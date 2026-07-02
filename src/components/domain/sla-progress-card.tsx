// بطاقة مؤشرات SLA (SPEC §12/04) — بالمعادلات الصحيحة من §9 وزمن التوقف منفصلًا.

import { CalendarClock, Clock3, Hourglass, PauseCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeliverySla } from "@/core/types";
import { formatPercent, formatRemaining, formatWorkingDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SlaProgressCard({ sla }: { sla: DeliverySla }) {
  const pct = sla.pct != null ? Math.round(sla.pct * 100) : null;
  const overdue = sla.state === "overdue";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">مؤشرات SLA</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hourglass className="size-3.5" />
              استهلاك المدة
            </span>
            <span className={cn("text-2xl font-bold", overdue ? "text-danger" : "text-navy")}>
              {pct != null ? formatPercent(pct) : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {sla.targetH != null
                ? `من إجمالي (${formatWorkingDuration(sla.targetH)})`
                : "الهدف باتفاق"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PauseCircle className="size-3.5" />
              زمن التوقف
            </span>
            <span className="text-2xl font-bold text-navy">
              {formatWorkingDuration(sla.pausedH)}
            </span>
            <span className="text-[10px] text-muted-foreground">بانتظار الجهة</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              مدة العمل الفعلية
            </span>
            <span className="text-2xl font-bold text-navy">
              {formatWorkingDuration(sla.consumedH)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {sla.targetH != null ? `من إجمالي (${formatWorkingDuration(sla.targetH)})` : ""}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              الوقت المتبقي
            </span>
            <span
              className={cn(
                "text-2xl font-bold",
                overdue ? "text-danger" : sla.state === "paused" ? "text-muted-token" : "text-success",
              )}
            >
              {formatRemaining(sla.remainingH, sla.state === "paused")}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {sla.expectedDeliveryAt ? "حتى موعد التسليم المتوقع" : ""}
            </span>
          </div>
        </div>

        {pct != null ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-4 w-full overflow-hidden rounded-full bg-muted" dir="rtl">
              <div
                className={cn(
                  "grid h-full place-items-center rounded-full text-[10px] font-bold text-white",
                  overdue ? "bg-danger" : "bg-success",
                )}
                style={{ width: `${Math.min(100, Math.max(6, pct))}%` }}
              >
                {formatPercent(pct)}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>
                {sla.remainingH != null && sla.remainingH > 0
                  ? `${formatWorkingDuration(sla.remainingH)} متبقية`
                  : ""}
              </span>
              <span>
                {sla.targetH != null ? `${formatWorkingDuration(sla.targetH)} إجمالي` : ""}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
