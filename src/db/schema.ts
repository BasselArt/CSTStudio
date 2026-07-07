// مخطط قاعدة البيانات (SPEC §5) — بلا خصائص خاصة بـ SQLite ليسهل النقل إلى Postgres.
// التواريخ تُخزَّن نصوصًا ISO بتوقيت UTC وتُحوَّل عند الحساب والعرض (Asia/Riyadh).

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EventType, Priority, Role, Status } from "@/core/types";

export const departments = sqliteTable("departments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** التعطيل بدل الحذف — الجهة مُشار إليها من الطلبات والمستخدمين */
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull(),
  departmentId: integer("department_id").references(() => departments.id),
  capacityPoints: integer("capacity_points").notNull().default(20),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const requestTypes = sqliteTable("request_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** وصف قصير يظهر في بطاقة اختيار النوع بنموذج الطلب الجديد */
  description: text("description"),
  effortPoints: integer("effort_points").notNull(),
  slaNormalH: integer("sla_normal_h").notNull(),
  slaHighH: integer("sla_high_h").notNull(),
  /** null = «باتفاق» — تُدخل المدة يدويًا عند اعتماد العاجل (SPEC §9) */
  slaUrgentH: integer("sla_urgent_h"),
  /** وحدة قياس الحجم للعرض (صفحة/شريحة/مادة) — null = النوع لا يُقاس بالوحدات */
  unitLabel: text("unit_label"),
  /** الحجم المرجعي المشمول في هدف المصفوفة */
  baseUnits: integer("base_units"),
  /** ساعات العمل المضافة لكل وحدة فوق الحجم المرجعي */
  extraUnitH: real("extra_unit_h"),
  pausable: integer("pausable", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const requests = sqliteTable("requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** DSN-YYYY-NNNN — يتولد بعدّاد سنوي داخل transaction */
  number: text("number").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  goal: text("goal"),
  audience: text("audience"),
  language: text("language").$type<"ar" | "en" | "both">().notNull().default("ar"),
  departmentId: integer("department_id")
    .notNull()
    .references(() => departments.id),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id),
  contact: text("contact"),
  typeId: integer("type_id")
    .notNull()
    .references(() => requestTypes.id),
  priority: text("priority").$type<Priority>().notNull().default("normal"),
  urgentJustification: text("urgent_justification"),
  urgentApprovedById: integer("urgent_approved_by_id").references(() => users.id),
  urgentApprovedAt: text("urgent_approved_at"),
  status: text("status").$type<Status>().notNull().default("new"),
  assigneeId: integer("assignee_id").references(() => users.id),
  sizes: text("sizes"),
  /** حجم الطلب بوحدات النوع (صفحات/شرائح) — يدخل في معادلة هدف SLA */
  unitCount: integer("unit_count"),
  /** قنوات الاستخدام المختارة — من قائمة settings.channels */
  channels: text("channels", { mode: "json" }).$type<string[]>(),
  publishDueDate: text("publish_due_date"),
  reviewRound: integer("review_round").notNull().default(0),
  relatedRequestId: integer("related_request_id"),
  isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(false),
  deliveredAt: text("delivered_at"),
  closedAt: text("closed_at"),
  cancelReason: text("cancel_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * الحدث الواحد مصدر أربع واجهات: Timeline، سجل التغييرات، التعليقات،
 * ومدخلات محرك SLA — لا جداول منفصلة (SPEC §4.8).
 */
export const requestEvents = sqliteTable("request_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id")
    .notNull()
    .references(() => requests.id),
  type: text("type").$type<EventType>().notNull(),
  actorId: integer("actor_id").references(() => users.id),
  /** JSON حسب النوع: status_change {from,to,note?} · comment {body} · … */
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id")
    .notNull()
    .references(() => requests.id),
  kind: text("kind").$type<"input" | "deliverable">().notNull(),
  version: text("version"),
  filename: text("filename").notNull(),
  /** مسار الملف داخل storage/uploads — null إذا كان التسليم رابطًا خارجيًا */
  path: text("path"),
  /** رابط خارجي للتصميم (Figma/Drive/…) — null إذا كان التسليم ملفًا مرفوعًا */
  url: text("url"),
  size: integer("size"),
  mime: text("mime"),
  uploadedById: integer("uploaded_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  requestId: integer("request_id").references(() => requests.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
  /** لمنع تكرار إشعارات sla-sweep (SPEC §14) */
  dedupeKey: text("dedupe_key").unique(),
});

/** صف واحد id=1 (SPEC §5) */
export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  /** أيام العمل: 0=الأحد … 6=السبت */
  workDays: text("work_days", { mode: "json" }).$type<number[]>().notNull(),
  workStart: text("work_start").notNull(),
  workEnd: text("work_end").notNull(),
  holidays: text("holidays", { mode: "json" }).$type<string[]>().notNull(),
  alertThresholdPct: integer("alert_threshold_pct").notNull().default(75),
  autoCloseWorkDays: integer("auto_close_work_days").notNull().default(3),
  maxReviewRounds: integer("max_review_rounds").notNull().default(2),
  loadLowPct: integer("load_low_pct").notNull().default(40),
  loadHighPct: integer("load_high_pct").notNull().default(75),
  responseSlaH: integer("response_sla_h").notNull().default(4),
  /** هوية النظام — تظهر في السايدبار وصفحة الدخول وعنوان التبويب */
  orgName: text("org_name").notNull().default("استوديو التصميم"),
  orgSubtitle: text("org_subtitle").notNull().default("هيئة الاتصالات والفضاء والتقنية"),
  /** مسار الشعار داخل storage/uploads — null = الشعار النصي الافتراضي */
  logoPath: text("logo_path"),
  /** قائمة قنوات الاستخدام المتاحة في نموذج الطلب — تُدار من صفحة الإعدادات */
  channels: text("channels", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** قائمة المقاسات المتاحة في نموذج الطلب — تُدار من صفحة الإعدادات */
  sizeOptions: text("size_options", { mode: "json" }).$type<string[]>().notNull().default([]),
  /** امتدادات الملفات المسموح رفعها (بلا نقطة) — تُدار من صفحة الإعدادات */
  allowedFileTypes: text("allowed_file_types", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(["jpg", "jpeg", "png", "gif", "webp", "svg", "pdf", "mp4", "mov", "zip", "rar", "ai", "psd", "eps", "ppt", "pptx", "doc", "docx", "xls", "xlsx"]),
});

/** عدّاد الترقيم السنوي — يُحدَّث داخل transaction لمنع التسابق (SPEC §5) */
export const requestCounters = sqliteTable("request_counters", {
  year: integer("year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});
