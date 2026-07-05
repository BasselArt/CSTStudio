"use client";

// محرر قائمة الجهات (صفحة الإعدادات): تعديل الأسماء، تفعيل/تعطيل (بدل الحذف —
// الجهات مُشار إليها من طلبات ومستخدمين تاريخيين)، وإضافة جهات جديدة.

import { useActionState, useState } from "react";
import { Building2, CheckCircle2, Info, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { SettingsState } from "@/app/(app)/settings/actions";

export interface DepartmentItem {
  id: number;
  name: string;
  isActive: boolean;
}

export function DepartmentsEditor({
  items,
  action,
}: {
  items: DepartmentItem[];
  action: (prev: SettingsState, formData: FormData) => Promise<SettingsState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [newRows, setNewRows] = useState<number[]>([]);
  const [nextKey, setNextKey] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4" />
          الجهات الطالبة
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          الجهة المعطلة لا تظهر في نموذج الطلب الجديد، وتبقى ظاهرة في الطلبات التاريخية.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <input type="hidden" name="itemId" value={item.id} />
                <Input
                  name={`item-${item.id}-name`}
                  defaultValue={item.name}
                  className="max-w-xs"
                  aria-label={`اسم ${item.name}`}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox name={`item-${item.id}-active`} defaultChecked={item.isActive} />
                  مفعّلة
                </label>
              </div>
            ))}

            {newRows.map((key) => (
              <div key={`new-${key}`} className="flex items-center gap-3">
                <Input
                  name="newName"
                  placeholder="اسم الجهة الجديدة"
                  className="max-w-xs"
                  aria-label="جهة جديدة"
                />
                <button
                  type="button"
                  onClick={() => setNewRows(newRows.filter((k) => k !== key))}
                  aria-label="إزالة الجهة الجديدة"
                  className="text-muted-foreground hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                setNewRows([...newRows, nextKey]);
                setNextKey(nextKey + 1);
              }}
            >
              <Plus className="size-3.5" />
              إضافة جهة
            </Button>
            <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
              <Save className="size-3.5" />
              {pending ? "جارٍ الحفظ…" : "حفظ الجهات"}
            </Button>
            {state.success ? (
              <p className="flex items-center gap-1.5 text-sm text-success" role="status">
                <CheckCircle2 className="size-4" />
                تم الحفظ.
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
      </CardContent>
    </Card>
  );
}
