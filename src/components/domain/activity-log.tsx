// سجل التغييرات — من كل أحداث request_events (SPEC §4.8 و§12/04).

import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { EVENT_TYPE_META, PRIORITY_META, STATUS_META } from "@/core/constants";
import type { EventType, Priority, Status } from "@/core/types";
import { formatDateTime } from "@/lib/format";

export interface EventRow {
  id: number;
  type: EventType;
  actorName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

/** وصف عربي للحدث من نوعه وبياناته — يُستخدم في السجل والتايملاين */
export function eventDescription(e: EventRow): string {
  const d = e.data as Record<string, string | undefined>;
  switch (e.type) {
    case "status_change":
      return `تغيير الحالة من «${STATUS_META[d.from as Status]?.label ?? d.from}» إلى «${STATUS_META[d.to as Status]?.label ?? d.to}»${d.note ? ` — ${d.note}` : ""}`;
    case "comment":
      return "تمت إضافة تعليق على الطلب";
    case "attachment":
      return `تم رفع ${d.version ? `الإصدار ${d.version} ` : "ملف "}(${d.filename})`;
    case "assignment":
      return `تم إسناد الطلب إلى ${d.designerName}`;
    case "priority_change":
      return `تغيير الأولوية من «${PRIORITY_META[d.from as Priority]?.label ?? d.from}» إلى «${PRIORITY_META[d.to as Priority]?.label ?? d.to}»${d.reason ? ` — ${d.reason}` : ""}`;
    case "urgent_approval":
      return e.data.approved
        ? "تم اعتماد الأولوية العاجلة"
        : `لم يُعتمد الاستعجال${d.reason ? ` — ${d.reason}` : ""}`;
    case "system":
      return String(d.message ?? "إجراء نظامي");
  }
}

export function ActivityLog({ events }: { events: EventRow[] }) {
  const columns: DataColumn<EventRow>[] = [
    { key: "at", header: "التاريخ والوقت", cell: (e) => formatDateTime(e.createdAt), className: "whitespace-nowrap" },
    { key: "actor", header: "المستخدم", cell: (e) => e.actorName ?? "النظام" },
    {
      key: "type",
      header: "التغيير",
      cell: (e) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-info" />
          {EVENT_TYPE_META[e.type].label}
        </span>
      ),
    },
    { key: "details", header: "التفاصيل", cell: (e) => eventDescription(e) },
  ];

  if (events.length === 0) {
    return <p className="p-4 text-center text-sm text-muted-foreground">لا أحداث بعد</p>;
  }
  return <DataTable columns={columns} rows={events} rowKey={(e) => e.id} />;
}
