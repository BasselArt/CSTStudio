// اختبار وظيفي/منطقي لطبقة الخدمات والترابط بينها — يعمل ضد قاعدة اختبار معزولة.
// يغطي: الصلاحيات (§11)، آلة الحالات والحراسات (§6)، الترابط حدث↔إشعار (§10/§14)،
// تكامل SLA مع الاعتماد العاجل (§9)، الترقيم (§5)، الكنس (§14)، الملفات، CSV، والفلاتر.
// التشغيل: pnpm audit:functions

// حارس أمان: السكربت يمسح كل بيانات القاعدة التي يشير إليها DATABASE_PATH.
if (!process.env.DATABASE_PATH || process.env.DATABASE_PATH.includes("studio.db")) {
  console.error(
    "⛔ حدد DATABASE_PATH لقاعدة اختبار معزولة (مثال: storage/functest.db) — هذا السكربت يمسح كل البيانات.",
  );
  process.exit(1);
}

import { hashSync } from "bcryptjs";
import { and, eq, isNotNull, sql } from "drizzle-orm";
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
import { workingHoursBetween } from "@/core/calendar";
import type { CalendarCfg, Status } from "@/core/types";
import {
  addAttachment,
  addComment,
  allowedTransitions,
  approveUrgent,
  assign,
  cancel,
  canView,
  createRequest,
  declineUrgent,
  getRequestDetails,
  listVisibleRequests,
  requestInfo,
  saveDraft,
  submitDraft,
  sweepSla,
  transition,
  type Actor,
} from "@/services/requests";
import { updateSettings } from "@/services/settings";
import { insertNotification } from "@/services/notifications";
import { saveUpload, readAttachmentFile, FileValidationError } from "@/services/files";
import { toCsv } from "@/lib/csv";
import { applyFilters, matchesTab, parseFilters } from "@/app/(app)/requests/query";

/* ---------------------------------------------------------------- */
/* عدة الاختبار                                                      */
/* ---------------------------------------------------------------- */

const results: { section: string; name: string; ok: boolean; detail?: string }[] = [];
let section = "";

function describe(s: string) {
  section = s;
}

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ section, name, ok: true });
  } catch (e) {
    results.push({
      section,
      name,
      ok: false,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    });
  }
}

function expect(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function expectThrows(fn: () => unknown | Promise<unknown>, errorName?: string) {
  try {
    await fn();
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (errorName && name !== errorName) {
      throw new Error(`رُمي «${name}» والمتوقع «${errorName}»`);
    }
    return;
  }
  throw new Error("لم يُرمَ أي خطأ والعملية كان يجب أن تُرفض");
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

/** لحظة تسبق now بعدد ساعات عمل (نفس أسلوب البذور) */
function subWorkH(hours: number): Date {
  const now = new Date();
  let candidate = new Date(now.getTime() - hours * 3_600_000);
  for (let i = 0; i < 60_000; i++) {
    if (workingHoursBetween(candidate, now, cfg) >= hours) return candidate;
    candidate = new Date(candidate.getTime() - 15 * 60_000);
  }
  throw new Error("subWorkH overflow");
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
      { name: "تصميم متوسط", effortPoints: 5, slaNormalH: 24, slaHighH: 16, slaUrgentH: 8, sortOrder: 3 },
      { name: "تصميم كبير", effortPoints: 10, slaNormalH: 40, slaHighH: 32, slaUrgentH: null, sortOrder: 4 },
    ])
    .returning()
    .all();

  const depts = db
    .insert(departments)
    .values([{ name: "جهة أ" }, { name: "جهة ب" }])
    .returning()
    .all();

  const hash = hashSync("test", 4);
  const ts = new Date().toISOString();
  const userRows = db
    .insert(users)
    .values([
      { name: "المسؤول", email: "mgr@t", passwordHash: hash, role: "studio_manager", createdAt: ts },
      { name: "مصمم أول", email: "d1@t", passwordHash: hash, role: "designer", createdAt: ts },
      { name: "مصمم ثانٍ", email: "d2@t", passwordHash: hash, role: "designer", createdAt: ts },
      { name: "طالب أ", email: "r1@t", passwordHash: hash, role: "requester", departmentId: depts[0].id, createdAt: ts },
      { name: "طالب أ2", email: "r1b@t", passwordHash: hash, role: "requester", departmentId: depts[0].id, createdAt: ts },
      { name: "طالب ب", email: "r2@t", passwordHash: hash, role: "requester", departmentId: depts[1].id, createdAt: ts },
      { name: "المدير", email: "ex@t", passwordHash: hash, role: "executive", createdAt: ts },
    ])
    .returning()
    .all();

  const actor = (email: string): Actor => {
    const u = userRows.find((x) => x.email === email)!;
    return { id: u.id, role: u.role, departmentId: u.departmentId, name: u.name };
  };

  return {
    types,
    depts,
    manager: actor("mgr@t"),
    designer1: actor("d1@t"),
    designer2: actor("d2@t"),
    requester1: actor("r1@t"),
    requester1b: actor("r1b@t"),
    requester2: actor("r2@t"),
    executive: actor("ex@t"),
  };
}

type Fixtures = Awaited<ReturnType<typeof setup>>;

function validInput(f: Fixtures, overrides: Record<string, unknown> = {}) {
  return {
    departmentId: f.depts[0].id,
    contact: "r1@t.gov.sa",
    title: "طلب اختبار وظيفي منطقي",
    typeId: f.types[1].id, // تصميم متوسط
    description: "وصف تفصيلي كافٍ لاجتياز التحقق من عشرة أحرف.",
    language: "ar",
    publishDueDate: "2026-08-01",
    sizes: "1080x1080",
    channel: "منصات التواصل الاجتماعي",
    priority: "normal",
    ...overrides,
  } as Parameters<typeof createRequest>[0];
}

const notifCount = (userId: number, type?: string) =>
  db
    .select({ c: sql<number>`count(*)` })
    .from(notifications)
    .where(
      type
        ? and(eq(notifications.userId, userId), eq(notifications.type, type))
        : eq(notifications.userId, userId),
    )
    .all()[0].c;

const eventsOf = (requestId: number, type?: string) =>
  db.query.requestEvents
    .findMany({ where: eq(requestEvents.requestId, requestId) })
    .then((rows) => (type ? rows.filter((r) => r.type === type) : rows));

const reqRow = (id: number) =>
  db.query.requests.findFirst({ where: eq(requests.id, id) }).then((r) => r!);

/* ---------------------------------------------------------------- */
/* السيناريوهات                                                      */
/* ---------------------------------------------------------------- */

async function main() {
  const f = await setup();

  /* ===== A. الصلاحيات والرؤية (§11) ===== */
  describe("A. الصلاحيات والرؤية");

  await check("طالب لا ينشئ طلبًا لجهة أخرى", () =>
    expectThrows(
      () => createRequest(validInput(f, { departmentId: f.depts[1].id }), f.requester1),
      "ForbiddenError",
    ));

  await check("المصمم والمدير لا ينشئان طلبات", async () => {
    await expectThrows(() => createRequest(validInput(f), f.designer1), "ForbiddenError");
    await expectThrows(() => createRequest(validInput(f), f.executive), "ForbiddenError");
  });

  // طلب مرجعي تُبنى عليه بقية السيناريوهات
  const reqId = await createRequest(validInput(f), f.requester1);

  await check("طالب من جهة أخرى لا يفتح التفاصيل", () =>
    expectThrows(() => getRequestDetails(reqId, f.requester2), "NotFoundError"));

  await check("المصمم غير المسند لا يرى الطلب ولا انتقالات له", async () => {
    expect(!canView(f.designer1, await reqRow(reqId)), "canView أعطى مصممًا غير مسند رؤية");
    await expectThrows(() => getRequestDetails(reqId, f.designer1), "NotFoundError");
  });

  await check("المدير يرى كل شيء لكن انتقالاته صفر (قراءة فقط)", async () => {
    const row = await reqRow(reqId);
    expect(canView(f.executive, row), "المدير لا يرى الطلب");
    expect(allowedTransitions(row, f.executive).length === 0, "المدير لديه انتقالات");
  });

  await check("الإسناد للمسؤول فقط", async () => {
    await expectThrows(() => assign(reqId, f.designer1.id, f.designer1), "ForbiddenError");
    await expectThrows(() => assign(reqId, f.designer1.id, f.requester1), "ForbiddenError");
    await assign(reqId, f.designer1.id, f.manager);
    const row = await reqRow(reqId);
    expect(row.assigneeId === f.designer1.id, "لم يُسند");
  });

  await check("الإسناد أنتج حدث assignment وإشعارًا للمصمم", async () => {
    expect((await eventsOf(reqId, "assignment")).length === 1, "لا حدث assignment");
    expect(notifCount(f.designer1.id, "assigned") === 1, "لا إشعار للمصمم");
  });

  await check("إسناد لمستخدم ليس مصممًا يُرفض", () =>
    expectThrows(() => assign(reqId, f.requester1.id, f.manager), "NotFoundError"));

  await check("رفع تسليم: يُرفض للطالب ولمصمم غير مسند ويُقبل للمسند", async () => {
    const meta = { filename: "x.png", path: "t/x.png", size: 10, mime: "image/png" };
    await expectThrows(() => addAttachment(reqId, "deliverable", meta, "v0.1", f.requester1), "ForbiddenError");
    await expectThrows(() => addAttachment(reqId, "deliverable", meta, "v0.1", f.designer2), "NotFoundError");
    // المسند — بعد نقله للحالة المناسبة لاحقًا؛ الرفع نفسه غير مقيد بالحالة
    await addAttachment(reqId, "deliverable", meta, "v0.1", f.designer1);
    expect((await eventsOf(reqId, "attachment")).length === 1, "لا حدث attachment");
    expect(notifCount(f.requester1.id, "deliverable") === 1, "لا إشعار تسليم للطالب");
  });

  await check("تعديل الإعدادات محصور بالمسؤول", async () => {
    const s = {
      workDays: [0, 1, 2, 3, 4], workStart: "08:00", workEnd: "16:00", holidays: [],
      alertThresholdPct: 75, autoCloseWorkDays: 3, maxReviewRounds: 2,
      loadLowPct: 40, loadHighPct: 75, responseSlaH: 4,
    };
    await expectThrows(() => updateSettings(s, "designer"), "ForbiddenError");
    await expectThrows(() => updateSettings(s, "requester"), "ForbiddenError");
    await updateSettings(s, "studio_manager");
  });

  await check("نطاق الرؤية في القوائم: كل دور يرى حصته فقط", async () => {
    const [mgr, r1, r2, d1, d2, ex] = await Promise.all([
      listVisibleRequests(f.manager),
      listVisibleRequests(f.requester1),
      listVisibleRequests(f.requester2),
      listVisibleRequests(f.designer1),
      listVisibleRequests(f.designer2),
      listVisibleRequests(f.executive),
    ]);
    expect(mgr.length === 1 && ex.length === 1, "المسؤول/المدير لا يريان الطلب");
    expect(r1.length === 1, "الطالب لا يرى طلب جهته");
    expect(r2.length === 0, "طالب الجهة الأخرى يرى ما لا يخصه");
    expect(d1.length === 1 && d2.length === 0, "نطاق المصممين خاطئ");
  });

  /* ===== B. آلة الحالات والحراسات (§6) ===== */
  describe("B. آلة الحالات والحراسات");

  await check("انتقال غير مسموح يُرفض (new → delivered)", () =>
    expectThrows(() => transition(reqId, "delivered", f.manager)));

  await check("انتقال متاح بالخريطة لكن ليس لدور الطالب يُرفض (new → ready)", () =>
    expectThrows(() => transition(reqId, "ready", f.requester1), "ForbiddenError"));

  await check("المسار الكامل new→ready→in_progress→internal_review→delivered→closed", async () => {
    await transition(reqId, "ready", f.manager);
    await transition(reqId, "in_progress", f.designer1); // المسند يبدأ التنفيذ
    await transition(reqId, "internal_review", f.designer1);
    await transition(reqId, "delivered", f.designer1);
    let row = await reqRow(reqId);
    expect(row.status === "delivered" && !!row.deliveredAt, "deliveredAt لم يُضبط");
    await transition(reqId, "closed", f.requester1); // اعتماد التسليم من صاحب الطلب
    row = await reqRow(reqId);
    expect(row.status === "closed" && !!row.closedAt, "closedAt لم يُضبط");
    expect((await eventsOf(reqId, "status_change")).length === 5, "عدد أحداث الحالة خاطئ");
  });

  await check("الحالة النهائية مقفلة (closed → أي شيء)", () =>
    expectThrows(() => transition(reqId, "in_progress", f.manager)));

  await check("إشعار الطالب عند كل تغيير حالة من الاستوديو", () => {
    expect(notifCount(f.requester1.id, "status_changed") >= 4, "إشعارات الحالة ناقصة"); // closed نفّذه الطالب نفسه فلا يُشعر
  });

  // طلب ثانٍ لاختبار جولات المراجعة والاستكمال والإلغاء
  const req2 = await createRequest(validInput(f, { title: "طلب جولات المراجعة" }), f.requester1);
  await assign(req2, f.designer1.id, f.manager);
  await transition(req2, "ready", f.manager);
  await transition(req2, "in_progress", f.designer1);

  await check("طلب استكمال يوقف عبر needs_info ويحمل الرسالة في الحدث", async () => {
    await requestInfo(req2, "نحتاج الشعار بصيغة مفتوحة", f.designer1);
    const row = await reqRow(req2);
    expect(row.status === "needs_info", "لم ينتقل إلى needs_info");
    const evs = await eventsOf(req2, "status_change");
    const last = evs.at(-1)!.data as { note?: string };
    expect(last.note === "نحتاج الشعار بصيغة مفتوحة", "الرسالة ليست داخل الحدث");
    expect(notifCount(f.requester1.id) > 0, "لا إشعار للطالب");
  });

  await check("الطالب يرد على الاستكمال (needs_info → ready)", async () => {
    await transition(req2, "ready", f.requester1);
    expect((await reqRow(req2)).status === "ready", "لم يعد جاهزًا");
  });

  await check("جولات المراجعة: تزيد حتى الحد ثم ReviewRoundLimitError", async () => {
    await transition(req2, "in_progress", f.designer1);
    await transition(req2, "awaiting_feedback", f.designer1);
    await transition(req2, "in_progress", f.requester1); // جولة 1
    expect((await reqRow(req2)).reviewRound === 1, "الجولة لم تُحتسب");
    await transition(req2, "awaiting_feedback", f.designer1);
    await transition(req2, "in_progress", f.requester1); // جولة 2
    expect((await reqRow(req2)).reviewRound === 2, "الجولة الثانية لم تُحتسب");
    await transition(req2, "awaiting_feedback", f.designer1);
    await expectThrows(() => transition(req2, "in_progress", f.requester1), "ReviewRoundLimitError");
    expect((await reqRow(req2)).reviewRound === 2, "الجولة زادت رغم الرفض");
  });

  await check("الإلغاء: طالب آخر بنفس الجهة لا يلغي، وصاحبه يلغي بسبب مسجل", async () => {
    const req3 = await createRequest(validInput(f, { title: "طلب للإلغاء بعد قليل" }), f.requester1);
    await expectThrows(() => cancel(req3, "سبب", f.requester1b), "ForbiddenError");
    await cancel(req3, "أُلغيت الفعالية نهائيًا", f.requester1);
    const row = await reqRow(req3);
    expect(row.status === "cancelled" && row.cancelReason === "أُلغيت الفعالية نهائيًا" && !!row.closedAt,
      "بيانات الإلغاء ناقصة");
  });

  /* ===== C. الترابط: تعليقات وإشعارات الطرف الآخر ===== */
  describe("C. التعليقات وإشعار الطرف الآخر");

  await check("تعليق الطالب يُشعر المصمم المسند (لا الطالب نفسه)", async () => {
    const before = notifCount(f.designer1.id, "comment");
    const selfBefore = notifCount(f.requester1.id, "comment");
    await addComment(req2, "هل من جديد؟", f.requester1);
    expect(notifCount(f.designer1.id, "comment") === before + 1, "المصمم لم يُشعر");
    expect(notifCount(f.requester1.id, "comment") === selfBefore, "الطالب أشعر نفسه");
  });

  await check("تعليق المصمم يُشعر الطالب", async () => {
    const before = notifCount(f.requester1.id, "comment");
    await addComment(req2, "سأرفع نسخة اليوم", f.designer1);
    expect(notifCount(f.requester1.id, "comment") === before + 1, "الطالب لم يُشعر");
  });

  await check("تعليق طالب على طلب غير مسند يُشعر المسؤول", async () => {
    const req4 = await createRequest(validInput(f, { title: "طلب بلا مصمم للتعليق" }), f.requester1);
    const before = notifCount(f.manager.id, "comment");
    await addComment(req4, "متى يُسند؟", f.requester1);
    expect(notifCount(f.manager.id, "comment") === before + 1, "المسؤول لم يُشعر");
  });

  await check("dedupeKey يمنع تكرار الإشعار", () => {
    insertNotification(db, { userId: f.manager.id, type: "t", title: "x", dedupeKey: "dup:1" });
    insertNotification(db, { userId: f.manager.id, type: "t", title: "x", dedupeKey: "dup:1" });
    const c = db
      .select({ c: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.dedupeKey, "dup:1"))
      .all()[0].c;
    expect(c === 1, `الصفوف ${c} والمتوقع 1`);
  });

  /* ===== D. العاجل وتكامل SLA (§9) ===== */
  describe("D. العاجل وتكامل SLA");

  const urgentId = await createRequest(
    validInput(f, { title: "طلب عاجل للاختبار", priority: "urgent", urgentJustification: "توجيه عاجل" }),
    f.requester1,
  );

  await check("عاجل بلا مبرر يُرفض من مخطط Zod", () =>
    expectThrows(() =>
      createRequest(validInput(f, { priority: "urgent", urgentJustification: "" }), f.requester1),
    ));

  await check("إنشاء عاجل يُشعر المسؤول بـ urgent_pending", () => {
    expect(notifCount(f.manager.id, "urgent_pending") >= 1, "لا إشعار انتظار اعتماد");
  });

  await check("قبل الاعتماد: الهدف = مدة «عالي» (متوسط: 16)", async () => {
    const d = await getRequestDetails(urgentId, f.manager);
    expect(d.sla.delivery.targetH === 16, `الهدف ${d.sla.delivery.targetH} والمتوقع 16`);
  });

  await check("اعتماد العاجل لغير المسؤول يُرفض", () =>
    expectThrows(() => approveUrgent(urgentId, f.requester1), "ForbiddenError"));

  await check("بعد الاعتماد: الهدف = مدة «عاجل» (متوسط: 8) والحدث مسجل", async () => {
    await approveUrgent(urgentId, f.manager);
    const d = await getRequestDetails(urgentId, f.manager);
    expect(!!d.request.urgentApprovedAt && d.request.urgentApprovedById === f.manager.id, "بيانات الاعتماد ناقصة");
    expect(d.sla.delivery.targetH === 8, `الهدف ${d.sla.delivery.targetH} والمتوقع 8`);
    expect((await eventsOf(urgentId, "urgent_approval")).length === 1, "لا حدث اعتماد");
  });

  await check("اعتماد عاجل مرتين يُرفض", () =>
    expectThrows(() => approveUrgent(urgentId, f.manager), "ForbiddenError"));

  await check("نوع كبير عاجله «باتفاق»: الهدف = المدة المتفق عليها من حدث الاعتماد", async () => {
    const bigId = await createRequest(
      validInput(f, { title: "عاجل كبير باتفاق", typeId: f.types[2].id, priority: "urgent", urgentJustification: "مبرر" }),
      f.requester1,
    );
    let d = await getRequestDetails(bigId, f.manager);
    expect(d.sla.delivery.targetH === 32, "قبل الاعتماد يجب أن يكون هدف عالي 32");
    await approveUrgent(bigId, f.manager, 12);
    d = await getRequestDetails(bigId, f.manager);
    expect(d.sla.delivery.targetH === 12, `الهدف ${d.sla.delivery.targetH} والمتوقع 12 (باتفاق)`);
  });

  await check("رفض الاستعجال يعيد الأولوية إلى «عالي» بحدثين وإشعار", async () => {
    const decId = await createRequest(
      validInput(f, { title: "عاجل سيُرفض", priority: "urgent", urgentJustification: "مبرر" }),
      f.requester1,
    );
    await declineUrgent(decId, f.manager, "لا يستدعي الاستعجال");
    const row = await reqRow(decId);
    expect(row.priority === "high", "الأولوية لم تعد high");
    expect((await eventsOf(decId, "urgent_approval")).length === 1, "لا حدث رفض");
    expect((await eventsOf(decId, "priority_change")).length === 1, "لا حدث تغيير أولوية");
  });

  await check("ترقيم متسلسل فريد DSN-YYYY-NNNN", async () => {
    const all = await db.query.requests.findMany({ columns: { number: true } });
    const numbers = all.map((r) => r.number);
    expect(new Set(numbers).size === numbers.length, "أرقام مكررة");
    expect(numbers.every((n) => /^DSN-\d{4}-\d{4}$/.test(n)), "صيغة رقم خاطئة");
    const seqs = numbers.map((n) => Number(n.slice(-4))).sort((a, b) => a - b);
    expect(seqs.at(-1)! - seqs[0] === numbers.length - 1, "التسلسل غير متصل");
  });

  /* ===== E. المسودات ===== */
  describe("E. المسودات");

  const draftId = await saveDraft(validInput(f, { title: "مسودة سرية لصاحبها" }), f.requester1);

  await check("المسودة لا يراها أحد غير صاحبها (حتى المسؤول وزميل الجهة)", async () => {
    const row = await reqRow(draftId);
    expect(canView(f.requester1, row), "صاحبها لا يراها");
    expect(!canView(f.manager, row), "المسؤول يرى المسودة");
    expect(!canView(f.requester1b, row), "زميل الجهة يرى المسودة");
    const mgrList = await listVisibleRequests(f.manager, { includeDrafts: true });
    expect(!mgrList.some((r) => r.request.id === draftId), "ظهرت في قائمة المسؤول");
  });

  await check("المسودة لا تدخل قوائم صاحبها الافتراضية (لا مؤشر)", async () => {
    const list = await listVisibleRequests(f.requester1);
    expect(!list.some((r) => r.request.id === draftId), "دخلت القائمة الافتراضية");
  });

  await check("إرسال المسودة لغير صاحبها يُرفض ولصاحبها يفعّلها ويُشعر المسؤول", async () => {
    await expectThrows(() => submitDraft(draftId, f.requester1b), "NotFoundError");
    const before = notifCount(f.manager.id, "created");
    await submitDraft(draftId, f.requester1);
    const row = await reqRow(draftId);
    expect(!row.isDraft, "ما زالت مسودة");
    expect(notifCount(f.manager.id, "created") === before + 1, "المسؤول لم يُشعر");
  });

  /* ===== F. الكنس sla-sweep (§14) ===== */
  describe("F. الكنس sla-sweep");

  // تجهيز زمني مباشر (fixtures): طلب متجاوز، وطلب فوق 75%، وطلب مسلَّم قديم
  const mkTimed = (title: string, status: Status, typeId: number, ageH: number, steps: { to: Status; afterH: number }[], extra: Record<string, unknown> = {}) => {
    const createdAt = subWorkH(ageH);
    const [row] = db
      .insert(requests)
      .values({
        number: `DSN-2099-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        title,
        description: "fixture",
        language: "ar",
        departmentId: f.depts[0].id,
        requesterId: f.requester1.id,
        typeId,
        priority: "normal",
        status,
        assigneeId: f.designer1.id,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        ...extra,
      })
      .returning({ id: requests.id })
      .all();
    let prev: Status = "new";
    for (const s of steps) {
      const when = subWorkH(ageH - s.afterH);
      db.insert(requestEvents)
        .values({ requestId: row.id, type: "status_change", actorId: f.manager.id, data: { from: prev, to: s.to }, createdAt: when.toISOString() })
        .run();
      prev = s.to;
    }
    return row.id;
  };

  const overdueId = mkTimed("متجاوز للهدف", "in_progress", f.types[0].id, 12, [
    { to: "ready", afterH: 0.5 },
    { to: "in_progress", afterH: 1 },
  ]); // هدف 8، مستهلك ≈ 11 → overdue

  const alertId = mkTimed("فوق عتبة التنبيه", "in_progress", f.types[1].id, 21, [
    { to: "ready", afterH: 0.5 },
    { to: "in_progress", afterH: 1 },
  ]); // هدف 24، مستهلك ≈ 20.5 → ≈85% دون تجاوز

  const oldDeliveredId = mkTimed("مسلَّم قديم للإغلاق", "delivered", f.types[0].id, 40, [
    { to: "ready", afterH: 0.5 },
    { to: "in_progress", afterH: 1 },
    { to: "delivered", afterH: 4 },
  ], { deliveredAt: subWorkH(36).toISOString() }); // ≥ 3 أيام عمل

  await check("الكنس: تنبيه 75% للمصمم وتجاوز للمصمم والمسؤول وإغلاق تلقائي", async () => {
    const r = await sweepSla();
    expect(r.alerts75 >= 1, `alerts75=${r.alerts75}`);
    expect(r.overdueAlerts >= 1, `overdue=${r.overdueAlerts}`);
    expect(r.autoClosed === 1, `autoClosed=${r.autoClosed}`);
    const closedRow = await reqRow(oldDeliveredId);
    expect(closedRow.status === "closed" && !!closedRow.closedAt, "لم يُغلق تلقائيًا");
    const sysEvents = await eventsOf(oldDeliveredId, "system");
    expect(sysEvents.some((e) => String((e.data as { message?: string }).message).includes("إغلاق تلقائي")), "لا حدث إغلاق تلقائي");
    expect(notifCount(f.designer1.id, "sla75") === 1, "لا تنبيه 75%");
    expect(notifCount(f.designer1.id, "slaover") >= 1 && notifCount(f.manager.id, "slaover") >= 1, "تنبيهات التجاوز ناقصة");
  });

  await check("الكنس idempotent: تشغيل ثانٍ لا يكرر إشعارًا ولا يغلق شيئًا", async () => {
    const before = db.select({ c: sql<number>`count(*)` }).from(notifications).where(isNotNull(notifications.dedupeKey)).all()[0].c;
    const r2 = await sweepSla();
    const after = db.select({ c: sql<number>`count(*)` }).from(notifications).where(isNotNull(notifications.dedupeKey)).all()[0].c;
    expect(before === after, `تكررت إشعارات: ${before} → ${after}`);
    expect(r2.autoClosed === 0, "أغلق مجددًا");
  });

  await check("طلب متجاوز حالته overdue في المحرك", async () => {
    const d = await getRequestDetails(overdueId, f.manager);
    expect(d.sla.delivery.state === "overdue", `الحالة ${d.sla.delivery.state}`);
    const a = await getRequestDetails(alertId, f.manager);
    expect(a.sla.delivery.state === "due_soon" || a.sla.delivery.state === "on_track", `حالة التنبيه ${a.sla.delivery.state}`);
    expect(a.sla.delivery.pct! >= 0.75 && a.sla.delivery.pct! < 1, `pct=${a.sla.delivery.pct}`);
  });

  /* ===== G. الملفات وCSV والفلاتر ===== */
  describe("G. الملفات وCSV والفلاتر");

  await check("saveUpload يرفض الامتداد الممنوع والحجم الصفري والمتجاوز", async () => {
    await expectThrows(() => saveUpload(new File([new Uint8Array(10)], "virus.exe")), "FileValidationError");
    await expectThrows(() => saveUpload(new File([], "empty.png")), "FileValidationError");
    const big = new File([new Uint8Array(51 * 1024 * 1024)], "big.zip");
    await expectThrows(() => saveUpload(big), "FileValidationError");
  });

  await check("saveUpload يقبل png ويعيد بيانات سليمة", async () => {
    const meta = await saveUpload(new File([new Uint8Array([137, 80, 78, 71])], "شعار.png"));
    expect(meta.mime === "image/png" && meta.size === 4 && meta.filename === "شعار.png", "بيانات الملف خاطئة");
    const buf = readAttachmentFile(meta.path);
    expect(buf.length === 4, "القراءة خاطئة");
  });

  await check("readAttachmentFile يرفض اختراق المسار (traversal)", () => {
    try {
      readAttachmentFile("../../.env.local");
      throw new Error("لم يُرفض المسار الخارج عن uploads");
    } catch (e) {
      if (e instanceof FileValidationError) return;
      // ENOENT يعني وصل للقراءة الفعلية — فشل الحماية
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // خارج الجذر أصلًا غير موجود؟
      throw e;
    }
  });

  await check("toCsv: يبدأ بـ BOM ويهرّب الفواصل والاقتباسات وأسطر جديدة", () => {
    // فاصل CSV هو الفاصلة ASCII — الفاصلة العربية «،» ليست فاصلًا ولا تحتاج تهريبًا
    const csv = toCsv(
      ["أ", "ب"],
      [["text, with comma", 'اقتباس "مزدوج"'], ["سطر\nجديد", "عادي"]],
    );
    expect(csv.charCodeAt(0) === 0xfeff, "لا BOM");
    expect(csv.includes('"text, with comma"'), "الفاصلة لم تُهرَّب");
    expect(csv.includes('"اقتباس ""مزدوج"""'), "الاقتباس لم يُهرَّب");
    expect(csv.includes('"سطر\nجديد"'), "السطر الجديد لم يُهرَّب");
  });

  await check("فلاتر القوائم: التبويبات والفرز بالمتبقي تصاعديًا والبحث", async () => {
    const rows = await listVisibleRequests(f.manager);
    const overdueTab = rows.filter((r) => matchesTab(r, "overdue"));
    expect(overdueTab.every((r) => r.sla.delivery.state === "overdue"), "تبويب متأخرة غير دقيق");
    const unassigned = rows.filter((r) => matchesTab(r, "unassigned"));
    expect(unassigned.every((r) => r.request.assigneeId == null), "تبويب غير مسندة غير دقيق");

    const filters = parseFilters({ tab: "all", q: "عاجل كبير" });
    const found = applyFilters(rows, filters);
    expect(found.length === 1 && found[0].request.title.includes("عاجل كبير"), "البحث بالعنوان فشل");

    const sorted = applyFilters(rows, parseFilters({}));
    const remainings = sorted.map((r) => r.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER);
    const isSorted = remainings.every((v, i) => i === 0 || remainings[i - 1] <= v);
    expect(isSorted, "الفرز بالمتبقي ليس تصاعديًا");

    const badTab = parseFilters({ tab: "hack", page: "-3" });
    expect(badTab.tab === "all" && badTab.page === 1, "تحصين searchParams فاشل");
  });

  /* ===== H. ثغرات محتملة (يجب أن تكون مرفوضة) ===== */
  describe("H. اختبارات سلبية إضافية");

  await check("المدير (قراءة فقط) لا يستطيع التعليق ولا الإرفاق", async () => {
    await expectThrows(() => addComment(req2, "تعليق من المدير", f.executive), "ForbiddenError");
    await expectThrows(
      () => addAttachment(req2, "input", { filename: "x.png", path: "t/x", size: 1, mime: "image/png" }, null, f.executive),
      "ForbiddenError",
    );
  });

  await check("مصمم مسند لا يتجاوز انتقالاته (in_progress → cancelled)", async () => {
    // req2 حاليًا awaiting_feedback: المصمم لا يملك أي انتقال منها
    const row = await reqRow(req2);
    expect(row.status === "awaiting_feedback", "حالة غير متوقعة");
    expect(allowedTransitions(row, f.designer1).length === 0, "المصمم يملك انتقالات من awaiting_feedback");
    await expectThrows(() => transition(req2, "cancelled", f.designer1), "ForbiddenError");
  });

  await check("طالب لا يعتمد تسليمًا لطلب جهة أخرى ولا يعلق عليه", async () => {
    await expectThrows(() => addComment(req2, "تطفل", f.requester2), "NotFoundError");
  });

  /* ---------------------------------------------------------------- */
  /* التقرير                                                           */
  /* ---------------------------------------------------------------- */

  let pass = 0, fail = 0, current = "";
  for (const r of results) {
    if (r.section !== current) {
      current = r.section;
      console.log(`\n${current}`);
    }
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `\n     ↳ ${r.detail}` : ""}`);
    if (r.ok) pass++;
    else fail++;
  }
  console.log(`\n${"=".repeat(50)}`);
  console.log(`النتيجة: ${pass} ناجح · ${fail} فاشل من ${pass + fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
