// جرس الإشعارات: GET للعدّاد وأحدث 10 (polling كل 60 ثانية) · POST لتعليم الكل كمقروء.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listForUser, markAllRead, unreadCount } from "@/services/notifications";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = Number(session.user.id);
  const [count, items] = await Promise.all([unreadCount(userId), listForUser(userId, 10)]);
  return NextResponse.json({ count, items });
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await markAllRead(Number(session.user.id));
  return NextResponse.json({ ok: true });
}
