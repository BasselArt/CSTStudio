// مخططات Zod — تُعرَّف مرة واحدة وتُستخدم في النموذج (client) وserver action معًا (SPEC §4.6).

import { z } from "zod";
import { PRIORITIES, ROLES, STATUSES } from "@/core/constants";

export const loginSchema = z.object({
  email: z.string().email("أدخل بريدًا إلكترونيًا صحيحًا."),
  password: z.string().min(1, "أدخل كلمة المرور."),
});

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? undefined : v));

export const createRequestSchema = z.object({
  departmentId: z.coerce.number().int().positive("اختر الجهة."),
  contact: z
    .string()
    .min(3, "أدخل البريد الإلكتروني أو رقم التواصل.")
    .max(150, "قيمة التواصل طويلة."),
  title: z
    .string()
    .min(5, "يرجى إدخال عنوان الطلب.")
    .max(150, "العنوان يتجاوز 150 حرفًا."),
  typeId: z.coerce.number().int().positive("اختر نوع التصميم."),
  description: z
    .string()
    .min(10, "اشرح المطلوب بالتفصيل (10 أحرف على الأقل).")
    .max(500, "الوصف يتجاوز 500 حرف."),
  goal: optionalText(500),
  audience: optionalText(300),
  language: z.enum(["ar", "en", "both"], "اختر لغة التصميم."),
  publishDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "اختر تاريخ النشر المطلوب."),
  sizes: z
    .string()
    .min(2, "أدخل المقاسات المطلوبة.")
    .max(200, "المقاسات تتجاوز 200 حرف."),
  channel: z.string().min(2, "اختر قناة الاستخدام.").max(100),
  priority: z.enum(PRIORITIES, "اختر الأولوية."),
  urgentJustification: optionalText(500),
  /** طلب تعديل مرتبط بطلب أصلي بعد استنفاد جولات المراجعة (SPEC §6) */
  relatedRequestId: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().positive().optional(),
  ),
  /** حقول القسم الرابع غير المخزنة كأعمدة — تُحفظ في حدث الإنشاء (سجل التغييرات) */
  referenceLinks: optionalText(500),
  requiredTexts: optionalText(1000),
  extraNotes: optionalText(1000),
})
.superRefine((val, ctx) => {
  if (val.priority === "urgent" && !val.urgentJustification) {
    ctx.addIssue({
      code: "custom",
      path: ["urgentJustification"],
      message: "مبرر الأولوية العاجل مطلوب.",
    });
  }
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const transitionSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  to: z.enum(STATUSES),
  note: optionalText(500),
});

export const commentSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  body: z.string().min(1, "اكتب تعليقًا.").max(1000, "التعليق يتجاوز 1000 حرف."),
});

export const assignSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  designerId: z.coerce.number().int().positive("اختر مصممًا."),
});

export const requestInfoSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  message: z
    .string()
    .min(5, "وضّح البيانات المطلوب استكمالها.")
    .max(500),
});

export const cancelSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  reason: z.string().min(3, "اذكر سبب الإلغاء.").max(500),
});

export const declineUrgentSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  reason: z.string().min(3, "اذكر سبب رفض الاستعجال.").max(500),
});

export const approveUrgentSchema = z.object({
  requestId: z.coerce.number().int().positive(),
  /** للأنواع التي عاجلها «باتفاق» (slaUrgentH = null): المدة المتفق عليها */
  agreedTargetH: z.coerce.number().int().positive().optional(),
});

export const settingsSchema = z.object({
  workDays: z.array(z.number().int().min(0).max(6)).min(1, "اختر يوم عمل واحدًا على الأقل."),
  workStart: z.string().regex(/^\d{2}:\d{2}$/, "صيغة الوقت HH:MM."),
  workEnd: z.string().regex(/^\d{2}:\d{2}$/, "صيغة الوقت HH:MM."),
  holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  alertThresholdPct: z.coerce.number().int().min(1).max(100),
  autoCloseWorkDays: z.coerce.number().int().min(1).max(30),
  maxReviewRounds: z.coerce.number().int().min(1).max(10),
  loadLowPct: z.coerce.number().int().min(1).max(100),
  loadHighPct: z.coerce.number().int().min(1).max(100),
  responseSlaH: z.coerce.number().int().min(1).max(40),
})
.refine((v) => v.loadLowPct < v.loadHighPct, {
  path: ["loadHighPct"],
  message: "عتبة الحمل المرتفع يجب أن تتجاوز عتبة المنخفض.",
})
.refine((v) => v.workStart < v.workEnd, {
  path: ["workEnd"],
  message: "نهاية الدوام يجب أن تلي بدايته.",
});

const userFields = {
  name: z.string().min(3, "أدخل الاسم الكامل.").max(100, "الاسم يتجاوز 100 حرف."),
  email: z.string().email("أدخل بريدًا إلكترونيًا صحيحًا.").max(150),
  role: z.enum(ROLES, "اختر الدور."),
  departmentId: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  capacityPoints: z.coerce.number().int().min(1).max(200),
};

const requireRequesterDepartment = (
  val: { role: string; departmentId: number | null },
  ctx: z.RefinementCtx,
) => {
  if (val.role === "requester" && val.departmentId == null) {
    ctx.addIssue({
      code: "custom",
      path: ["departmentId"],
      message: "طالب الخدمة يجب أن يتبع جهة.",
    });
  }
};

export const userCreateSchema = z
  .object({
    ...userFields,
    password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل.").max(100),
  })
  .superRefine(requireRequesterDepartment);

export const userUpdateSchema = z
  .object({
    ...userFields,
    id: z.coerce.number().int().positive(),
    /** فارغ = إبقاء كلمة المرور الحالية */
    password: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.string().min(8, "كلمة المرور 8 أحرف على الأقل.").max(100).optional(),
    ),
  })
  .superRefine(requireRequesterDepartment);

export const requestTypeUpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  effortPoints: z.coerce.number().int().min(1).max(100),
  slaNormalH: z.coerce.number().int().min(1).max(400),
  slaHighH: z.coerce.number().int().min(1).max(400),
  /** فارغ = «باتفاق» (null) */
  slaUrgentH: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().min(1).max(400).nullable(),
  ),
});
