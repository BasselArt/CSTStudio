// لوحة المتابعة (SPEC §12/01) — Server Component ينادي services مباشرة.

import Link from "next/link";
import {
  AlarmClock,
  Clock4,
  ClipboardList,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { DataTable, type DataColumn } from "@/components/domain/data-table";
import { DesignerLoadCard } from "@/components/domain/designer-load-card";
import { EmptyState } from "@/components/domain/empty-state";
import { KpiCard } from "@/components/domain/kpi-card";
import { PageHeader } from "@/components/domain/page-header";
import { PeriodSelect } from "@/components/domain/period-select";
import { SlaBadge } from "@/components/domain/badges";
import { TOKEN_BG } from "@/components/domain/token-styles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTIVE_STATUSES,
  DASHBOARD_PERIODS,
  STATUS_META,
  type PeriodKey,
} from "@/core/constants";
import {
  avgDeliveryWorkDays,
  complianceRatePct,
  deltaPct,
  KPI_DEFS,
  statusDistribution,
} from "@/core/kpi";
import { designerLoadPoints, loadPct, loadState } from "@/core/load";
import { requireActor } from "@/lib/auth";
import { formatNumber, formatPercent, formatRemaining } from "@/lib/format";
import { getSettings } from "@/services/settings";
import { listVisibleRequests, type EnrichedRequest } from "@/services/requests";
import { listDesigners } from "@/services/users";
import { cn } from "@/lib/utils";

const PERIOD_DAYS: Record<PeriodKey, number> = { month: 30, week: 7, "90d": 90 };

function inWindow(dateIso: string | null, from: Date, to: Date): boolean {
  if (!dateIso) return false;
  const t = new Date(dateIso).getTime();
  return t >= from.getTime() && t < to.getTime();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await requireActor();
  const params = await searchParams;
  const period: PeriodKey =
    params.period && params.period in DASHBOARD_PERIODS ? (params.period as PeriodKey) : "month";

  const now = new Date();
  const len = PERIOD_DAYS[period] * 24 * 3_600_000;
  const currFrom = new Date(now.getTime() - len);
  const prevFrom = new Date(now.getTime() - 2 * len);

  const [rows, settingsRow] = await Promise.all([
    // لقطة بداية الفترة — أساس دلتا «مقارنة بالفترة السابقة» للمؤشرات اللحظية
    listVisibleRequests(actor, { snapshotAt: currFrom }),
    getSettings(),
  ]);

  /* --- KPIs --- */
  const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.request.status));
  const overdue = rows.filter((r) => r.sla.delivery.state === "overdue");
  const dueSoon = rows.filter((r) => r.sla.delivery.state === "due_soon");

  /* المؤشرات اللحظية تُقارن بلقطة بداية الفترة (SPEC §12/01) */
  const activePrev = rows.filter(
    (r) => r.snapshot && ACTIVE_STATUSES.includes(r.snapshot.status),
  ).length;
  const overduePrev = rows.filter((r) => r.snapshot?.sla.delivery.state === "overdue").length;
  const dueSoonPrev = rows.filter((r) => r.snapshot?.sla.delivery.state === "due_soon").length;

  const deliveredIn = (from: Date, to: Date) =>
    rows.filter((r) => inWindow(r.request.deliveredAt, from, to));
  const currDelivered = deliveredIn(currFrom, now);
  const prevDelivered = deliveredIn(prevFrom, currFrom);

  const compliance = complianceRatePct(
    currDelivered.map((r) => ({
      metSla: r.sla.delivery.metSla,
      excluded: r.request.status === "cancelled",
    })),
  );
  const prevCompliance = complianceRatePct(
    prevDelivered.map((r) => ({
      metSla: r.sla.delivery.metSla,
      excluded: r.request.status === "cancelled",
    })),
  );
  const avgDays = avgDeliveryWorkDays(currDelivered.map((r) => r.sla.delivery.consumedH));
  const prevAvgDays = avgDeliveryWorkDays(prevDelivered.map((r) => r.sla.delivery.consumedH));


  /* --- التوزيع وجدول الانتباه --- */
  const distribution = statusDistribution(
    rows
      .filter((r) => !["closed", "cancelled"].includes(r.request.status))
      .map((r) => r.request.status),
  );
  const distributionTotal = distribution.reduce((s, d) => s + d.count, 0);

  const attention = rows
    .filter((r) => ["overdue", "due_soon", "paused"].includes(r.sla.delivery.state))
    .sort(
      (a, b) =>
        (a.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER) -
        (b.sla.delivery.remainingH ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 8);

  const attentionColumns: DataColumn<EnrichedRequest>[] = [
    {
      key: "number",
      header: "رقم الطلب",
      cell: (r) => (
        <Link href={`/requests/${r.request.id}`} className="font-medium text-info hover:underline">
          {r.request.number}
        </Link>
      ),
    },
    { key: "title", header: "العنوان", cell: (r) => r.request.title },
    { key: "dept", header: "الجهة", cell: (r) => r.departmentName },
    { key: "designer", header: "المصمم", cell: (r) => r.assigneeName ?? "غير مسند" },
    {
      key: "remaining",
      header: "الوقت المتبقي",
      cell: (r) => (
        <span
          className={cn(
            "text-sm",
            r.sla.delivery.state === "overdue" && "font-medium text-danger",
            r.sla.delivery.state === "due_soon" && "text-warning",
          )}
        >
          {r.sla.delivery.state === "paused"
            ? "بانتظار معلومات"
            : formatRemaining(r.sla.delivery.remainingH)}
        </span>
      ),
    },
    {
      key: "sla",
      header: "حالة SLA",
      cell: (r) => <SlaBadge state={r.sla.delivery.state} />,
    },
  ];

  /* --- حمل المصممين (للمسؤول والمدير) --- */
  const showLoads = actor.role === "studio_manager" || actor.role === "executive";
  const designers = showLoads ? await listDesigners() : [];
  const loadCards = designers.map((d) => {
    const theirs = rows.filter((r) => r.request.assigneeId === d.id);
    const points = designerLoadPoints(
      theirs.map((r) => ({ status: r.request.status, effortPoints: r.type.effortPoints })),
    );
    const pct = loadPct(points, d.capacityPoints);
    return {
      id: d.id,
      name: d.name,
      loadPoints: points,
      pct,
      state: loadState(pct, settingsRow),
      activeCount: theirs.filter((r) => ACTIVE_STATUSES.includes(r.request.status)).length,
      overdueCount: theirs.filter((r) => r.sla.delivery.state === "overdue").length,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageHeader title="لوحة المتابعة" />
        <PeriodSelect value={period} />
      </div>

      {/* بطاقات KPI الخمس */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label={KPI_DEFS.active.label}
          value={active.length}
          delta={deltaPct(active.length, activePrev)}
          lowerIsBetter={KPI_DEFS.active.lowerIsBetter}
          icon={ClipboardList}
          iconClassName="bg-info/10 text-info"
        />
        <KpiCard
          label={KPI_DEFS.overdue.label}
          value={overdue.length}
          delta={deltaPct(overdue.length, overduePrev)}
          lowerIsBetter={KPI_DEFS.overdue.lowerIsBetter}
          icon={AlarmClock}
          iconClassName="bg-danger/10 text-danger"
        />
        <KpiCard
          label={KPI_DEFS.dueSoon24h.label}
          value={dueSoon.length}
          delta={deltaPct(dueSoon.length, dueSoonPrev)}
          lowerIsBetter={KPI_DEFS.dueSoon24h.lowerIsBetter}
          icon={Clock4}
          iconClassName="bg-warning/10 text-warning"
        />
        <KpiCard
          label={KPI_DEFS.slaCompliance.label}
          value={compliance == null ? "—" : formatPercent(compliance)}
          delta={
            compliance != null && prevCompliance != null
              ? compliance - prevCompliance
              : null
          }
          lowerIsBetter={KPI_DEFS.slaCompliance.lowerIsBetter}
          icon={ShieldCheck}
          iconClassName="bg-navy/10 text-navy"
        />
        <KpiCard
          label={KPI_DEFS.avgDeliveryDays.label}
          value={avgDays == null ? "—" : formatNumber(avgDays)}
          suffix="أيام عمل"
          delta={
            avgDays != null && prevAvgDays != null ? deltaPct(avgDays, prevAvgDays) : null
          }
          lowerIsBetter={KPI_DEFS.avgDeliveryDays.lowerIsBetter}
          icon={Timer}
          iconClassName="bg-progress/10 text-progress"
        />
      </div>

      {/* توزيع الطلبات حسب الحالة — stacked div بألوان constants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع الطلبات حسب الحالة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {distributionTotal === 0 ? (
            <p className="text-sm text-muted-foreground">لا طلبات مفتوحة حاليًا.</p>
          ) : (
            <>
              <div className="flex h-10 w-full overflow-hidden rounded-lg" role="img" aria-label="توزيع الطلبات">
                {distribution.map(({ status, count }) => (
                  <div
                    key={status}
                    className={cn(
                      "grid place-items-center text-sm font-bold text-white",
                      TOKEN_BG[STATUS_META[status].color],
                    )}
                    style={{ width: `${(count / distributionTotal) * 100}%` }}
                    title={`${STATUS_META[status].label}: ${count}`}
                  >
                    {formatNumber(count)}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {distribution.map(({ status }) => (
                  <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-2.5 rounded-full", TOKEN_BG[STATUS_META[status].color])} />
                    {STATUS_META[status].label}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* طلبات تحتاج انتباه */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">طلبات تحتاج انتباه</CardTitle>
          <Link href="/requests?tab=overdue" className="text-sm text-info hover:underline">
            عرض الكل
          </Link>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={attentionColumns}
            rows={attention}
            rowKey={(r) => r.request.id}
            rowClassName={(r) =>
              r.sla.delivery.state === "overdue" ? "bg-danger/5 hover:bg-danger/10" : undefined
            }
            empty={
              <EmptyState
                title="لا طلبات تحتاج انتباهًا"
                description="كل الطلبات ضمن الوقت المحدد."
              />
            }
          />
        </CardContent>
      </Card>

      {/* حمل المصممين */}
      {showLoads ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">حمل المصممين</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {loadCards.map((c) => (
                <DesignerLoadCard key={c.id} {...c} />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
