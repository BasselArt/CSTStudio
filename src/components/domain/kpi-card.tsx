// بطاقة KPI للوحة المتابعة — اتجاه التحسّن من تعريف المؤشر (SPEC §12/01).

import { TrendingDown, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { deltaIsImprovement } from "@/core/kpi";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  suffix,
  delta,
  lowerIsBetter,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta: number | null;
  lowerIsBetter: boolean;
  icon: LucideIcon;
  iconClassName?: string;
}) {
  const improved = delta != null ? deltaIsImprovement(delta, lowerIsBetter) : null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className={cn("rounded-full p-2", iconClassName ?? "bg-muted text-muted-foreground")}>
            <Icon className="size-4" />
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-navy">
            {typeof value === "number" ? formatNumber(value) : value}
          </span>
          {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
        </div>
        <div className="flex items-center gap-1 text-xs">
          {delta == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium",
                  improved ? "text-success" : "text-danger",
                )}
              >
                {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {formatNumber(Math.abs(Math.round(delta)))}%
              </span>
              <span className="text-muted-foreground">مقارنة بالفترة السابقة</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
