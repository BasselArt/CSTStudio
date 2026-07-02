// محرك ساعات العمل — دوال خالصة (SPEC §8).
// كل الحسابات بتوقيت Asia/Riyadh عبر Intl.DateTimeFormat حصريًا؛
// لا اعتماد على توقيت السيرفر ولا مكتبات خارجية.

import type { CalendarCfg } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const TIME_ZONE = "Asia/Riyadh";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface LocalParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=الأحد … 6=السبت
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

/** مكونات التوقيت المحلي (الرياض) للحظة معينة */
function localParts(d: Date): LocalParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(d)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday],
  };
}

/** إزاحة المنطقة الزمنية (ms) عند لحظة معينة — تُقاس عبر Intl لا افتراضًا */
function tzOffsetMs(d: Date): number {
  const p = localParts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // نقارن على دقة الثانية لتجنب فروق الميلي ثانية في القياس
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** تحويل وقت حائطي بتوقيت الرياض إلى لحظة UTC */
function localToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(guess - tzOffsetMs(new Date(guess)));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** مفتاح التاريخ المحلي "YYYY-MM-DD" لمقارنة الإجازات */
function dateKey(p: LocalParts): string {
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(":").map(Number);
  return { h, m };
}

function isWorkDay(p: LocalParts, cfg: CalendarCfg): boolean {
  return cfg.workDays.includes(p.weekday) && !cfg.holidays.includes(dateKey(p));
}

/** حدا الدوام (UTC) لليوم المحلي الذي تقع فيه اللحظة */
function workWindow(p: LocalParts, cfg: CalendarCfg): { start: Date; end: Date } {
  const s = parseTime(cfg.workStart);
  const e = parseTime(cfg.workEnd);
  return {
    start: localToUtc(p.year, p.month, p.day, s.h, s.m),
    end: localToUtc(p.year, p.month, p.day, e.h, e.m),
  };
}

/** منتصف الليل المحلي لليوم التالي */
function nextLocalMidnight(p: LocalParts): Date {
  return localToUtc(p.year, p.month, p.day + 1); // Date.UTC يتكفل بتجاوز الشهر/السنة
}

/** ساعات العمل بين لحظتين (كسور الساعة مدعومة) */
export function workingHoursBetween(from: Date, to: Date, cfg: CalendarCfg): number {
  if (to.getTime() <= from.getTime()) return 0;
  let totalMs = 0;
  const fp = localParts(from);
  let cursor = localToUtc(fp.year, fp.month, fp.day); // منتصف ليل يوم البداية
  // حارس ضد إعدادات فاسدة (بلا أيام عمل): حد أقصى ~11 سنة
  for (let i = 0; i < 4000 && cursor.getTime() < to.getTime(); i++) {
    const p = localParts(cursor);
    if (isWorkDay(p, cfg)) {
      const { start, end } = workWindow(p, cfg);
      const s = Math.max(start.getTime(), from.getTime());
      const e = Math.min(end.getTime(), to.getTime());
      if (e > s) totalMs += e - s;
    }
    cursor = nextLocalMidnight(p);
  }
  return totalMs / HOUR_MS;
}

/** هل اللحظة داخل دوام يوم عمل؟ */
export function isWorkingMoment(d: Date, cfg: CalendarCfg): boolean {
  const p = localParts(d);
  if (!isWorkDay(p, cfg)) return false;
  const { start, end } = workWindow(p, cfg);
  return d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

/** اللحظة نفسها إن كانت لحظة عمل، وإلا أول لحظة عمل تالية */
export function nextWorkingMoment(d: Date, cfg: CalendarCfg): Date {
  let cursor = d;
  for (let i = 0; i < 4000; i++) {
    const p = localParts(cursor);
    if (isWorkDay(p, cfg)) {
      const { start, end } = workWindow(p, cfg);
      if (cursor.getTime() < start.getTime()) return start;
      if (cursor.getTime() < end.getTime()) return cursor;
    }
    cursor = nextLocalMidnight(p);
  }
  throw new Error("لا توجد لحظة عمل قادمة — تحقق من إعدادات التقويم");
}

/** إضافة ساعات عمل إلى لحظة (تقفز الويكند والإجازات وخارج الدوام) */
export function addWorkingHours(from: Date, hours: number, cfg: CalendarCfg): Date {
  let cursor = nextWorkingMoment(from, cfg);
  if (hours <= 0) return cursor;
  let remainingMs = hours * HOUR_MS;
  for (let i = 0; i < 4000; i++) {
    const p = localParts(cursor);
    const { end } = workWindow(p, cfg);
    const availableMs = end.getTime() - cursor.getTime();
    if (remainingMs <= availableMs) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    cursor = nextWorkingMoment(end, cfg);
  }
  throw new Error("تعذر إتمام إضافة ساعات العمل — تحقق من إعدادات التقويم");
}
