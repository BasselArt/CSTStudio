import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRemaining,
  formatWorkingDuration,
} from "./format";

describe("فخ التقويم (SPEC §13): ميلادي gregory بأرقام لاتينية", () => {
  it("يعرض «15 يوليو 2026» وليس التاريخ الهجري", () => {
    const out = formatDate(new Date("2026-07-15T12:00:00+03:00"));
    expect(out).toBe("15 يوليو 2026");
    expect(out).not.toContain("١"); // لا أرقام هندية
    expect(out).not.toContain("144"); // لا سنة هجرية
  });

  it("يحوّل UTC إلى توقيت الرياض عند العرض", () => {
    // 23:30 UTC = 02:30 فجر اليوم التالي بالرياض
    expect(formatDate(new Date("2026-07-15T23:30:00Z"))).toBe("16 يوليو 2026");
  });

  it("التاريخ والوقت بصيغة ص/م", () => {
    const out = formatDateTime(new Date("2026-07-15T10:30:00+03:00"));
    expect(out).toContain("15 يوليو 2026");
    expect(out).toContain("10:30");
    expect(out).toContain("ص");
  });

  it("الأرقام لاتينية دائمًا", () => {
    expect(formatNumber(1234)).toBe("1,234");
    expect(formatPercent(45)).toBe("45%");
    expect(formatPercent(0.45, true)).toBe("45%");
  });
});

describe("formatWorkingDuration — صيغ الجمع العربية (SPEC §13)", () => {
  it("المفرد والمثنى وجمع القلة وجمع الكثرة للساعات", () => {
    expect(formatWorkingDuration(1)).toBe("ساعة عمل");
    expect(formatWorkingDuration(2)).toBe("ساعتا عمل");
    expect(formatWorkingDuration(3)).toBe("3 ساعات عمل");
    expect(formatWorkingDuration(6)).toBe("6 ساعات عمل");
    expect(formatWorkingDuration(7.5)).toBe("7.5 ساعة عمل");
  });

  it("التحول لأيام عمل عند بلوغ 8 ساعات", () => {
    expect(formatWorkingDuration(8)).toBe("يوم عمل");
    expect(formatWorkingDuration(16)).toBe("يوما عمل");
    expect(formatWorkingDuration(24)).toBe("3 أيام عمل");
    expect(formatWorkingDuration(40)).toBe("5 أيام عمل");
    expect(formatWorkingDuration(88)).toBe("11 يوم عمل");
  });

  it("القيم السالبة تُعامل بقيمتها المطلقة (للتأخر)", () => {
    expect(formatWorkingDuration(-4)).toBe("4 ساعات عمل");
  });
});

describe("formatRemaining — المتبقي/المتأخر/المتوقف", () => {
  it("متبقٍ وتأخر وتوقف وغياب القيمة", () => {
    expect(formatRemaining(6)).toBe("متبقٍ 6 ساعات عمل");
    expect(formatRemaining(-4)).toBe("متأخر منذ 4 ساعات عمل");
    expect(formatRemaining(16)).toBe("متبقٍ يوما عمل");
    expect(formatRemaining(10, true)).toBe("متوقف");
    expect(formatRemaining(null)).toBe("—");
  });
});

describe("formatBytes", () => {
  it("بايت وكيلو وميغا", () => {
    expect(formatBytes(500)).toBe("500 بايت");
    expect(formatBytes(45 * 1024)).toBe("45 KB");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});
