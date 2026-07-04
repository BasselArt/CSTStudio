// محرك SLA — حساب عند القراءة من أحداث status_change، لا عدّادات مخزنة (SPEC §9).

import { addWorkingHours, workingHoursBetween } from "./calendar";
import { DUE_SOON_THRESHOLD_H, STATUS_META, TOOL_META } from "./constants";
import type {
  DeliverySla,
  DesignTool,
  Priority,
  ResponseSla,
  SlaInput,
  SlaResult,
  SlaSizing,
  SlaState,
  Status,
  StatusChange,
  ToolFactors,
} from "./types";

interface Segment {
  status: Status;
  from: Date;
  to: Date;
}

/** يبني مقاطع الإقامة في كل حالة من createdAt حتى now */
function buildSegments(
  createdAt: Date,
  changes: StatusChange[],
  now: Date,
): { segments: Segment[]; current: Status } {
  const segments: Segment[] = [];
  let status: Status = "new";
  let cursor = createdAt;
  for (const c of changes) {
    segments.push({ status, from: cursor, to: c.at });
    status = c.to;
    cursor = c.at;
  }
  segments.push({ status, from: cursor, to: now });
  return { segments, current: status };
}

export function computeSla(input: SlaInput): SlaResult {
  const { createdAt, statusChanges, targetH, responseTargetH, cfg, now } = input;
  const dueSoonH = input.dueSoonThresholdH ?? DUE_SOON_THRESHOLD_H;
  const { segments, current } = buildSegments(createdAt, statusChanges, now);

  // ---- SLA الاستجابة: من الإنشاء حتى أول مغادرة لحالة new (أو حتى now)
  const respondedAt = statusChanges[0]?.at ?? null;
  const responseConsumedH = workingHoursBetween(createdAt, respondedAt ?? now, cfg);
  const response: ResponseSla = {
    targetH: responseTargetH,
    consumedH: responseConsumedH,
    respondedAt,
    metSla: respondedAt ? responseConsumedH <= responseTargetH : null,
    state: respondedAt
      ? "stopped"
      : responseConsumedH > responseTargetH
        ? "overdue"
        : "on_track",
  };

  // ---- SLA التسليم: يبدأ من أول دخول ready (SPEC §9)
  const startedAt = statusChanges.find((c) => c.to === "ready")?.at ?? null;
  const deliveredAt =
    [...statusChanges].reverse().find((c) => c.to === "delivered")?.at ?? null;

  let consumedH = 0;
  let pausedH = 0;
  for (const seg of segments) {
    const effect = STATUS_META[seg.status].slaEffect;
    if (effect === "running") consumedH += workingHoursBetween(seg.from, seg.to, cfg);
    else if (effect === "paused") pausedH += workingHoursBetween(seg.from, seg.to, cfg);
  }

  const remainingH = targetH == null ? null : targetH - consumedH;
  const pct = targetH == null || targetH === 0 ? null : consumedH / targetH;
  const currentEffect = STATUS_META[current].slaEffect;
  const isStopped = currentEffect === "stopped" || currentEffect === "excluded";

  let state: SlaState;
  if (isStopped) state = "stopped";
  else if (!startedAt) state = "not_started";
  else if (targetH == null) state = currentEffect === "paused" ? "paused" : "on_track";
  else if (remainingH! <= 0) state = "overdue";
  else if (currentEffect === "paused") state = "paused";
  else if (remainingH! <= dueSoonH) state = "due_soon";
  else state = "on_track";

  const counterRunning = currentEffect === "running";
  const delivery: DeliverySla = {
    targetH,
    consumedH,
    pausedH,
    remainingH,
    pct,
    state,
    startedAt,
    deliveredAt,
    expectedDeliveryAt:
      counterRunning && targetH != null && remainingH! > 0
        ? addWorkingHours(now, remainingH!, cfg)
        : null,
    metSla:
      deliveredAt && targetH != null && current !== "cancelled"
        ? consumedH <= targetH
        : null,
  };

  return { response, delivery };
}

export interface SlaMatrixRow {
  slaNormalH: number;
  slaHighH: number;
  slaUrgentH: number | null;
  /** الحجم المرجعي المشمول في هدف المصفوفة (null = النوع لا يُقاس بالوحدات) */
  baseUnits?: number | null;
  /** ساعات العمل المضافة لكل وحدة فوق الحجم المرجعي */
  extraUnitH?: number | null;
}

/** معامل أداة التنفيذ: قيمة الإعدادات إن وُجدت وإلا الافتراضي — بلا أداة = 1 */
export function toolFactorFor(
  tool: DesignTool | null | undefined,
  overrides?: ToolFactors | null,
): number {
  if (!tool) return 1;
  return overrides?.[tool] ?? TOOL_META[tool].defaultFactor;
}

/**
 * هدف التسليم (SPEC §9 + تنويع الحجم/الأداة):
 *   الهدف = (أساس المصفوفة + الوحدات فوق الحجم المرجعي × ساعة/وحدة) × معامل الأداة
 * مقربًا لأقرب ساعة عمل (بحد أدنى ساعة).
 * قاعدة «عاجل»: قبل اعتماد المسؤول يُحسب على مدة «عالي»، وبعد الاعتماد على
 * مدة «عاجل» — وnull تعني «باتفاق»: المدة المتفق عليها تُدخل يدويًا للحجم
 * الفعلي، فلا يطبَّق عليها الحجم ولا الأداة.
 */
export function slaTargetHours(
  type: SlaMatrixRow,
  priority: Priority,
  urgentApproved: boolean,
  sizing?: SlaSizing,
): number | null {
  const baseH =
    priority === "normal"
      ? type.slaNormalH
      : priority === "high"
        ? type.slaHighH
        : urgentApproved
          ? type.slaUrgentH
          : type.slaHighH;
  if (baseH == null) return null;

  const { unitCount, toolFactor } = sizing ?? {};
  const extraUnits =
    unitCount != null && type.baseUnits != null && type.extraUnitH != null
      ? Math.max(0, unitCount - type.baseUnits)
      : 0;
  const sized = baseH + extraUnits * (type.extraUnitH ?? 0);
  return Math.max(1, Math.round(sized * (toolFactor ?? 1)));
}
