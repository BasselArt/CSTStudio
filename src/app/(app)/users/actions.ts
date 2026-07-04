"use server";

// إدارة المستخدمين: إنشاء/تعديل/تعطيل (للمسؤول فقط).

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createUser, setUserActive, updateUser } from "@/services/users";
import { userCreateSchema, userUpdateSchema } from "@/services/schemas";

export interface UsersState {
  error?: string;
  success?: boolean;
}

/** إنشاء مستخدم أو تعديله — وجود id يحدد العملية */
export async function saveUser(
  _prev: UsersState,
  formData: FormData,
): Promise<UsersState> {
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

  revalidatePath("/users");
  return { success: true };
}

export async function toggleUserActive(
  _prev: UsersState,
  formData: FormData,
): Promise<UsersState> {
  const actor = await requireActor();
  const id = Number(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  try {
    await setUserActive(id, isActive, actor);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "تعذر التنفيذ." };
  }

  revalidatePath("/users");
  return { success: true };
}
