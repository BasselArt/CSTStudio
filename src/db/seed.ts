// بذور حتمية وقابلة لإعادة التشغيل (SPEC §15).
// تُدرج الأحداث مباشرة (استثناء موثق لقاعدة §4.2 — البذور خارج مسار التشغيل)
// وتبني سلاسل status_change بساعات عمل حقيقية عبر core/calendar حتى تنتج
// المشاهد نفسها في الصور: متأخرة، مستحقة قريبًا، متوقفة، ومسلَّمة بإصدارات.
// أحجام (unitCount) ومواعيد النشر للطلبات النشطة مضبوطة بحيث يبقى مزيج SLA
// متوازنًا (على المسار/مستحقة قريبًا/متأخرة قليلة) نحو أسبوعين بعد الزرع —
// فترة التجربة — بدل أن تنقلب كلها «متأخرة» بعد يوم واحد.

import fs from "node:fs";
import path from "node:path";
import { hashSync } from "bcryptjs";
import { db } from "./index";
import {
  attachments,
  departments,
  notifications,
  requestCounters,
  requestEvents,
  requests,
  requestTypes,
  settings,
  users,
} from "./schema";
import { addWorkingHours, workingHoursBetween } from "@/core/calendar";
import type { CalendarCfg, Priority, Status } from "@/core/types";

const DEV_PASSWORD = "Cst@2026"; // موثقة في README — للتطوير فقط

const cfg: CalendarCfg = {
  workDays: [0, 1, 2, 3, 4],
  workStart: "08:00",
  workEnd: "16:00",
  holidays: [],
};

const now = new Date();

/** لحظة تسبق `from` بعدد ساعات عمل معيّن (بحث خلفي بدقة 15 دقيقة — كافٍ للبذور) */
function subWorkingHours(from: Date, hours: number): Date {
  let candidate = new Date(from.getTime() - hours * 3_600_000);
  for (let i = 0; i < 40_000; i++) {
    if (workingHoursBetween(candidate, from, cfg) >= hours) return candidate;
    candidate = new Date(candidate.getTime() - 15 * 60_000);
  }
  throw new Error("subWorkingHours: تجاوز حد البحث");
}

const iso = (d: Date) => d.toISOString();

/* ------------------------------------------------------------------ */

interface Step {
  to: Status;
  /** ساعات عمل بعد إنشاء الطلب */
  afterH: number;
  note?: string;
}

interface SeedComment {
  by: "requester" | "designer" | "manager";
  body: string;
  afterH: number;
}

interface SeedAttachment {
  kind: "input" | "deliverable";
  filename: string;
  mime?: string;
  /** رابط خارجي بدل ملف مرفوع (تسليم بالروابط) */
  url?: string;
  version?: string;
  afterH: number;
  by: "requester" | "designer";
}

interface SeedRequest {
  title: string;
  description: string;
  dept: string;
  requesterEmail: string;
  typeName: string;
  priority: Priority;
  designerEmail?: string;
  /** عمر الطلب بساعات العمل حتى الآن */
  ageH: number;
  steps: Step[];
  goal?: string;
  audience?: string;
  sizes?: string;
  /** حجم الطلب بوحدات النوع — يوسّع هدف SLA */
  unitCount?: number;
  /** قناة الاستخدام المعروضة في تفاصيل الطلب */
  channel?: string;
  publishDueWorkH?: number;
  urgentJustification?: string;
  urgentApprovedAfterH?: number;
  cancelReason?: string;
  isDraft?: boolean;
  comments?: SeedComment[];
  files?: SeedAttachment[];
}

/* ------------------------------------------------------------------ */

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function placeholderFile(filename: string): Buffer {
  if (filename.endsWith(".png") || filename.endsWith(".jpg")) return PNG_1PX;
  if (filename.endsWith(".pdf")) {
    return Buffer.from(
      `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF\n`,
    );
  }
  return Buffer.from(`ملف تجريبي من البذور: ${filename}\n`.repeat(20), "utf8");
}

async function main() {
  console.log("🌱 بدء البذور…");

  // ترتيب الحذف يراعي القيود المرجعية
  db.delete(notifications).run();
  db.delete(attachments).run();
  db.delete(requestEvents).run();
  db.delete(requests).run();
  db.delete(requestCounters).run();
  db.delete(users).run();
  db.delete(departments).run();
  db.delete(requestTypes).run();
  db.delete(settings).run();

  /* الإعدادات (SPEC §5) */
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
      orgName: "استوديو التصميم",
      orgSubtitle: "هيئة الاتصالات والفضاء والتقنية",
      logoPath: null,
      channels: [
        "منصات التواصل الاجتماعي",
        "الموقع الإلكتروني",
        "مطبوعات",
        "شاشات داخلية",
        "عروض تقديمية",
        "فعاليات",
        "البريد الداخلي",
      ],
      sizeOptions: [
        "1080x1080 (مربع)",
        "1080x1920 (ستوري)",
        "1920x1080 (شاشة)",
        "A4",
        "A5",
        "بانر ويب 1920x600",
        "بطاقة عمل 85x55mm",
        "SVG / PNG شفاف",
      ],
      allowedFileTypes: [
        "jpg", "jpeg", "png", "gif", "webp", "svg", "pdf", "mp4", "mov",
        "zip", "rar", "ai", "psd", "eps", "ppt", "pptx", "doc", "docx", "xls", "xlsx",
      ],
    })
    .run();

  /* الأنواع الأربعة بقيم مصفوفة §9 */
  const typeRows = db
    .insert(requestTypes)
    .values([
      { name: "تعديل بسيط", description: "تعديلات على تصميم حالي أو تصحيح فني", effortPoints: 1, slaNormalH: 8, slaHighH: 4, slaUrgentH: 2, sortOrder: 1 },
      { name: "تصميم بسيط", description: "تصاميم أحادية أو مواد تواصل بسيطة", effortPoints: 2, slaNormalH: 8, slaHighH: 6, slaUrgentH: 4, unitLabel: "مادة", baseUnits: 1, extraUnitH: 2, sortOrder: 2 },
      { name: "تصميم متوسط", description: "تصاميم متعددة الصفحات أو مواد ترويجية متكاملة", effortPoints: 5, slaNormalH: 24, slaHighH: 16, slaUrgentH: 8, unitLabel: "صفحة/شريحة", baseUnits: 5, extraUnitH: 1.5, sortOrder: 3 },
      { name: "تصميم كبير", description: "مشاريع معقدة متعددة الشاشات أو الحملات المتكاملة", effortPoints: 10, slaNormalH: 40, slaHighH: 32, slaUrgentH: null, unitLabel: "صفحة/شريحة", baseUnits: 10, extraUnitH: 2, sortOrder: 4 },
    ])
    .returning()
    .all();
  const typeByName = new Map(typeRows.map((t) => [t.name, t]));

  /* الجهات */
  const deptRows = db
    .insert(departments)
    .values([
      { name: "الاتصال المؤسسي" },
      { name: "الشؤون القانونية" },
      { name: "تقنية المعلومات" },
      { name: "الموارد البشرية" },
      { name: "إدارة المشاريع" },
    ])
    .returning()
    .all();
  const deptByName = new Map(deptRows.map((d) => [d.name, d]));

  /* المستخدمون */
  const passwordHash = hashSync(DEV_PASSWORD, 10);
  const createdAtIso = iso(subWorkingHours(now, 400));
  const mkUser = (
    name: string,
    email: string,
    role: "requester" | "studio_manager" | "designer" | "executive",
    dept?: string,
    capacityPoints = 20,
  ) => ({
    name,
    email,
    passwordHash,
    role,
    departmentId: dept ? deptByName.get(dept)!.id : null,
    capacityPoints,
    isActive: true,
    createdAt: createdAtIso,
  });

  const userRows = db
    .insert(users)
    .values([
      mkUser("محمد خولي", "m.alkhouli@cst.gov.sa", "studio_manager"),
      mkUser("نورة الشهري", "n.alshahri@cst.gov.sa", "designer"),
      mkUser("سارة المطيري", "s.almutairi@cst.gov.sa", "designer"),
      mkUser("محمد صبحي", "m.sobhy@cst.gov.sa", "designer"),
      mkUser("أحمد نبيل", "a.nabil@cst.gov.sa", "designer"),
      mkUser("أحمد السعيد", "a.alsaeed@cst.gov.sa", "designer"),
      mkUser("ريم العتيبي", "r.alotaibi@cst.gov.sa", "designer"),
      mkUser("مها القحطاني", "m.alqahtani@cst.gov.sa", "requester", "الاتصال المؤسسي"),
      mkUser("فهد العنزي", "f.alanazi@cst.gov.sa", "requester", "الشؤون القانونية"),
      mkUser("عبدالله السبيعي", "a.alsubaie@cst.gov.sa", "requester", "تقنية المعلومات"),
      mkUser("سلمى الدوسري", "s.aldossari@cst.gov.sa", "requester", "الموارد البشرية"),
      mkUser("يوسف الشمري", "y.alshammari@cst.gov.sa", "requester", "إدارة المشاريع"),
      mkUser("محمد العبدان", "m.alabdan@cst.gov.sa", "executive"),
    ])
    .returning()
    .all();
  const userByEmail = new Map(userRows.map((u) => [u.email, u]));
  const manager = userByEmail.get("m.alkhouli@cst.gov.sa")!;

  /* ------------------------------------------------------------------ */
  /* الطلبات (~34) — موزعة واقعيًا على الحالات (SPEC §15)                */
  /* ------------------------------------------------------------------ */

  const R = (r: SeedRequest) => r;
  const seedRequests: SeedRequest[] = [
    // --- جديدة
    R({
      title: "بنر لوحة إعلانات داخلية",
      description: "بنر تعريفي للوحة الإعلانات الداخلية في بهو المبنى الرئيسي.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", ageH: 1, steps: [],
      sizes: "1920x1080", channel: "شاشات داخلية", publishDueWorkH: 40,
    }),
    R({
      title: "تحديث غلاف دليل الموظف",
      description: "تحديث غلاف دليل الموظف ليتوافق مع الهوية الجديدة.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", ageH: 6, steps: [],
      sizes: "A4", channel: "مطبوعات", publishDueWorkH: 24,
    }),
    R({
      title: "مواد مؤتمر صحفي طارئ",
      description: "خلفية منصة وشارات أسماء لمؤتمر صحفي يُعقد بعد يومين.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "urgent", ageH: 2, steps: [],
      urgentJustification: "توجيه من معالي المحافظ بعقد مؤتمر صحفي خلال 48 ساعة.",
      sizes: "3000x2000، A5", unitCount: 12,
      channel: "فعاليات", publishDueWorkH: 16,
    }),
    // --- تحتاج استكمال
    R({
      title: "إنفوغرافيك خدمات المنصة الرقمية",
      description: "إنفوغرافيك يلخص خدمات المنصة الرقمية الجديدة للجمهور.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", ageH: 10,
      steps: [{ to: "needs_info", afterH: 2, note: "نحتاج قائمة الخدمات النهائية المعتمدة قبل البدء." }],
      sizes: "1080x1920", channel: "منصات التواصل الاجتماعي", publishDueWorkH: 60,
    }),
    R({
      title: "مطوية التوعية القانونية",
      description: "مطوية عن حقوق المستفيدين والتزامات مقدمي الخدمة.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 20,
      steps: [
        { to: "ready", afterH: 3 },
        { to: "in_progress", afterH: 4 },
        { to: "needs_info", afterH: 8, note: "النص القانوني في الصفحة الثانية ناقص — نحتاج الفقرة المعتمدة." },
      ],
      sizes: "A4 مطوية ثلاثية", channel: "مطبوعات", publishDueWorkH: 80,
    }),
    // --- جاهزة للتنفيذ
    R({
      title: "منشورات اليوم العالمي للاتصالات",
      description: "سلسلة ثلاثة منشورات لليوم العالمي للاتصالات ومجتمع المعلومات.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 3, steps: [{ to: "ready", afterH: 1 }],
      sizes: "1080x1080", unitCount: 3,
      channel: "منصات التواصل الاجتماعي", publishDueWorkH: 32,
    }),
    R({
      title: "قالب شهادات الدورات الداخلية",
      description: "قالب شهادة حضور موحد للدورات التدريبية الداخلية.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 4, steps: [{ to: "ready", afterH: 1 }],
      sizes: "A4 أفقي", channel: "مطبوعات", publishDueWorkH: 48,
    }),
    R({
      title: "شعار مبادرة الاستدامة الرقمية",
      description: "شعار فرعي لمبادرة الاستدامة الرقمية ضمن الهوية المؤسسية.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "urgent", designerEmail: "m.sobhy@cst.gov.sa",
      ageH: 2, steps: [{ to: "ready", afterH: 0.5 }],
      urgentJustification: "إطلاق المبادرة مرتبط بفعالية وزارية مؤكدة الأسبوع القادم.",
      urgentApprovedAfterH: 1,
      sizes: "SVG، PNG شفاف", channel: "هوية", publishDueWorkH: 20,
    }),
    // --- قيد التنفيذ (متأخرة × 2، مستحقة قريبًا، على المسار)
    R({
      title: "بطاقات تعريف الموظفين الجدد",
      description: "تصميم بطاقات تعريفية لدفعة الموظفين الجدد (12 موظفًا).",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 30,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 3 },
      ],
      sizes: "85x55mm", channel: "مطبوعات", publishDueWorkH: 30,
      comments: [
        { by: "requester", body: "نأمل اعتماد الصور الرسمية المرفقة في النظام.", afterH: 5 },
      ],
    }),
    R({
      title: "بنر اليوم الوطني",
      description: "بنر احتفالي لليوم الوطني للموقع الرسمي ومنصات التواصل.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 50,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 4 },
      ],
      sizes: "1920x600، 1080x1080", channel: "الموقع ومنصات التواصل", publishDueWorkH: 48,
      files: [
        { kind: "input", filename: "دليل الهوية البصرية.pdf", mime: "application/pdf", afterH: 1, by: "requester" },
      ],
    }),
    R({
      title: "غلاف تقرير التحول الرقمي",
      description: "غلاف وتصميم داخلي لتقرير التحول الرقمي السنوي.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "m.sobhy@cst.gov.sa",
      ageH: 24,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
      ],
      // 20 صفحة: 24 + 15×1.5 ≈ 47 ساعة — مستهلك 23 فتبقى ~3 أيام عمل
      sizes: "A4", unitCount: 20,
      channel: "مطبوعات وPDF", publishDueWorkH: 60,
    }),
    R({
      title: "عرض تقديمي لورشة الحوكمة",
      description: "قالب عرض تقديمي لورشة عمل الحوكمة الرقمية.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "high", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 12,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
      ],
      // عرض 45 شريحة: الهدف يتمدد من 16 إلى 16 + 40×1.5 = 76 ساعة
      sizes: "1920x1080", unitCount: 45,
      channel: "عروض تقديمية", publishDueWorkH: 90,
    }),
    R({
      title: "حملة التوظيف السنوية",
      description: "هوية بصرية متكاملة لحملة التوظيف السنوية بمخرجات متعددة.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", designerEmail: "a.nabil@cst.gov.sa",
      ageH: 6,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
      ],
      // حملة بـ 45 مخرجًا: 40 + 35×2 = 110 ساعات — على المسار طوال فترة التجربة
      sizes: "متعددة", unitCount: 45,
      channel: "حملة متكاملة", publishDueWorkH: 120,
    }),
    R({
      title: "تعديل ألوان مطوية الخدمات",
      description: "مواءمة ألوان مطوية الخدمات مع تحديث الهوية.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 2,
      steps: [
        { to: "ready", afterH: 0.5 },
        { to: "in_progress", afterH: 1 },
      ],
      sizes: "A4", channel: "مطبوعات", publishDueWorkH: 10,
    }),
    R({
      title: "شريحة عرض لمشروع التحول الرقمي",
      description: "شريحة موجزة عن مؤشرات مشروع التحول الرقمي للعرض التنفيذي.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "urgent", designerEmail: "r.alotaibi@cst.gov.sa",
      ageH: 5,
      steps: [
        { to: "ready", afterH: 0.5 },
        { to: "in_progress", afterH: 1 },
      ],
      urgentJustification: "العرض أمام اللجنة التنفيذية صباح الغد.",
      urgentApprovedAfterH: 0.75,
      sizes: "1920x1080", unitCount: 1,
      channel: "عروض تقديمية", publishDueWorkH: 8,
    }),
    R({
      title: "تعديل نموذج خطاب رسمي",
      description: "تعديل ترويسة نموذج الخطاب الرسمي وإضافة حقل الرمز البريدي.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 2,
      steps: [
        { to: "ready", afterH: 0.5 },
        { to: "in_progress", afterH: 0.75 },
      ],
      sizes: "A4", channel: "مطبوعات", publishDueWorkH: 12,
    }),
    // --- قيد المراجعة الداخلية
    R({
      title: "منشورات حملة الأمن السيبراني",
      description: "حزمة من عشرين مادة توعوية لحملة الأمن السيبراني الوطنية.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم كبير", priority: "high", designerEmail: "m.sobhy@cst.gov.sa",
      ageH: 20,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "internal_review", afterH: 16 },
      ],
      // 20 مادة: 32 + 10×2 = 52 ساعة — مستهلك 19 فتبقى ~4 أيام عمل
      sizes: "1080x1080، 1080x1920", unitCount: 20,
      channel: "منصات التواصل الاجتماعي", publishDueWorkH: 60,
      files: [
        { kind: "deliverable", filename: "مسودة أولية.png", mime: "image/png", version: "v0.1", afterH: 15, by: "designer" },
      ],
    }),
    R({
      title: "إنفوغرافيك مؤشرات الأداء",
      description: "إنفوغرافيك مؤشرات الأداء الربعية للنشر الداخلي.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "high", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 10,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "internal_review", afterH: 8 },
      ],
      sizes: "A3", channel: "مطبوعات وشاشات", publishDueWorkH: 20,
    }),
    R({
      title: "تحديث قالب العرض التقديمي",
      description: "تحديث القالب الرسمي للعروض التقديمية بالهوية الجديدة.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 6,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "internal_review", afterH: 4 },
      ],
      sizes: "1920x1080", channel: "عروض تقديمية", publishDueWorkH: 14,
    }),
    R({
      title: "مطوية خدمات الهيئة",
      description: "مطوية شاملة بخدمات الهيئة للجمهور — طباعة ونسخة رقمية.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 10,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 1.5 },
        { to: "internal_review", afterH: 9 },
      ],
      // 12 صفحة: 40 + 2×2 = 44 ساعة — مستهلك 9 فتبقى ~4 أيام عمل
      sizes: "A4 مطوية", unitCount: 12,
      channel: "مطبوعات", publishDueWorkH: 56,
    }),
    // --- بانتظار ملاحظات الجهة (متوقفة) — منها الحالة الذهبية
    R({
      title: "إنفوغرافيك تقرير الأداء السنوي",
      description: "إنفوغرافيك تفصيلي لأبرز أرقام تقرير الأداء السنوي 2025.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم كبير", priority: "high", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 24,
      steps: [
        { to: "ready", afterH: 0 },
        { to: "in_progress", afterH: 1 },
        { to: "awaiting_feedback", afterH: 18, note: "نسخة أولى مرفوعة — بانتظار ملاحظات الجهة." },
      ],
      goal: "إبراز أبرز إنجازات ومؤشرات العام في مادة واحدة سهلة القراءة.",
      audience: "الجمهور العام والإعلام",
      sizes: "1080x1920، 1080x1080", channel: "منصات التواصل الاجتماعي", publishDueWorkH: 40,
      comments: [
        { by: "requester", body: "هل يمكن تعديل ألوان الشريحة الثالثة وفق دليل الهوية المرفق؟", afterH: 19 },
        { by: "designer", body: "تم استلام الملاحظة. سأقوم بالتعديل ورفع إصدار جديد اليوم.", afterH: 19.5 },
        { by: "requester", body: "شكرًا لك. نحتاج النسخة النهائية قبل الخميس.", afterH: 20 },
      ],
      files: [
        { kind: "input", filename: "النصوص والمحتوى.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", afterH: 0.1, by: "requester" },
        { kind: "input", filename: "دليل الهوية البصرية.pdf", mime: "application/pdf", afterH: 0.2, by: "requester" },
        { kind: "input", filename: "بيانات تقرير الأداء 2025.pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", afterH: 0.3, by: "requester" },
        { kind: "deliverable", filename: "المخطط المبدئي.pdf", mime: "application/pdf", version: "v0.1", afterH: 8, by: "designer" },
        { kind: "deliverable", filename: "مسودة أولية.png", mime: "image/png", version: "v0.2", afterH: 12, by: "designer" },
        { kind: "deliverable", filename: "الإنفوغرافيك - الإصدار الأول.pdf", mime: "application/pdf", version: "v1.0", afterH: 17, by: "designer" },
        { kind: "deliverable", filename: "figma.com", url: "https://www.figma.com/file/annual-report-infographic", version: "v1.0", afterH: 17.2, by: "designer" },
      ],
    }),
    R({
      title: "هوية فعالية الابتكار الداخلي",
      description: "هوية بصرية مصغرة لفعالية الابتكار الداخلي السنوية.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم كبير", priority: "high", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 30,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "awaiting_feedback", afterH: 20 },
      ],
      sizes: "متعددة", channel: "فعاليات", publishDueWorkH: 64,
    }),
    R({
      title: "تعديل أيقونات دليل الاستخدام",
      description: "استبدال أيقونات قديمة في دليل استخدام البوابة.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "r.alotaibi@cst.gov.sa",
      ageH: 4,
      steps: [
        { to: "ready", afterH: 0.5 },
        { to: "in_progress", afterH: 1 },
        { to: "awaiting_feedback", afterH: 2 },
      ],
      sizes: "SVG", channel: "رقمي", publishDueWorkH: 12,
    }),
    // --- موقوفة مؤقتًا بقرار المسؤول (عدّاد SLA متوقف)
    R({
      title: "كتيب ملتقى الشركاء السنوي",
      description: "كتيب تعريفي لملتقى الشركاء — أُجّل الملتقى لحين اعتماد الموعد الجديد.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "a.nabil@cst.gov.sa",
      ageH: 28,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "on_hold", afterH: 8, note: "تأجيل الملتقى لحين اعتماد الموعد الجديد من اللجنة — إيقاف مؤقت بقرار المسؤول." },
      ],
      sizes: "A5", unitCount: 12, channel: "فعاليات", publishDueWorkH: 80,
    }),
    // --- تم التسليم
    R({
      title: "شهادة شكر للمتقاعدين",
      description: "تصميم شهادة شكر وتقدير لحفل المتقاعدين.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "a.nabil@cst.gov.sa",
      ageH: 20,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "internal_review", afterH: 12 },
        { to: "delivered", afterH: 16 },
      ],
      sizes: "A4 أفقي", channel: "مطبوعات", publishDueWorkH: 30,
      files: [
        { kind: "deliverable", filename: "الشهادة النهائية.pdf", mime: "application/pdf", version: "v1.0", afterH: 15.5, by: "designer" },
      ],
    }),
    R({
      title: "منشور تهنئة باليوم الوطني",
      description: "منشور تهنئة رسمي بمناسبة اليوم الوطني.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 14,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "delivered", afterH: 12 }, // مستهلك 11 > هدف 8 → تسليم متأخر
      ],
      sizes: "1080x1080", channel: "منصات التواصل الاجتماعي", publishDueWorkH: 10,
    }),
    R({
      title: "تعديل جدول الاجتماعات الأسبوعي",
      description: "تعديل تصميم جدول الاجتماعات المعروض على الشاشات.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "high", designerEmail: "r.alotaibi@cst.gov.sa",
      ageH: 5,
      steps: [
        { to: "ready", afterH: 0.25 },
        { to: "in_progress", afterH: 0.5 },
        { to: "delivered", afterH: 3 },
      ],
      sizes: "1920x1080", channel: "شاشات داخلية", publishDueWorkH: 6,
    }),
    R({
      title: "بنر ورشة عمل الأمن السيبراني",
      description: "بنر إعلاني لورشة عمل الأمن السيبراني للموظفين.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "high", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 8,
      steps: [
        { to: "ready", afterH: 0.5 },
        { to: "in_progress", afterH: 1 },
        { to: "internal_review", afterH: 4 },
        { to: "delivered", afterH: 5.5 },
      ],
      sizes: "1200x630", channel: "البريد الداخلي والشاشات", publishDueWorkH: 12,
    }),
    // --- مغلقة
    R({
      title: "غلاف حساب المنصة X",
      description: "تحديث غلاف الحساب الرسمي على منصة X.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 40,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "delivered", afterH: 7 },
        { to: "closed", afterH: 12 },
      ],
      sizes: "1500x500", channel: "منصات التواصل الاجتماعي", publishDueWorkH: 16,
    }),
    R({
      title: "دعوة ورشة إدارة المخاطر",
      description: "بطاقة دعوة رقمية لورشة إدارة المخاطر.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "a.nabil@cst.gov.sa",
      ageH: 60,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 3 },
        { to: "internal_review", afterH: 6 },
        { to: "delivered", afterH: 8 },
        { to: "closed", afterH: 30 },
      ],
      sizes: "1080x1350", channel: "البريد الداخلي", publishDueWorkH: 20,
    }),
    R({
      title: "تقرير ملخص المشاريع الربعي",
      description: "تنسيق تقرير ملخص المشاريع الربعي مع رسوم بيانية.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "m.sobhy@cst.gov.sa",
      ageH: 80,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 4 },
        { to: "awaiting_feedback", afterH: 16 },
        { to: "in_progress", afterH: 24, note: "ملاحظات الجهة: تحديث أرقام الربع الأخير." }, // جولة مراجعة 1
        { to: "delivered", afterH: 30 },
        { to: "closed", afterH: 60 },
      ],
      // تقرير 20 صفحة بإن ديزاين: (24 + 15×1.5) × 0.9 = 42 ساعة
      sizes: "A4", unitCount: 20,
      channel: "مطبوعات وPDF", publishDueWorkH: 48,
    }),
    R({
      title: "منشور إعلان صيانة الأنظمة",
      description: "منشور إعلان عن صيانة مجدولة للأنظمة الداخلية.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "r.alotaibi@cst.gov.sa",
      ageH: 45,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "delivered", afterH: 12 }, // مستهلك 10 > هدف 8 → متأخر (يُحتسب في نسبة الالتزام)
        { to: "closed", afterH: 20 },
      ],
      sizes: "1080x1080", channel: "البريد الداخلي", publishDueWorkH: 14,
    }),
    // --- ملغاة
    R({
      title: "بروشور فعالية مؤجلة",
      description: "بروشور لفعالية تم تأجيلها لأجل غير مسمى.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal",
      ageH: 25,
      steps: [{ to: "cancelled", afterH: 4 }],
      cancelReason: "تأجيل الفعالية لأجل غير مسمى بقرار اللجنة المنظمة.",
      sizes: "A5", channel: "مطبوعات", publishDueWorkH: 40,
    }),
    R({
      title: "تعديل شعار قديم",
      description: "تعديل على شعار وحدة أُعيد هيكلتها.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 35,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "cancelled", afterH: 6 },
      ],
      cancelReason: "إلغاء الوحدة ضمن إعادة الهيكلة — لم يعد التعديل مطلوبًا.",
      sizes: "SVG", channel: "هوية", publishDueWorkH: 16,
    }),
    // --- مسودة (تظهر لصاحبها فقط)
    R({
      title: "أفكار حملة الصيف التوعوية",
      description: "مسودة مبدئية لحملة توعوية صيفية — لم تُستكمل التفاصيل بعد.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", ageH: 3, steps: [],
      isDraft: true,
      sizes: "متعددة", channel: "حملة متكاملة", publishDueWorkH: 120,
    }),
    // --- طلبات تاريخية (أعمار 185–330 ساعة عمل ≈ شهر إلى شهرين)
    // تُغذّي «مقارنة بالفترة السابقة» في لوحة المتابعة على مدى الشهر و90 يومًا:
    // مسلّمة في نافذة الشهر السابق + طويلة العمر كانت نشطة عند بداية الشهر الحالي.
    R({
      title: "دليل الهوية البصرية للمقرات",
      description: "دليل تطبيق الهوية البصرية على لوحات المقرات الداخلية والخارجية.",
      dept: "الاتصال المؤسسي", requesterEmail: "m.alqahtani@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 330,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 4 },
        { to: "delivered", afterH: 30 },
        { to: "closed", afterH: 36 },
      ],
      sizes: "A4", channel: "مطبوعات", publishDueWorkH: 40,
    }),
    R({
      title: "تصحيح بيانات بطاقة معايدة",
      description: "تصحيح أسماء ومناصب في بطاقة معايدة رسمية.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تعديل بسيط", priority: "normal", designerEmail: "a.alsaeed@cst.gov.sa",
      ageH: 300,
      steps: [
        { to: "ready", afterH: 1 },
        { to: "in_progress", afterH: 2 },
        { to: "delivered", afterH: 7 },
        { to: "closed", afterH: 12 },
      ],
      sizes: "1080x1080", channel: "البريد الداخلي", publishDueWorkH: 12,
    }),
    R({
      title: "مطوية برنامج الابتعاث",
      description: "مطوية تعريفية ببرنامج الابتعاث بمساراته الثلاثة.",
      dept: "الموارد البشرية", requesterEmail: "s.aldossari@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "high", designerEmail: "n.alshahri@cst.gov.sa",
      ageH: 260,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 5 },
        { to: "internal_review", afterH: 30 },
        { to: "delivered", afterH: 40 },
        { to: "closed", afterH: 48 },
      ],
      sizes: "A4 مطوية ثلاثية", channel: "مطبوعات", publishDueWorkH: 30,
    }),
    R({
      title: "جناح معرض التقنية الحكومي",
      description: "تصاميم جناح الهيئة في معرض التقنية الحكومي بمخرجاته المتعددة.",
      dept: "إدارة المشاريع", requesterEmail: "y.alshammari@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", designerEmail: "a.nabil@cst.gov.sa",
      ageH: 240,
      steps: [
        { to: "ready", afterH: 3 },
        { to: "in_progress", afterH: 6 },
        { to: "delivered", afterH: 33 },
        { to: "closed", afterH: 40 },
      ],
      sizes: "متعددة", channel: "فعاليات", publishDueWorkH: 50,
    }),
    R({
      title: "كتيب التقرير السنوي التنظيمي",
      description: "إخراج كتيب التقرير السنوي التنظيمي وتسليمه بعد جولة ملاحظات مطولة.",
      dept: "الشؤون القانونية", requesterEmail: "f.alanazi@cst.gov.sa",
      typeName: "تصميم كبير", priority: "normal", designerEmail: "s.almutairi@cst.gov.sa",
      ageH: 250,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 5 },
        { to: "awaiting_feedback", afterH: 60 },
        { to: "in_progress", afterH: 80 },
        { to: "delivered", afterH: 130 },
        { to: "closed", afterH: 140 },
      ],
      sizes: "A4", unitCount: 14, channel: "مطبوعات", publishDueWorkH: 90,
    }),
    R({
      title: "عرض نتائج الربع الأول",
      description: "عرض تقديمي لنتائج الربع الأول أمام اللجنة التنفيذية.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم متوسط", priority: "normal", designerEmail: "m.sobhy@cst.gov.sa",
      ageH: 200,
      steps: [
        { to: "ready", afterH: 2 },
        { to: "in_progress", afterH: 6 },
        { to: "internal_review", afterH: 100 },
        { to: "delivered", afterH: 110 },
        { to: "closed", afterH: 118 },
      ],
      sizes: "1920x1080", unitCount: 22, channel: "عروض تقديمية", publishDueWorkH: 60,
    }),
    R({
      title: "ملصقات حملة الأمن السيبراني",
      description: "سلسلة ملصقات توعوية لحملة الأمن السيبراني الداخلية.",
      dept: "تقنية المعلومات", requesterEmail: "a.alsubaie@cst.gov.sa",
      typeName: "تصميم بسيط", priority: "normal", designerEmail: "r.alotaibi@cst.gov.sa",
      ageH: 185,
      steps: [
        { to: "ready", afterH: 3 },
        { to: "in_progress", afterH: 8 },
        { to: "delivered", afterH: 90 },
        { to: "closed", afterH: 100 },
      ],
      sizes: "A3", unitCount: 4, channel: "شاشات داخلية", publishDueWorkH: 45,
    }),
  ];

  /* إدراج الطلبات وسلاسلها */
  const uploadRoot = path.join(process.cwd(), "storage", "uploads");
  fs.mkdirSync(path.join(uploadRoot, "seed"), { recursive: true });

  let counter = 139;
  let eventsCount = 0;
  let attachmentsCount = 0;

  for (const spec of seedRequests) {
    counter += 1;
    const number = `DSN-2026-${String(counter).padStart(4, "0")}`;
    const requester = userByEmail.get(spec.requesterEmail)!;
    const designer = spec.designerEmail ? userByEmail.get(spec.designerEmail)! : null;
    const type = typeByName.get(spec.typeName)!;
    const dept = deptByName.get(spec.dept)!;

    const createdAt = subWorkingHours(now, spec.ageH);
    const at = (h: number) => addWorkingHours(createdAt, h, cfg);

    const lastStep = spec.steps.at(-1);
    const status: Status = lastStep?.to ?? "new";
    const reviewRound = spec.steps.filter(
      (s, i) =>
        s.to === "in_progress" &&
        ["awaiting_feedback", "delivered"].includes(
          (spec.steps[i - 1]?.to ?? "new") as string,
        ),
    ).length;
    const deliveredStep = [...spec.steps].reverse().find((s) => s.to === "delivered");
    const closedStep = spec.steps.find((s) => s.to === "closed" || s.to === "cancelled");
    const lastEventAt = lastStep ? at(lastStep.afterH) : createdAt;
    const approvedAt =
      spec.urgentApprovedAfterH != null ? at(spec.urgentApprovedAfterH) : null;

    const [created] = db
      .insert(requests)
      .values({
        number,
        title: spec.title,
        description: spec.description,
        goal: spec.goal,
        audience: spec.audience,
        language: "ar",
        departmentId: dept.id,
        requesterId: requester.id,
        contact: requester.email,
        typeId: type.id,
        priority: spec.priority,
        urgentJustification: spec.urgentJustification,
        urgentApprovedById: approvedAt ? manager.id : null,
        urgentApprovedAt: approvedAt ? iso(approvedAt) : null,
        status,
        assigneeId: designer?.id ?? null,
        sizes: spec.sizes,
        unitCount: spec.unitCount,
        channels: spec.channel ? [spec.channel] : null,
        publishDueDate: spec.publishDueWorkH
          ? iso(addWorkingHours(createdAt, spec.publishDueWorkH, cfg)).slice(0, 10)
          : null,
        reviewRound,
        isDraft: spec.isDraft ?? false,
        deliveredAt: deliveredStep ? iso(at(deliveredStep.afterH)) : null,
        closedAt: closedStep ? iso(at(closedStep.afterH)) : null,
        cancelReason: spec.cancelReason,
        createdAt: iso(createdAt),
        updatedAt: iso(lastEventAt),
      })
      .returning({ id: requests.id })
      .all();

    const addEvent = (
      type2: string,
      actorId: number | null,
      data: Record<string, unknown>,
      when: Date,
    ) => {
      db.insert(requestEvents)
        .values({
          requestId: created.id,
          type: type2 as never,
          actorId,
          data,
          createdAt: iso(when),
        })
        .run();
      eventsCount += 1;
    };

    addEvent(
      "system",
      requester.id,
      { message: spec.isDraft ? "تم حفظ الطلب كمسودة" : "تم إنشاء الطلب" },
      createdAt,
    );

    // الإسناد قبل أول انتقال إلى ready (أو بعد الإنشاء بقليل)
    if (designer) {
      const readyStep = spec.steps.find((s) => s.to === "ready");
      const assignAt = readyStep
        ? new Date(at(readyStep.afterH).getTime() - 5 * 60_000)
        : new Date(createdAt.getTime() + 5 * 60_000);
      addEvent("assignment", manager.id, {
        designerId: designer.id,
        designerName: designer.name,
      }, assignAt);
    }

    if (approvedAt) {
      addEvent("urgent_approval", manager.id, { approved: true }, approvedAt);
    }

    let prev: Status = "new";
    for (const step of spec.steps) {
      const actorId =
        step.to === "cancelled"
          ? requester.id
          : step.to === "ready" || step.to === "closed" || step.to === "on_hold"
            ? manager.id
            : (designer?.id ?? manager.id);
      addEvent(
        "status_change",
        actorId,
        { from: prev, to: step.to, note: step.note },
        at(step.afterH),
      );
      prev = step.to;
    }

    for (const c of spec.comments ?? []) {
      const actor =
        c.by === "requester" ? requester : c.by === "manager" ? manager : (designer ?? manager);
      addEvent("comment", actor.id, { body: c.body }, at(c.afterH));
    }

    for (const f of spec.files ?? []) {
      const uploader = f.by === "requester" ? requester : (designer ?? manager);
      const when = at(f.afterH);
      let fileMeta: { path: string | null; size: number | null; mime: string | null } = {
        path: null,
        size: null,
        mime: null,
      };
      if (!f.url) {
        const buffer = placeholderFile(f.filename);
        const relPath = path.join("seed", `${counter}-${f.filename}`);
        fs.writeFileSync(path.join(uploadRoot, relPath), buffer);
        fileMeta = { path: relPath, size: buffer.length, mime: f.mime ?? null };
      }
      const [att] = db
        .insert(attachments)
        .values({
          requestId: created.id,
          kind: f.kind,
          version: f.version ?? null,
          filename: f.filename,
          url: f.url ?? null,
          ...fileMeta,
          uploadedById: uploader.id,
          createdAt: iso(when),
        })
        .returning({ id: attachments.id })
        .all();
      addEvent("attachment", uploader.id, {
        attachmentId: att.id,
        kind: f.kind,
        filename: f.filename,
        url: f.url,
        version: f.version ?? null,
      }, when);
      attachmentsCount += 1;
    }

    /* إشعارات مختارة تُبقي الجرس حيًا */
    if (!spec.isDraft && status === "new") {
      db.insert(notifications)
        .values({
          userId: manager.id,
          requestId: created.id,
          type: spec.priority === "urgent" ? "urgent_pending" : "created",
          title:
            spec.priority === "urgent"
              ? `طلب عاجل بانتظار الاعتماد: ${spec.title}`
              : `طلب جديد: ${spec.title}`,
          body: `رقم الطلب ${number}`,
          createdAt: iso(createdAt),
        })
        .run();
    }
    if (designer && ["ready", "in_progress"].includes(status)) {
      db.insert(notifications)
        .values({
          userId: designer.id,
          requestId: created.id,
          type: "assigned",
          title: `أُسند إليك الطلب ${number}`,
          body: spec.title,
          createdAt: iso(createdAt),
          readAt: status === "in_progress" ? iso(lastEventAt) : null,
        })
        .run();
    }
    if (deliveredStep) {
      db.insert(notifications)
        .values({
          userId: requester.id,
          requestId: created.id,
          type: "deliverable",
          title: `تم تسليم الطلب ${number}`,
          body: spec.title,
          createdAt: iso(at(deliveredStep.afterH)),
          readAt: closedStep ? iso(at(closedStep.afterH)) : null,
        })
        .run();
    }
  }

  db.insert(requestCounters).values({ year: 2026, lastValue: counter }).run();

  console.log(`✅ اكتملت البذور:
  - ${deptRows.length} جهات · ${userRows.length} مستخدمًا · ${typeRows.length} أنواع
  - ${seedRequests.length} طلبًا (${counter - 139} رقمًا حتى DSN-2026-${String(counter).padStart(4, "0")})
  - ${eventsCount} حدثًا · ${attachmentsCount} مرفقًا
  - كلمة مرور الجميع: ${DEV_PASSWORD}`);
}

main().then(() => process.exit(0));
