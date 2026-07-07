// تفاصيل الطلب (SPEC §12/04).

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AtSign,
  Bookmark,
  Building2,
  CalendarDays,
  Layers,
  Megaphone,
  MessagesSquare,
  Paperclip,
  RefreshCw,
  Ruler,
  UploadCloud,
  User,
  History,
} from "lucide-react";
import { PriorityBadge, SlaBadge, StatusBadge } from "@/components/domain/badges";
import { ActivityLog } from "@/components/domain/activity-log";
import { CommentsThread, type CommentItem } from "@/components/domain/comments-thread";
import { FileList } from "@/components/domain/file-list";
import { RequestActions } from "@/components/domain/request-actions";
import { RequestTimeline } from "@/components/domain/request-timeline";
import { SlaProgressCard } from "@/components/domain/sla-progress-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_META } from "@/core/constants";
import type { Status } from "@/core/types";
import { requireActor } from "@/lib/auth";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import {
  allowedTransitions,
  getRequestDetails,
  NotFoundError,
  resumeTargetFor,
} from "@/services/requests";
import { listDesigners } from "@/services/users";
import {
  doApproveUrgent,
  doAssign,
  doCancel,
  doComment,
  doDeclineUrgent,
  doRequestInfo,
  doResume,
  doSubmitDraft,
  doTransition,
  doUploadDeliverable,
  doUploadInput,
} from "./actions";

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-start font-medium">{value}</span>
    </div>
  );
}

export default async function RequestDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;

  let details;
  try {
    details = await getRequestDetails(Number(id), actor);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { request, type, sla, events, attachments, settingsRow } = details;
  const transitions = allowedTransitions(request, actor);
  const designers = actor.role === "studio_manager" ? await listDesigners() : [];

  const statusChanges = events
    .filter((e) => e.type === "status_change")
    .map((e) => ({ to: (e.data as { to: Status }).to, at: e.createdAt }))
    .sort((a, b) => a.at.localeCompare(b.at));

  const inputFiles = attachments.filter((a) => a.kind === "input");
  const deliverables = attachments
    .filter((a) => a.kind === "deliverable")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const roleLabelFor = (actorId: number | null): string => {
    if (actorId === request.requesterId) return "صاحب الطلب";
    if (actorId === request.assigneeId) return "المصمم";
    return ROLE_META.studio_manager.label;
  };

  const comments: CommentItem[] = events
    .filter((e) => e.type === "comment")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((e) => ({
      id: e.id,
      actorName: e.actorName,
      actorRoleLabel: roleLabelFor(e.actorId),
      body: String((e.data as { body?: string }).body ?? ""),
      createdAt: e.createdAt,
    }));

  const canUploadDeliverable =
    (actor.role === "designer" && request.assigneeId === actor.id) ||
    actor.role === "studio_manager";
  const canUploadInput =
    actor.role === "studio_manager" ||
    (actor.role === "requester" && request.departmentId === actor.departmentId);
  const urgentPending =
    actor.role === "studio_manager" &&
    request.priority === "urgent" &&
    !request.urgentApprovedAt &&
    request.status !== "cancelled";

  return (
    <div className="flex flex-col gap-5">
      {/* الرأس */}
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          <Link href="/requests" className="hover:underline">
            الطلبات
          </Link>{" "}
          ‹ تفاصيل الطلب
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-navy">{request.title}</h1>
          <span className="font-mono text-lg font-bold text-navy" dir="ltr">
            {request.number}
          </span>
          {request.isDraft ? (
            <Badge className="border-transparent bg-warning/10 text-warning">
              <Bookmark className="size-3" />
              مسودة
            </Badge>
          ) : null}
          <StatusBadge status={request.status} />
          <SlaBadge state={sla.delivery.state} />
          <PriorityBadge priority={request.priority} />
          <Badge variant="outline" className="gap-1">
            <RefreshCw className="size-3" />
            جولة المراجعة: {request.reviewRound} من {settingsRow.maxReviewRounds}
          </Badge>
          {details.relatedRequestNumber && request.relatedRequestId ? (
            <Link
              href={`/requests/${request.relatedRequestId}`}
              className="text-xs text-info hover:underline"
            >
              طلب تعديل مرتبط بالطلب {details.relatedRequestNumber}
            </Link>
          ) : null}
        </div>
        <RequestActions
          requestId={request.id}
          role={actor.role}
          status={request.status}
          transitions={transitions}
          canAssign={actor.role === "studio_manager" && !request.isDraft}
          designers={designers.map((d) => ({ value: String(d.id), label: d.name }))}
          currentAssigneeId={request.assigneeId}
          canUploadDeliverable={canUploadDeliverable && !request.isDraft}
          canUploadInput={canUploadInput && !request.isDraft}
          hasDeliverables={deliverables.length > 0}
          resumeTo={request.status === "on_hold" ? resumeTargetFor(events) : null}
          allowedExtensions={settingsRow.allowedFileTypes}
          suggestedVersion={`v0.${deliverables.length + 1}`}
          urgentPending={urgentPending}
          urgentNeedsAgreedH={type.slaUrgentH == null}
          urgentJustification={request.urgentJustification}
          isDraftOwner={request.isDraft && request.requesterId === actor.id}
          actions={{
            doTransition,
            doResume,
            doCancel,
            doRequestInfo,
            doAssign,
            doUploadDeliverable,
            doUploadInput,
            doApproveUrgent,
            doDeclineUrgent,
            doSubmitDraft,
          }}
        />
        {request.status === "cancelled" && request.cancelReason ? (
          <p className="rounded-lg bg-danger/5 p-3 text-sm text-danger">
            سبب الإلغاء: {request.cancelReason}
          </p>
        ) : null}

        {/* استُنفدت جولات المراجعة → طلب تعديل جديد مرتبط (SPEC §6) */}
        {request.reviewRound >= settingsRow.maxReviewRounds &&
        ["awaiting_feedback", "delivered", "closed"].includes(request.status) &&
        (actor.role === "studio_manager" ||
          (actor.role === "requester" && request.departmentId === actor.departmentId)) ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <span>
              استُنفدت جولات المراجعة ({settingsRow.maxReviewRounds} من{" "}
              {settingsRow.maxReviewRounds}) — لملاحظات إضافية أنشئ طلب تعديل مرتبطًا بهذا
              الطلب.
            </span>
            <Link
              href={`/requests/new?related=${request.id}`}
              className="ms-auto rounded-lg bg-navy px-3 py-1.5 font-medium text-white hover:bg-navy/90"
            >
              إنشاء طلب تعديل
            </Link>
          </div>
        ) : null}
      </div>

      {/* ملخص الطلب + مؤشرات SLA */}
      <div className="grid items-start gap-5 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملخص الطلب</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SummaryRow icon={Building2} label="الجهة الطالبة" value={details.departmentName} />
            <SummaryRow icon={User} label="صاحب الطلب" value={details.requesterName} />
            {request.contact ? (
              <SummaryRow
                icon={AtSign}
                label="التواصل"
                value={<span dir="ltr">{request.contact}</span>}
              />
            ) : null}
            <SummaryRow
              icon={User}
              label="المصمم المسؤول"
              value={details.assigneeName ?? "غير مسند"}
            />
            <SummaryRow icon={Layers} label="نوع التصميم" value={type.name} />
            <SummaryRow
              icon={CalendarDays}
              label="تاريخ الإنشاء"
              value={formatDate(request.createdAt)}
            />
            <SummaryRow
              icon={CalendarDays}
              label="تاريخ التسليم المتوقع"
              value={
                sla.delivery.expectedDeliveryAt
                  ? formatDate(sla.delivery.expectedDeliveryAt)
                  : sla.delivery.deliveredAt
                    ? formatDate(sla.delivery.deliveredAt)
                    : "—"
              }
            />
            {request.publishDueDate ? (
              <SummaryRow
                icon={CalendarDays}
                label="تاريخ النشر المطلوب"
                value={formatDate(request.publishDueDate)}
              />
            ) : null}
            {request.channels?.length ? (
              <SummaryRow
                icon={Megaphone}
                label="قنوات الاستخدام"
                value={request.channels.join("، ")}
              />
            ) : null}
            {request.sizes ? (
              <SummaryRow
                icon={Ruler}
                label="المقاسات"
                value={<span dir="ltr">{request.sizes}</span>}
              />
            ) : null}
            {request.unitCount != null && type.unitLabel ? (
              <SummaryRow
                icon={Layers}
                label="حجم الطلب"
                value={`${formatNumber(request.unitCount)} ${type.unitLabel}`}
              />
            ) : null}
            <div className="border-t pt-3 text-sm">
              <p className="mb-1 text-muted-foreground">وصف الطلب</p>
              <p className="whitespace-pre-wrap">{request.description}</p>
              {request.goal ? (
                <>
                  <p className="mb-1 mt-3 text-muted-foreground">الهدف</p>
                  <p>{request.goal}</p>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <SlaProgressCard sla={sla.delivery} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">مراحل الطلب</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestTimeline
                createdAt={request.createdAt}
                statusChanges={statusChanges}
                currentStatus={request.status}
                pausedH={sla.delivery.pausedH}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* الملفات */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="size-4" />
              مرفقات الطلب (من الجهة)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileList files={inputFiles} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="size-4" />
              التسليمات (من المصمم)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileList files={deliverables} withVersion />
          </CardContent>
        </Card>
      </div>

      {/* السجل والتعليقات */}
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" />
              سجل التغييرات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityLog events={events} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessagesSquare className="size-4" />
              التعليقات
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              آخر تحديث: {formatDateTime(request.updatedAt)}
            </p>
          </CardHeader>
          <CardContent>
            <CommentsThread
              requestId={request.id}
              comments={comments}
              action={doComment}
              disabled={actor.role === "executive" || request.isDraft}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
