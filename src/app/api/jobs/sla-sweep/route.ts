// مهمة الكنس الدورية (SPEC §14): محمية بترويسة x-job-token، idempotent عبر dedupeKey.
// تُستدعى من مجدول خارجي كل 15 دقيقة — أمر curl موثق في README.

import { NextResponse, type NextRequest } from "next/server";
import { sweepSla } from "@/services/requests";

export async function POST(request: NextRequest) {
  const token = process.env.JOB_TOKEN;
  if (!token || request.headers.get("x-job-token") !== token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sweepSla();
  return NextResponse.json(result);
}
