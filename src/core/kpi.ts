// حسابات مؤشرات لوحة المتابعة — دوال خالصة على مدخلات بسيطة (SPEC §12/01).

import { STATUSES, WORK_DAY_HOURS } from "./constants";
import type { Status } from "./types";

/**
 * تعريفات بطاقات KPI: اتجاه التحسّن خاصية في التعريف —
 * انخفاض «المتأخرة» تحسّن (أخضر)، وارتفاع «الالتزام» تحسّن.
 */
export const KPI_DEFS = {
  active: { label: "الطلبات النشطة", lowerIsBetter: false },
  overdue: { label: "الطلبات المتأخرة", lowerIsBetter: true },
  dueSoon24h: { label: "مستحق خلال 24 ساعة", lowerIsBetter: true },
  slaCompliance: { label: "نسبة الالتزام بـ SLA", lowerIsBetter: false },
  avgDeliveryDays: { label: "متوسط مدة التسليم", lowerIsBetter: true },
} as const;

export type KpiKey = keyof typeof KPI_DEFS;

/** دلتا نسبية مقارنة بالفترة السابقة — null إذا تعذر الحساب */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** هل الدلتا تحسّن؟ (يحدد اللون الأخضر/الأحمر في البطاقة) */
export function deltaIsImprovement(delta: number, lowerIsBetter: boolean): boolean {
  return lowerIsBetter ? delta < 0 : delta > 0;
}

/**
 * نسبة الالتزام بـ SLA: من الطلبات المُقيَّمة فقط (metSla ليست null)
 * مع استبعاد الملغى (SPEC §6: cancelled مستبعد من نسبة الالتزام).
 */
export function complianceRatePct(
  items: { metSla: boolean | null; excluded?: boolean }[],
): number | null {
  const evaluated = items.filter((i) => !i.excluded && i.metSla !== null);
  if (evaluated.length === 0) return null;
  return (evaluated.filter((i) => i.metSla).length / evaluated.length) * 100;
}

/** متوسط مدة التسليم بأيام العمل (كل 8 ساعات = يوم عمل) */
export function avgDeliveryWorkDays(durationsH: number[]): number | null {
  if (durationsH.length === 0) return null;
  const meanH = durationsH.reduce((a, b) => a + b, 0) / durationsH.length;
  return meanH / WORK_DAY_HOURS;
}

/** توزيع الطلبات حسب الحالة، بترتيب constants، مع إسقاط الأصفار */
export function statusDistribution(
  statuses: Status[],
): { status: Status; count: number }[] {
  const counts = new Map<Status, number>();
  for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
  return STATUSES.filter((s) => counts.has(s)).map((s) => ({
    status: s,
    count: counts.get(s)!,
  }));
}
