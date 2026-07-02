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
});
