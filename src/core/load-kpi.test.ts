import { describe, expect, it } from "vitest";
import {
  avgDeliveryWorkDays,
  complianceRatePct,
  deltaIsImprovement,
  deltaPct,
  statusDistribution,
} from "./kpi";
import { designerLoadPoints, loadPct, loadState } from "./load";

describe("الحمل (load)", () => {
  it("يحتسب فقط ready/in_progress/internal_review/awaiting_feedback", () => {
    expect(
      designerLoadPoints([
        { status: "ready", effortPoints: 5 },
        { status: "in_progress", effortPoints: 2 },
        { status: "awaiting_feedback", effortPoints: 3 },
        { status: "internal_review", effortPoints: 1 },
        { status: "new", effortPoints: 10 }, // لا يُحتسب
        { status: "delivered", effortPoints: 10 }, // لا يُحتسب
        { status: "cancelled", effortPoints: 10 }, // لا يُحتسب
      ]),
    ).toBe(11);
  });

  it("نسبة الحمل من السعة", () => {
    expect(loadPct(17, 20)).toBe(85);
    expect(loadPct(5, 0)).toBe(0); // حماية من قسمة على صفر
  });

  it("حدود الحالة: منخفض < 40 · طبيعي · مرتفع > 75", () => {
    const t = { loadLowPct: 40, loadHighPct: 75 };
    expect(loadState(30, t)).toBe("low");
    expect(loadState(40, t)).toBe("normal"); // الحد الأدنى ليس منخفضًا
    expect(loadState(60, t)).toBe("normal");
    expect(loadState(75, t)).toBe("normal"); // الحد الأعلى ليس مرتفعًا
    expect(loadState(85, t)).toBe("high");
  });
});

describe("المؤشرات (kpi)", () => {
  it("نسبة الالتزام تستبعد الملغى وغير المُقيَّم", () => {
    expect(
      complianceRatePct([
        { metSla: true },
        { metSla: false },
        { metSla: true },
        { metSla: null }, // نشط — غير مُقيَّم
        { metSla: false, excluded: true }, // ملغي — مستبعد
      ]),
    ).toBeCloseTo((2 / 3) * 100);
    expect(complianceRatePct([{ metSla: null }])).toBeNull();
  });

  it("الدلتا واتجاه التحسّن", () => {
    expect(deltaPct(110, 100)).toBeCloseTo(10);
    expect(deltaPct(5, 0)).toBeNull();
    // انخفاض المتأخرة تحسّن (أخضر)
    expect(deltaIsImprovement(-8, true)).toBe(true);
    expect(deltaIsImprovement(8, true)).toBe(false);
    // ارتفاع الالتزام تحسّن
    expect(deltaIsImprovement(4, false)).toBe(true);
  });

  it("متوسط مدة التسليم بأيام العمل (8 ساعات = يوم)", () => {
    expect(avgDeliveryWorkDays([16, 40])).toBeCloseTo(3.5);
    expect(avgDeliveryWorkDays([])).toBeNull();
  });

  it("توزيع الحالات بترتيب constants مع إسقاط الأصفار", () => {
    expect(
      statusDistribution(["in_progress", "new", "in_progress", "delivered"]),
    ).toEqual([
      { status: "new", count: 1 },
      { status: "in_progress", count: 2 },
      { status: "delivered", count: 1 },
    ]);
  });
});
