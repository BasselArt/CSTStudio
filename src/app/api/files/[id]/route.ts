// تنزيل المرفقات — storage/uploads خارج public، مع فحص صلاحية الوصول للطلب نفسه (SPEC §12/04).

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { attachments, requests } from "@/db/schema";
import { auth } from "@/lib/auth";
import { readAttachmentFile } from "@/services/files";
import { canView, type Actor } from "@/services/requests";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor: Actor = {
    id: Number(session.user.id),
    role: session.user.role,
    departmentId: session.user.departmentId,
    name: session.user.name ?? "",
  };

  const { id } = await params;
  const attachment = await db.query.attachments.findFirst({
    where: eq(attachments.id, Number(id)),
  });
  if (!attachment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const request = await db.query.requests.findFirst({
    where: eq(requests.id, attachment.requestId),
  });
  if (!request || !canView(actor, request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let file: Buffer;
  try {
    file = readAttachmentFile(attachment.path);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(file.length),
      // RFC 5987 لأسماء الملفات العربية
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    },
  });
}
