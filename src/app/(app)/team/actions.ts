"use server";

// حفظ إعدادات SLA وإدارة المستخدمين (للمسؤول فقط) — SPEC §12/05.

import { revalidatePath } from "next/cache";
import { DESIGN_TOOLS } from "@/core/constants";
import { requireActor } from "@/lib/auth";
import { updateRequestType, updateSettings } from "@/services/settings";
import { createUser, setUserActive, updateUser } from "@/services/users";
import {
  requestTypeUpdateSchema,
  settingsSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/services/schemas";

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

  revalidatePath("/team");
  revalidatePath("/");
  return { success: true };
}

/** إنشاء مستخدم أو تعديله — وجود id يحدد العملية */
export async function saveUser(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    departmentId: formData.get("departmentId"),
    capacityPoints: formData.get("capacityPoints"),
    password: formData.get("password"),
  };
  const id = formData.get("id");

  try {
    if (id) {
      const parsed = userUpdateSchema.safeParse({ ...raw, id });
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      await updateUser(parsed.data, actor);
    } else {
      const parsed = userCreateSchema.safeParse(raw);
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      await createUser(parsed.data, actor);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر الحفظ." };
  }

  revalidatePath("/team");
  return { success: true };
}

export async function toggleUserActive(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();
  const id = Number(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  try {
    await setUserActive(id, isActive, actor);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر التنفيذ." };
  }

  revalidatePath("/team");
  return { success: true };
}
