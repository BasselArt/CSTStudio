// قراءة بيانات المستخدمين والجهات + إدارة الحسابات (للمسؤول فقط).

import { and, asc, eq } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import type { z } from "zod";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import type { Role } from "@/core/types";
import { ForbiddenError } from "./settings";
import { userCreateSchema, userUpdateSchema } from "./schemas";

export type UserRow = typeof users.$inferSelect;

/** منفّذ عمليات الإدارة — الدور والمعرّف معًا لمنع المسؤول من قفل حسابه */
interface ManagerActor {
  id: number;
  role: Role;
}

function assertManager(actor: ManagerActor): void {
  if (actor.role !== "studio_manager") throw new ForbiddenError();
}

async function assertEmailAvailable(email: string, excludeId?: number): Promise<void> {
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing && existing.id !== excludeId) {
    throw new Error("البريد الإلكتروني مستخدم لحساب آخر.");
  }
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function getUser(id: number): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function listDesigners(): Promise<UserRow[]> {
  return db.query.users.findMany({
    where: and(eq(users.role, "designer"), eq(users.isActive, true)),
    orderBy: asc(users.name),
  });
}

export async function listUsers(actor: ManagerActor): Promise<UserRow[]> {
  assertManager(actor);
  return db.query.users.findMany({ orderBy: asc(users.name) });
}

export async function createUser(
  input: z.infer<typeof userCreateSchema>,
  actor: ManagerActor,
): Promise<void> {
  assertManager(actor);
  const data = userCreateSchema.parse(input);
  await assertEmailAvailable(data.email);
  const { password, ...rest } = data;
  await db.insert(users).values({
    ...rest,
    passwordHash: hashSync(password, 10),
    createdAt: new Date().toISOString(),
  });
}

export async function updateUser(
  input: z.infer<typeof userUpdateSchema>,
  actor: ManagerActor,
): Promise<void> {
  assertManager(actor);
  const { id, password, ...rest } = userUpdateSchema.parse(input);
  if (id === actor.id && rest.role !== "studio_manager") {
    throw new Error("لا يمكنك تغيير دور حسابك الحالي.");
  }
  await assertEmailAvailable(rest.email, id);
  await db
    .update(users)
    .set({ ...rest, ...(password ? { passwordHash: hashSync(password, 10) } : {}) })
    .where(eq(users.id, id));
}

export async function setUserActive(
  id: number,
  isActive: boolean,
  actor: ManagerActor,
): Promise<void> {
  assertManager(actor);
  if (id === actor.id) throw new Error("لا يمكنك تعطيل حسابك الحالي.");
  await db.update(users).set({ isActive }).where(eq(users.id, id));
}

/** activeOnly للنماذج (طلب جديد/حساب جديد) — الفلاتر والقوائم التاريخية تعرض الكل */
export async function listDepartments(opts: { activeOnly?: boolean } = {}) {
  return db.query.departments.findMany({
    where: opts.activeOnly ? eq(departments.isActive, true) : undefined,
    orderBy: asc(departments.name),
  });
}

export async function getStudioManagerIds(): Promise<number[]> {
  const rows = await db.query.users.findMany({
    where: eq(users.role, "studio_manager"),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}
