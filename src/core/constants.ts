// المصدر الحصري لنصوص الحالات والأولويات وألوانها وترتيبها (SPEC §4.1).
// ممنوع كتابة أي تسمية عربية لحالة/أولوية أو لون خارج هذا الملف.

import type {
  ColorToken,
  DesignTool,
  EventType,
  LoadState,
  Priority,
  Role,
  SlaEffect,
  SlaState,
  Status,
} from "./types";

interface StatusMeta {
  label: string;
  color: ColorToken;
  slaEffect: SlaEffect;
}

/** الترتيب الرسمي للحالات (يحكم ترتيب شريط التوزيع والقوائم) */
export const STATUSES = [
  "new",
  "needs_info",
  "ready",
  "in_progress",
  "internal_review",
  "awaiting_feedback",
  "delivered",
  "closed",
  "cancelled",
] as const satisfies readonly Status[];

export const STATUS_META: Record<Status, StatusMeta> = {
  new: { label: "جديد", color: "muted", slaEffect: "response" },
  needs_info: { label: "يحتاج استكمال", color: "warning", slaEffect: "paused" },
  ready: { label: "جاهز للتنفيذ", color: "warning", slaEffect: "running" },
  in_progress: { label: "قيد التنفيذ", color: "progress", slaEffect: "running" },
  internal_review: {
    label: "قيد المراجعة الداخلية",
    color: "info",
    slaEffect: "running",
  },
  awaiting_feedback: {
    label: "بانتظار ملاحظات الجهة",
    color: "waiting",
    slaEffect: "paused",
  },
  delivered: { label: "تم التسليم", color: "success", slaEffect: "stopped" },
  closed: { label: "مغلق", color: "muted", slaEffect: "stopped" },
  cancelled: { label: "ملغي", color: "danger", slaEffect: "excluded" },
};

export function statusOrder(s: Status): number {
  return STATUSES.indexOf(s);
}

/** الحالات المفتوحة (تدخل في «الطلبات النشطة») */
export const ACTIVE_STATUSES: readonly Status[] = STATUSES.filter(
  (s) => !["delivered", "closed", "cancelled"].includes(s),
);

/** الحالات المشغِّلة لعدّاد التسليم (SPEC §9) */
export const RUNNING_STATUSES: readonly Status[] = STATUSES.filter(
  (s) => STATUS_META[s].slaEffect === "running",
);

/** الحالتان الموقِفتان — انتظار على الجهة (SPEC §9) */
export const PAUSED_STATUSES: readonly Status[] = STATUSES.filter(
  (s) => STATUS_META[s].slaEffect === "paused",
);

/** الحالات المحتسبة في حمل المصمم (SPEC §7) */
export const LOAD_COUNTING_STATUSES: readonly Status[] = [
  "ready",
  "in_progress",
  "internal_review",
  "awaiting_feedback",
];

export const PRIORITIES = ["normal", "high", "urgent"] as const satisfies readonly Priority[];

export const PRIORITY_META: Record<Priority, { label: string; color: ColorToken }> = {
  normal: { label: "عادي", color: "muted" },
  high: { label: "عالي", color: "warning" },
  urgent: { label: "عاجل", color: "danger" },
};

export const SLA_STATE_META: Record<SlaState, { label: string; color: ColorToken }> = {
  not_started: { label: "لم يبدأ", color: "muted" },
  on_track: { label: "ضمن الوقت", color: "success" },
  due_soon: { label: "مستحق قريبًا", color: "warning" },
  overdue: { label: "متأخر", color: "danger" },
  paused: { label: "متوقف", color: "muted" },
  stopped: { label: "منتهٍ", color: "muted" },
};

export const ROLES = [
  "requester",
  "studio_manager",
  "designer",
  "executive",
] as const satisfies readonly Role[];

export const ROLE_META: Record<Role, { label: string }> = {
  requester: { label: "طالب الخدمة" },
  designer: { label: "مصمم" },
  studio_manager: { label: "مسؤول الاستوديو" },
  executive: { label: "المدير" },
};

export const EVENT_TYPE_META: Record<EventType, { label: string }> = {
  status_change: { label: "تغيير حالة" },
  comment: { label: "إضافة تعليق" },
  attachment: { label: "رفع ملف" },
  assignment: { label: "إسناد مصمم" },
  priority_change: { label: "تغيير أولوية" },
  urgent_approval: { label: "اعتماد عاجل" },
  system: { label: "إجراء نظامي" },
};

export const LOAD_STATE_META: Record<LoadState, { label: string; color: ColorToken }> = {
  low: { label: "منخفض", color: "success" },
  normal: { label: "طبيعي", color: "info" },
  high: { label: "مرتفع", color: "warning" },
};

/** الترتيب الرسمي لأدوات التنفيذ (يحكم القوائم ونموذج الإعدادات) */
export const DESIGN_TOOLS = [
  "powerpoint",
  "illustrator",
  "photoshop",
  "indesign",
  "figma",
  "canva",
  "other",
] as const satisfies readonly DesignTool[];

/**
 * أداة التنفيذ: التسمية + المعامل الافتراضي لهدف SLA.
 * المعامل يضرب الهدف: 1 = الأساس (بوربوينت)، أقل من 1 = إنجاز أسرع.
 * القيم الفعلية قابلة للتعديل من إعدادات SLA (settings.toolFactors).
 */
export const TOOL_META: Record<DesignTool, { label: string; defaultFactor: number }> = {
  powerpoint: { label: "بوربوينت", defaultFactor: 1 },
  illustrator: { label: "إليستريتور", defaultFactor: 0.85 },
  photoshop: { label: "فوتوشوب", defaultFactor: 0.9 },
  indesign: { label: "إن ديزاين", defaultFactor: 0.9 },
  figma: { label: "فيقما", defaultFactor: 0.85 },
  canva: { label: "كانفا", defaultFactor: 0.7 },
  other: { label: "أخرى", defaultFactor: 1 },
};

/** عتبة «مستحق قريبًا»: المتبقي ≤ 24 ساعة عمل (SPEC §9) */
export const DUE_SOON_THRESHOLD_H = 24;

/** ساعات يوم العمل الواحد عند عرض المدد بالأيام (SPEC §13) */
export const WORK_DAY_HOURS = 8;
