"use server";

// حفظ إعدادات SLA وهوية النظام (للمسؤول فقط) — SPEC §12/05.

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { FileValidationError, saveBrandingLogo } from "@/services/files";
import {
  createRequestType,
  deleteRequestType,
  saveDepartment,
  updateBranding,
  updateRequestType,
  updateSettings,
} from "@/services/settings";
import {
  brandingSchema,
  departmentItemSchema,
  requestTypeCreateSchema,
  requestTypeUpdateSchema,
  settingsSchema,
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

  revalidatePath("/settings/sla");
  revalidatePath("/");
  return { success: true };
}

/** حفظ هوية النظام: الاسم والوصف والشعار وقنوات الاستخدام (للمسؤول فقط) */
export async function saveBrandingSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();

  const parsed = brandingSchema.safeParse({
    orgName: formData.get("orgName"),
    orgSubtitle: formData.get("orgSubtitle") ?? "",
    channels: formData.getAll("channels").filter((c) => typeof c === "string" && c),
    sizeOptions: formData.getAll("sizeOptions").filter((s) => typeof s === "string" && s),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  /* الشعار اختياري — undefined يعني إبقاء الحالي، وremoveLogo تعيده للنصي */
  let logoPath: string | null | undefined;
  const logo = formData.get("logo");
  if (formData.get("removeLogo") === "1") {
    logoPath = null;
  } else if (logo instanceof File && logo.size > 0) {
    try {
      logoPath = await saveBrandingLogo(logo);
    } catch (error) {
      if (error instanceof FileValidationError) return { error: error.message };
      throw error;
    }
  }

  try {
    await updateBranding(parsed.data, actor.role, logoPath);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر الحفظ." };
  }

  revalidatePath("/", "layout"); // الهوية تظهر في السايدبار عبر كل الصفحات
  return { success: true };
}

/** حفظ قائمة الجهات: تعديل الأسماء وتفعيل/تعطيل وإضافة جهات جديدة (للمسؤول فقط) */
export async function saveDepartments(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const actor = await requireActor();

  const inputs = [
    ...formData.getAll("itemId").map((raw) => ({
      id: Number(raw),
      name: formData.get(`item-${raw}-name`),
      isActive: formData.get(`item-${raw}-active`),
    })),
    ...formData
      .getAll("newName")
      .filter((n) => typeof n === "string" && n.trim() !== "")
      .map((name) => ({ id: undefined, name, isActive: "on" })),
  ];

  const items = [];
  for (const input of inputs) {
    const parsed = departmentItemSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    items.push(parsed.data);
  }

  try {
    for (const item of items) await saveDepartment(item, actor.role);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر الحفظ." };
  }

  revalidatePath("/settings");
  revalidatePath("/requests/new");
  revalidatePath("/requests");
  revalidatePath("/users");
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

  revalidatePath("/settings/sla");
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

  revalidatePath("/settings/sla");
  revalidatePath("/requests/new");
  return { success: true };
}
