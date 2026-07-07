"use server";

// إجراءات تفاصيل الطلب — كلها تمر عبر services/requests حصريًا (SPEC §4.2).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { saveUpload, FileValidationError } from "@/services/files";
import { getSettings } from "@/services/settings";
import {
  addAttachments,
  addComment,
  resume,
  type AttachmentInput,
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
  deliverableLinksSchema,
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

/** استئناف مهمة موقوفة مؤقتًا — العودة للحالة السابقة للإيقاف */
export async function doResume(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  try {
    await resume(requestId, actor);
  } catch (error) {
    return { error: message(error) };
  }
  done(requestId);
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

/** اسم معروض لرابط تسليم: النطاق بلا www */
function linkLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}

/** التسليم يقبل ملفات متعددة و/أو روابط متعددة (سطر لكل رابط) في عملية واحدة */
export async function doUploadDeliverable(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  const version = String(formData.get("version") || "").trim() || null;

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const rawLinks = String(formData.get("links") || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const parsedLinks = deliverableLinksSchema.safeParse(rawLinks);
  if (!parsedLinks.success) return { error: parsedLinks.error.issues[0].message };
  if (files.length === 0 && parsedLinks.data.length === 0) {
    return { error: "أضف ملفًا واحدًا أو رابطًا واحدًا على الأقل." };
  }

  try {
    const settingsRow = await getSettings();
    const inputs: AttachmentInput[] = [];
    for (const file of files) {
      inputs.push(await saveUpload(file, settingsRow.allowedFileTypes));
    }
    for (const url of parsedLinks.data) {
      inputs.push({ filename: linkLabel(url), url });
    }
    await addAttachments(requestId, "deliverable", inputs, version, actor);
  } catch (error) {
    if (error instanceof FileValidationError) return { error: error.message };
    return { error: message(error) };
  }
  done(requestId);
}

export async function doUploadInput(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const requestId = Number(formData.get("requestId"));
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "اختر ملفًا واحدًا على الأقل." };
  try {
    const settingsRow = await getSettings();
    const inputs: AttachmentInput[] = [];
    for (const file of files) {
      inputs.push(await saveUpload(file, settingsRow.allowedFileTypes));
    }
    await addAttachments(requestId, "input", inputs, null, actor);
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
