// العمود الفقري (SPEC §10): المنفذ الوحيد للكتابة على الطلبات.
// كل دالة: فحص صلاحية المنفّذ (§11) → فحص الانتقال عبر state-machine →
// كتابة داخل transaction واحدة (تحديث الطلب + حدث request_events + إشعارات).
// لا يوجد db.update(requests) خارج هذا الملف إطلاقًا (§4.2).

import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  attachments,
  requestCounters,
  requestEvents,
  requests,
  users,
} from "@/db/schema";
import {
  assertReviewRoundLimit,
  assertTransition,
  TRANSITIONS,
} from "@/core/state-machine";
import { workingHoursBetween } from "@/core/calendar";
import { computeSla, slaTargetHours } from "@/core/sla";
import type {
  EventType,
  Priority,
  Role,
  SlaResult,
  Status,
  StatusChange,
} from "@/core/types";
import { insertNotification } from "./notifications";
import {
  ForbiddenError,
  getSettings,
  listRequestTypes,
  toCalendarCfg,
  type RequestTypeRow,
  type SettingsRow,
} from "./settings";
import { getStudioManagerIds } from "./users";
import { createRequestSchema, type CreateRequestInput } from "./schemas";

export type RequestRow = typeof requests.$inferSelect;
export type RequestEventRow = typeof requestEvents.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;

export interface Actor {
  id: number;
  role: Role;
  departmentId: number | null;
  name: string;
}

export class NotFoundError extends Error {
  constructor(message = "الطلب غير موجود أو لا تملك صلاحية الوصول إليه.") {
    super(message);
    this.name = "NotFoundError";
  }
}

const nowIso = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* الرؤية والصلاحيات (SPEC §11)                                        */
/* ------------------------------------------------------------------ */

export function canView(actor: Actor, req: RequestRow): boolean {
  if (req.isDraft && req.requesterId !== actor.id) return false;
  switch (actor.role) {
    case "studio_manager":
    case "executive":
      return !req.isDraft || req.requesterId === actor.id;
    case "designer":
      return req.assigneeId === actor.id;
    case "requester":
      return req.departmentId === actor.departmentId;
  }
}

/**
 * الانتقالات المتاحة فعلًا = الدور × خريطة state-machine (SPEC §12/04).
 * أزرار الواجهة تُشتق من هذه الدالة حصريًا.
 */
export function allowedTransitions(req: RequestRow, actor: Actor): Status[] {
  const machine = TRANSITIONS[req.status];
  let byRole: readonly Status[];
  switch (actor.role) {
    case "studio_manager":
      byRole = machine;
      break;
    case "designer": {
      if (req.assigneeId !== actor.id) return [];
      const map: Partial<Record<Status, Status[]>> = {
        ready: ["in_progress"],
        in_progress: ["internal_review", "needs_info", "awaiting_feedback"],
        internal_review: ["in_progress", "awaiting_feedback", "delivered"],
      };
      byRole = map[req.status] ?? [];
      break;
    }
    case "requester": {
      if (req.departmentId !== actor.departmentId) return [];
      const map: Partial<Record<Status, Status[]>> = {
        needs_info: ["ready"], // الرد على الاستكمال
        awaiting_feedback: ["in_progress", "delivered"], // ملاحظات أو اعتماد
        delivered: ["closed", "in_progress"], // اعتماد التسليم أو إعادة ملاحظات
      };
      byRole = map[req.status] ?? [];
      // إلغاء طلبه هو فقط
      if (req.requesterId === actor.id && machine.includes("cancelled")) {
        byRole = [...byRole, "cancelled"];
      }
      break;
    }
    case "executive":
      return []; // قراءة فقط
  }
  return byRole.filter((s) => machine.includes(s));
}

/* ------------------------------------------------------------------ */
/* أدوات داخلية                                                        */
/* ------------------------------------------------------------------ */

function addEvent(
  tx: Tx,
  requestId: number,
  type: EventType,
  actorId: number | null,
  data: Record<string, unknown>,
  createdAt = nowIso(),
): void {
  tx.insert(requestEvents)
    .values({ requestId, type, actorId, data, createdAt })
    .run();
}

/** توليد الرقم DSN-YYYY-NNNN بعدّاد سنوي داخل الـ transaction (SPEC §5) */
function generateNumber(tx: Tx): string {
  const year = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
    }).format(new Date()),
  );
  tx.insert(requestCounters)
    .values({ year, lastValue: 0 })
    .onConflictDoNothing({ target: requestCounters.year })
    .run();
  const [row] = tx
    .select()
    .from(requestCounters)
    .where(eq(requestCounters.year, year))
    .all();
  const next = row.lastValue + 1;
  tx.update(requestCounters)
    .set({ lastValue: next })
    .where(eq(requestCounters.year, year))
    .run();
  return `DSN-${year}-${String(next).padStart(4, "0")}`;
}

function loadRequestOrThrow(tx: Tx, id: number, actor: Actor): RequestRow {
  const [req] = tx.select().from(requests).where(eq(requests.id, id)).all();
  if (!req || !canView(actor, req)) throw new NotFoundError();
  return req;
}

/** إشعار الطرف الآخر: الطالب إذا كان المنفّذ من الاستوديو، والمصمم/المسؤول عكس ذلك */
function notifyCounterpart(
  tx: Tx,
  req: RequestRow,
  actor: Actor,
  managerIds: number[],
  payload: { type: string; title: string; body?: string },
): void {
  const targets = new Set<number>();
  if (actor.role === "requester") {
    if (req.assigneeId) targets.add(req.assigneeId);
    else managerIds.forEach((m) => targets.add(m));
  } else {
    targets.add(req.requesterId);
  }
  targets.delete(actor.id);
  for (const userId of targets) {
    insertNotification(tx, { userId, requestId: req.id, ...payload });
  }
}

/* ------------------------------------------------------------------ */
/* حساب SLA لطلب (يُستخدم في القوائم والتفاصيل)                        */
/* ------------------------------------------------------------------ */

export function slaFor(
  req: RequestRow,
  events: Pick<RequestEventRow, "type" | "data" | "createdAt">[],
  type: RequestTypeRow,
  settingsRow: SettingsRow,
  now = new Date(),
): SlaResult {
  const statusChanges: StatusChange[] = events
    .filter((e) => e.type === "status_change")
    .map((e) => ({
      to: (e.data as { to: Status }).to,
      at: new Date(e.createdAt),
    }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  // مدة «باتفاق» المدخلة عند اعتماد العاجل (SPEC §9)
  const agreedH = events
    .filter((e) => e.type === "urgent_approval")
    .map((e) => (e.data as { agreedTargetH?: number }).agreedTargetH)
    .find((v) => typeof v === "number");

  let targetH = slaTargetHours(type, req.priority, !!req.urgentApprovedAt);
  if (req.priority === "urgent" && req.urgentApprovedAt && targetH == null && agreedH) {
    targetH = agreedH;
  }

  return computeSla({
    createdAt: new Date(req.createdAt),
    statusChanges,
    targetH,
    responseTargetH: settingsRow.responseSlaH,
    cfg: toCalendarCfg(settingsRow),
    now,
  });
}

/* ------------------------------------------------------------------ */
/* القراءة                                                             */
/* ------------------------------------------------------------------ */

export interface EnrichedRequest {
  request: RequestRow;
  type: RequestTypeRow;
  departmentName: string;
  requesterName: string;
  assigneeName: string | null;
  sla: SlaResult;
}

/** قائمة الطلبات المرئية للمنفّذ مع SLA محسوبًا — الفلترة والفرز على الطرف المستدعي */
export async function listVisibleRequests(
  actor: Actor,
  opts: { includeDrafts?: boolean } = {},
): Promise<EnrichedRequest[]> {
  const [settingsRow, types, managerless] = await Promise.all([
    getSettings(),
    listRequestTypes(),
    db.query.departments.findMany(),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const deptById = new Map(managerless.map((d) => [d.id, d.name]));

  const rows = await db.query.requests.findMany();
  const visible = rows.filter(
    (r) => canView(actor, r) && (opts.includeDrafts ? true : !r.isDraft),
  );
  if (visible.length === 0) return [];

  const ids = visible.map((r) => r.id);
  const events = await db.query.requestEvents.findMany({
    where: and(
      inArray(requestEvents.requestId, ids),
      inArray(requestEvents.type, ["status_change", "urgent_approval"]),
    ),
  });
  const eventsByRequest = new Map<number, RequestEventRow[]>();
  for (const e of events) {
    const list = eventsByRequest.get(e.requestId) ?? [];
    list.push(e);
    eventsByRequest.set(e.requestId, list);
  }

  const userRows = await db.query.users.findMany();
  const userById = new Map(userRows.map((u) => [u.id, u.name]));

  const now = new Date();
  return visible.map((request) => ({
    request,
    type: typeById.get(request.typeId)!,
    departmentName: deptById.get(request.departmentId) ?? "—",
    requesterName: userById.get(request.requesterId) ?? "—",
    assigneeName: request.assigneeId ? (userById.get(request.assigneeId) ?? null) : null,
    sla: slaFor(
      request,
      eventsByRequest.get(request.id) ?? [],
      typeById.get(request.typeId)!,
      settingsRow,
      now,
    ),
  }));
}

export interface RequestDetails extends EnrichedRequest {
  events: (RequestEventRow & { actorName: string | null })[];
  attachments: (AttachmentRow & { uploaderName: string })[];
  settingsRow: SettingsRow;
}

export async function getRequestDetails(
  id: number,
  actor: Actor,
): Promise<RequestDetails> {
  const request = await db.query.requests.findFirst({ where: eq(requests.id, id) });
  if (!request || !canView(actor, request)) throw new NotFoundError();

  const [settingsRow, types, deptRows, eventRows, attachmentRows, userRows] =
    await Promise.all([
      getSettings(),
      listRequestTypes(),
      db.query.departments.findMany(),
      db.query.requestEvents.findMany({
        where: eq(requestEvents.requestId, id),
        orderBy: desc(requestEvents.createdAt),
      }),
      db.query.attachments.findMany({ where: eq(attachments.requestId, id) }),
      db.query.users.findMany(),
    ]);

  const type = types.find((t) => t.id === request.typeId)!;
  const userById = new Map(userRows.map((u) => [u.id, u.name]));

  return {
    request,
    type,
    departmentName: deptRows.find((d) => d.id === request.departmentId)?.name ?? "—",
    requesterName: userById.get(request.requesterId) ?? "—",
    assigneeName: request.assigneeId ? (userById.get(request.assigneeId) ?? null) : null,
    sla: slaFor(request, eventRows, type, settingsRow),
    events: eventRows.map((e) => ({
      ...e,
      actorName: e.actorId ? (userById.get(e.actorId) ?? null) : null,
    })),
    attachments: attachmentRows.map((a) => ({
      ...a,
      uploaderName: userById.get(a.uploadedById) ?? "—",
    })),
    settingsRow,
  };
}

/* ------------------------------------------------------------------ */
/* الكتابة (SPEC §10)                                                  */
/* ------------------------------------------------------------------ */

async function insertRequest(
  input: CreateRequestInput,
  actor: Actor,
  isDraft: boolean,
): Promise<number> {
  if (actor.role !== "requester" && actor.role !== "studio_manager") {
    throw new ForbiddenError("إنشاء الطلبات لطالب الخدمة أو مسؤول الاستوديو.");
  }
  const data = createRequestSchema.parse(input);
  if (actor.role === "requester" && data.departmentId !== actor.departmentId) {
    throw new ForbiddenError("لا يمكنك إنشاء طلب لجهة أخرى.");
  }
  const managerIds = await getStudioManagerIds();

  return db.transaction((tx) => {
    const number = generateNumber(tx);
    const ts = nowIso();
    const [created] = tx
      .insert(requests)
      .values({
        number,
        title: data.title,
        description: data.description,
        goal: data.goal,
        audience: data.audience,
        language: data.language,
        departmentId: data.departmentId,
        requesterId: actor.id,
        contact: data.contact,
        typeId: data.typeId,
        priority: data.priority,
        urgentJustification: data.urgentJustification,
        sizes: data.sizes,
        channel: data.channel,
        publishDueDate: data.publishDueDate,
        isDraft,
        status: "new",
        createdAt: ts,
        updatedAt: ts,
      })
      .returning({ id: requests.id })
      .all();

    addEvent(
      tx,
      created.id,
      "system",
      actor.id,
      {
        message: isDraft ? "تم حفظ الطلب كمسودة" : "تم إنشاء الطلب",
        referenceLinks: data.referenceLinks,
        requiredTexts: data.requiredTexts,
        extraNotes: data.extraNotes,
      },
      ts,
    );

    if (!isDraft) {
      for (const managerId of managerIds) {
        insertNotification(tx, {
          userId: managerId,
          requestId: created.id,
          type: data.priority === "urgent" ? "urgent_pending" : "created",
          title:
            data.priority === "urgent"
              ? `طلب عاجل بانتظار الاعتماد: ${data.title}`
              : `طلب جديد: ${data.title}`,
          body: `رقم الطلب ${number}`,
        });
      }
    }
    return created.id;
  });
}

export async function createRequest(
  input: CreateRequestInput,
  actor: Actor,
): Promise<number> {
  return insertRequest(input, actor, false);
}

export async function saveDraft(
  input: CreateRequestInput,
  actor: Actor,
): Promise<number> {
  return insertRequest(input, actor, true);
}

export async function submitDraft(id: number, actor: Actor): Promise<void> {
  const managerIds = await getStudioManagerIds();
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    if (!req.isDraft) throw new ForbiddenError("الطلب مُرسل مسبقًا.");
    if (req.requesterId !== actor.id) throw new ForbiddenError();
    const ts = nowIso();
    tx.update(requests)
      .set({ isDraft: false, createdAt: ts, updatedAt: ts })
      .where(eq(requests.id, id))
      .run();
    addEvent(tx, id, "system", actor.id, { message: "تم إرسال الطلب" }, ts);
    for (const managerId of managerIds) {
      insertNotification(tx, {
        userId: managerId,
        requestId: id,
        type: req.priority === "urgent" ? "urgent_pending" : "created",
        title:
          req.priority === "urgent"
            ? `طلب عاجل بانتظار الاعتماد: ${req.title}`
            : `طلب جديد: ${req.title}`,
        body: `رقم الطلب ${req.number}`,
      });
    }
  });
}

/** البوابة الوحيدة لتغيير الحالة (SPEC §10) */
export async function transition(
  id: number,
  to: Status,
  actor: Actor,
  note?: string,
): Promise<void> {
  const [settingsRow, managerIds] = await Promise.all([
    getSettings(),
    getStudioManagerIds(),
  ]);
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    if (!allowedTransitions(req, actor).includes(to)) {
      throw new ForbiddenError("هذا الانتقال غير متاح لدورك.");
    }
    assertTransition(req.status, to);
    assertReviewRoundLimit(req.status, to, req.reviewRound, settingsRow.maxReviewRounds);

    const ts = nowIso();
    const bump =
      to === "in_progress" &&
      (req.status === "awaiting_feedback" || req.status === "delivered");

    tx.update(requests)
      .set({
        status: to,
        updatedAt: ts,
        reviewRound: bump ? req.reviewRound + 1 : req.reviewRound,
        deliveredAt: to === "delivered" ? ts : req.deliveredAt,
        closedAt: to === "closed" || to === "cancelled" ? ts : req.closedAt,
        cancelReason: to === "cancelled" ? (note ?? req.cancelReason) : req.cancelReason,
      })
      .where(eq(requests.id, id))
      .run();

    addEvent(tx, id, "status_change", actor.id, { from: req.status, to, note }, ts);

    notifyCounterpart(tx, req, actor, managerIds, {
      type: "status_changed",
      title: `تغيّرت حالة الطلب ${req.number}`,
      body: note,
    });
  });
}

export async function assign(id: number, designerId: number, actor: Actor): Promise<void> {
  if (actor.role !== "studio_manager") {
    throw new ForbiddenError("الإسناد لمسؤول الاستوديو فقط.");
  }
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    const [designer] = tx
      .select()
      .from(users)
      .where(and(eq(users.id, designerId), eq(users.role, "designer")))
      .all();
    if (!designer) throw new NotFoundError("المصمم غير موجود.");
    const ts = nowIso();
    tx.update(requests)
      .set({ assigneeId: designerId, updatedAt: ts })
      .where(eq(requests.id, id))
      .run();
    addEvent(tx, id, "assignment", actor.id, {
      designerId,
      designerName: designer.name,
    }, ts);
    insertNotification(tx, {
      userId: designerId,
      requestId: id,
      type: "assigned",
      title: `أُسند إليك الطلب ${req.number}`,
      body: req.title,
    });
  });
}

/** طلب استكمال بيانات: transition → needs_info والرسالة داخل الحدث */
export async function requestInfo(id: number, message: string, actor: Actor): Promise<void> {
  await transition(id, "needs_info", actor, message);
}

export async function addComment(id: number, body: string, actor: Actor): Promise<void> {
  const managerIds = await getStudioManagerIds();
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    const ts = nowIso();
    addEvent(tx, id, "comment", actor.id, { body }, ts);
    tx.update(requests).set({ updatedAt: ts }).where(eq(requests.id, id)).run();
    notifyCounterpart(tx, req, actor, managerIds, {
      type: "comment",
      title: `تعليق جديد على الطلب ${req.number}`,
      body: body.slice(0, 120),
    });
  });
}

export interface AttachmentInput {
  filename: string;
  path: string;
  size: number;
  mime: string;
}

export async function addAttachment(
  id: number,
  kind: "input" | "deliverable",
  file: AttachmentInput,
  version: string | null,
  actor: Actor,
): Promise<void> {
  const managerIds = await getStudioManagerIds();
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    if (kind === "deliverable") {
      const isAssignee = actor.role === "designer" && req.assigneeId === actor.id;
      if (!isAssignee && actor.role !== "studio_manager") {
        throw new ForbiddenError("رفع التسليمات للمصمم المسند أو المسؤول.");
      }
    } else if (actor.role === "executive") {
      throw new ForbiddenError();
    }
    const ts = nowIso();
    const [created] = tx
      .insert(attachments)
      .values({
        requestId: id,
        kind,
        version,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mime: file.mime,
        uploadedById: actor.id,
        createdAt: ts,
      })
      .returning({ id: attachments.id })
      .all();
    addEvent(tx, id, "attachment", actor.id, {
      attachmentId: created.id,
      kind,
      filename: file.filename,
      version,
    }, ts);
    tx.update(requests).set({ updatedAt: ts }).where(eq(requests.id, id)).run();
    if (kind === "deliverable") {
      notifyCounterpart(tx, req, actor, managerIds, {
        type: "deliverable",
        title: `تسليم جديد على الطلب ${req.number}`,
        body: file.filename,
      });
    }
  });
}

export async function approveUrgent(
  id: number,
  actor: Actor,
  agreedTargetH?: number,
): Promise<void> {
  if (actor.role !== "studio_manager") throw new ForbiddenError();
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    if (req.priority !== "urgent" || req.urgentApprovedAt) {
      throw new ForbiddenError("الطلب ليس بانتظار اعتماد عاجل.");
    }
    const ts = nowIso();
    tx.update(requests)
      .set({ urgentApprovedById: actor.id, urgentApprovedAt: ts, updatedAt: ts })
      .where(eq(requests.id, id))
      .run();
    addEvent(tx, id, "urgent_approval", actor.id, {
      approved: true,
      agreedTargetH,
    }, ts);
    insertNotification(tx, {
      userId: req.requesterId,
      requestId: id,
      type: "urgent_approved",
      title: `تم اعتماد استعجال الطلب ${req.number}`,
    });
    if (req.assigneeId) {
      insertNotification(tx, {
        userId: req.assigneeId,
        requestId: id,
        type: "urgent_approved",
        title: `اعتُمد استعجال الطلب ${req.number} المسند إليك`,
      });
    }
  });
}

export async function declineUrgent(id: number, actor: Actor, reason: string): Promise<void> {
  if (actor.role !== "studio_manager") throw new ForbiddenError();
  await db.transaction((tx) => {
    const req = loadRequestOrThrow(tx, id, actor);
    if (req.priority !== "urgent" || req.urgentApprovedAt) {
      throw new ForbiddenError("الطلب ليس بانتظار اعتماد عاجل.");
    }
    const ts = nowIso();
    // يعود لأولوية «عالي» — وهي أساس حساب هدفه قبل الاعتماد أصلًا (SPEC §9)
    tx.update(requests)
      .set({ priority: "high" satisfies Priority, updatedAt: ts })
      .where(eq(requests.id, id))
      .run();
    addEvent(tx, id, "urgent_approval", actor.id, { approved: false, reason }, ts);
    addEvent(tx, id, "priority_change", actor.id, {
      from: "urgent",
      to: "high",
      reason,
    }, ts);
    insertNotification(tx, {
      userId: req.requesterId,
      requestId: id,
      type: "urgent_declined",
      title: `لم يُعتمد استعجال الطلب ${req.number}`,
      body: reason,
    });
  });
}

export async function deliver(id: number, actor: Actor): Promise<void> {
  await transition(id, "delivered", actor);
}

/* ------------------------------------------------------------------ */
/* sla-sweep (SPEC §14) — idempotent بالكامل عبر dedupeKey             */
/* ------------------------------------------------------------------ */

export interface SweepResult {
  checked: number;
  alerts75: number;
  overdueAlerts: number;
  autoClosed: number;
}

export async function sweepSla(now = new Date()): Promise<SweepResult> {
  const [settingsRow, types, managerIds] = await Promise.all([
    getSettings(),
    listRequestTypes(),
    getStudioManagerIds(),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const cfg = toCalendarCfg(settingsRow);

  const rows = await db.query.requests.findMany();
  const active = rows.filter(
    (r) => !r.isDraft && !["closed", "cancelled"].includes(r.status),
  );
  if (active.length === 0) return { checked: 0, alerts75: 0, overdueAlerts: 0, autoClosed: 0 };

  const events = await db.query.requestEvents.findMany({
    where: and(
      inArray(requestEvents.requestId, active.map((r) => r.id)),
      inArray(requestEvents.type, ["status_change", "urgent_approval"]),
    ),
  });
  const byRequest = new Map<number, RequestEventRow[]>();
  for (const e of events) {
    byRequest.set(e.requestId, [...(byRequest.get(e.requestId) ?? []), e]);
  }

  const result: SweepResult = {
    checked: active.length,
    alerts75: 0,
    overdueAlerts: 0,
    autoClosed: 0,
  };
  db.transaction((tx) => {
    for (const req of active) {
      const type = typeById.get(req.typeId);
      if (!type) continue;
      const sla = slaFor(req, byRequest.get(req.id) ?? [], type, settingsRow, now);
      const d = sla.delivery;

      // استهلاك ≥ عتبة التنبيه → إشعار للمصمم (sla75:{id})
      if (
        d.pct != null &&
        d.pct * 100 >= settingsRow.alertThresholdPct &&
        d.state !== "overdue" &&
        d.state !== "stopped" &&
        req.assigneeId
      ) {
        insertNotification(tx, {
          userId: req.assigneeId,
          requestId: req.id,
          type: "sla75",
          title: `تنبيه: استهلاك ${Math.round(d.pct * 100)}% من مدة الطلب ${req.number}`,
          body: req.title,
          dedupeKey: `sla75:${req.id}`,
        });
        result.alerts75 += 1;
      }

      // تجاوز الهدف → إشعار للمصمم والمسؤول (slaover:{id})
      if (d.state === "overdue") {
        const targets = [
          ...(req.assigneeId ? [{ userId: req.assigneeId, key: `slaover:${req.id}:d` }] : []),
          ...managerIds.map((m, i) => ({ userId: m, key: `slaover:${req.id}:m${i}` })),
        ];
        for (const t of targets) {
          insertNotification(tx, {
            userId: t.userId,
            requestId: req.id,
            type: "slaover",
            title: `الطلب ${req.number} تجاوز هدف SLA`,
            body: req.title,
            dedupeKey: t.key,
          });
        }
        result.overdueAlerts += 1;
      }

      // الإغلاق التلقائي: delivered منذ ≥ autoCloseWorkDays أيام عمل → closed بحدث system
      if (req.status === "delivered" && req.deliveredAt) {
        const sinceH = workingHoursBetween(new Date(req.deliveredAt), now, cfg);
        if (sinceH >= settingsRow.autoCloseWorkDays * 8) {
          assertTransition("delivered", "closed");
          const ts = now.toISOString();
          tx.update(requests)
            .set({ status: "closed", closedAt: ts, updatedAt: ts })
            .where(eq(requests.id, req.id))
            .run();
          addEvent(tx, req.id, "system", null, {
            message: `إغلاق تلقائي بعد ${settingsRow.autoCloseWorkDays} أيام عمل من التسليم`,
            from: "delivered",
            to: "closed",
          }, ts);
          insertNotification(tx, {
            userId: req.requesterId,
            requestId: req.id,
            type: "auto_closed",
            title: `أُغلق الطلب ${req.number} تلقائيًا بعد التسليم`,
            dedupeKey: `autoclose:${req.id}`,
          });
          result.autoClosed += 1;
        }
      }
    }
  });

  return result;
}

export async function cancel(id: number, reason: string, actor: Actor): Promise<void> {
  await transition(id, "cancelled", actor, reason);
}
