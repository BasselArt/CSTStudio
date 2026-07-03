import { describe, expect, it } from "vitest";
import type { Status } from "./types";
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

  it("المصفوفة الشاملة 9×9 تطابق خريطة الـ SPEC §6 حرفيًا", () => {
    // المصدر: SPEC §6 — أي انحراف هنا يكسر الاختبار
    const SPEC_MAP: Record<Status, Status[]> = {
      new: ["needs_info", "ready", "cancelled"],
      needs_info: ["ready", "cancelled"],
      ready: ["in_progress", "needs_info", "cancelled"],
      in_progress: ["internal_review", "needs_info", "awaiting_feedback", "cancelled"],
      internal_review: ["in_progress", "awaiting_feedback", "delivered"],
      awaiting_feedback: ["in_progress", "delivered", "cancelled"],
      delivered: ["closed", "in_progress"],
      closed: [],
      cancelled: [],
    };
    const all = Object.keys(SPEC_MAP) as Status[];
    let checked = 0;
    for (const from of all) {
      for (const to of all) {
        const expected = SPEC_MAP[from].includes(to);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(expected);
        if (!expected) {
          expect(() => assertTransition(from, to), `${from} → ${to} يجب أن يرمي`).toThrow(
            TransitionError,
          );
        }
        checked += 1;
      }
    }
    expect(checked).toBe(81);
  });

  it("رسالة الخطأ تحمل التسميات العربية من constants", () => {
    try {
      assertTransition("new", "delivered");
      expect.fail("لم يُرمَ خطأ");
    } catch (e) {
      expect((e as Error).message).toContain("جديد");
      expect((e as Error).message).toContain("تم التسليم");
    }
  });

  it("حارس الجولات يحترم حدًا مخصصًا من الإعدادات (3 جولات)", () => {
    expect(() =>
      assertReviewRoundLimit("delivered", "in_progress", 2, 3),
    ).not.toThrow();
    expect(() =>
      assertReviewRoundLimit("delivered", "in_progress", 3, 3),
    ).toThrow(ReviewRoundLimitError);
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
