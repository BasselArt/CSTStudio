"use client";

// نموذج إعدادات SLA (SPEC §12/05): المصفوفة + تقويم العمل + قواعد التشغيل.

import { useActionState, useState, useTransition } from "react";
import { CalendarDays, CheckCircle2, Info, Plus, Save, SlidersHorizontal, Table2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/domain/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { PRIORITY_META, WORK_DAY_HOURS } from "@/core/constants";
import { formatDate, formatNumber } from "@/lib/format";
import type { SettingsState } from "@/app/(app)/settings/actions";

const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface TypeRow {
  id: number;
  name: string;
  description: string | null;
  /** عدد الطلبات المرتبطة — نوع مرتبط بطلبات لا يُحذف */
  requestCount: number;
  effortPoints: number;
  slaNormalH: number;
  slaHighH: number;
  slaUrgentH: number | null;
  unitLabel: string | null;
  baseUnits: number | null;
  extraUnitH: number | null;
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
  addAction,
  deleteAction,
}: {
  types: TypeRow[];
  settings: SettingsValues;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  addAction: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
  deleteAction: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [holidays, setHolidays] = useState<string[]>(settings.holidays);
  const [newHoliday, setNewHoliday] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addState, addFormAction, addPending] = useActionState(
    async (prev: SettingsState, formData: FormData) => {
      const result = await addAction(prev, formData);
      if (result.success) setAddOpen(false);
      return result;
    },
    {},
  );
  const [deleteState, setDeleteState] = useState<SettingsState>({});
  const [deletePending, startDelete] = useTransition();

  const handleDeleteType = (t: TypeRow) => {
    if (!window.confirm(`حذف نوع «${t.name}» نهائيًا؟`)) return;
    startDelete(async () => {
      const fd = new FormData();
      fd.set("id", String(t.id));
      setDeleteState(await deleteAction({}, fd));
    });
  };

  return (
    <>
    <form action={formAction} className="flex flex-col gap-5">
      {/* مصفوفة SLA */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Table2 className="size-4" />
              مصفوفة أهداف SLA (النوع × الأولوية)
            </CardTitle>
            <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              إضافة نوع جديد
            </Button>
          </div>
          <div className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              كل صف نوع تصميم، وكل عمود أولوية — والقيمة هي المدة المستهدفة للتسليم
              بساعات العمل من لحظة جاهزية الطلب للتنفيذ.
            </p>
            <ul className="list-disc space-y-1 ps-4">
              <li>
                مثال: «تصميم متوسط» بأولوية «{PRIORITY_META.normal.label}» هدفه 24 ساعة عمل ≈ 3
                أيام (يوم العمل {WORK_DAY_HOURS} ساعات).
              </li>
              <li>
                خانة «{PRIORITY_META.urgent.label}» الفارغة تعني «باتفاق»: المدة تُدخل يدويًا عند
                اعتماد الطلب العاجل — وقبل الاعتماد يُحسب الهدف على مدة «{PRIORITY_META.high.label}».
              </li>
              <li>
                أعمدة الحجم توسّع الهدف تلقائيًا: كل وحدة فوق «الحجم الأساسي» تضيف
                «ساعات/وحدة» — اترك وحدة الحجم فارغة إن كان النوع لا يُقاس بالوحدات.
              </li>
              <li>«نقاط الجهد» لا تدخل في المدة — تُستخدم لحساب حمل المصمم وسعته.</li>
              <li>الهدف الناتج يُضرب أخيرًا في معامل أداة التنفيذ المختارة في الطلب (البطاقة التالية).</li>
            </ul>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-start">نوع التصميم</TableHead>
                  <TableHead className="text-start">نقاط الجهد</TableHead>
                  <TableHead className="text-start">{PRIORITY_META.normal.label}</TableHead>
                  <TableHead className="text-start">{PRIORITY_META.high.label}</TableHead>
                  <TableHead className="text-start">{PRIORITY_META.urgent.label}</TableHead>
                  <TableHead className="text-start">وحدة الحجم</TableHead>
                  <TableHead className="text-start">الحجم الأساسي</TableHead>
                  <TableHead className="text-start">ساعات/وحدة إضافية</TableHead>
                  <TableHead className="text-start">
                    <span className="sr-only">حذف النوع</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <input type="hidden" name="typeId" value={t.id} />
                      <div className="flex flex-col gap-1">
                        <span>{t.name}</span>
                        <Input
                          name={`type-${t.id}-description`}
                          defaultValue={t.description ?? ""}
                          placeholder="وصف قصير يظهر لطالب الخدمة"
                          className="h-8 w-44 text-xs font-normal"
                          aria-label={`وصف ${t.name}`}
                        />
                      </div>
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
                    <TableCell>
                      <Input
                        name={`type-${t.id}-unitLabel`}
                        defaultValue={t.unitLabel ?? ""}
                        placeholder="بلا وحدات"
                        className="w-24"
                        aria-label={`وحدة حجم ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-baseUnits`}
                        type="number"
                        min={1}
                        defaultValue={t.baseUnits ?? ""}
                        placeholder="—"
                        dir="ltr"
                        className="w-20"
                        aria-label={`الحجم الأساسي ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`type-${t.id}-extraUnitH`}
                        type="number"
                        min={0.25}
                        step={0.25}
                        defaultValue={t.extraUnitH ?? ""}
                        placeholder="—"
                        dir="ltr"
                        className="w-20"
                        aria-label={`ساعات الوحدة الإضافية ${t.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      {t.requestCount > 0 ? (
                        <span
                          className="whitespace-nowrap text-xs text-muted-foreground"
                          title="لا يمكن حذف نوع مرتبط بطلبات قائمة"
                        >
                          مستخدم في {formatNumber(t.requestCount)} من الطلبات
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={deletePending}
                          className="gap-1 text-muted-foreground hover:text-danger"
                          aria-label={`حذف نوع ${t.name}`}
                          onClick={() => handleDeleteType(t)}
                        >
                          <Trash2 className="size-3.5" />
                          حذف
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {deleteState.error ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-danger" role="alert">
              <Info className="size-4" />
              {deleteState.error}
            </p>
          ) : null}
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

    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>إضافة نوع تصميم جديد</DialogTitle>
          <DialogDescription>
            يظهر النوع فورًا في نموذج «طلب جديد» وفي المصفوفة، ويمكن تعديل قيمه لاحقًا من هنا.
          </DialogDescription>
        </DialogHeader>

        <form action={addFormAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-type-name">اسم النوع</Label>
              <Input id="new-type-name" name="name" placeholder="مثال: موشن جرافيك" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-effort">نقاط الجهد (لحمل المصمم)</Label>
              <Input id="new-type-effort" name="effortPoints" type="number" min={1} defaultValue={2} dir="ltr" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="new-type-description">وصف قصير (يظهر لطالب الخدمة)</Label>
              <Input
                id="new-type-description"
                name="description"
                placeholder="مثال: مقاطع متحركة قصيرة للمنصات الاجتماعية"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-normal">هدف «{PRIORITY_META.normal.label}» (ساعات عمل)</Label>
              <Input id="new-type-normal" name="slaNormalH" type="number" min={1} defaultValue={8} dir="ltr" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-high">هدف «{PRIORITY_META.high.label}» (ساعات عمل)</Label>
              <Input id="new-type-high" name="slaHighH" type="number" min={1} defaultValue={6} dir="ltr" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-urgent">هدف «{PRIORITY_META.urgent.label}» (ساعات عمل)</Label>
              <Input id="new-type-urgent" name="slaUrgentH" type="number" min={1} placeholder="فارغ = باتفاق" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-unit">وحدة الحجم (اختياري)</Label>
              <Input id="new-type-unit" name="unitLabel" placeholder="صفحة/شريحة/ثانية" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-base">الحجم الأساسي المشمول بالهدف</Label>
              <Input id="new-type-base" name="baseUnits" type="number" min={1} placeholder="—" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-type-extra">ساعات لكل وحدة إضافية</Label>
              <Input id="new-type-extra" name="extraUnitH" type="number" min={0.25} step={0.25} placeholder="—" dir="ltr" />
            </div>
          </div>

          {addState.error ? (
            <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
              <Info className="size-4" />
              {addState.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={addPending}>
              {addPending ? "جارٍ الإضافة…" : "إضافة النوع"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
