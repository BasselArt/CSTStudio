"use server";

// إجراءات تفاصيل الطلب — كلها تمر عبر services/requests حصريًا (SPEC §4.2).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { saveUpload, FileValidationError } from "@/services/files";
import {
  addAttachment,
  addComment,
  approveUrgent,
  assign,
  cancel,
  declineUrgent,
  requestInfo,
  submitDraft,
  transition,
} from "@/services/requests";
import {
  approveUrgentSchema,
  assignSchema,
  cancelSchema,
  commentSchema,
  declineUrgentSchema,
  requestInfoSchema,
  transitionSchema,
} from "@/services/schemas";

export interface ActionState {
  error?: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.";
}

function done(requestId: number): never {
  revalidatePath(`/requests/${requestId}`);
  redirect(`/requests/${requestId}`);
}

export async function doTransition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await transition(parsed.data.requestId, parsed.data.to, actor, parsed.data.note);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doCancel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await cancel(parsed.data.requestId, parsed.data.reason, actor);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doRequestInfo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = requestInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await requestInfo(parsed.data.requestId, parsed.data.message, actor);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doAssign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await assign(parsed.data.requestId, parsed.data.designerId, actor);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doComment(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await addComment(parsed.data.requestId, parsed.data.body, actor);
  revalidatePath(`/requests/${parsed.data.requestId}`);
}

export async function doUploadDeliverable(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  const version = String(formData.get("version") || "").trim() || null;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملفًا للرفع." };
  try {
    const meta = await saveUpload(file);
    await addAttachment(requestId, "deliverable", meta, version, actor);
  } catch (error) {
    if (error instanceof FileValidationError) return { error: error.message };
    return { error: message(error) };
  }
  done(requestId);
}

export async function doUploadInput(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "اختر ملفًا للرفع." };
  try {
    const meta = await saveUpload(file);
    await addAttachment(requestId, "input", meta, null, actor);
  } catch (error) {
    if (error instanceof FileValidationError) return { error: error.message };
    return { error: message(error) };
  }
  done(requestId);
}

export async function doApproveUrgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = approveUrgentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await approveUrgent(parsed.data.requestId, actor, parsed.data.agreedTargetH);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doDeclineUrgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const parsed = declineUrgentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await declineUrgent(parsed.data.requestId, actor, parsed.data.reason);
  } catch (error) {
    return { error: message(error) };
  }
  done(parsed.data.requestId);
}

export async function doSubmitDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  try {
    await submitDraft(requestId, actor);
  } catch (error) {
    return { error: message(error) };
  }
  done(requestId);
}
