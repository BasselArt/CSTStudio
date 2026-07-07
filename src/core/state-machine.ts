// البوابة الحصرية لصحة الانتقالات بين الحالات (SPEC §4.3 و§6).

import { STATUS_META } from "./constants";
import type { Status } from "./types";

/**
 * خريطة الانتقالات المسموحة (SPEC §6 + امتداد «موقوف مؤقتًا»):
 * on_hold إيقاف بقرار مسؤول الاستوديو من أي حالة تشغيل، والاستئناف يعيد
 * الطلب للحالة التي أُوقف منها (تُشتق من حدث الإيقاف في request_events).
 */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  new: ["needs_info", "ready", "cancelled"],
  needs_info: ["ready", "cancelled"],
  ready: ["in_progress", "needs_info", "on_hold", "cancelled"],
  in_progress: ["internal_review", "needs_info", "awaiting_feedback", "on_hold", "cancelled"],
  internal_review: ["in_progress", "awaiting_feedback", "delivered", "on_hold"],
  awaiting_feedback: ["in_progress", "delivered", "cancelled"],
  on_hold: ["ready", "in_progress", "internal_review", "cancelled"],
  delivered: ["closed", "in_progress"],
  closed: [],
  cancelled: [],
};

export class TransitionError extends Error {
  constructor(from: Status, to: Status) {
    super(
      `انتقال غير مسموح: من «${STATUS_META[from].label}» إلى «${STATUS_META[to].label}»`,
    );
    this.name = "TransitionError";
  }
}

export class ReviewRoundLimitError extends Error {
  constructor(maxRounds: number) {
    super(
      `تم استنفاد جولات المراجعة (${maxRounds} من ${maxRounds}). أنشئ «طلب تعديل» جديدًا مرتبطًا بهذا الطلب بدلًا من جولة إضافية.`,
    );
    this.name = "ReviewRoundLimitError";
  }
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

/** يرمي TransitionError عند انتقال غير مسموح */
export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

/** هل يرفع هذا الانتقال عدّاد جولات المراجعة؟ (SPEC §6) */
export function incrementsReviewRound(from: Status, to: Status): boolean {
  return to === "in_progress" && (from === "awaiting_feedback" || from === "delivered");
}

/**
 * حارس جولات المراجعة: يرمي ReviewRoundLimitError إذا كان الانتقال
 * سيرفع reviewRound فوق maxReviewRounds (SPEC §6).
 */
export function assertReviewRoundLimit(
  from: Status,
  to: Status,
  currentRound: number,
  maxRounds: number,
): void {
  if (incrementsReviewRound(from, to) && currentRound + 1 > maxRounds) {
    throw new ReviewRoundLimitError(maxRounds);
  }
}

export function isFinalStatus(s: Status): boolean {
  return TRANSITIONS[s].length === 0;
}
