// تعليم إشعار واحد كمقروء عند الضغط عليه.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markRead } from "@/services/notifications";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await markRead(Number(session.user.id), Number(id));
  return NextResponse.json({ ok: true });
}
