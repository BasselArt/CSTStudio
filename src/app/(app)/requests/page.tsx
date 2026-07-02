// إدارة الطلبات (SPEC §12/02) — كل الفلاتر والتبويب والفرز والصفحة في searchParams.

import Link from "next/link";
import { Bookmark, Download, Plus } from "lucide-react";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/domain/badges";
import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { RequestsFilters } from "@/components/domain/requests-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIVE_STATUSES } from "@/core/constants";
import { requireActor } from "@/lib/auth";
import { formatDate, formatNumber } from "@/lib/format";
import { listVisibleRequests, type EnrichedRequest } from "@/services/requests";
import { listRequestTypes } from "@/services/settings";
import { listDepartments, listDesigners } from "@/services/users";
import { cn } from "@/lib/utils";
import {
  applyFilters,
  PAGE_SIZE,
  parseFilters,
  REQUEST_TABS,
  tabCounts,
  type RequestTab,
} from "./query";

function tabHref(tab: RequestTab, sp: URLSearchParams): string {
  const params = new URLSearchParams(sp);
  params.set("tab", tab);
  params.delete("page");
  return `/requests?${params.toString()}`;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [allRows, departments, designers, types] = await Promise.all([
    listVisibleRequests(actor, { includeDrafts: true }),
    listDepartments(),
    listDesigners(),
    listRequestTypes(),
  ]);

  // المسودات تظهر لصاحبها فقط ولا تدخل أي مؤشر أو تبويب (SPEC §12/03)
  const drafts = allRows.filter(
    (r) => r.request.isDraft && r.request.requesterId === actor.id,
  );
  const rows = allRows.filter((r) => !r.request.isDraft);

  const counts = tabCounts(rows);
  const filtered = applyFilters(rows, filters);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeCount = rows.filter((r) => ACTIVE_STATUSES.includes(r.request.status)).length;
  const overdueCount = counts.overdue;
  const dueThisWeek = rows.filter(
    (r) =>
      r.sla.delivery.remainingH != null &&
      r.sla.delivery.remainingH > 0 &&
      r.sla.delivery.remainingH <= 40,
  ).length;

  const spParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") spParams.set(k, v);

  const columns: DataColumn<EnrichedRequest>[] = [
    {
      key: "number",
      header: "رقم الطلب",
      cell: (r) => (
        <Link href={`/requests/${r.request.id}`} className="font-medium text-info hover:underline">
          {r.request.number}
        </Link>
      ),
    },
    {
      key: "title",
      header: "العنوان",
      cell: (r) => (
        <Link href={`/requests/${r.request.id}`} className="hover:underline">
          {r.request.title}
        </Link>
      ),
      className: "max-w-64 truncate",
    },
    { key: "dept", header: "الجهة", cell: (r) => r.departmentName },
    { key: "type", header: "النوع", cell: (r) => r.type.name },
    { key: "priority", header: "الأولوية", cell: (r) => <PriorityBadge priority={r.request.priority} /> },
    {
      key: "designer",
      header: "المصمم",
      cell: (r) =>
        r.assigneeName ?? <span className="text-muted-foreground">غير مسند</span>,
    },
    { key: "status", header: "الحالة", cell: (r) => <StatusBadge status={r.request.status} /> },
    {
      key: "due",
      header: "موعد التسليم",
      cell: (r) => {
        const due = r.sla.delivery.expectedDeliveryAt ?? r.request.publishDueDate;
        return due ? (
          <span className={cn(r.sla.delivery.state === "overdue" && "font-medium text-danger")}>
            {formatDate(due)}
          </span>
        ) : (
          "—"
        );
      },
    },
    { key: "sla", header: "حالة SLA", cell: (r) => <SlaBadge state={r.sla.delivery.state} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="إدارة طلبات التصميم"
        subtitle={`${formatNumber(activeCount)} طلبًا نشطًا · ${formatNumber(overdueCount)} متأخرة · ${formatNumber(dueThisWeek)} مستحقة هذا الأسبوع`}
        actions={
          <>
            <Button variant="outline" asChild className="gap-2">
              <a href={`/requests/export?${spParams.toString()}`}>
                <Download className="size-4" />
                تصدير
              </a>
            </Button>
            {actor.role === "requester" || actor.role === "studio_manager" ? (
              <Button asChild className="gap-2">
                <Link href="/requests/new">
                  <Plus className="size-4" />
                  طلب جديد
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {/* التبويبات بأعداد حية */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(REQUEST_TABS) as [RequestTab, string][]).map(([tab, label]) => {
          const active = filters.tab === tab;
          return (
            <Link
              key={tab}
              href={tabHref(tab, spParams)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-navy bg-navy font-medium text-white"
                  : "bg-card hover:bg-muted",
              )}
            >
              {label}
              {tab !== "all" && counts[tab] > 0 ? (
                <Badge
                  className={cn(
                    "border-transparent px-1.5",
                    active
                      ? "bg-white/20 text-white"
                      : tab === "overdue"
                        ? "bg-danger/10 text-danger"
                        : "bg-warning/10 text-warning",
                  )}
                >
                  {formatNumber(counts[tab])}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </div>

      {drafts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <Bookmark className="size-4 text-warning" />
          <span className="font-medium">لديك {formatNumber(drafts.length)} مسودة محفوظة:</span>
          {drafts.map((d) => (
            <Link
              key={d.request.id}
              href={`/requests/${d.request.id}`}
              className="text-info hover:underline"
            >
              {d.request.title}
            </Link>
          ))}
        </div>
      ) : null}

      <RequestsFilters
        departments={departments.map((d) => ({ value: String(d.id), label: d.name }))}
        designers={designers.map((d) => ({ value: String(d.id), label: d.name }))}
        types={types.map((t) => ({ value: String(t.id), label: t.name }))}
      />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(r) => r.request.id}
        rowClassName={(r) =>
          r.sla.delivery.state === "overdue" ? "bg-danger/5 hover:bg-danger/10" : undefined
        }
        empty={
          <EmptyState
            title="لا توجد نتائج مطابقة"
            description="جرّب تعديل الفلاتر أو كلمات البحث للعثور على طلبات التصميم التي تبحث عنها."
          />
        }
      />

      {/* الترقيم */}
      {filtered.length > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            عرض {formatNumber((page - 1) * PAGE_SIZE + 1)}–
            {formatNumber(Math.min(page * PAGE_SIZE, filtered.length))} من{" "}
            {formatNumber(filtered.length)}
          </p>
          <div className="flex items-center gap-1">
            <PageLink sp={spParams} page={page - 1} disabled={page <= 1} label="السابق" />
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <PageLink key={p} sp={spParams} page={p} current={p === page} label={formatNumber(p)} />
            ))}
            <PageLink sp={spParams} page={page + 1} disabled={page >= totalPages} label="التالي" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageLink({
  sp,
  page,
  label,
  current,
  disabled,
}: {
  sp: URLSearchParams;
  page: number;
  label: string;
  current?: boolean;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground/50">{label}</span>
    );
  }
  const params = new URLSearchParams(sp);
  params.set("page", String(page));
  return (
    <Link
      href={`/requests?${params.toString()}`}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm hover:bg-muted",
        current && "border-navy bg-navy font-medium text-white hover:bg-navy",
      )}
    >
      {label}
    </Link>
  );
}
