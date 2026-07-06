// الإشعارات: الإنشاء (مع dedupeKey) والقراءة والتعليم كمقروء.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { notifications } from "@/db/schema";

export type NotificationRow = typeof notifications.$inferSelect;

export interface NotificationInput {
  userId: number;
  requestId?: number;
  type: string;
  title: string;
  body?: string;
  /** يمنع التكرار (إشعارات sla-sweep) — SPEC §14 */
  dedupeKey?: string;
}

const nowIso = () => new Date().toISOString();

/**
 * إدراج إشعار — يقبل منفّذ transaction ليعمل داخل عمليات services.
 * مع dedupeKey: يتجاهل الإدراج إن سبق (idempotent).
 */
export function insertNotification(executor: Db | Tx, input: NotificationInput): void {
  executor
    .insert(notifications)
    .values({
      userId: input.userId,
      requestId: input.requestId,
      type: input.type,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey,
      createdAt: nowIso(),
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .run();
}

export async function listForUser(userId: number, limit = 10): Promise<NotificationRow[]> {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: desc(notifications.createdAt),
    limit,
  });
}

export async function unreadCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markAllRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function markRead(userId: number, id: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId), isNull(notifications.readAt)));
}
