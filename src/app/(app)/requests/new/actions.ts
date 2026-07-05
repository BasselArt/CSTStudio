"use server";

// إرسال/مسودة طلب جديد — نفس مخطط Zod المشترك client/server (SPEC §4.6).

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { saveUpload, FileValidationError } from "@/services/files";
import { addAttachment, createRequest, saveDraft } from "@/services/requests";
import { createRequestSchema } from "@/services/schemas";

export interface NewRequestState {
  fieldErrors: Record<string, string>;
  formError?: string;
}

export async function submitNewRequest(
  _prev: NewRequestState,
  formData: FormData,
): Promise<NewRequestState> {
  const actor = await requireActor();
  const raw = {
    ...Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")),
    // الحقول متعددة القيم — Object.fromEntries يبقي آخر قيمة فقط
    sizes: formData.getAll("sizes").filter((v) => typeof v === "string" && v),
    channels: formData.getAll("channels").filter((v) => typeof v === "string" && v),
  };

  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const isDraft = formData.get("intent") === "draft";
  let id: number;
  try {
    // التحقق من الملفات قبل إنشاء الطلب (النوع والحجم على الخادم)
    const saved = [];
    for (const file of files) saved.push(await saveUpload(file));

    id = isDraft
      ? await saveDraft(parsed.data, actor)
      : await createRequest(parsed.data, actor);

    for (const meta of saved) await addAttachment(id, "input", meta, null, actor);
  } catch (error) {
    if (error instanceof FileValidationError) {
      return { fieldErrors: { files: error.message } };
    }
    return {
      fieldErrors: {},
      formError: error instanceof Error ? error.message : "تعذر إرسال الطلب.",
    };
  }

  redirect(`/requests/${id}`);
}
