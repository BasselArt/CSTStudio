"use client";

// نموذج هوية النظام: الاسم والوصف والشعار وقنوات الاستخدام — للمسؤول فقط.

import { useActionState, useState } from "react";
import { CheckCircle2, ImageIcon, Info, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsState } from "@/app/(app)/settings/actions";

interface BrandingValues {
  orgName: string;
  orgSubtitle: string;
  hasLogo: boolean;
  channels: string[];
  sizeOptions: string[];
  allowedFileTypes: string[];
}

/** قائمة وسوم قابلة للتحرير (قنوات/مقاسات) — تُرسل كحقول مخفية متعددة القيم */
function TagListField({
  label,
  name,
  placeholder,
  items,
  onChange,
  ltr,
}: {
  label: string;
  name: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  /** للمقاسات الرقمية — تُعرض باتجاه LTR */
  ltr?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (value && !items.includes(value)) {
      onChange([...items, value]);
      setDraft("");
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs"
          >
            <input type="hidden" name={name} value={item} />
            <span dir={ltr ? "ltr" : undefined}>{item}</span>
            <button
              type="button"
              onClick={() => onChange(items.filter((x) => x !== item))}
              aria-label={`حذف ${item}`}
              className="text-muted-foreground hover:text-danger"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="w-56"
          aria-label={placeholder}
        />
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={add}>
          <Plus className="size-3.5" />
          إضافة
        </Button>
      </div>
    </div>
  );
}

export function BrandingSettingsForm({
  branding,
  action,
}: {
  branding: BrandingValues;
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [channels, setChannels] = useState<string[]>(branding.channels);
  const [sizeOptions, setSizeOptions] = useState<string[]>(branding.sizeOptions);
  const [fileTypes, setFileTypes] = useState<string[]>(branding.allowedFileTypes);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    branding.hasLogo ? "/api/branding/logo" : null,
  );
  const [removeLogo, setRemoveLogo] = useState(false);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="size-4" />
            هوية النظام
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            الاسم والشعار يظهران في القائمة الجانبية وصفحة تسجيل الدخول، والقنوات في نموذج الطلب
            الجديد.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="orgName">
                اسم الاستوديو <span className="text-danger">*</span>
              </Label>
              <Input id="orgName" name="orgName" defaultValue={branding.orgName} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="orgSubtitle">الجهة / الوصف الفرعي</Label>
              <Input
                id="orgSubtitle"
                name="orgSubtitle"
                defaultValue={branding.orgSubtitle}
                maxLength={150}
              />
            </div>
          </div>

          {/* الشعار */}
          <div className="space-y-2">
            <Label htmlFor="logo">الشعار</Label>
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border bg-navy">
                {logoPreview && !removeLogo ? (
                  // preview محلي أو من الخادم — img عادي يكفي (خارج تحسين next/image عمدًا)
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="الشعار الحالي" className="size-full object-contain p-1" />
                ) : (
                  <span className="text-xs font-bold text-white">CST</span>
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                <Input
                  id="logo"
                  name="logo"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  className="max-w-72 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setLogoPreview(URL.createObjectURL(file));
                      setRemoveLogo(false);
                    }
                  }}
                />
                <p className="text-[10px] text-muted-foreground">
                  PNG أو JPG أو WEBP — بحد أقصى 2MB. يُفضَّل شعار مربع بخلفية شفافة.
                </p>
              </div>
              {branding.hasLogo ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="removeLogo"
                    value="1"
                    checked={removeLogo}
                    onChange={(e) => setRemoveLogo(e.target.checked)}
                  />
                  <Trash2 className="size-3.5" />
                  إزالة الشعار والعودة للنصي
                </label>
              ) : null}
            </div>
          </div>

          {/* القوائم المرجعية لنموذج الطلب */}
          <TagListField
            label="قنوات الاستخدام في نموذج الطلب"
            name="channels"
            placeholder="قناة جديدة…"
            items={channels}
            onChange={setChannels}
          />
          <TagListField
            label="المقاسات المتاحة في نموذج الطلب"
            name="sizeOptions"
            placeholder="مقاس جديد…"
            items={sizeOptions}
            onChange={setSizeOptions}
            ltr
          />
          <div className="space-y-1">
            <TagListField
              label="أنواع الملفات المسموح رفعها (المرفقات والتسليمات)"
              name="allowedFileTypes"
              placeholder="امتداد جديد — مثل psd"
              items={fileTypes}
              onChange={setFileTypes}
              ltr
            />
            <p className="text-[10px] text-muted-foreground">
              اكتب الامتداد بلا نقطة (مثل png أو indd) — تنطبق القائمة فورًا على نموذج
              الطلب الجديد وحوارات الرفع والتسليم.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} className="gap-2">
              <Save className="size-4" />
              {pending ? "جارٍ الحفظ…" : "حفظ الهوية"}
            </Button>
            {state.success ? (
              <p className="flex items-center gap-1.5 text-sm text-success" role="status">
                <CheckCircle2 className="size-4" />
                تم حفظ هوية النظام.
              </p>
            ) : null}
            {state.error ? (
              <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                <Info className="size-4" />
                {state.error}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
