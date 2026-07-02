// تحليل فلاتر searchParams وتطبيقها — مشترك بين صفحة الطلبات ومسار تصدير CSV.

import { ACTIVE_STATUSES, STATUSES } from "@/core/constants";
import type { Priority, Status } from "@/core/types";
import type { EnrichedRequest } from "@/services/requests";

export const REQUEST_TABS = {
  all: "الكل",
  unassigned: "غير مسندة",
  overdue: "متأخرة",
  needs_info: "بانتظار معلومات",
  internal_review: "قيد المراجعة",
} as const;

export type RequestTab = keyof typeof REQUEST_TABS;

export interface RequestFilters {
  tab: RequestTab;
  q: string;
  status: Status | null;
  designerId: number | null;
  departmentId: number | null;
  typeId: number | null;
  priority: Priority | null;
  page: number;
}

export const PAGE_SIZE = 10;

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function parseFilters(sp: SP): RequestFilters {
  const tab = str(sp.tab);
  const status = str(sp.status);
  const priority = str(sp.priority);
  const num = (v?: string) => {
    const n = Number(v);
    return v && Number.isInteger(n) && n > 0 ? n : null;
  };
  return {
    tab: tab && tab in REQUEST_TABS ? (tab as RequestTab) : "all",
    q: str(sp.q)?.trim() ?? "",
    status: status && (STATUSES as readonly string[]).includes(status) ? (status as Status) : null,
    designerId: num(str(sp.designer)),
    departmentId: num(str(sp.department)),
    typeId: num(str(sp.type)),
    priority: priority && ["normal", "high", "urgent"].includes(priority) ? (priority as Priority) : null,
    page: num(str(sp.page)) ?? 1,
  };
}

export function matchesTab(r: EnrichedRequest, tab: RequestTab): boolean {
  switch (tab) {
    case "all":
      return true;
    case "unassigned":
      return r.request.assigneeId == null && ACTIVE_STATUSES.includes(r.request.status);
    case "overdue":
      return r.sla.delivery.state === "overdue";
    case "needs_info":
      return r.request.status === "needs_info";
    case "internal_review":
      return r.request.status === "internal_review";
  }
}

export function tabCounts(rows: EnrichedRequest[]): Record<RequestTab, number> {
  const counts = { all: 0, unassigned: 0, overdue: 0, needs_info: 0, internal_review: 0 };
  for (const r of rows) {
    for (const tab of Object.keys(counts) as RequestTab[]) {
      if (matchesTab(r, tab)) counts[tab] += 1;
    }
  }
  return counts;
}

/** الفلترة + الفرز الافتراضي بالمتبقي تصاعديًا (SPEC §12/02) */
export function applyFilters(rows: EnrichedRequest[], f: RequestFilters): EnrichedRequest[] {
  const q = f.q.toLowerCase();
  return rows
    .filter((r) => matchesTab(r, f.tab))
    .filter((r) => !f.status || r.request.status === f.status)
    .filter((r) => !f.designerId || r.request.assigneeId === f.designerId)
    .filter((r) => !f.departmentId || r.request.departmentId === f.departmentId)
    .filter((r) => !f.typeId || r.request.typeId === f.typeId)
    .filter((r) => !f.priority || r.request.priority === f.priority)
    .filter(
      (r) =>
        !q ||
        r.request.number.toLowerCase().includes(q) ||
        r.request.title.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const ra = a.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER;
      const rb = b.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return ra - rb;
      return b.request.createdAt.localeCompare(a.request.createdAt);
    });
}
