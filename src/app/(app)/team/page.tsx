// المصممون (SPEC §12/05) — بطاقات الإحصائيات وطلبات المصمم المختار.

import Link from "next/link";
import { redirect } from "next/navigation";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/domain/badges";
import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { DesignerStatsCard, type DesignerStats } from "@/components/domain/designer-stats-card";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACTIVE_STATUSES } from "@/core/constants";
import { complianceRatePct } from "@/core/kpi";
import { designerLoadPoints, loadPct, loadState } from "@/core/load";
import { requireActor } from "@/lib/auth";
import { formatDate, formatNumber, formatRemaining } from "@/lib/format";
import { listVisibleRequests, type EnrichedRequest } from "@/services/requests";
import { getSettings } from "@/services/settings";
import { listDesigners } from "@/services/users";
import { cn } from "@/lib/utils";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ designer?: string }>;
}) {
  const actor = await requireActor();
  if (actor.role !== "studio_manager" && actor.role !== "executive") redirect("/");

  const sp = await searchParams;

  const [designers, rows, settingsRow] = await Promise.all([
    listDesigners(),
    listVisibleRequests(actor),
    getSettings(),
  ]);

  /* إحصائيات كل مصمم */
  const stats: DesignerStats[] = designers.map((d) => {
    const theirs = rows.filter((r) => r.request.assigneeId === d.id);
    const points = designerLoadPoints(
      theirs.map((r) => ({ status: r.request.status, effortPoints: r.type.effortPoints })),
    );
    const pct = loadPct(points, d.capacityPoints);
    const delivered = theirs.filter((r) => ["delivered", "closed"].includes(r.request.status));
    const nonCancelled = theirs.filter((r) => r.request.status !== "cancelled");
    return {
      id: d.id,
      name: d.name,
      title: d.name.includes("ة") ? "مصممة" : "مصمم",
      loadPct: pct,
      loadState: loadState(pct, settingsRow),
      activeCount: theirs.filter((r) => ACTIVE_STATUSES.includes(r.request.status)).length,
      inProgressCount: theirs.filter((r) => r.request.status === "in_progress").length,
      overdueCount: theirs.filter((r) => r.sla.delivery.state === "overdue").length,
      completionPct:
        nonCancelled.length > 0 ? (delivered.length / nonCancelled.length) * 100 : null,
      slaCompliancePct: complianceRatePct(
        delivered.map((r) => ({ metSla: r.sla.delivery.metSla })),
      ),
      firstApprovalPct:
        delivered.length > 0
          ? (delivered.filter((r) => r.request.reviewRound === 0).length / delivered.length) * 100
          : null,
    };
  });

  const selectedId = Number(sp.designer) || null;
  const selected = selectedId ? designers.find((d) => d.id === selectedId) : null;
  const selectedRequests = selected
    ? rows
        .filter((r) => r.request.assigneeId === selected.id)
        .sort(
          (a, b) =>
            (a.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER) -
            (b.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER),
        )
    : [];

  const requestColumns: DataColumn<EnrichedRequest>[] = [
    {
      key: "number",
      header: "رقم الطلب",
      cell: (r) => (
        <Link href={`/requests/${r.request.id}`} className="font-medium text-info hover:underline">
          {r.request.number}
        </Link>
      ),
    },
    { key: "title", header: "العنوان", cell: (r) => r.request.title, className: "max-w-64 truncate" },
    { key: "dept", header: "الجهة", cell: (r) => r.departmentName },
    { key: "type", header: "نوع التصميم", cell: (r) => r.type.name },
    { key: "priority", header: "الأولوية", cell: (r) => <PriorityBadge priority={r.request.priority} /> },
    { key: "status", header: "الحالة", cell: (r) => <StatusBadge status={r.request.status} /> },
    {
      key: "due",
      header: "موعد التسليم",
      cell: (r) => {
        const due = r.sla.delivery.expectedDeliveryAt ?? r.request.publishDueDate;
        return due ? formatDate(due) : "—";
      },
    },
    {
      key: "remaining",
      header: "الوقت المتبقي",
      cell: (r) =>
        r.sla.delivery.state === "paused" ? (
          "متوقف"
        ) : (
          <span className={cn(r.sla.delivery.state === "overdue" && "text-danger")}>
            {formatRemaining(r.sla.delivery.remainingH)}
          </span>
        ),
    },
    { key: "sla", header: "حالة SLA", cell: (r) => <SlaBadge state={r.sla.delivery.state} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="المصممون" />

      <p className="text-sm text-muted-foreground">
        المصممون ({formatNumber(stats.length)})
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <DesignerStatsCard
            key={s.id}
            stats={s}
            selected={s.id === selectedId}
            href={`/team?designer=${s.id}`}
          />
        ))}
      </div>

      {selected ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              الطلبات المسندة إلى: {selected.name}
            </CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                عرض {formatNumber(Math.min(6, selectedRequests.length))} من{" "}
                {formatNumber(selectedRequests.length)} طلبات
              </span>
              <Link
                href={`/requests?designer=${selected.id}`}
                className="text-info hover:underline"
              >
                عرض جميع طلبات {selected.name} ‹
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={requestColumns}
              rows={selectedRequests.slice(0, 6)}
              rowKey={(r) => r.request.id}
              rowClassName={(r) =>
                r.sla.delivery.state === "overdue" ? "bg-danger/5 hover:bg-danger/10" : undefined
              }
              empty={<EmptyState title="لا طلبات مسندة لهذا المصمم" />}
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          اختر مصممًا لعرض طلباته المسندة.
        </p>
      )}
    </div>
  );
}
