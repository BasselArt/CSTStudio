import { describe, expect, it } from "vitest";
import {
  assertReviewRoundLimit,
  assertTransition,
  canTransition,
  incrementsReviewRound,
  isFinalStatus,
  ReviewRoundLimitError,
  TransitionError,
  TRANSITIONS,
} from "./state-machine";

describe("آلة الحالات", () => {
  it("انتقال مرفوض يرمي TransitionError", () => {
    expect(() => assertTransition("new", "delivered")).toThrow(TransitionError);
    expect(canTransition("closed", "in_progress")).toBe(false);
    expect(canTransition("needs_info", "in_progress")).toBe(false);
  });

  it("الانتقالات المسموحة تمر", () => {
    expect(() => assertTransition("new", "ready")).not.toThrow();
    expect(() => assertTransition("internal_review", "delivered")).not.toThrow();
    expect(() => assertTransition("delivered", "in_progress")).not.toThrow();
  });

  it("closed وcancelled حالتان نهائيتان", () => {
    expect(TRANSITIONS.closed).toHaveLength(0);
    expect(TRANSITIONS.cancelled).toHaveLength(0);
    expect(isFinalStatus("closed")).toBe(true);
    expect(isFinalStatus("cancelled")).toBe(true);
    expect(isFinalStatus("delivered")).toBe(false);
  });

  it("reviewRound يزيد عند العودة من awaiting_feedback أو delivered", () => {
    expect(incrementsReviewRound("awaiting_feedback", "in_progress")).toBe(true);
    expect(incrementsReviewRound("delivered", "in_progress")).toBe(true);
    expect(incrementsReviewRound("internal_review", "in_progress")).toBe(false);
    expect(incrementsReviewRound("awaiting_feedback", "delivered")).toBe(false);
  });

  it("حارس جولات المراجعة يرفض تجاوز الحد", () => {
    expect(() =>
      assertReviewRoundLimit("awaiting_feedback", "in_progress", 2, 2),
    ).toThrow(ReviewRoundLimitError);
    expect(() =>
      assertReviewRoundLimit("awaiting_feedback", "in_progress", 1, 2),
    ).not.toThrow();
    // انتقال لا يرفع العدّاد لا يتأثر بالحد
    expect(() =>
      assertReviewRoundLimit("internal_review", "in_progress", 5, 2),
    ).not.toThrow();
  });
});
