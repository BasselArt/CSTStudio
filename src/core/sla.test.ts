import { describe, expect, it } from "vitest";
import { computeSla, slaTargetHours } from "./sla";
import type { CalendarCfg, StatusChange } from "./types";

const cfg: CalendarCfg = {
  workDays: [0, 1, 2, 3, 4],
  workStart: "08:00",
  workEnd: "16:00",
  holidays: [],
};

const riyadh = (iso: string) => new Date(`${iso}+03:00`);
// مرجع الأيام: 2026-01-04 = الأحد
const createdAt = riyadh("2026-01-04T08:00:00");

describe("محرك SLA — التسليم", () => {
  it("الاختبار الذهبي: هدف 40، مستهلك 18، متوقف 6 → 45% و22 متبقية", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T09:00:00") },
      // تشغيل من الأحد 08:00 حتى الثلاثاء 10:00 = 8 + 8 + 2 = 18 ساعة عمل
      { to: "awaiting_feedback", at: riyadh("2026-01-06T10:00:00") },
    ];
    // توقف من الثلاثاء 10:00 حتى الأربعاء 08:00 = 6 ساعات عمل
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: 40,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-07T08:00:00"),
    });

    expect(delivery.consumedH).toBe(18);
    expect(delivery.pausedH).toBe(6);
    expect(delivery.pct).toBeCloseTo(0.45);
    expect(delivery.remainingH).toBe(22);
    expect(delivery.state).toBe("paused");
    expect(delivery.expectedDeliveryAt).toBeNull(); // متوقف → لا تاريخ متوقع
  });

  it("طلب لم يبدأ (قبل ready) → not_started", () => {
    const { delivery } = computeSla({
      createdAt,
      statusChanges: [],
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-04T10:00:00"),
    });
    expect(delivery.state).toBe("not_started");
    expect(delivery.consumedH).toBe(0);
    expect(delivery.startedAt).toBeNull();
  });

  it("متجاوز للهدف → overdue بمتبقٍ سالب", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
    ];
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: 8,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-06T10:00:00"), // مستهلك 18
    });
    expect(delivery.consumedH).toBe(18);
    expect(delivery.state).toBe("overdue");
    expect(delivery.remainingH).toBe(-10);
    expect(delivery.expectedDeliveryAt).toBeNull();
  });

  it("مستحق قريبًا: المتبقي ≤ 24 والعدّاد يعمل + تاريخ متوقع", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
    ];
    const now = riyadh("2026-01-06T10:00:00"); // مستهلك 18 من 20
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: 20,
      responseTargetH: 4,
      cfg,
      now,
    });
    expect(delivery.state).toBe("due_soon");
    expect(delivery.remainingH).toBe(2);
    expect(delivery.expectedDeliveryAt?.getTime()).toBe(
      riyadh("2026-01-06T12:00:00").getTime(),
    );
  });

  it("المسلَّم يُقيَّم بلحظة التسليم ويتجمد استهلاكه", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
      { to: "internal_review", at: riyadh("2026-01-04T14:00:00") },
      { to: "delivered", at: riyadh("2026-01-05T12:00:00") }, // مستهلك 8 + 4 = 12
    ];
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: 40,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-14T12:00:00"), // بعد أيام — لا يتغير الاستهلاك
    });
    expect(delivery.consumedH).toBe(12);
    expect(delivery.state).toBe("stopped");
    expect(delivery.metSla).toBe(true);
    expect(delivery.deliveredAt?.getTime()).toBe(
      riyadh("2026-01-05T12:00:00").getTime(),
    );
  });

  it("هدف null (عاجل باتفاق) → لا نسب ولا تأخر", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
    ];
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: null,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-06T10:00:00"),
    });
    expect(delivery.pct).toBeNull();
    expect(delivery.remainingH).toBeNull();
    expect(delivery.state).toBe("on_track");
  });
});

describe("محرك SLA — الاستجابة", () => {
  it("استجابة ضمن الهدف", () => {
    const { response } = computeSla({
      createdAt,
      statusChanges: [{ to: "ready", at: riyadh("2026-01-04T11:00:00") }],
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-05T08:00:00"),
    });
    expect(response.consumedH).toBe(3);
    expect(response.metSla).toBe(true);
    expect(response.state).toBe("stopped");
  });

  it("بلا استجابة بعد وتجاوز الهدف → overdue", () => {
    const { response } = computeSla({
      createdAt,
      statusChanges: [],
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-04T13:00:00"), // 5 ساعات
    });
    expect(response.consumedH).toBe(5);
    expect(response.metSla).toBeNull();
    expect(response.state).toBe("overdue");
  });

  it("استجابة متأخرة تُسجَّل metSla=false", () => {
    const { response } = computeSla({
      createdAt,
      statusChanges: [{ to: "needs_info", at: riyadh("2026-01-04T14:00:00") }], // 6 ساعات
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-05T08:00:00"),
    });
    expect(response.metSla).toBe(false);
  });
});

describe("slaTargetHours — مصفوفة النوع × الأولوية", () => {
  const big = { slaNormalH: 40, slaHighH: 32, slaUrgentH: null };
  const medium = { slaNormalH: 24, slaHighH: 16, slaUrgentH: 8 };

  it("عادي وعالي مباشرة من المصفوفة", () => {
    expect(slaTargetHours(medium, "normal", false)).toBe(24);
    expect(slaTargetHours(medium, "high", false)).toBe(16);
  });

  it("عاجل غير معتمد يُحسب على مدة عالي", () => {
    expect(slaTargetHours(medium, "urgent", false)).toBe(16);
  });

  it("عاجل معتمد يتحول لمدة عاجل (وnull = باتفاق)", () => {
    expect(slaTargetHours(medium, "urgent", true)).toBe(8);
    expect(slaTargetHours(big, "urgent", true)).toBeNull();
  });
});
