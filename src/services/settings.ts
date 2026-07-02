// قراءة وتحديث الإعدادات وأنواع الطلبات (مصفوفة SLA).

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { requestTypes, settings } from "@/db/schema";
import type { CalendarCfg, Role } from "@/core/types";
import { settingsSchema, requestTypeUpdateSchema } from "./schemas";
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
