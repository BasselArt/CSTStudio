// الشارات المشتركة للشاشات الخمس (SPEC §4.4) — النصوص والألوان من core/constants حصريًا.

import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_META,
  SLA_STATE_META,
  STATUS_META,
} from "@/core/constants";
import type { Priority, SlaState, Status } from "@/core/types";
import { cn } from "@/lib/utils";
import { TOKEN_SOFT } from "./token-styles";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={cn("border-transparent font-medium", TOKEN_SOFT[meta.color], className)}>
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority];
  return (
    <Badge className={cn("border-transparent font-medium", TOKEN_SOFT[meta.color], className)}>
      {meta.label}
    </Badge>
  );
}

export function SlaBadge({ state, className }: { state: SlaState; className?: string }) {
  const meta = SLA_STATE_META[state];
  return (
    <Badge className={cn("border-transparent font-medium", TOKEN_SOFT[meta.color], className)}>
      {meta.label}
    </Badge>
  );
}
