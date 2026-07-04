"use client";

// نموذج إعدادات SLA (SPEC §12/05): المصفوفة + تقويم العمل + قواعد التشغيل.

import { useActionState, useState } from "react";
import { CalendarDays, CheckCircle2, Info, Plus, Save, SlidersHorizontal, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/domain/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import type { SettingsState } from "@/app/(app)/team/actions";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface TypeRow {
  id: number;
  name: string;
  effortPoints: number;
  slaNormalH: number;
  slaHighH: number;
  slaUrgentH: number | null;
}

interface SettingsValues {
  workDays: number[];
  workStart: string;
  workEnd: string;
  holidays: string[];
  alertThresholdPct: number;
  autoCloseWorkDays: number;
  maxReviewRounds: number;
  loadLowPct: number;
  loadHighPct: number;
  responseSlaH: number;
}

function NumberField({
  name,
  label,
  defaultValue,
  suffix,
}: {
  name: string;
  label: string;
  defaultValue: number;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input id={name} name={name} type="number" min={1} defaultValue={defaultValue} dir="ltr" className="w-24" />
        {suffix ? <span className="text-xs text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function SlaSettingsForm({
  types,
  settings,
  action,
}: {
  types: TypeRow[];
  settings: SettingsValues;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [holidays, setHolidays] = useState<string[]>(settings.holidays);
  const [newHoliday, setNewHoliday] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* مصفوفة SLA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Table2 className="size-4" />
            مصفوفة أهداف SLA (النوع × الأولوية)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            المدد بساعات العمل — اترك «عاجل» فارغًا ليكون «باتفاق» يُدخل عند الاعتماد.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">نوع التصميم</TableHead>
                  <TableHead className="text-start">نقاط الجهد</TableHead>
                  <TableHead className="text-start">عادي</TableHead>
                  <TableHead className="text-start">عالي</TableHead>
                  <TableHead className="text-start">عاجل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.name}
                      <input type="hidden" name="typeId" value={t.id} />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-effortPoints`}
                        type="number"
                        min={1}
                        defaultValue={t.effortPoints}
                        dir="ltr"
                        className="w-20"
                        aria-label={`نقاط جهد ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-slaNormalH`}
                        type="number"
                        min={1}
                        defaultValue={t.slaNormalH}
                        dir="ltr"
                        className="w-20"
                        aria-label={`هدف عادي ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-slaHighH`}
                        type="number"
                        min={1}
                        defaultValue={t.slaHighH}
                        dir="ltr"
                        className="w-20"
                        aria-label={`هدف عالي ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-slaUrgentH`}
                        type="number"
                        min={1}
                        defaultValue={t.slaUrgentH ?? ""}
                        placeholder="باتفاق"
                        dir="ltr"
                        className="w-20"
                        aria-label={`هدف عاجل ${t.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {/* تقويم العمل */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4" />
              تقويم العمل
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label className="text-xs">أيام العمل</Label>
              <div className="flex flex-wrap gap-3">
                {DAY_NAMES.map((day, i) => (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <Checkbox name="workDays" value={i} defaultChecked={settings.workDays.includes(i)} />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="workStart" className="text-xs">
                  بداية الدوام
                </Label>
                <Input id="workStart" name="workStart" type="time" defaultValue={settings.workStart} dir="ltr" className="w-28" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workEnd" className="text-xs">
                  نهاية الدوام
                </Label>
                <Input id="workEnd" name="workEnd" type="time" defaultValue={settings.workEnd} dir="ltr" className="w-28" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">الإجازات الرسمية</Label>
              {holidays.map((h) => (
                <span key={h} className="me-2 inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
                  <input type="hidden" name="holidays" value={h} />
                  {formatDate(h)}
                  <button
                    type="button"
                    onClick={() => setHolidays(holidays.filter((x) => x !== h))}
                    aria-label={`حذف إجازة ${h}`}
                    className="text-muted-foreground hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-2">
                <DatePicker
                  value={newHoliday}
                  onChange={setNewHoliday}
                  className="w-52"
                  placeholder="تاريخ إجازة جديدة"
                  aria-label="تاريخ إجازة جديدة"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    if (newHoliday && !holidays.includes(newHoliday)) {
                      setHolidays([...holidays, newHoliday].sort());
                      setNewHoliday("");
                    }
                  }}
                >
                  <Plus className="size-3.5" />
                  إضافة
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* قواعد التشغيل */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4" />
              قواعد التشغيل
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <NumberField name="alertThresholdPct" label="عتبة التنبيه" defaultValue={settings.alertThresholdPct} suffix="%" />
            <NumberField name="autoCloseWorkDays" label="الإغلاق التلقائي بعد التسليم" defaultValue={settings.autoCloseWorkDays} suffix="أيام عمل" />
            <NumberField name="maxReviewRounds" label="جولات المراجعة القصوى" defaultValue={settings.maxReviewRounds} suffix="جولة" />
            <NumberField name="responseSlaH" label="هدف SLA الاستجابة" defaultValue={settings.responseSlaH} suffix="ساعات عمل" />
            <NumberField name="loadLowPct" label="عتبة الحمل المنخفض" defaultValue={settings.loadLowPct} suffix="%" />
            <NumberField name="loadHighPct" label="عتبة الحمل المرتفع" defaultValue={settings.loadHighPct} suffix="%" />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="gap-2">
          <Save className="size-4" />
          {pending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </Button>
        {state.success ? (
          <p className="flex items-center gap-1.5 text-sm text-success" role="status">
            <CheckCircle2 className="size-4" />
            تم حفظ الإعدادات بنجاح.
          </p>
        ) : null}
        {state.error ? (
          <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
            <Info className="size-4" />
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
