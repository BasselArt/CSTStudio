"use server";

// حفظ إعدادات SLA (للمسؤول فقط) — SPEC §12/05.

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { updateRequestType, updateSettings } from "@/services/settings";
import { requestTypeUpdateSchema, settingsSchema } from "@/services/schemas";

export interface SettingsState {
  error?: string;
  success?: boolean;
}

export async function saveSlaSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();

  const settingsInput = {
    workDays: formData.getAll("workDays").map(Number),
    workStart: formData.get("workStart"),
    workEnd: formData.get("workEnd"),
    holidays: formData.getAll("holidays").filter((h) => typeof h === "string" && h),
    alertThresholdPct: formData.get("alertThresholdPct"),
    autoCloseWorkDays: formData.get("autoCloseWorkDays"),
    maxReviewRounds: formData.get("maxReviewRounds"),
    loadLowPct: formData.get("loadLowPct"),
    loadHighPct: formData.get("loadHighPct"),
    responseSlaH: formData.get("responseSlaH"),
  };

  const parsedSettings = settingsSchema.safeParse(settingsInput);
  if (!parsedSettings.success) {
    return { error: parsedSettings.error.issues[0].message };
  }

  const typeIds = formData.getAll("typeId").map(Number);
  const typeUpdates = [];
  for (const id of typeIds) {
    const parsed = requestTypeUpdateSchema.safeParse({
      id,
      effortPoints: formData.get(`type-${id}-effortPoints`),
      slaNormalH: formData.get(`type-${id}-slaNormalH`),
      slaHighH: formData.get(`type-${id}-slaHighH`),
      slaUrgentH: formData.get(`type-${id}-slaUrgentH`),
    });
    if (!parsed.success) {
      return { error: `مصفوفة SLA: ${parsed.error.issues[0].message}` };
    }
    typeUpdates.push(parsed.data);
  }

  try {
    await updateSettings(parsedSettings.data, actor.role);
    for (const update of typeUpdates) await updateRequestType(update, actor.role);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر الحفظ." };
  }

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}
