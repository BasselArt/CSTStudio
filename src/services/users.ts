// قراءة بيانات المستخدمين والجهات.

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function getUser(id: number): Promise<UserRow | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function listDesigners(): Promise<UserRow[]> {
  return db.query.users.findMany({
    where: eq(users.role, "designer"),
    orderBy: asc(users.name),
  });
}

export async function listDepartments() {
  return db.query.departments.findMany({ orderBy: asc(departments.name) });
}

export async function getStudioManagerIds(): Promise<number[]> {
  const rows = await db.query.users.findMany({
    where: eq(users.role, "studio_manager"),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}
