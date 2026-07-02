// بطاقة المصمم في صفحة الفريق (SPEC §12/05): نسبة الحمل بشريط،
// النشطة/قيد التنفيذ/المتأخرة، وثلاث حلقات SVG بسيطة بلا مكتبة.

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LOAD_STATE_META, STATUS_META } from "@/core/constants";
import type { ColorToken, LoadState } from "@/core/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LoadBar } from "./designer-load-card";
import { TOKEN_SOFT, TOKEN_TEXT } from "./token-styles";

function ProgressRing({
  pct,
  label,
  color,
}: {
  pct: number | null;
  label: string;
  color: ColorToken;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const value = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="relative grid place-items-center">
        <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * c} ${c}`}
            className={cn("transition-all", TOKEN_TEXT[color])}
            stroke="currentColor"
          />
        </svg>
        <span className="absolute text-[10px] font-bold text-navy">
          {pct == null ? "—" : formatPercent(pct)}
        </span>
      </span>
      <span className="text-center text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export interface DesignerStats {
  id: number;
  name: string;
  title: string;
  loadPct: number;
  loadState: LoadState;
  activeCount: number;
  inProgressCount: number;
  overdueCount: number;
  completionPct: number | null;
  slaCompliancePct: number | null;
  firstApprovalPct: number | null;
}

export function DesignerStatsCard({
  stats,
  selected,
  href,
}: {
  stats: DesignerStats;
  selected: boolean;
  href: string;
}) {
  const loadMeta = LOAD_STATE_META[stats.loadState];
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "ring-2 ring-navy",
      )}
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-navy/10 font-medium text-navy">
                {stats.name.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-bold text-navy">{stats.name}</p>
              <p className="text-xs text-muted-foreground">{stats.title}</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">نقاط الجهد الحالية</p>
              <p className="font-bold text-navy">
                {formatNumber(Math.round(stats.loadPct))} / 100
              </p>
            </div>
            <Badge className={cn("border-transparent", TOKEN_SOFT[loadMeta.color])}>
              {loadMeta.label}
            </Badge>
          </div>
          <LoadBar pct={stats.loadPct} state={stats.loadState} />

          <div className="grid grid-cols-3 divide-x divide-x-reverse border-y py-2 text-center">
            <div>
              <p className="font-bold text-navy">{formatNumber(stats.activeCount)}</p>
              <p className="text-[10px] text-muted-foreground">النشطة</p>
            </div>
            <div>
              <p className="font-bold text-navy">{formatNumber(stats.inProgressCount)}</p>
              <p className="text-[10px] text-muted-foreground">
                {STATUS_META.in_progress.label}
              </p>
            </div>
            <div>
              <p className={cn("font-bold", stats.overdueCount > 0 ? "text-danger" : "text-navy")}>
                {formatNumber(stats.overdueCount)}
              </p>
              <p className="text-[10px] text-muted-foreground">المتأخرة</p>
            </div>
          </div>

          <div className="flex items-start justify-around">
            <ProgressRing pct={stats.completionPct} label="نسبة الإنجاز" color="warning" />
            <ProgressRing pct={stats.slaCompliancePct} label="الالتزام بـ SLA" color="info" />
            <ProgressRing pct={stats.firstApprovalPct} label="اعتماد من أول تسليم" color="success" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
