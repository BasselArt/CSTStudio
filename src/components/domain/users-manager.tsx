"use client";

// إدارة المستخدمين (التبويب الثالث في /team) — إنشاء وتعديل وتعطيل الحسابات، للمسؤول فقط.

import { useActionState, useState } from "react";
import { Info, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, ROLE_META } from "@/core/constants";
import type { Role } from "@/core/types";
import { formatNumber } from "@/lib/format";
import type { SettingsState } from "@/app/(app)/team/actions";
import { DataTable, type DataColumn } from "./data-table";
import { EmptyState } from "./empty-state";
import { TOKEN_SOFT } from "./token-styles";

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  departmentId: number | null;
  capacityPoints: number;
  isActive: boolean;
}

type SettingsAction = (prev: SettingsState, formData: FormData) => Promise<SettingsState>;

export function UsersManager({
  users,
  departments,
  currentUserId,
  saveAction,
  toggleAction,
}: {
  users: ManagedUser[];
  departments: { id: number; name: string }[];
  currentUserId: number;
  saveAction: SettingsAction;
  toggleAction: SettingsAction;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [saveState, saveFormAction, savePending] = useActionState(
    async (prev: SettingsState, formData: FormData) => {
      const result = await saveAction(prev, formData);
      if (result.success) setOpen(false);
      return result;
    },
    {},
  );
  const [toggleState, toggleFormAction, togglePending] = useActionState(toggleAction, {});

  const openFor = (user: ManagedUser | null) => {
    setEditing(user);
    setOpen(true);
  };

  const departmentName = (id: number | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  const columns: DataColumn<ManagedUser>[] = [
    {
      key: "name",
      header: "الاسم",
      cell: (u) => (
        <span className="font-medium">
          {u.name}
          {u.id === currentUserId ? (
            <span className="ms-1 text-xs text-muted-foreground">(أنت)</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "email",
      header: "البريد الإلكتروني",
      cell: (u) => (
        <span dir="ltr" className="text-muted-foreground">
          {u.email}
        </span>
      ),
    },
    {
      key: "role",
      header: "الدور",
      cell: (u) => <Badge variant="outline">{ROLE_META[u.role].label}</Badge>,
    },
    { key: "dept", header: "الجهة", cell: (u) => departmentName(u.departmentId) },
    {
      key: "capacity",
      header: "السعة",
      cell: (u) => (u.role === "designer" ? `${formatNumber(u.capacityPoints)} نقطة` : "—"),
    },
    {
      key: "active",
      header: "الحالة",
      cell: (u) => (
        <Badge
          className={`border-transparent font-medium ${u.isActive ? TOKEN_SOFT.success : TOKEN_SOFT.muted}`}
        >
          {u.isActive ? "نشط" : "معطل"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "إجراءات",
      cell: (u) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => openFor(u)}
            aria-label={`تعديل ${u.name}`}
          >
            <Pencil className="size-3.5" />
            تعديل
          </Button>
          {u.id !== currentUserId ? (
            <form action={toggleFormAction}>
              <input type="hidden" name="id" value={u.id} />
              <input type="hidden" name="isActive" value={String(!u.isActive)} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={togglePending}
                className={`gap-1 ${u.isActive ? "text-danger hover:text-danger" : "text-success hover:text-success"}`}
                aria-label={u.isActive ? `تعطيل ${u.name}` : `تفعيل ${u.name}`}
              >
                {u.isActive ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                {u.isActive ? "تعطيل" : "تفعيل"}
              </Button>
            </form>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          المستخدمون ({formatNumber(users.length)}) — التعطيل يمنع الدخول ويحفظ سجلّ الطلبات.
        </p>
        <Button className="gap-2" onClick={() => openFor(null)}>
          <Plus className="size-4" />
          إضافة مستخدم
        </Button>
      </div>

      {toggleState.error ? (
        <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
          <Info className="size-4" />
          {toggleState.error}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        rowClassName={(u) => (u.isActive ? undefined : "opacity-60")}
        empty={<EmptyState title="لا مستخدمين بعد" />}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `تعديل: ${editing.name}` : "إضافة مستخدم"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "اترك كلمة المرور فارغة للإبقاء على الحالية."
                : "يُنشأ الحساب نشطًا ويستطيع الدخول فورًا."}
            </DialogDescription>
          </DialogHeader>

          <form key={editing?.id ?? "new"} action={saveFormAction} className="flex flex-col gap-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="user-name">الاسم الكامل</Label>
                <Input id="user-name" name="name" defaultValue={editing?.name ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-email">البريد الإلكتروني</Label>
                <Input
                  id="user-email"
                  name="email"
                  type="email"
                  dir="ltr"
                  defaultValue={editing?.email ?? ""}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-role">الدور</Label>
                <Select name="role" defaultValue={editing?.role}>
                  <SelectTrigger id="user-role" className="w-full">
                    <SelectValue placeholder="اختر الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_META[r].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-dept">الجهة (إلزامية لطالب الخدمة)</Label>
                <Select
                  name="departmentId"
                  defaultValue={editing?.departmentId ? String(editing.departmentId) : undefined}
                >
                  <SelectTrigger id="user-dept" className="w-full">
                    <SelectValue placeholder="بلا جهة" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-capacity">سعة الحمل (نقاط — للمصمم)</Label>
                <Input
                  id="user-capacity"
                  name="capacityPoints"
                  type="number"
                  min={1}
                  dir="ltr"
                  defaultValue={editing?.capacityPoints ?? 20}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-password">كلمة المرور</Label>
                <Input
                  id="user-password"
                  name="password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder={editing ? "بلا تغيير" : "8 أحرف على الأقل"}
                  required={!editing}
                />
              </div>
            </div>

            {saveState.error ? (
              <p className="flex items-center gap-1.5 text-sm text-danger" role="alert">
                <Info className="size-4" />
                {saveState.error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={savePending}>
                {savePending ? "جارٍ الحفظ…" : editing ? "حفظ التعديلات" : "إنشاء المستخدم"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
