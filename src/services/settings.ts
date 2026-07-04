// قراءة وتحديث الإعدادات وأنواع الطلبات (مصفوفة SLA).

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { requests, requestTypes, settings } from "@/db/schema";
import type { CalendarCfg, Role } from "@/core/types";
import { settingsSchema, requestTypeCreateSchema, requestTypeUpdateSchema } from "./schemas";
import type { z } from "zod";

export type SettingsRow = typeof settings.$inferSelect;
export type RequestTypeRow = typeof requestTypes.$inferSelect;

export class ForbiddenError extends Error {
  constructor(message = "لا تملك صلاحية هذا الإجراء.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function getSettings(): Promise<SettingsRow> {
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });
  if (!row) throw new Error("صف الإعدادات غير موجود — شغّل pnpm db:seed أولًا.");
  return row;
}

export function toCalendarCfg(s: SettingsRow): CalendarCfg {
  return {
    workDays: s.workDays,
    workStart: s.workStart,
    workEnd: s.workEnd,
    holidays: s.holidays,
  };
}

export async function listRequestTypes(): Promise<RequestTypeRow[]> {
  return db.query.requestTypes.findMany({ orderBy: asc(requestTypes.sortOrder) });
}

export async function getRequestType(id: number): Promise<RequestTypeRow | undefined> {
  return db.query.requestTypes.findFirst({ where: eq(requestTypes.id, id) });
}

function assertManager(role: Role): void {
  if (role !== "studio_manager") throw new ForbiddenError();
}

export async function updateSettings(
  input: z.infer<typeof settingsSchema>,
  actorRole: Role,
): Promise<void> {
  assertManager(actorRole);
  const data = settingsSchema.parse(input);
  await db.update(settings).set(data).where(eq(settings.id, 1));
}

export async function updateRequestType(
  input: z.infer<typeof requestTypeUpdateSchema>,
  actorRole: Role,
): Promise<void> {
  assertManager(actorRole);
  const { id, ...data } = requestTypeUpdateSchema.parse(input);
  await db.update(requestTypes).set(data).where(eq(requestTypes.id, id));
}

/** عدد الطلبات المرتبطة بكل نوع — يحدد إمكانية حذف النوع من الإعدادات */
export async function countRequestsByType(): Promise<Record<number, number>> {
  const rows = await db
    .select({ typeId: requests.typeId, n: sql<number>`count(*)` })
    .from(requests)
    .groupBy(requests.typeId);
  return Object.fromEntries(rows.map((r) => [r.typeId, r.n]));
}

export async function createRequestType(
  input: z.infer<typeof requestTypeCreateSchema>,
  actorRole: Role,
): Promise<void> {
  assertManager(actorRole);
  const data = requestTypeCreateSchema.parse(input);
  const existing = await listRequestTypes();
  if (existing.some((t) => t.name === data.name)) {
    throw new Error("يوجد نوع بهذا الاسم بالفعل.");
  }
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sortOrder), 0);
  await db.insert(requestTypes).values({ ...data, sortOrder: maxSort + 1 });
}

export async function deleteRequestType(id: number, actorRole: Role): Promise<void> {
  assertManager(actorRole);
  const used = await db.query.requests.findFirst({
    where: eq(requests.typeId, id),
    columns: { id: true },
  });
  if (used) throw new Error("لا يمكن حذف نوع مرتبط بطلبات قائمة.");
  await db.delete(requestTypes).where(eq(requestTypes.id, id));
}
