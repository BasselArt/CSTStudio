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

describe("محرك SLA — حالات حدية تفصيلية", () => {
  it("التوقف قبل ready (استكمال مبكر) يدخل pausedH ولا يمس الاستهلاك", () => {
    const statusChanges: StatusChange[] = [
      { to: "needs_info", at: riyadh("2026-01-04T09:00:00") },
      { to: "ready", at: riyadh("2026-01-04T12:00:00") }, // توقف 3 ساعات قبل البدء
      { to: "in_progress", at: riyadh("2026-01-04T12:00:00") },
    ];
    const { delivery } = computeSla({
      createdAt,
      statusChanges,
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-04T16:00:00"),
    });
    expect(delivery.pausedH).toBe(3);
    expect(delivery.consumedH).toBe(4); // 12:00 → 16:00 فقط
    expect(delivery.startedAt?.getTime()).toBe(riyadh("2026-01-04T12:00:00").getTime());
  });

  it("حد due_soon: المتبقي 24 بالضبط → due_soon، وصفر بالضبط → overdue", () => {
    const base: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
    ];
    // مستهلك 8 (الأحد كامل) من 32 → متبقٍ 24 بالضبط
    const atBoundary = computeSla({
      createdAt, statusChanges: base, targetH: 32, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T16:00:00"),
    });
    expect(atBoundary.delivery.remainingH).toBe(24);
    expect(atBoundary.delivery.state).toBe("due_soon");
    // مستهلك 8 من 8 → متبقٍ صفر → overdue (وليس due_soon)
    const atZero = computeSla({
      createdAt, statusChanges: base, targetH: 8, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T16:00:00"),
    });
    expect(atZero.delivery.remainingH).toBe(0);
    expect(atZero.delivery.state).toBe("overdue");
  });

  it("فترتا توقف منفصلتان تتجمعان في pausedH", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
      { to: "needs_info", at: riyadh("2026-01-04T10:00:00") }, // توقف 1: ساعتان
      { to: "ready", at: riyadh("2026-01-04T12:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T12:00:00") },
      { to: "awaiting_feedback", at: riyadh("2026-01-04T14:00:00") }, // توقف 2: ساعتان
    ];
    const { delivery } = computeSla({
      createdAt, statusChanges, targetH: 24, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T16:00:00"),
    });
    expect(delivery.pausedH).toBe(4);
    expect(delivery.consumedH).toBe(4);
    expect(delivery.state).toBe("paused");
  });

  it("إعادة الفتح بعد التسليم تستأنف الاستهلاك وتقيّم على آخر تسليم", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
      { to: "delivered", at: riyadh("2026-01-04T12:00:00") }, // مستهلك 4
      { to: "in_progress", at: riyadh("2026-01-05T08:00:00") }, // جولة مراجعة
      { to: "delivered", at: riyadh("2026-01-05T14:00:00") }, // +6 → 10
    ];
    const { delivery } = computeSla({
      createdAt, statusChanges, targetH: 8, responseTargetH: 4, cfg,
      now: riyadh("2026-01-06T08:00:00"),
    });
    expect(delivery.consumedH).toBe(10);
    expect(delivery.metSla).toBe(false); // 10 > 8 عند آخر تسليم
    expect(delivery.deliveredAt?.getTime()).toBe(riyadh("2026-01-05T14:00:00").getTime());
    expect(delivery.state).toBe("stopped");
  });

  it("الملغي: state=stopped وmetSla=null (مستبعد من الالتزام)", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "cancelled", at: riyadh("2026-01-04T10:00:00") },
    ];
    const { delivery } = computeSla({
      createdAt, statusChanges, targetH: 8, responseTargetH: 4, cfg,
      now: riyadh("2026-01-05T08:00:00"),
    });
    expect(delivery.state).toBe("stopped");
    expect(delivery.metSla).toBeNull();
  });

  it("pct يتجاوز 1 عند التأخر (لا سقف)", () => {
    const statusChanges: StatusChange[] = [
      { to: "ready", at: riyadh("2026-01-04T08:00:00") },
      { to: "in_progress", at: riyadh("2026-01-04T08:00:00") },
    ];
    const { delivery } = computeSla({
      createdAt, statusChanges, targetH: 4, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T16:00:00"), // مستهلك 8 من 4
    });
    expect(delivery.pct).toBeCloseTo(2);
  });

  it("لا تاريخ متوقع في not_started وpaused", () => {
    const notStarted = computeSla({
      createdAt, statusChanges: [], targetH: 24, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T10:00:00"),
    });
    expect(notStarted.delivery.expectedDeliveryAt).toBeNull();
    const paused = computeSla({
      createdAt,
      statusChanges: [
        { to: "ready", at: riyadh("2026-01-04T08:00:00") },
        { to: "needs_info", at: riyadh("2026-01-04T09:00:00") },
      ],
      targetH: 24, responseTargetH: 4, cfg,
      now: riyadh("2026-01-04T12:00:00"),
    });
    expect(paused.delivery.expectedDeliveryAt).toBeNull();
    expect(paused.delivery.state).toBe("paused");
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

  it("استجابة عند الهدف بالضبط تُحتسب ملتزمة", () => {
    const { response } = computeSla({
      createdAt,
      statusChanges: [{ to: "ready", at: riyadh("2026-01-04T12:00:00") }], // 4 = الهدف
      targetH: 24,
      responseTargetH: 4,
      cfg,
      now: riyadh("2026-01-05T08:00:00"),
    });
    expect(response.consumedH).toBe(4);
    expect(response.metSla).toBe(true);
  });

  it("هدف استجابة مخصص من الإعدادات يُحترم", () => {
    const { response } = computeSla({
      createdAt,
      statusChanges: [],
      targetH: 24,
      responseTargetH: 2,
      cfg,
      now: riyadh("2026-01-04T11:00:00"), // 3 ساعات > هدف 2
    });
    expect(response.state).toBe("overdue");
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
