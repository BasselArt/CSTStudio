// شعار النظام — يُخدَّم من storage/uploads/branding دون مصادقة
// (يظهر في صفحة تسجيل الدخول قبل الدخول).

import { NextResponse } from "next/server";
import { logoMime, readAttachmentFile } from "@/services/files";
import { getSettings } from "@/services/settings";

export async function GET() {
  const settings = await getSettings();
  if (!settings.logoPath) {
    return NextResponse.json({ error: "no logo" }, { status: 404 });
  }

  let file: Buffer;
  try {
    file = readAttachmentFile(settings.logoPath);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": logoMime(settings.logoPath),
      "Content-Length": String(file.length),
      // المسار يتغير مع كل رفع (uuid) — التخزين المؤقت القصير كافٍ
      "Cache-Control": "private, max-age=300",
    },
  });
}
