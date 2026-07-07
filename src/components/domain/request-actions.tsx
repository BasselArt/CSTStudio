"use client";

// أزرار إجراءات تفاصيل الطلب — تُشتق من الدور × الانتقالات المتاحة فعلًا
// في state-machine (تصل جاهزة من الخادم عبر allowedTransitions) — SPEC §12/04.
// كل انتقال زر صريح بتسمية CTA من core/constants + شريط «الخطوة التالية»
// الذي يوجّه كل دور لما يُنتظر منه الآن.

import { useActionState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Info,
  Lightbulb,
  Link2,
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
import { transitionActionLabel } from "@/core/constants";
import type { Role, Status } from "@/core/types";
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

/**
 * إرشاد «الخطوة التالية» حسب الدور والحالة — يجعل الإجراء المنتظر واضحًا
 * بدل ترك المستخدم يخمّن متى يغيّر حالة الطلب.
 */
function nextStepHint(
  role: Role,
  status: Status,
  opts: { assigned: boolean; hasDeliverables: boolean },
): string | null {
  if (role === "studio_manager") {
    switch (status) {
      case "new":
        return opts.assigned
          ? "طلب جديد — راجع البيانات ثم اعتمده «جاهز للتنفيذ»، أو اطلب استكمال البيانات إن كانت ناقصة."
          : "طلب جديد — عيّن مصممًا ثم اعتمده «جاهز للتنفيذ»، أو اطلب استكمال البيانات إن كانت ناقصة.";
      case "ready":
        return opts.assigned
          ? null // الدور الآن على المصمم
          : "الطلب معتمد لكنه بلا مصمم — عيّن مصممًا الآن ليبدأ التنفيذ.";
      case "internal_review":
        return "التسليم قيد مراجعتك — أعده للتنفيذ للتعديل، أو أرسله للجهة لإبداء الملاحظات، أو سلّمه مباشرة.";
      default:
        return null;
    }
  }
  if (role === "designer") {
    switch (status) {
      case "ready":
        return "الطلب مسند إليك وجاهز — اضغط «بدء التنفيذ» عند الشروع في العمل ليبدأ السجل بعكس تقدمك الفعلي.";
      case "in_progress":
        return opts.hasDeliverables
          ? "رفعت تسليمًا — أرسل الطلب للمراجعة الداخلية أو للجهة لإبداء الملاحظات حتى لا يبقى معلقًا عليك."
          : "أنت تعمل على الطلب — عند اكتمال المسودة ارفع التسليم (ملفات أو روابط) ثم أرسله للمراجعة الداخلية.";
      case "internal_review":
        return "التسليم قيد المراجعة الداخلية — بعد اعتماده أرسله للجهة أو سلّمه، وإن طُلبت تعديلات أعده للتنفيذ.";
      default:
        return null;
    }
  }
  if (role === "requester") {
    switch (status) {
      case "needs_info":
        return "الاستوديو بحاجة لبيانات إضافية — أضفها في التعليقات أو أرفق الملفات، ثم اضغط «أُكملت البيانات» ليُستأنف العمل.";
      case "awaiting_feedback":
        return "التسليمات بانتظار ملاحظاتك — راجعها ثم أعد الطلب للتنفيذ مع ملاحظاتك، أو اعتمده بالضغط على «تسليم الطلب».";
      case "delivered":
        return "تم التسليم — راجع المخرجات النهائية واعتمد الإغلاق، أو أعد الطلب للتنفيذ بملاحظات. يُغلق الطلب تلقائيًا بعد مدة محددة.";
      default:
        return null;
    }
  }
  return null;
}

/** الانتقال الأنسب كخطوة تالية من كل حالة — يُعرض زرًا أساسيًا (solid) */
const PRIMARY_TO: Partial<Record<Status, Status>> = {
  new: "ready",
  needs_info: "ready",
  ready: "in_progress",
  in_progress: "internal_review",
  internal_review: "awaiting_feedback",
  awaiting_feedback: "delivered",
  delivered: "closed",
};

/** الانتقالات التي تُطلب معها ملاحظة اختيارية (إعادة للتنفيذ بملاحظات) */
function needsNoteDialog(from: Status, to: Status): boolean {
  return to === "in_progress" && ["internal_review", "awaiting_feedback", "delivered"].includes(from);
}

export interface RequestActionsProps {
  requestId: number;
  role: Role;
  status: Status;
  transitions: Status[];
  canAssign: boolean;
  designers: { value: string; label: string }[];
  currentAssigneeId: number | null;
  canUploadDeliverable: boolean;
  canUploadInput: boolean;
  hasDeliverables: boolean;
  /** امتدادات الملفات المسموحة — من settings.allowedFileTypes */
  allowedExtensions: string[];
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
  role,
  status,
  transitions,
  canAssign,
  designers,
  currentAssigneeId,
  canUploadDeliverable,
  canUploadInput,
  hasDeliverables,
  allowedExtensions,
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

  const accept = allowedExtensions.map((e) => `.${e}`).join(",");
  const extensionsHint = allowedExtensions.map((e) => e.toUpperCase()).join("، ");
  const uploadDescription = `الأنواع المسموحة: ${extensionsHint} — بحد أقصى 50MB للملف.`;

  // الأزرار المخصصة (حوارات) تُستبعد من أزرار الانتقال المباشرة
  const canRequestInfo = transitions.includes("needs_info");
  const canCancel = transitions.includes("cancelled");
  const noteTransitions = transitions.filter((t) => needsNoteDialog(status, t));
  const plainTransitions = transitions.filter(
    (t) => !["needs_info", "cancelled"].includes(t) && !needsNoteDialog(status, t),
  );
  // الزر الأساسي أولًا
  plainTransitions.sort((a, b) =>
    a === PRIMARY_TO[status] ? -1 : b === PRIMARY_TO[status] ? 1 : 0,
  );

  const hint = isDraftOwner
    ? "الطلب مسودة لم تُرسل بعد — أكمل بياناته ثم اضغط «إرسال الطلب» ليصل للاستوديو."
    : nextStepHint(role, status, { assigned: currentAssigneeId != null, hasDeliverables });

  return (
    <div className="flex flex-col gap-2">
      {hint ? (
        <div className="flex items-start gap-2 rounded-lg border border-navy/15 bg-navy/5 p-3 text-sm text-navy">
          <Lightbulb className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-bold">الخطوة التالية: </span>
            {hint}
          </p>
        </div>
      ) : null}

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

        {plainTransitions.map((to) => {
          const isPrimary = PRIMARY_TO[status] === to;
          const isDeliver = to === "delivered";
          return (
            <form key={to} action={transitionAction}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="to" value={to} />
              <Button
                type="submit"
                disabled={transitionPending}
                variant={isPrimary ? "default" : "outline"}
                className={
                  isDeliver && !isPrimary
                    ? "gap-2 border-success/40 text-success hover:bg-success/10 hover:text-success"
                    : isDeliver
                      ? "gap-2 bg-success text-white hover:bg-success/90"
                      : "gap-2"
                }
              >
                {isDeliver ? <CheckCircle2 className="size-4" /> : null}
                {transitionActionLabel(status, to)}
              </Button>
            </form>
          );
        })}

        {noteTransitions.map((to) => (
          <ActionDialog
            key={to}
            trigger={
              <Button variant="outline" className="gap-2">
                <XCircle className="size-4" />
                {transitionActionLabel(status, to)}
              </Button>
            }
            title={transitionActionLabel(status, to)}
            description="اكتب الملاحظات المطلوب معالجتها — تظهر في سجل الطلب ويُشعر بها المصمم."
            action={actions.doTransition}
            requestId={requestId}
            submitLabel="إرسال"
          >
            <input type="hidden" name="to" value={to} />
            <div className="space-y-2">
              <Label htmlFor={`note-${to}`}>الملاحظات</Label>
              <Textarea
                id={`note-${to}`}
                name="note"
                rows={3}
                placeholder="وضّح التعديلات المطلوبة…"
              />
            </div>
          </ActionDialog>
        ))}

        {canUploadDeliverable ? (
          <ActionDialog
            trigger={
              <Button variant="outline" className="gap-2">
                <Upload className="size-4" />
                رفع تسليم
              </Button>
            }
            title="رفع تسليم"
            description="ارفع ملفًا أو أكثر، أو ألصق روابط التصاميم (Figma، Drive، …) — أو الاثنين معًا."
            action={actions.doUploadDeliverable}
            requestId={requestId}
            submitLabel="إضافة التسليم"
          >
            <div className="space-y-2">
              <Label htmlFor="deliverable-files">الملفات (يمكن اختيار أكثر من ملف)</Label>
              <Input id="deliverable-files" type="file" name="files" accept={accept} multiple />
              <p className="text-[10px] text-muted-foreground">{uploadDescription}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliverable-links" className="flex items-center gap-1.5">
                <Link2 className="size-3.5" />
                روابط التصاميم
              </Label>
              <Textarea
                id="deliverable-links"
                name="links"
                rows={3}
                dir="ltr"
                placeholder={"https://www.figma.com/file/…\nhttps://drive.google.com/…"}
              />
              <p className="text-[10px] text-muted-foreground">رابط واحد في كل سطر.</p>
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
            title="إرفاق ملفات للطلب"
            description={uploadDescription}
            action={actions.doUploadInput}
            requestId={requestId}
            submitLabel="رفع"
          >
            <div className="space-y-2">
              <Label htmlFor="input-files">الملفات (يمكن اختيار أكثر من ملف)</Label>
              <Input id="input-files" type="file" name="files" accept={accept} multiple required />
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
