"use server";

// حفظ إعدادات SLA (للمسؤول فقط) — SPEC §12/05.

import { revalidatePath } from "next/cache";
import { DESIGN_TOOLS } from "@/core/constants";
import { requireActor } from "@/lib/auth";
import {
  createRequestType,
  deleteRequestType,
  updateRequestType,
  updateSettings,
} from "@/services/settings";
import { requestTypeCreateSchema, requestTypeUpdateSchema, settingsSchema } from "@/services/schemas";

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
    toolFactors: Object.fromEntries(
      DESIGN_TOOLS.map((tool) => [tool, formData.get(`tool-${tool}-factor`)]),
    ),
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
      description: formData.get(`type-${id}-description`),
      effortPoints: formData.get(`type-${id}-effortPoints`),
      slaNormalH: formData.get(`type-${id}-slaNormalH`),
      slaHighH: formData.get(`type-${id}-slaHighH`),
      slaUrgentH: formData.get(`type-${id}-slaUrgentH`),
      unitLabel: formData.get(`type-${id}-unitLabel`),
      baseUnits: formData.get(`type-${id}-baseUnits`),
      extraUnitH: formData.get(`type-${id}-extraUnitH`),
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

/** إضافة نوع تصميم جديد إلى المصفوفة (للمسؤول فقط) */
export async function addRequestType(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();

  const parsed = requestTypeCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    effortPoints: formData.get("effortPoints"),
    slaNormalH: formData.get("slaNormalH"),
    slaHighH: formData.get("slaHighH"),
    slaUrgentH: formData.get("slaUrgentH"),
    unitLabel: formData.get("unitLabel"),
    baseUnits: formData.get("baseUnits"),
    extraUnitH: formData.get("extraUnitH"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await createRequestType(parsed.data, actor.role);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر إنشاء النوع." };
  }

  revalidatePath("/settings");
  revalidatePath("/requests/new");
  return { success: true };
}

/** حذف نوع غير مرتبط بأي طلب (للمسؤول فقط) */
export async function removeRequestType(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { error: "نوع غير صالح." };

  try {
    await deleteRequestType(id, actor.role);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر حذف النوع." };
  }

  revalidatePath("/settings");
  revalidatePath("/requests/new");
  return { success: true };
}
