// مراحل الطلب (SPEC §12/04) — من أحداث status_change مع فقاعة زمن التوقف.

import { Check, ClipboardCheck, PauseCircle, PenLine, Search, Truck } from "lucide-react";
import { STATUS_META } from "@/core/constants";
import type { Status } from "@/core/types";
import { formatDateTime, formatWorkingDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/** المراحل الخمس الرئيسة المعروضة في الشريط (صورة 04) */
const MAIN_STAGES: { status: Status; icon: typeof Check }[] = [
  { status: "new", icon: Check },
  { status: "ready", icon: ClipboardCheck },
  { status: "in_progress", icon: PenLine },
  { status: "internal_review", icon: Search },
  { status: "delivered", icon: Truck },
];

export function RequestTimeline({
  createdAt,
  statusChanges,
  currentStatus,
  pausedH,
}: {
  createdAt: string;
  statusChanges: { to: Status; at: string }[];
  currentStatus: Status;
  pausedH: number;
}) {
  const reachedAt = new Map<Status, string>([["new", createdAt]]);
  for (const c of statusChanges) {
    if (!reachedAt.has(c.to)) reachedAt.set(c.to, c.at);
  }
  // المغلق يَعتبر مرحلة التسليم منجزة
  if (reachedAt.has("closed") && !reachedAt.has("delivered")) {
    reachedAt.set("delivered", reachedAt.get("closed")!);
  }

  const currentMainIndex = (() => {
    // الحالات الموقِفة تُعرض عند آخر مرحلة رئيسة وُصلت
    for (let i = MAIN_STAGES.length - 1; i >= 0; i--) {
      if (reachedAt.has(MAIN_STAGES[i].status)) return i;
    }
    return 0;
  })();

  const isPaused = STATUS_META[currentStatus].slaEffect === "paused";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start">
        {MAIN_STAGES.map(({ status, icon: Icon }, i) => {
          const at = reachedAt.get(status);
          const done = at != null && i < currentMainIndex;
          const current = i === currentMainIndex;
          return (
            <div key={status} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    "h-px flex-1",
                    i === 0 ? "bg-transparent" : at ? "bg-success" : "border-t border-dashed",
                  )}
                />
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full border-2",
                    done && "border-success bg-success/10 text-success",
                    current && "border-navy bg-navy text-white",
                    !at && !current && "border-muted-foreground/30 text-muted-foreground/50",
                    at && !done && !current && "border-success bg-success/10 text-success",
                  )}
                >
                  {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                </span>
                <div
                  className={cn(
                    "h-px flex-1",
                    i === MAIN_STAGES.length - 1
                      ? "bg-transparent"
                      : reachedAt.get(MAIN_STAGES[i + 1].status)
                        ? "bg-success"
                        : "border-t border-dashed",
                  )}
                />
              </div>
              <p className={cn("text-sm font-medium", !at && "text-muted-foreground/60")}>
                {STATUS_META[status].label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {at ? formatDateTime(at) : "لم يبدأ بعد"}
              </p>
              {current ? (
                <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-medium text-navy">
                  المرحلة الحالية
                </span>
              ) : null}
              {current && isPaused ? (
                <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                  <PauseCircle className="size-3" />
                  توقف {formatWorkingDuration(pausedH)} — {STATUS_META[currentStatus].label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
