"use client";

// نموذج طلب جديد (SPEC §12/03): أربعة أقسام + ملخص جانبي حي يحسب الهدف
// والتاريخ المتوقع عبر دوال core مباشرة، وأخطاء التحقق تحت الحقول.

import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Clock,
  FileImage,
  Grid2x2,
  Info,
  LayoutTemplate,
  Mail,
  PencilLine,
  Plus,
  Send,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/domain/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITIES, PRIORITY_META } from "@/core/constants";
import { addWorkingHours } from "@/core/calendar";
import { slaTargetHours } from "@/core/sla";
import type { CalendarCfg, Priority } from "@/core/types";
import { formatDate, formatWorkingDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NewRequestState } from "@/app/(app)/requests/new/actions";

interface TypeOption {
  id: number;
  name: string;
  description: string;
  effortPoints: number;
  slaNormalH: number;
  slaHighH: number;
  slaUrgentH: number | null;
  unitLabel: string | null;
  baseUnits: number | null;
  extraUnitH: number | null;
}

interface Option {
  value: string;
  label: string;
}

const TYPE_ICONS = [PencilLine, FileImage, LayoutTemplate, Grid2x2];

/** زر اختيار متعدد (chip) — للمقاسات وقنوات الاستخدام */
function ToggleChip({
  active,
  onToggle,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active ? "border-navy bg-navy text-white" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-danger" role="alert">
      <Info className="size-3" />
      {message}
    </p>
  );
}

function SectionCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 font-bold text-navy">
          <span className="grid size-6 place-items-center rounded-full bg-navy text-xs text-white">
            {number}
          </span>
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <span className="text-[10px] text-muted-foreground" dir="ltr">
      {value.length}/{max}
    </span>
  );
}

export function NewRequestForm({
  departments,
  types,
  cfg,
  channels,
  sizeOptions,
  defaultDepartmentId,
  defaultTypeId,
  related,
  requesterName,
  action,
}: {
  departments: Option[];
  types: TypeOption[];
  cfg: CalendarCfg;
  /** قنوات الاستخدام المتاحة — من settings.channels (تُدار في صفحة الإعدادات) */
  channels: string[];
  /** المقاسات المتاحة — من settings.sizeOptions (تُدار في صفحة الإعدادات) */
  sizeOptions: string[];
  defaultDepartmentId: number | null;
  defaultTypeId?: number | null;
  /** طلب أصلي يرتبط به هذا الطلب كـ«طلب تعديل» (SPEC §6) */
  related?: { id: number; number: string; title: string } | null;
  requesterName: string;
  action: (prev: NewRequestState, formData: FormData) => Promise<NewRequestState>;
}) {
  const [state, formAction, pending] = useActionState(action, { fieldErrors: {} });
  const errors = state.fieldErrors;

  const [typeId, setTypeId] = useState<number | null>(defaultTypeId ?? null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [unitCount, setUnitCount] = useState("");
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [otherSizeOn, setOtherSizeOn] = useState(false);
  const [otherSizeDraft, setOtherSizeDraft] = useState("");
  /** مقاسات مخصّصة أضافها المستخدم عبر «أخرى» — يمكن إضافة أكثر من واحد */
  const [customSizes, setCustomSizes] = useState<string[]>([]);

  function addCustomSize() {
    const value = otherSizeDraft.trim();
    if (value && !customSizes.includes(value)) {
      setCustomSizes((prev) => [...prev, value]);
      setOtherSizeDraft("");
    }
  }
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [publishDueDate, setPublishDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);

  const selectedType = types.find((t) => t.id === typeId) ?? null;

  /* الملخص الحي عبر دوال core (SPEC §12/03) — يراعي حجم الطلب */
  const summary = useMemo(() => {
    if (!selectedType) return null;
    // «عاجل» قبل الاعتماد يُحسب على مدة «عالي» (SPEC §9)
    const targetH = slaTargetHours(selectedType, priority, false, {
      unitCount: unitCount ? Number(unitCount) : null,
    });
    if (targetH == null) return { targetH: null, expected: null, dueWarning: false };
    const expected = addWorkingHours(new Date(), targetH, cfg);
    const dueWarning = publishDueDate
      ? new Date(`${publishDueDate}T23:59:59+03:00`).getTime() < expected.getTime()
      : false;
    return { targetH, expected, dueWarning };
  }, [selectedType, priority, unitCount, publishDueDate, cfg]);

  return (
    <form action={formAction} className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 rounded-lg bg-info/10 p-3 text-sm text-navy">
          <Info className="size-4 shrink-0 text-info" />
          يبدأ احتساب مدة التنفيذ بعد اكتمال بيانات الطلب ومرفقاته واعتماده من مسؤول الاستوديو.
        </div>

        {related ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span>
              طلب تعديل مرتبط بالطلب الأصلي{" "}
              <span className="font-bold" dir="ltr">
                {related.number}
              </span>{" "}
              ({related.title}) — استُنفدت جولات المراجعة.
            </span>
            <input type="hidden" name="relatedRequestId" value={related.id} />
          </div>
        ) : null}

        {/* القسم الأول — بيانات الجهة الطالبة */}
        <SectionCard number={1} title="القسم الأول — بيانات الجهة الطالبة">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="departmentId">
                الجهة <span className="text-danger">*</span>
              </Label>
              <Select
                name="departmentId"
                defaultValue={defaultDepartmentId ? String(defaultDepartmentId) : undefined}
              >
                <SelectTrigger id="departmentId" className="w-full">
                  <SelectValue placeholder="اختر الجهة" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.departmentId} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="requesterName">اسم صاحب الطلب</Label>
              <Input id="requesterName" value={requesterName} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact">البريد الإلكتروني أو رقم التواصل</Label>
              <Input
                id="contact"
                name="contact"
                placeholder="أدخل البريد الإلكتروني أو رقم الجوال"
              />
              <FieldError message={errors.contact} />
            </div>
          </div>
        </SectionCard>

        {/* القسم الثاني — تفاصيل الطلب */}
        <SectionCard number={2} title="القسم الثاني — تفاصيل الطلب">
          <div className="space-y-2">
            <Label htmlFor="title">
              عنوان الطلب <span className="text-danger">*</span>
            </Label>
            <Input id="title" name="title" aria-invalid={!!errors.title} />
            <FieldError message={errors.title} />
          </div>

          <div className="space-y-2">
            <Label>
              نوع التصميم <span className="text-danger">*</span>
            </Label>
            <input type="hidden" name="typeId" value={typeId ?? ""} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {types.map((t, i) => {
                const Icon = TYPE_ICONS[i % TYPE_ICONS.length];
                const active = typeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active ? "border-navy bg-navy/5 ring-1 ring-navy" : "hover:bg-muted",
                    )}
                  >
                    <Icon className={cn("size-6", active ? "text-navy" : "text-muted-foreground")} />
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </button>
                );
              })}
            </div>
            <FieldError message={errors.typeId} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">
                  وصف الطلب <span className="text-danger">*</span>
                </Label>
                <CharCounter value={description} max={500} />
              </div>
              <Textarea
                id="description"
                name="description"
                rows={4}
                maxLength={500}
                placeholder="اشرح المطلوب بالتفصيل…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <FieldError message={errors.description} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="goal">الهدف من التصميم</Label>
                <CharCounter value={goal} max={500} />
              </div>
              <Textarea
                id="goal"
                name="goal"
                rows={4}
                maxLength={500}
                placeholder="ما الهدف الأساسي من هذا التصميم؟"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="audience">الجمهور المستهدف</Label>
                <CharCounter value={audience} max={300} />
              </div>
              <Textarea
                id="audience"
                name="audience"
                rows={4}
                maxLength={300}
                placeholder="من هو الجمهور المستهدف؟"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Label>
              اللغة <span className="text-danger">*</span>
            </Label>
            {(
              [
                ["ar", "عربي"],
                ["en", "إنجليزي"],
                ["both", "ثنائي اللغة"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="language"
                  value={value}
                  defaultChecked={value === "ar"}
                  className="accent-[var(--color-navy)]"
                />
                {label}
              </label>
            ))}
          </div>
        </SectionCard>

        {/* القسم الثالث — متطلبات التسليم */}
        <SectionCard number={3} title="القسم الثالث — متطلبات التسليم">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="publishDueDate">
                تاريخ النشر المطلوب <span className="text-danger">*</span>
              </Label>
              <DatePicker
                id="publishDueDate"
                name="publishDueDate"
                value={publishDueDate}
                onChange={setPublishDueDate}
                placeholder="اختر تاريخ النشر"
                aria-invalid={!!errors.publishDueDate}
              />
              <FieldError message={errors.publishDueDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">
                الأولوية <span className="text-danger">*</span>
              </Label>
              <input type="hidden" name="priority" value={priority} />
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger id="priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_META[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedType?.unitLabel ? (
              <div className="space-y-2">
                <Label htmlFor="unitCount">حجم الطلب (عدد {selectedType.unitLabel})</Label>
                <Input
                  id="unitCount"
                  name="unitCount"
                  type="number"
                  min={1}
                  max={1000}
                  dir="ltr"
                  value={unitCount}
                  onChange={(e) => setUnitCount(e.target.value)}
                  placeholder={selectedType.baseUnits ? String(selectedType.baseUnits) : ""}
                />
                {selectedType.baseUnits != null && selectedType.extraUnitH != null ? (
                  <p className="text-[10px] text-muted-foreground">
                    الهدف الأساسي يغطي حتى {selectedType.baseUnits} {selectedType.unitLabel} —
                    وكل وحدة إضافية تمدد المدة تلقائيًا.
                  </p>
                ) : null}
                <FieldError message={errors.unitCount} />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>
              المقاسات المطلوبة <span className="text-danger">*</span>
              <span className="ms-2 text-[10px] font-normal text-muted-foreground">
                يمكن اختيار أكثر من مقاس
              </span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((s) => (
                <ToggleChip
                  key={s}
                  active={selectedSizes.includes(s)}
                  onToggle={() =>
                    setSelectedSizes((prev) =>
                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                    )
                  }
                >
                  <span dir="ltr">{s}</span>
                </ToggleChip>
              ))}
              <ToggleChip active={otherSizeOn} onToggle={() => setOtherSizeOn((v) => !v)}>
                أخرى…
              </ToggleChip>
            </div>
            {customSizes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {customSizes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-lg bg-navy/5 px-2 py-1 text-xs text-navy"
                  >
                    <span dir="ltr">{s}</span>
                    <button
                      type="button"
                      onClick={() => setCustomSizes((prev) => prev.filter((x) => x !== s))}
                      aria-label={`حذف مقاس ${s}`}
                      className="text-muted-foreground hover:text-danger"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {otherSizeOn ? (
              <div className="flex items-center gap-2">
                <Input
                  value={otherSizeDraft}
                  onChange={(e) => setOtherSizeDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSize();
                    }
                  }}
                  placeholder="اكتب المقاس المطلوب — مثال: 2000x800"
                  className="max-w-72"
                  aria-label="مقاس آخر"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={addCustomSize}
                >
                  <Plus className="size-3.5" />
                  إضافة
                </Button>
              </div>
            ) : null}
            {selectedSizes.map((s) => (
              <input key={s} type="hidden" name="sizes" value={s} />
            ))}
            {customSizes.map((s) => (
              <input key={s} type="hidden" name="sizes" value={s} />
            ))}
            <FieldError message={errors.sizes} />
          </div>

          <div className="space-y-2">
            <Label>
              قنوات الاستخدام <span className="text-danger">*</span>
              <span className="ms-2 text-[10px] font-normal text-muted-foreground">
                يمكن اختيار أكثر من قناة
              </span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {channels.map((c) => (
                <ToggleChip
                  key={c}
                  active={selectedChannels.includes(c)}
                  onToggle={() =>
                    setSelectedChannels((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                    )
                  }
                >
                  {c}
                </ToggleChip>
              ))}
            </div>
            {selectedChannels.map((c) => (
              <input key={c} type="hidden" name="channels" value={c} />
            ))}
            <FieldError message={errors.channels} />
          </div>

          {priority === "urgent" ? (
            <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="urgentJustification">
                  مبرر اختيار الأولوية «عاجل» <span className="text-danger">*</span>
                </Label>
                <Textarea
                  id="urgentJustification"
                  name="urgentJustification"
                  rows={2}
                  placeholder="اكتب السبب بالتفصيل…"
                />
                <FieldError message={errors.urgentJustification} />
              </div>
              <p className="flex items-center gap-1.5 text-xs font-medium text-danger">
                <AlertTriangle className="size-4" />
                تتطلب هذه الأولوية اعتماد مسؤول الاستوديو
              </p>
            </div>
          ) : null}
        </SectionCard>

        {/* القسم الرابع — الملفات والمحتوى */}
        <SectionCard number={4} title="القسم الرابع — الملفات والمحتوى">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="files">الملفات والمرفقات</Label>
              <label
                htmlFor="files"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:bg-muted/50"
              >
                <UploadCloud className="size-8 text-info" />
                <span className="text-sm">اسحب الملفات هنا أو اضغط للاختيار</span>
                <span className="text-xs text-muted-foreground">
                  الأنواع المسموحة: JPG, PNG, PDF, MP4, ZIP — الحد الأقصى لحجم الملف: 50MB
                </span>
              </label>
              <input
                id="files"
                name="files"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.pdf,.mp4,.zip"
                className="sr-only"
                onChange={(e) =>
                  setFileNames([...(e.target.files ?? [])].map((f) => f.name))
                }
              />
              {fileNames.length > 0 ? (
                <ul className="text-xs text-muted-foreground">
                  {fileNames.map((n) => (
                    <li key={n}>• {n}</li>
                  ))}
                </ul>
              ) : null}
              <FieldError message={errors.files} />
            </div>
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="referenceLinks">روابط أو مراجع تصميمية</Label>
                <Input
                  id="referenceLinks"
                  name="referenceLinks"
                  placeholder="أضف روابط لمراجع أو أمثلة تصميم (اختياري)"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="requiredTexts">النصوص المطلوبة</Label>
                <Textarea
                  id="requiredTexts"
                  name="requiredTexts"
                  rows={2}
                  placeholder="أدخل النصوص التي يجب تضمينها في التصميم"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="extraNotes">ملاحظات إضافية</Label>
                <Textarea
                  id="extraNotes"
                  name="extraNotes"
                  rows={2}
                  placeholder="أي ملاحظات أو معلومات إضافية تساعد في تنفيذ الطلب…"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        {state.formError ? (
          <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger" role="alert">
            {state.formError}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" name="intent" value="submit" disabled={pending} className="gap-2">
            <Send className="size-4 rtl:-scale-x-100" />
            {pending ? "جارٍ الإرسال…" : "إرسال الطلب"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="draft"
            variant="outline"
            disabled={pending}
            className="gap-2"
          >
            <Bookmark className="size-4" />
            حفظ كمسودة
          </Button>
        </div>
      </div>

      {/* الشريط الجانبي — ملخص الطلب الحي */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-20">
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm">
            <h3 className="font-bold text-navy">ملخص الطلب</h3>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">نوع التصميم</span>
              <span className="font-medium">{selectedType?.name ?? "يتم الاختيار"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">الأولوية</span>
              <span className="font-medium">{PRIORITY_META[priority].label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مدة التنفيذ المتوقعة</span>
              <span className="font-medium">
                {summary
                  ? summary.targetH == null
                    ? "باتفاق"
                    : formatWorkingDuration(summary.targetH)
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">تاريخ التسليم المتوقع</span>
              <span className="font-medium">
                {summary?.expected ? formatDate(summary.expected) : "—"}
              </span>
            </div>
            {summary?.dueWarning ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                <AlertTriangle className="size-4 shrink-0" />
                الموعد المطلوب أقرب من المدة المعتادة لهذا النوع، وقد يتطلب أولوية أعلى.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 text-xs text-muted-foreground">
            <h3 className="text-sm font-bold text-navy">معلومات توضيحية</h3>
            <p className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0" />
              تعتمد مدة التنفيذ على نوع التصميم والتعقيد وحجم المحتوى المطلوب.
            </p>
            <p className="flex items-start gap-2">
              <Mail className="mt-0.5 size-4 shrink-0" />
              سيتم إشعارك بحالة الطلب عبر النظام.
            </p>
            <p className="flex items-start gap-2">
              <Bookmark className="mt-0.5 size-4 shrink-0" />
              يمكنك حفظ الطلب كمسودة والعودة إليه لاحقًا قبل الإرسال.
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
