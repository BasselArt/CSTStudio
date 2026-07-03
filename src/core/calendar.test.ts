import { describe, expect, it } from "vitest";
import {
  addWorkingHours,
  isWorkingMoment,
  nextWorkingMoment,
  workingHoursBetween,
} from "./calendar";
import type { CalendarCfg } from "./types";

// الأحد..الخميس 08:00–16:00 بتوقيت الرياض
const cfg: CalendarCfg = {
  workDays: [0, 1, 2, 3, 4],
  workStart: "08:00",
  workEnd: "16:00",
  holidays: [],
};

// لحظة بتوقيت الرياض (+03:00). مرجع الأيام: 2026-01-04 = الأحد.
const riyadh = (iso: string) => new Date(`${iso}+03:00`);

describe("workingHoursBetween", () => {
  it("امتداد عبر ويكند الجمعة/السبت", () => {
    // الخميس 14:00 → الأحد 10:00: خميس ساعتان + أحد ساعتان
    expect(
      workingHoursBetween(riyadh("2026-01-08T14:00:00"), riyadh("2026-01-11T10:00:00"), cfg),
    ).toBe(4);
  });

  it("امتداد عبر إجازة رسمية", () => {
    const withHoliday = { ...cfg, holidays: ["2026-01-05"] }; // الاثنين إجازة
    expect(
      workingHoursBetween(
        riyadh("2026-01-04T08:00:00"),
        riyadh("2026-01-06T16:00:00"),
        withHoliday,
      ),
    ).toBe(16); // الأحد 8 + الثلاثاء 8
  });

  it("بداية قبل الدوام وبعده", () => {
    // قبل الدوام: 06:00 → 09:00 = ساعة واحدة
    expect(
      workingHoursBetween(riyadh("2026-01-04T06:00:00"), riyadh("2026-01-04T09:00:00"), cfg),
    ).toBe(1);
    // بعد الدوام: الأحد 17:00 → الاثنين 09:00 = ساعة واحدة
    expect(
      workingHoursBetween(riyadh("2026-01-04T17:00:00"), riyadh("2026-01-05T09:00:00"), cfg),
    ).toBe(1);
  });

  it("from === to → صفر", () => {
    const d = riyadh("2026-01-04T10:00:00");
    expect(workingHoursBetween(d, d, cfg)).toBe(0);
  });

  it("مدة تمتد عدة أيام (أسبوع عمل كامل = 40)", () => {
    expect(
      workingHoursBetween(riyadh("2026-01-04T08:00:00"), riyadh("2026-01-08T16:00:00"), cfg),
    ).toBe(40);
  });

  it("كسور الساعة", () => {
    expect(
      workingHoursBetween(riyadh("2026-01-04T08:15:00"), riyadh("2026-01-04T09:45:00"), cfg),
    ).toBe(1.5);
  });
});

describe("addWorkingHours", () => {
  it("يقفز الويكند", () => {
    expect(addWorkingHours(riyadh("2026-01-08T14:00:00"), 4, cfg).getTime()).toBe(
      riyadh("2026-01-11T10:00:00").getTime(),
    );
  });

  it("40 ساعة من بداية الأسبوع = نهاية الخميس", () => {
    expect(addWorkingHours(riyadh("2026-01-04T08:00:00"), 40, cfg).getTime()).toBe(
      riyadh("2026-01-08T16:00:00").getTime(),
    );
  });

  it("يقفز الإجازة ويحترم كسور الساعة", () => {
    const withHoliday = { ...cfg, holidays: ["2026-01-05"] };
    // الأحد 15:00 + 1.5 ساعة: ساعة تنهي الأحد، والنصف صباح الثلاثاء (الاثنين إجازة)
    expect(
      addWorkingHours(riyadh("2026-01-04T15:00:00"), 1.5, withHoliday).getTime(),
    ).toBe(riyadh("2026-01-06T08:30:00").getTime());
  });

  it("بداية خارج الدوام تُسند لأول لحظة عمل", () => {
    // الجمعة ظهرًا + ساعتان → الأحد 10:00
    expect(addWorkingHours(riyadh("2026-01-09T12:00:00"), 2, cfg).getTime()).toBe(
      riyadh("2026-01-11T10:00:00").getTime(),
    );
  });
});

describe("workingHoursBetween — حالات حدية إضافية", () => {
  it("امتداد عبر نهاية السنة (خميس 2026 → أحد 2027)", () => {
    // 31 ديسمبر 2026 خميس · 3 يناير 2027 أحد
    expect(
      workingHoursBetween(riyadh("2026-12-31T14:00:00"), riyadh("2027-01-03T10:00:00"), cfg),
    ).toBe(4);
  });

  it("إجازة ملاصقة للويكند (خميس إجازة → القفز للأحد)", () => {
    const c = { ...cfg, holidays: ["2026-01-08"] }; // الخميس إجازة
    // الأربعاء 15:00 → الأحد 09:00: أربعاء 1 + أحد 1
    expect(
      workingHoursBetween(riyadh("2026-01-07T15:00:00"), riyadh("2026-01-11T09:00:00"), c),
    ).toBe(2);
  });

  it("to قبل from → صفر (لا قيم سالبة)", () => {
    expect(
      workingHoursBetween(riyadh("2026-01-05T12:00:00"), riyadh("2026-01-04T12:00:00"), cfg),
    ).toBe(0);
  });

  it("كسور الدقائق (20 دقيقة = ثلث ساعة)", () => {
    expect(
      workingHoursBetween(riyadh("2026-01-04T09:00:00"), riyadh("2026-01-04T09:20:00"), cfg),
    ).toBeCloseTo(1 / 3, 5);
  });

  it("ثلاثة أسابيع كاملة = 120 ساعة عمل", () => {
    expect(
      workingHoursBetween(riyadh("2026-01-04T08:00:00"), riyadh("2026-01-22T16:00:00"), cfg),
    ).toBe(120);
  });

  it("تقويم بأيام عمل مختلفة (الاثنين–الجمعة)", () => {
    const monFri = { ...cfg, workDays: [1, 2, 3, 4, 5] };
    // الأحد ليس يوم عمل هنا: الأحد 04 → الاثنين 05 10:00 = ساعتان فقط
    expect(
      workingHoursBetween(riyadh("2026-01-04T08:00:00"), riyadh("2026-01-05T10:00:00"), monFri),
    ).toBe(2);
  });

  it("الفترة كلها داخل إجازة → صفر", () => {
    const c = { ...cfg, holidays: ["2026-01-05"] };
    expect(
      workingHoursBetween(riyadh("2026-01-05T08:00:00"), riyadh("2026-01-05T16:00:00"), c),
    ).toBe(0);
  });
});

describe("addWorkingHours — حالات حدية إضافية", () => {
  it("مدة تفوق أسبوعًا وتقفز ويكندين", () => {
    // الأحد 04 08:00 + 48 ساعة = 6 أيام عمل → الأحد 11 يستهلك اليوم السادس...
    // 40 حتى الخميس 08 16:00، والباقي 8 → الأحد 11 16:00
    expect(addWorkingHours(riyadh("2026-01-04T08:00:00"), 48, cfg).getTime()).toBe(
      riyadh("2026-01-11T16:00:00").getTime(),
    );
  });

  it("بداية داخل إجازة تُسند لأول يوم عمل تالٍ", () => {
    const c = { ...cfg, holidays: ["2026-01-05"] };
    expect(addWorkingHours(riyadh("2026-01-05T10:00:00"), 1, c).getTime()).toBe(
      riyadh("2026-01-06T09:00:00").getTime(),
    );
  });

  it("صفر ساعات يعيد أول لحظة عمل", () => {
    expect(addWorkingHours(riyadh("2026-01-09T12:00:00"), 0, cfg).getTime()).toBe(
      riyadh("2026-01-11T08:00:00").getTime(),
    );
  });
});

describe("isWorkingMoment / nextWorkingMoment", () => {
  it("داخل الدوام وخارجه", () => {
    expect(isWorkingMoment(riyadh("2026-01-04T10:00:00"), cfg)).toBe(true);
    expect(isWorkingMoment(riyadh("2026-01-04T07:59:00"), cfg)).toBe(false);
    expect(isWorkingMoment(riyadh("2026-01-04T16:00:00"), cfg)).toBe(false); // نهاية الدوام حصرية
    expect(isWorkingMoment(riyadh("2026-01-09T10:00:00"), cfg)).toBe(false); // الجمعة
  });

  it("nextWorkingMoment من الويكند ومن قبل الدوام", () => {
    expect(nextWorkingMoment(riyadh("2026-01-09T12:00:00"), cfg).getTime()).toBe(
      riyadh("2026-01-11T08:00:00").getTime(),
    );
    expect(nextWorkingMoment(riyadh("2026-01-04T06:00:00"), cfg).getTime()).toBe(
      riyadh("2026-01-04T08:00:00").getTime(),
    );
    const inside = riyadh("2026-01-04T11:30:00");
    expect(nextWorkingMoment(inside, cfg).getTime()).toBe(inside.getTime());
  });

  it("اللحظة داخل إجازة ليست لحظة عمل وتُقفز", () => {
    const c = { ...cfg, holidays: ["2026-01-05"] };
    expect(isWorkingMoment(riyadh("2026-01-05T10:00:00"), c)).toBe(false);
    expect(nextWorkingMoment(riyadh("2026-01-05T10:00:00"), c).getTime()).toBe(
      riyadh("2026-01-06T08:00:00").getTime(),
    );
  });

  it("بداية الدوام لحظة عمل (شاملة) ونهايته ليست كذلك (حصرية)", () => {
    expect(isWorkingMoment(riyadh("2026-01-04T08:00:00"), cfg)).toBe(true);
    expect(isWorkingMoment(riyadh("2026-01-04T15:59:59"), cfg)).toBe(true);
    expect(isWorkingMoment(riyadh("2026-01-04T16:00:00"), cfg)).toBe(false);
  });
});
