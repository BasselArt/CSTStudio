// محاكاة واقعية: «أسبوع في حياة الاستوديو» — تُنفَّذ كل الإجراءات عبر طبقة
// الخدمات الحقيقية (لا كتابة مباشرة للمجال)، مع «آلة زمن» تعيد ختم ما كتبته
// كل عملية إلى لحظتها في السيناريو، ثم تُفحص أرقام SLA والإشعارات والتجميعات
// عند نقاط زمنية محددة — بما يشمل القفز فوق ويكند الجمعة/السبت.
// التشغيل: pnpm simulate

if (!process.env.DATABASE_PATH || process.env.DATABASE_PATH.includes("studio.db")) {
  console.error("⛔ حدد DATABASE_PATH لقاعدة اختبار معزولة — هذا السكربت يمسح كل البيانات.");
  process.exit(1);
}

import { hashSync } from "bcryptjs";
import { eq, gt, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  departments,
  notifications,
  requestCounters,
  requestEvents,
  requests,
  requestTypes,
  settings,
  users,
} from "@/db/schema";
import { addWorkingHours } from "@/core/calendar";
import {
  avgDeliveryWorkDays,
  complianceRatePct,
  statusDistribution,
} from "@/core/kpi";
import { designerLoadPoints, loadPct, loadState } from "@/core/load";
import type { CalendarCfg } from "@/core/types";
import {
  addAttachment,
  addComment,
  approveUrgent,
  assign,
  cancel,
  createRequest,
  listVisibleRequests,
  requestInfo,
  slaFor,
  sweepSla,
  transition,
  type Actor,
} from "@/services/requests";
import { getSettings } from "@/services/settings";
import { markAllRead, unreadCount } from "@/services/notifications";

/* ---------------------------------------------------------------- */
/* عدة الفحص والسرد                                                  */
/* ---------------------------------------------------------------- */

let pass = 0;
let fail = 0;
const failures: string[] = [];

function verify(name: string, cond: unknown, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`      ✅ ${name}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`      ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function close(a: number | null, b: number, eps = 0.02) {
  return a != null && Math.abs(a - b) < eps;
}

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function narrate(day: number, time: string, text: string) {
  console.log(`  🕐 ${DAY_NAMES[day % 7]} ${time} — ${text}`);
}

/* ---------------------------------------------------------------- */
/* آلة الزمن: تنفّذ عبر الخدمات ثم تعيد ختم ما كُتب إلى لحظة السيناريو */
/* ---------------------------------------------------------------- */

const DATE_FIELDS = [
  "createdAt",
  "updatedAt",
  "deliveredAt",
  "closedAt",
  "urgentApprovedAt",
] as const;

async function at<T>(when: Date, fn: () => Promise<T>): Promise<T> {
  const callStartIso = new Date().toISOString();
  const [{ maxEvent }] = db
    .select({ maxEvent: sql<number>`coalesce(max(id), 0)` })
    .from(requestEvents)
    .all();
  const [{ maxNotif }] = db
    .select({ maxNotif: sql<number>`coalesce(max(id), 0)` })
    .from(notifications)
    .all();

  const result = await fn();

  const whenIso = when.toISOString();
  db.update(requestEvents)
    .set({ createdAt: whenIso })
    .where(gt(requestEvents.id, maxEvent))
    .run();
  db.update(notifications)
    .set({ createdAt: whenIso })
    .where(gt(notifications.id, maxNotif))
    .run();
  for (const field of DATE_FIELDS) {
    db.update(requests)
      .set({ [field]: whenIso })
      .where(gte(requests[field], callStartIso))
      .run();
  }
  return result;
}

/* ---------------------------------------------------------------- */
/* التجهيز                                                           */
/* ---------------------------------------------------------------- */

const cfg: CalendarCfg = {
  workDays: [0, 1, 2, 3, 4],
  workStart: "08:00",
  workEnd: "16:00",
  holidays: [],
};

/** أحد يقع قبل ≥ 4 أسابيع (حتى يعمل الإغلاق التلقائي لاحقًا) */
function findBaseSunday(): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Riyadh",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let d = new Date(Date.now() - 28 * 86_400_000);
  for (let i = 0; i < 8; i++) {
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
    if (parts.weekday === "Sun") {
      return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+03:00`);
    }
    d = new Date(d.getTime() - 86_400_000);
  }
  throw new Error("لم يوجد أحد");
}

const BASE = findBaseSunday();

/** لحظة في السيناريو: اليوم (0=الأحد الأساس) والوقت المحلي بالرياض */
function T(day: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(BASE.getTime() + day * 86_400_000 + h * 3_600_000 + m * 60_000);
}

async function setup() {
  db.delete(notifications).run();
  db.delete(requestEvents).run();
  db.delete(requests).run();
  db.delete(requestCounters).run();
  db.delete(users).run();
  db.delete(departments).run();
  db.delete(requestTypes).run();
  db.delete(settings).run();

  db.insert(settings)
    .values({
      id: 1,
      workDays: cfg.workDays,
      workStart: cfg.workStart,
      workEnd: cfg.workEnd,
      holidays: [],
      alertThresholdPct: 75,
      autoCloseWorkDays: 3,
      maxReviewRounds: 2,
      loadLowPct: 40,
      loadHighPct: 75,
      responseSlaH: 4,
    })
    .run();

  const types = db
    .insert(requestTypes)
    .values([
      { name: "تعديل بسيط", effortPoints: 1, slaNormalH: 8, slaHighH: 4, slaUrgentH: 2, sortOrder: 1 },
      { name: "تصميم بسيط", effortPoints: 2, slaNormalH: 8, slaHighH: 6, slaUrgentH: 4, sortOrder: 2 },
      { name: "تصميم متوسط", effortPoints: 5, slaNormalH: 24, slaHighH: 16, slaUrgentH: 8, sortOrder: 3 },
      { name: "تصميم كبير", effortPoints: 10, slaNormalH: 40, slaHighH: 32, slaUrgentH: null, sortOrder: 4 },
    ])
    .returning()
    .all();

  const depts = db
    .insert(departments)
    .values([
      { name: "الاتصال المؤسسي" },
      { name: "إدارة المشاريع" },
      { name: "الشؤون القانونية" },
      { name: "الموارد البشرية" },
      { name: "تقنية المعلومات" },
    ])
    .returning()
    .all();

  const hash = hashSync("sim", 4);
  const ts = BASE.toISOString();
  const rows = db
    .insert(users)
    .values([
      { name: "أحمد العتيبي", email: "mgr@sim", passwordHash: hash, role: "studio_manager", createdAt: ts },
      { name: "نورة الشهري", email: "noura@sim", passwordHash: hash, role: "designer", createdAt: ts },
      { name: "سارة المطيري", email: "sara@sim", passwordHash: hash, role: "designer", createdAt: ts },
      { name: "خالد الزهراني", email: "khaled@sim", passwordHash: hash, role: "designer", createdAt: ts },
      { name: "مها القحطاني", email: "maha@sim", passwordHash: hash, role: "requester", departmentId: depts[0].id, createdAt: ts },
      { name: "يوسف الشمري", email: "yousef@sim", passwordHash: hash, role: "requester", departmentId: depts[1].id, createdAt: ts },
      { name: "فهد العنزي", email: "fahad@sim", passwordHash: hash, role: "requester", departmentId: depts[2].id, createdAt: ts },
      { name: "سلمى الدوسري", email: "salma@sim", passwordHash: hash, role: "requester", departmentId: depts[3].id, createdAt: ts },
      { name: "عبدالله السبيعي", email: "abd@sim", passwordHash: hash, role: "requester", departmentId: depts[4].id, createdAt: ts },
    ])
    .returning()
    .all();

  const actor = (email: string): Actor => {
    const u = rows.find((x) => x.email === email)!;
    return { id: u.id, role: u.role, departmentId: u.departmentId, name: u.name };
  };

  return { types, depts, actor };
}

/* ---------------------------------------------------------------- */

async function main() {
  const { types, depts, actor } = await setup();
  const settingsRow = await getSettings();
  const typeById = new Map(types.map((t) => [t.id, t]));

  const manager = actor("mgr@sim");
  const noura = actor("noura@sim");
  const sara = actor("sara@sim");
  const khaled = actor("khaled@sim");
  const maha = actor("maha@sim");
  const yousef = actor("yousef@sim");
  const fahad = actor("fahad@sim");
  const salma = actor("salma@sim");
  const abdullah = actor("abd@sim");

  const typeByName = (n: string) => types.find((t) => t.name === n)!;
  const reqRow = (id: number) =>
    db.query.requests.findFirst({ where: eq(requests.id, id) }).then((r) => r!);
  const slaAt = async (id: number, when: Date) => {
    const row = await reqRow(id);
    const evs = await db.query.requestEvents.findMany({
      where: eq(requestEvents.requestId, id),
    });
    return slaFor(row, evs, typeById.get(row.typeId)!, settingsRow, when);
  };
  const notifCount = (userId: number, type: string) =>
    db
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(sql`user_id = ${userId} AND type = ${type}`)
      .all()[0].c;

  const input = (dept: number, title: string, typeName: string, extra: Record<string, unknown> = {}) => ({
    departmentId: dept,
    contact: "sim@cst.gov.sa",
    title,
    typeId: typeByName(typeName).id,
    description: "وصف تفصيلي واقعي يتجاوز الحد الأدنى للتحقق.",
    language: "ar",
    publishDueDate: "2026-12-31",
    sizes: ["1080x1080"],
    channels: ["منصات التواصل الاجتماعي"],
    priority: "normal",
    ...extra,
  }) as Parameters<typeof createRequest>[0];

  console.log(`\n📅 المحاكاة تبدأ من ${DAY_NAMES[0]} ${BASE.toISOString().slice(0, 10)} (قبل ~4 أسابيع)\n`);

  /* ================= اليوم 0 — الأحد ================= */
  console.log("═══ اليوم الأول (الأحد) ═══");

  narrate(0, "08:00", "مها (الاتصال المؤسسي) تنشئ طلب «إنفوغرافيك الأداء» — متوسط/عادي، هدف 24 ساعة");
  const A = await at(T(0, "08:00"), () =>
    createRequest(input(depts[0].id, "إنفوغرافيك الأداء السنوي", "تصميم متوسط"), maha));
  {
    const s = await slaAt(A, T(0, "08:30"));
    verify("أ: عدّاد الاستجابة يعمل والتسليم لم يبدأ",
      s.response.state === "on_track" && s.delivery.state === "not_started");
    verify("أ: المسؤول أُشعر بالطلب الجديد", notifCount(manager.id, "created") === 1);
  }

  narrate(0, "09:00", "يوسف ينشئ طلبًا عاجلًا «هوية مؤتمر» — كبير، عاجله «باتفاق»");
  const B = await at(T(0, "09:00"), () =>
    createRequest(input(depts[1].id, "هوية مؤتمر التحول الرقمي", "تصميم كبير", {
      priority: "urgent",
      urgentJustification: "توجيه تنفيذي بمؤتمر خلال أيام",
    }), yousef));
  verify("ب: قبل الاعتماد هدفه على مدة «عالي» = 32",
    (await slaAt(B, T(0, "09:15"))).delivery.targetH === 32);
  verify("ب: إشعار «بانتظار اعتماد عاجل» وصل المسؤول",
    notifCount(manager.id, "urgent_pending") === 1);

  narrate(0, "09:00", "المسؤول يطلب من مها استكمال المحتوى (يتوقف العدّاد على الجهة)");
  await at(T(0, "09:00"), () => requestInfo(A, "نحتاج نصوص الأرقام النهائية", manager));
  {
    const s = await slaAt(A, T(0, "09:30"));
    verify("أ: الاستجابة أُغلقت خلال ساعة (ملتزمة)",
      s.response.metSla === true && close(s.response.consumedH, 1));
  }

  narrate(0, "09:30", "المسؤول يعتمد استعجال «ب» بمدة متفق عليها = 10 ساعات عمل");
  await at(T(0, "09:30"), () => approveUrgent(B, manager, 10));
  verify("ب: بعد الاعتماد الهدف = 10 (باتفاق من حدث الاعتماد)",
    (await slaAt(B, T(0, "09:45"))).delivery.targetH === 10);

  narrate(0, "10:00", "المسؤول يسند «ب» لسارة وتبدأ التنفيذ فورًا");
  await at(T(0, "10:00"), () => assign(B, sara.id, manager));
  await at(T(0, "10:00"), () => transition(B, "ready", manager));
  await at(T(0, "10:00"), () => transition(B, "in_progress", sara));

  narrate(0, "10:00", "فهد (القانونية) ينشئ طلب مطوية ثم يلغيه بعد ساعة (أُلغيت الفعالية)");
  const C = await at(T(0, "10:00"), () =>
    createRequest(input(depts[2].id, "مطوية ندوة قانونية", "تصميم بسيط"), fahad));
  await at(T(0, "11:00"), () => cancel(C, "أُلغيت الندوة", fahad));
  verify("ج: الملغي حالته cancelled ومستبعد من الالتزام",
    (await reqRow(C)).status === "cancelled" &&
    (await slaAt(C, T(0, "12:00"))).delivery.metSla === null);

  narrate(0, "11:00", "عبدالله (التقنية) ينشئ طلبًا سيُنسى قيد التنفيذ (متوسط/عادي)");
  const E = await at(T(0, "11:00"), () =>
    createRequest(input(depts[4].id, "عرض خدمات المنصة", "تصميم متوسط"), abdullah));
  await at(T(0, "11:30"), () => assign(E, sara.id, manager));
  await at(T(0, "11:30"), () => transition(E, "ready", manager));
  await at(T(0, "11:30"), () => transition(E, "in_progress", sara));

  narrate(0, "12:00", "مها ترد على الاستكمال → جاهز، ويُسند لنورة وتبدأ 13:00");
  await at(T(0, "12:00"), () => transition(A, "ready", maha));
  await at(T(0, "12:00"), () => assign(A, noura.id, manager));
  await at(T(0, "13:00"), () => transition(A, "in_progress", noura));
  verify("أ: نورة أُشعرت بالإسناد", notifCount(noura.id, "assigned") === 1);

  /* ================= اليوم 1 — الاثنين ================= */
  console.log("\n═══ اليوم الثاني (الاثنين) ═══");

  {
    narrate(1, "08:00", "📊 نقطة فحص لطلب «أ» صباح الاثنين");
    const s = await slaAt(A, T(1, "08:00"));
    verify("أ: المستهلك 4 ساعات (الأحد 12→16)", close(s.delivery.consumedH, 4), `فعلي ${s.delivery.consumedH}`);
    verify("أ: التوقف 3 ساعات (استكمال الأحد 9→12)", close(s.delivery.pausedH, 3), `فعلي ${s.delivery.pausedH}`);
    verify("أ: المتبقي 20 → «مستحق قريبًا»", close(s.delivery.remainingH, 20) && s.delivery.state === "due_soon");
    verify("أ: التسليم المتوقع الأربعاء 12:00 بالضبط",
      s.delivery.expectedDeliveryAt?.getTime() === T(3, "12:00").getTime(),
      `فعلي ${s.delivery.expectedDeliveryAt?.toISOString()}`);
    verify("أ: يطابق addWorkingHours مباشرة",
      addWorkingHours(T(1, "08:00"), 20, cfg).getTime() === T(3, "12:00").getTime());
  }

  narrate(1, "09:00", "حوار تعليقات: مها تسأل، نورة ترد");
  await at(T(1, "09:00"), () => addComment(A, "هل وصلتكم النصوص المحدثة؟", maha));
  await at(T(1, "09:30"), () => addComment(A, "وصلت، جارٍ التنفيذ عليها.", noura));
  verify("أ: كلٌّ أشعر الطرف الآخر (لا نفسه)",
    notifCount(noura.id, "comment") === 1 && notifCount(maha.id, "comment") === 1);

  {
    narrate(1, "11:00", "📊 نقطة فحص للعاجل «ب»: على حافة هدفه");
    const s = await slaAt(B, T(1, "11:00"));
    verify("ب: المستهلك 9 من 10 (90%) → «مستحق قريبًا»",
      close(s.delivery.consumedH, 9) && close(s.delivery.pct ?? 0, 0.9) && s.delivery.state === "due_soon",
      `مستهلك ${s.delivery.consumedH}`);
  }

  narrate(1, "08:30", "سلمى (الموارد البشرية) تنشئ «شهادة تدريب» بسيط/عادي وخالد ينجزه في اليوم نفسه");
  const D = await at(T(1, "08:30"), () =>
    createRequest(input(depts[3].id, "شهادة برنامج تدريبي", "تصميم بسيط"), salma));
  await at(T(1, "09:00"), () => assign(D, khaled.id, manager));
  await at(T(1, "09:00"), () => transition(D, "ready", manager));
  await at(T(1, "09:00"), () => transition(D, "in_progress", khaled));
  // لا تسليم مباشرًا من قيد التنفيذ — المرور بالمراجعة الداخلية إلزامي (§6)
  await at(T(1, "14:30"), () => transition(D, "internal_review", khaled));
  await at(T(1, "15:30"), () => transition(D, "delivered", khaled));
  {
    const s = await slaAt(D, T(1, "16:00"));
    verify("د: أُنجز في 6.5 ساعة من 8 → ملتزم", close(s.delivery.consumedH, 6.5) && s.delivery.metSla === true);
  }

  narrate(1, "10:00", "نورة تنقل «أ» للمراجعة الداخلية ثم لملاحظات الجهة 14:00");
  await at(T(1, "10:00"), () => transition(A, "internal_review", noura));
  await at(T(1, "14:00"), () => transition(A, "awaiting_feedback", noura));

  /* ================= اليوم 2 — الثلاثاء ================= */
  console.log("\n═══ اليوم الثالث (الثلاثاء) ═══");

  narrate(2, "09:00", "مها تعيد «أ» بملاحظات (جولة مراجعة 1)");
  await at(T(2, "09:00"), () => transition(A, "in_progress", maha));
  verify("أ: جولة المراجعة أصبحت 1", (await reqRow(A)).reviewRound === 1);

  narrate(2, "10:00", "سلمى تعتمد تسليم «د» → مغلق");
  await at(T(2, "10:00"), () => transition(D, "closed", salma));

  narrate(2, "12:30", "نورة ترفع التسليم النهائي v1.0 ثم تسلّم 13:00");
  await at(T(2, "12:30"), () =>
    addAttachment(A, "deliverable", { filename: "final.pdf", path: "sim/final.pdf", size: 100, mime: "application/pdf" }, "v1.0", noura));
  verify("أ: مها أُشعرت بالتسليمة", notifCount(maha.id, "deliverable") === 1);
  await at(T(2, "12:45"), () => transition(A, "internal_review", noura));
  await at(T(2, "13:00"), () => transition(A, "delivered", noura));

  {
    narrate(2, "14:00", "📊 نقطة فحص «أ» بعد التسليم — أرقام الحالة الذهبية");
    const s = await slaAt(A, T(2, "14:00"));
    verify("أ: مستهلك 14 (4+6+4) وتوقف 6 (3+3)",
      close(s.delivery.consumedH, 14) && close(s.delivery.pausedH, 6),
      `مستهلك ${s.delivery.consumedH} توقف ${s.delivery.pausedH}`);
    verify("أ: ملتزم (14 ≤ 24) والحالة منتهية",
      s.delivery.metSla === true && s.delivery.state === "stopped");
  }

  narrate(2, "15:00", "سارة تسلّم العاجل «ب» متأخرة (المستهلك 21 من 10)");
  await at(T(2, "14:30"), () => transition(B, "internal_review", sara));
  await at(T(2, "15:00"), () => transition(B, "delivered", sara));
  {
    const s = await slaAt(B, T(2, "15:30"));
    verify("ب: تسليم متأخر metSla=false", close(s.delivery.consumedH, 21) && s.delivery.metSla === false,
      `مستهلك ${s.delivery.consumedH}`);
  }

  /* ================= اليوم 4 — الخميس (اختبار الويكند) ================= */
  console.log("\n═══ اليوم الخامس (الخميس) — القفز فوق الويكند ═══");

  narrate(4, "14:00", "سلمى تنشئ «بطاقة معايدة» بسيط/عادي قبل نهاية الأسبوع");
  const F = await at(T(4, "14:00"), () =>
    createRequest(input(depts[3].id, "بطاقة معايدة داخلية", "تصميم بسيط"), salma));
  await at(T(4, "14:00"), () => assign(F, noura.id, manager));
  await at(T(4, "14:00"), () => transition(F, "ready", manager));
  {
    const s = await slaAt(F, T(4, "15:00"));
    verify("و: المتبقي 7 والتسليم المتوقع الأحد 14:00 (قفز الجمعة والسبت)",
      close(s.delivery.remainingH, 7) &&
      s.delivery.expectedDeliveryAt?.getTime() === T(7, "14:00").getTime(),
      `متوقع ${s.delivery.expectedDeliveryAt?.toISOString()}`);
  }

  /* ================= «بعد أسابيع» — الحاضر الفعلي ================= */
  console.log("\n═══ بعد أسابيع (الحاضر): الكنس الدوري sla-sweep ═══");

  const sweep1 = await sweepSla();
  console.log(`  🔁 نتيجة الكنس: ${JSON.stringify(sweep1)}`);
  verify("الكنس: أُغلق تلقائيًا «أ» و«ب» (المسلَّمان القديمان) فقط", sweep1.autoClosed === 2);
  verify("الكنس: تنبيها تجاوز للطلبين المنسيين (هـ قيد التنفيذ، و جاهز)", sweep1.overdueAlerts === 2);
  verify("أ أصبح مغلقًا بحدث نظامي", (await reqRow(A)).status === "closed");
  verify("سارة والمسؤول أُشعرا بتجاوز «هـ»",
    notifCount(sara.id, "slaover") >= 1 && notifCount(manager.id, "slaover") >= 1);

  const sweep2 = await sweepSla();
  verify("الكنس idempotent: الثاني لا يغلق ولا يكرر", sweep2.autoClosed === 0);

  /* ================= التجميعات كما تحسبها الشاشات ================= */
  console.log("\n═══ تجميعات لوحة المتابعة (نفس دوال الصفحات) ═══");

  const all = await listVisibleRequests(manager);
  const delivered = all.filter((r) => r.request.deliveredAt);
  const compliance = complianceRatePct(
    delivered.map((r) => ({ metSla: r.sla.delivery.metSla, excluded: r.request.status === "cancelled" })),
  );
  verify("نسبة الالتزام 66.7% (أ ود ملتزمان، ب متأخر، ج مستبعد)", close(compliance, 66.67, 0.5),
    `فعلي ${compliance}`);

  const avgDays = avgDeliveryWorkDays(delivered.map((r) => r.sla.delivery.consumedH));
  verify("متوسط مدة التسليم ≈ 1.73 يوم عمل ((14+21+6.5)/3/8)", close(avgDays, 41.5 / 24, 0.02),
    `فعلي ${avgDays}`);

  const dist = statusDistribution(
    all.filter((r) => !["closed", "cancelled"].includes(r.request.status)).map((r) => r.request.status),
  );
  verify("التوزيع المفتوح: ready=1 (و) وin_progress=1 (هـ)",
    dist.find((d) => d.status === "ready")?.count === 1 &&
    dist.find((d) => d.status === "in_progress")?.count === 1);

  const saraLoad = designerLoadPoints(
    all.filter((r) => r.request.assigneeId === sara.id)
      .map((r) => ({ status: r.request.status, effortPoints: r.type.effortPoints })),
  );
  verify("حمل سارة الآن 5 نقاط («هـ» فقط — المسلَّم لا يُحتسب) = 25% منخفض",
    saraLoad === 5 && loadState(loadPct(saraLoad, 20), settingsRow) === "low");

  const mahaUnread = await unreadCount(maha.id);
  verify("جرس مها ممتلئ ثم يفرغ بـ«تعليم الكل كمقروء»", mahaUnread > 0);
  await markAllRead(maha.id);
  verify("بعد التعليم: صفر غير مقروء", (await unreadCount(maha.id)) === 0);

  /* ================= الخلاصة ================= */
  console.log(`\n${"=".repeat(52)}`);
  console.log(`نتيجة المحاكاة: ${pass} ناجح · ${fail} فاشل من ${pass + fail}`);
  if (failures.length) {
    console.log("الإخفاقات:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();
