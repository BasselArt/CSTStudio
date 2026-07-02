"use client";

// فلتر مدة لوحة المتابعة — يكتب searchParams (روابط قابلة للمشاركة).

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PERIODS = {
  month: "هذا الشهر",
  week: "هذا الأسبوع",
  "90d": "آخر 90 يومًا",
} as const;

export type PeriodKey = keyof typeof PERIODS;

export function PeriodSelect({ value }: { value: PeriodKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const params = new URLSearchParams(searchParams);
        params.set("period", v);
        router.replace(`/?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-40 bg-card" aria-label="فترة العرض">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(PERIODS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
