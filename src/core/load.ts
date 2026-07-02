// نقاط الجهد وحالة الحمل (SPEC §7).

import { LOAD_COUNTING_STATUSES } from "./constants";
import type { LoadState, Status } from "./types";

export interface LoadThresholds {
  loadLowPct: number;
  loadHighPct: number;
}

/** حمل المصمم = مجموع effortPoints لطلباته في الحالات المحتسبة */
export function designerLoadPoints(
  items: { status: Status; effortPoints: number }[],
): number {
  return items
    .filter((i) => LOAD_COUNTING_STATUSES.includes(i.status))
    .reduce((sum, i) => sum + i.effortPoints, 0);
}

/** نسبة الحمل من السعة (المعروضة «X / 100» في بطاقات المصممين) */
export function loadPct(points: number, capacityPoints: number): number {
  if (capacityPoints <= 0) return 0;
  return (points / capacityPoints) * 100;
}

/** منخفض < loadLowPct · طبيعي بينهما · مرتفع > loadHighPct */
export function loadState(pct: number, t: LoadThresholds): LoadState {
  if (pct < t.loadLowPct) return "low";
  if (pct > t.loadHighPct) return "high";
  return "normal";
}
