// التنسيق الحصري لكل تاريخ/رقم/مدة في النظام (SPEC §4.5 و§13).
// تقويم ميلادي gregory + أرقام لاتينية nu-latn + توقيت Asia/Riyadh.

import { WORK_DAY_HOURS } from "@/core/constants";

const LOCALE = "ar-u-ca-gregory-nu-latn";
const TZ = "Asia/Riyadh";

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TZ,
});

const timeFmt = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: TZ,
});

const numberFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

type DateInput = Date | string;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** "15 يوليو 2026" */
export function formatDate(d: DateInput): string {
  return dateFmt.format(toDate(d));
}

/** "15 يوليو 2026 - 10:30 ص" */
export function formatDateTime(d: DateInput): string {
  const date = toDate(d);
  return `${dateFmt.format(date)} - ${timeFmt.format(date)}`;
}

/** أرقام لاتينية دائمًا (1234) */
export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

/** "45%" — من نسبة 0..1 أو 0..100 حسب asRatio */
export function formatPercent(value: number, asRatio = false): string {
  const pct = asRatio ? value * 100 : value;
  return `${numberFmt.format(Math.round(pct))}%`;
}

/** حجم ملف مقروء */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} بايت`;
  if (size < 1024 * 1024) return `${numberFmt.format(size / 1024)} KB`;
  return `${numberFmt.format(size / (1024 * 1024))} MB`;
}

function hoursPhrase(h: number): string {
  if (h === 1) return "ساعة عمل";
  if (h === 2) return "ساعتا عمل";
  if (Number.isInteger(h) && h >= 3 && h <= 10) return `${numberFmt.format(h)} ساعات عمل`;
  return `${numberFmt.format(h)} ساعة عمل`;
}

function daysPhrase(d: number): string {
  if (d === 1) return "يوم عمل";
  if (d === 2) return "يوما عمل";
  if (Number.isInteger(d) && d >= 3 && d <= 10) return `${numberFmt.format(d)} أيام عمل`;
  return `${numberFmt.format(d)} يوم عمل`;
}

/**
 * مدة بساعات العمل بصيغ الجمع العربية الصحيحة (SPEC §13):
 * «ساعة عمل»، «ساعتا عمل»، «3–10 ساعات عمل»، «11+ ساعة عمل» —
 * وتتحول لأيام عمل (كل 8 ساعات) إذا بلغت يومًا.
 */
export function formatWorkingDuration(hours: number): string {
  const h = Math.abs(hours);
  if (h < WORK_DAY_HOURS) {
    const rounded = Math.round(h * 2) / 2;
    return hoursPhrase(rounded);
  }
  const days = Math.round((h / WORK_DAY_HOURS) * 2) / 2;
  return daysPhrase(days);
}

/** «متبقٍ 6 ساعات عمل» / «متأخر منذ 4 ساعات عمل» / «متوقف» */
export function formatRemaining(remainingH: number | null, paused = false): string {
  if (paused) return "متوقف";
  if (remainingH == null) return "—";
  if (remainingH >= 0) return `متبقٍ ${formatWorkingDuration(remainingH)}`;
  return `متأخر منذ ${formatWorkingDuration(-remainingH)}`;
}
