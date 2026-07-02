// تصدير CSV للفلترة الحالية — UTF-8 مع BOM (SPEC §12/02).

import { NextResponse, type NextRequest } from "next/server";
import { PRIORITY_META, SLA_STATE_META, STATUS_META } from "@/core/constants";
import { auth } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { listVisibleRequests, type Actor } from "@/services/requests";
import { applyFilters, parseFilters } from "../query";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor: Actor = {
    id: Number(session.user.id),
    role: session.user.role,
    departmentId: session.user.departmentId,
    name: session.user.name ?? "",
  };

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const rows = applyFilters(await listVisibleRequests(actor), parseFilters(sp));

  const csv = toCsv(
    ["رقم الطلب", "العنوان", "الجهة", "النوع", "الأولوية", "المصمم", "الحالة", "حالة SLA", "تاريخ الإنشاء", "موعد التسليم المتوقع"],
    rows.map((r) => [
      r.request.number,
      r.request.title,
      r.departmentName,
      r.type.name,
      PRIORITY_META[r.request.priority].label,
      r.assigneeName ?? "غير مسند",
      STATUS_META[r.request.status].label,
      SLA_STATE_META[r.sla.delivery.state].label,
      formatDate(r.request.createdAt),
      r.sla.delivery.expectedDeliveryAt ? formatDate(r.sla.delivery.expectedDeliveryAt) : "—",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="requests-${Date.now()}.csv"`,
    },
  });
}
