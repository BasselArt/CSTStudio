import { SearchX } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = SearchX,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <span className="rounded-lg border p-3 text-muted-foreground">
        <Icon className="size-6" />
      </span>
      <p className="font-medium text-navy">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
