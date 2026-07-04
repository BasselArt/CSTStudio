// أنواع نواة المجال — TypeScript خالص: بلا React وبلا استيراد من db (SPEC §3).

export type Status =
  | "new"
  | "needs_info"
  | "ready"
  | "in_progress"
  | "internal_review"
  | "awaiting_feedback"
  | "delivered"
  | "closed"
  | "cancelled";

export type Priority = "normal" | "high" | "urgent";

export type Role = "requester" | "studio_manager" | "designer" | "executive";

export type EventType =
  | "status_change"
  | "comment"
  | "attachment"
  | "assignment"
  | "priority_change"
  | "urgent_approval"
  | "system";

/** أثر الحالة على عدّاد SLA (SPEC §6) */
export type SlaEffect = "response" | "paused" | "running" | "stopped" | "excluded";

export type SlaState =
  | "not_started"
  | "on_track"
  | "due_soon"
  | "overdue"
  | "paused"
  | "stopped";

export type LoadState = "low" | "normal" | "high";

/** أدوات التنفيذ المعتمدة — تسمياتها ومعاملاتها الافتراضية في core/constants.ts */
export type DesignTool =
  | "powerpoint"
  | "illustrator"
  | "photoshop"
  | "indesign"
  | "figma"
  | "canva"
  | "other";

/** معاملات الأدوات المخصصة من الإعدادات — الغائب يسقط على الافتراضي */
export type ToolFactors = Partial<Record<DesignTool, number>>;

/** مدخلات تنويع هدف SLA حسب حجم الطلب وأداة التنفيذ (امتداد لمصفوفة §9) */
export interface SlaSizing {
  /** حجم الطلب بوحدات النوع (صفحات/شرائح/مواد) — null = لم يُحدَّد */
  unitCount?: number | null;
  /** معامل الأداة (1 = الأساس، أقل = أسرع) — يُستخرج عبر toolFactorFor */
  toolFactor?: number | null;
}

/** مفاتيح ألوان الـ tokens المعرفة في globals.css — لا hex خارجها (SPEC §13) */
export type ColorToken =
  | "navy"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "progress"
  | "waiting"
  | "muted";

export interface CalendarCfg {
  /** أيام العمل: 0=الأحد … 6=السبت */
  workDays: number[];
  /** بداية الدوام "HH:MM" بتوقيت الرياض */
  workStart: string;
  /** نهاية الدوام "HH:MM" بتوقيت الرياض */
  workEnd: string;
  /** إجازات رسمية بصيغة "YYYY-MM-DD" (تاريخ محلي بتوقيت الرياض) */
  holidays: string[];
}

/** حدث تغيير حالة كما يصل من request_events، مرتب زمنيًا تصاعديًا */
export interface StatusChange {
  to: Status;
  at: Date;
}

export interface ResponseSla {
  targetH: number;
  consumedH: number;
  /** لحظة أول مغادرة لحالة new — null إذا لم تتم الاستجابة بعد */
  respondedAt: Date | null;
  /** هل تمت الاستجابة ضمن الهدف؟ null قبل الاستجابة */
  metSla: boolean | null;
  state: Extract<SlaState, "on_track" | "overdue" | "stopped">;
}

export interface DeliverySla {
  /** null = «باتفاق» (عاجل لنوع كبير قبل إدخال المدة يدويًا) */
  targetH: number | null;
  consumedH: number;
  /** زمن الانتظار على الجهة (needs_info + awaiting_feedback) بساعات العمل */
  pausedH: number;
  remainingH: number | null;
  /** consumedH ÷ targetH — قد يتجاوز 1 عند التأخر */
  pct: number | null;
  state: SlaState;
  /** أول دخول لحالة ready */
  startedAt: Date | null;
  /** آخر انتقال إلى delivered */
  deliveredAt: Date | null;
  /** يُحسب فقط والعدّاد يعمل والمتبقي موجب */
  expectedDeliveryAt: Date | null;
  /** للمسلَّم/المغلق: هل كان التسليم ضمن الهدف؟ */
  metSla: boolean | null;
}

export interface SlaResult {
  response: ResponseSla;
  delivery: DeliverySla;
}

export interface SlaInput {
  createdAt: Date;
  /** أحداث status_change مرتبة زمنيًا تصاعديًا */
  statusChanges: StatusChange[];
  /** هدف التسليم بالساعات من مصفوفة النوع × الأولوية */
  targetH: number | null;
  /** settings.responseSlaH */
  responseTargetH: number;
  cfg: CalendarCfg;
  now: Date;
  /** عتبة «مستحق قريبًا» بساعات العمل — افتراضي DUE_SOON_THRESHOLD_H */
  dueSoonThresholdH?: number;
}
