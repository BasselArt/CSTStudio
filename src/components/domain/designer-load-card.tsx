// بطاقة حمل المصمم (SPEC §7 و§12/01) — تُستخدم في لوحة المتابعة وصفحة المصممين.

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { LOAD_STATE_META } from "@/core/constants";
import type { LoadState } from "@/core/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TOKEN_BG, TOKEN_TEXT } from "./token-styles";

export function LoadBar({ pct, state }: { pct: number; state: LoadState }) {
  const meta = LOAD_STATE_META[state];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" dir="rtl">
      <div
        className={cn("h-full rounded-full", TOKEN_BG[meta.color])}
        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
      />
    </div>
  );
}

export function DesignerLoadCard({
  name,
  loadPoints,
  pct,
  state,
  activeCount,
  overdueCount,
}: {
  name: string;
  loadPoints: number;
  pct: number;
  state: LoadState;
  activeCount: number;
  overdueCount: number;
}) {
  const meta = LOAD_STATE_META[state];
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback className="bg-navy/10 font-medium text-navy">
              {name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-navy">{name}</p>
            <p className="text-xs text-muted-foreground">
              {formatNumber(loadPoints)} نقطة حمل
            </p>
          </div>
        </div>
        <LoadBar pct={pct} state={state} />
        <p className={cn("text-xs font-medium", TOKEN_TEXT[meta.color])}>
          حالة: {meta.label}
        </p>
        <div className="grid grid-cols-2 divide-x divide-x-reverse border-t pt-2 text-center">
          <div>
            <p className="text-lg font-bold text-navy">{formatNumber(activeCount)}</p>
            <p className="text-xs text-muted-foreground">الطلبات النشطة</p>
          </div>
          <div>
            <p className={cn("text-lg font-bold", overdueCount > 0 ? "text-danger" : "text-navy")}>
              {formatNumber(overdueCount)}
            </p>
            <p className="text-xs text-muted-foreground">المتأخر منها</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
