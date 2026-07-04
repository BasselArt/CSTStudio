"use client";

// منتقي تاريخ عربي RTL مشترك — بلا مكتبات تواريخ (SPEC: Intl فقط).
// القيمة نص "YYYY-MM-DD" وتُرسل عبر حقل مخفي، والعرض عبر lib/format حصريًا.

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, formatDateKey, formatMonthYear, weekdayNarrow } from "@/lib/format";
import { cn } from "@/lib/utils";

const pad2 = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** عدد أيام الشهر (m: 1..12) — حساب خالص بلا منطقة زمنية */
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** يوم أسبوع أول الشهر (0=الأحد) */
const firstWeekday = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

/** إزاحة مفتاح تاريخ بعدد أيام (Date.UTC يتكفل بتجاوز الشهر/السنة) */
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return keyOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

const parseKey = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
};

export function DatePicker({
  id,
  name,
  value,
  onChange,
  min,
  max,
  placeholder = "اختر التاريخ",
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  id?: string;
  name?: string;
  /** "YYYY-MM-DD" أو "" */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const todayKey = formatDateKey(new Date());
  const [open, setOpen] = useState(false);
  // الشهر المعروض + خلية التركيز للتنقل بالأسهم
  const [view, setView] = useState(() => {
    const { y, m } = parseKey(value || todayKey);
    return { y, m };
  });
  const [focusKey, setFocusKey] = useState(value || todayKey);
  const gridRef = useRef<HTMLDivElement>(null);

  const isDisabled = (key: string) => (!!min && key < min) || (!!max && key > max);

  const openTo = (isOpen: boolean) => {
    if (isOpen) {
      const start = value || todayKey;
      const { y, m } = parseKey(start);
      setView({ y, m });
      setFocusKey(start);
    }
    setOpen(isOpen);
  };

  const select = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const moveFocus = (key: string) => {
    const { y, m } = parseKey(key);
    setView({ y, m });
    setFocusKey(key);
  };

  // خلية التركيز ترافق الشهر المعروض دائمًا (مع قصّ اليوم لطول الشهر الجديد)
  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(view.y, view.m - 1 + delta, 1));
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    setView({ y, m });
    const { d } = parseKey(focusKey);
    setFocusKey(keyOf(y, m, Math.min(d, daysInMonth(y, m))));
  };

  // بعد تغيّر خلية التركيز (سهم نقَل الشهر مثلًا) نعيد التركيز على زر اليوم المقصود.
  // تبديل الشهر يستبدل أزرار الشبكة كلها فيسقط التركيز على body — نلتقط الحالتين،
  // دون سرقة التركيز حين يكون على زرّي التنقل (تصفح بالفأرة).
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const lost = active === document.body || active === null;
    if (!lost && !gridRef.current?.contains(active)) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-key="${focusKey}"]`)?.focus();
  }, [focusKey, view, open]);

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // الواجهة RTL بالكامل: اليسار يتقدم في الزمن واليمين يرجع
    const steps: Record<string, number> = {
      ArrowLeft: 1,
      ArrowRight: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    if (e.key in steps) {
      e.preventDefault();
      moveFocus(shiftKey(focusKey, steps[e.key]));
    } else if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      shiftMonth(e.key === "PageDown" ? 1 : -1);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const weekday = new Date(`${focusKey}T00:00:00Z`).getUTCDay();
      // بداية الأسبوع الأحد ونهايته السبت
      moveFocus(shiftKey(focusKey, e.key === "Home" ? -weekday : 6 - weekday));
    }
  };

  const blanks = firstWeekday(view.y, view.m);
  const total = daysInMonth(view.y, view.m);
  const monthLabel = formatMonthYear(new Date(Date.UTC(view.y, view.m - 1, 15)));

  return (
    <Popover open={open} onOpenChange={openTo}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
          {value ? formatDate(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="الشهر السابق"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Button>
          <span className="text-sm font-bold text-navy" aria-live="polite">
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="الشهر التالي"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>

        <div
          ref={gridRef}
          role="grid"
          aria-label={monthLabel}
          onKeyDown={onGridKeyDown}
          className="mt-2 grid grid-cols-7 gap-y-0.5 text-center"
        >
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              role="columnheader"
              className="grid size-8 place-items-center text-xs font-medium text-muted-foreground"
            >
              {weekdayNarrow(i)}
            </span>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <span key={`b${i}`} aria-hidden />
          ))}
          {Array.from({ length: total }, (_, i) => {
            const key = keyOf(view.y, view.m, i + 1);
            const selected = key === value;
            const disabled = isDisabled(key);
            return (
              <button
                key={key}
                type="button"
                data-key={key}
                role="gridcell"
                aria-selected={selected}
                disabled={disabled}
                tabIndex={key === focusKey ? 0 : -1}
                onClick={() => select(key)}
                onFocus={() => setFocusKey(key)}
                className={cn(
                  "grid size-8 place-items-center rounded-lg text-sm transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  selected
                    ? "bg-navy font-bold text-white"
                    : disabled
                      ? "text-muted-foreground/40"
                      : "hover:bg-muted",
                  key === todayKey && !selected && "font-bold text-navy ring-1 ring-navy/40",
                )}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isDisabled(todayKey)}
            onClick={() => select(todayKey)}
          >
            اليوم
          </Button>
          {value ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              مسح
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
