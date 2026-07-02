"use client";

// أزرار إجراءات تفاصيل الطلب — تُشتق من الدور × الانتقالات المتاحة فعلًا
// في state-machine (تصل جاهزة من الخادم عبر allowedTransitions) — SPEC §12/04.

import { useActionState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Info,
  Send,
  Upload,
  UserPlus,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { STATUS_META } from "@/core/constants";
import type { Status } from "@/core/types";
import type { ActionState } from "@/app/(app)/requests/[id]/actions";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function ErrorLine({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="flex items-center gap-1 text-sm text-danger" role="alert">
      <Info className="size-4" />
      {error}
    </p>
  );
}

/** حوار بنموذج server action موحد */
function ActionDialog({
  trigger,
  title,
  description,
  action,
  requestId,
  submitLabel,
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: FormAction;
  requestId: number;
  submitLabel: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="requestId" value={requestId} />
          {children}
          <ErrorLine error={state.error} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ التنفيذ…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface RequestActionsProps {
  requestId: number;
  transitions: Status[];
  canAssign: boolean;
  designers: { value: string; label: string }[];
  currentAssigneeId: number | null;
  canUploadDeliverable: boolean;
  canUploadInput: boolean;
  suggestedVersion: string;
  urgentPending: boolean;
  urgentNeedsAgreedH: boolean;
  urgentJustification: string | null;
  isDraftOwner: boolean;
  actions: {
    doTransition: FormAction;
    doCancel: FormAction;
    doRequestInfo: FormAction;
    doAssign: FormAction;
    doUploadDeliverable: FormAction;
    doUploadInput: FormAction;
    doApproveUrgent: FormAction;
    doDeclineUrgent: FormAction;
    doSubmitDraft: FormAction;
  };
}

export function RequestActions({
  requestId,
  transitions,
  canAssign,
  designers,
  currentAssigneeId,
  canUploadDeliverable,
  canUploadInput,
  suggestedVersion,
  urgentPending,
  urgentNeedsAgreedH,
  urgentJustification,
  isDraftOwner,
  actions,
}: RequestActionsProps) {
  const [transitionState, transitionAction, transitionPending] = useActionState(
    actions.doTransition,
    {},
  );
  const [draftState, draftAction, draftPending] = useActionState(actions.doSubmitDraft, {});

  // أزرار مخصصة لها حوارات — تُستبعد من قائمة «تغيير الحالة»
  const dedicated: Status[] = ["needs_info", "cancelled", "delivered"];
  const dropdownTransitions = transitions.filter((t) => !dedicated.includes(t));
  const canDeliver = transitions.includes("delivered");
  const canRequestInfo = transitions.includes("needs_info");
  const canCancel = transitions.includes("cancelled");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {isDraftOwner ? (
          <form action={draftAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <Button type="submit" disabled={draftPending} className="gap-2">
              <Send className="size-4 rtl:-scale-x-100" />
              إرسال الطلب
            </Button>
          </form>
        ) : null}

        {dropdownTransitions.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" disabled={transitionPending}>
                تغيير الحالة
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {dropdownTransitions.map((to) => (
                <DropdownMenuItem key={to} asChild>
                  <form action={transitionAction} className="w-full">
                    <input type="hidden" name="requestId" value={requestId} />
                    <input type="hidden" name="to" value={to} />
                    <button type="submit" className="w-full text-start">
                      {STATUS_META[to].label}
                    </button>
                  </form>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {canDeliver ? (
          <form action={transitionAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="to" value="delivered" />
            <Button
              type="submit"
              variant="outline"
              disabled={transitionPending}
              className="gap-2 border-success/40 text-success hover:bg-success/10 hover:text-success"
            >
              <CheckCircle2 className="size-4" />
              تسليم الطلب
            </Button>
          </form>
        ) : null}

        {canUploadDeliverable ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <Upload className="size-4" />
                رفع تسليم
              </Button>
            }
            title="رفع تسليم"
            description="JPG, PNG, PDF, MP4, ZIP — بحد أقصى 50MB"
            action={actions.doUploadDeliverable}
            requestId={requestId}
            submitLabel="رفع"
          >
            <div className="space-y-2">
              <Label htmlFor="deliverable-file">الملف</Label>
              <Input id="deliverable-file" type="file" name="file" accept=".jpg,.jpeg,.png,.pdf,.mp4,.zip" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliverable-version">الإصدار</Label>
              <Input id="deliverable-version" name="version" defaultValue={suggestedVersion} dir="ltr" />
            </div>
          </ActionDialog>
        ) : null}

        {canUploadInput ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <Upload className="size-4" />
                إرفاق ملف
              </Button>
            }
            title="إرفاق ملف للطلب"
            description="JPG, PNG, PDF, MP4, ZIP — بحد أقصى 50MB"
            action={actions.doUploadInput}
            requestId={requestId}
            submitLabel="رفع"
          >
            <div className="space-y-2">
              <Label htmlFor="input-file">الملف</Label>
              <Input id="input-file" type="file" name="file" accept=".jpg,.jpeg,.png,.pdf,.mp4,.zip" required />
            </div>
          </ActionDialog>
        ) : null}

        {canRequestInfo ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <Info className="size-4" />
                طلب استكمال بيانات
              </Button>
            }
            title="طلب استكمال بيانات"
            description="سيتوقف عدّاد SLA وتُحتسب المدة انتظارًا على الجهة."
            action={actions.doRequestInfo}
            requestId={requestId}
            submitLabel="إرسال الطلب"
          >
            <div className="space-y-2">
              <Label htmlFor="info-message">البيانات المطلوبة</Label>
              <Textarea id="info-message" name="message" rows={3} required placeholder="وضّح البيانات المطلوب استكمالها…" />
            </div>
          </ActionDialog>
        ) : null}

        {canAssign ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <UserPlus className="size-4" />
                {currentAssigneeId ? "تغيير المصمم" : "تعيين مصمم"}
              </Button>
            }
            title="إسناد الطلب إلى مصمم"
            action={actions.doAssign}
            requestId={requestId}
            submitLabel="إسناد"
          >
            <div className="space-y-2">
              <Label>المصمم</Label>
              <Select name="designerId" defaultValue={currentAssigneeId ? String(currentAssigneeId) : undefined}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر مصممًا" />
                </SelectTrigger>
                <SelectContent>
                  {designers.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </ActionDialog>
        ) : null}

        {canCancel ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger">
                <Ban className="size-4" />
                إلغاء الطلب
              </Button>
            }
            title="إلغاء الطلب"
            description="الإلغاء نهائي ويُستبعد الطلب من نسبة الالتزام."
            action={actions.doCancel}
            requestId={requestId}
            submitLabel="تأكيد الإلغاء"
          >
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">سبب الإلغاء</Label>
              <Textarea id="cancel-reason" name="reason" rows={2} required />
            </div>
          </ActionDialog>
        ) : null}
      </div>

      <ErrorLine error={transitionState.error ?? draftState.error} />

      {urgentPending ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="flex items-center gap-2 text-sm">
            <AlertTriangle className="size-4 text-danger" />
            <span className="font-medium text-danger">طلب عاجل بانتظار الاعتماد</span>
            {urgentJustification ? (
              <span className="text-muted-foreground">— المبرر: {urgentJustification}</span>
            ) : null}
          </p>
          <div className="ms-auto flex gap-2">
            <ActionDialog
              trigger={
                <Button size="sm" className="gap-1.5">
                  <CheckCircle2 className="size-4" />
                  اعتماد الاستعجال
                </Button>
              }
              title="اعتماد الأولوية العاجلة"
              description={
                urgentNeedsAgreedH
                  ? "هذا النوع عاجله «باتفاق» — أدخل المدة المتفق عليها بساعات العمل."
                  : "سيتحول هدف SLA إلى مدة «عاجل»."
              }
              action={actions.doApproveUrgent}
              requestId={requestId}
              submitLabel="اعتماد"
            >
              {urgentNeedsAgreedH ? (
                <div className="space-y-2">
                  <Label htmlFor="agreedTargetH">المدة المتفق عليها (ساعات عمل)</Label>
                  <Input id="agreedTargetH" name="agreedTargetH" type="number" min={1} required dir="ltr" />
                </div>
              ) : null}
            </ActionDialog>
            <ActionDialog
              trigger={
                <Button size="sm" variant="outline" className="gap-1.5 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger">
                  <XCircle className="size-4" />
                  رفض
                </Button>
              }
              title="رفض الاستعجال"
              description="سيعود الطلب لأولوية «عالي»."
              action={actions.doDeclineUrgent}
              requestId={requestId}
              submitLabel="تأكيد الرفض"
            >
              <div className="space-y-2">
                <Label htmlFor="decline-reason">سبب الرفض</Label>
                <Textarea id="decline-reason" name="reason" rows={2} required />
              </div>
            </ActionDialog>
          </div>
        </div>
      ) : null}
    </div>
  );
}
