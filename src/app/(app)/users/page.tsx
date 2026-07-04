// إدارة المستخدمين — إنشاء وتعديل وتعطيل الحسابات، للمسؤول فقط.

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/domain/page-header";
import { UsersManager } from "@/components/domain/users-manager";
import { requireActor } from "@/lib/auth";
import { listDepartments, listUsers } from "@/services/users";
import { saveUser, toggleUserActive } from "./actions";

export default async function UsersPage() {
  const actor = await requireActor();
  if (actor.role !== "studio_manager") redirect("/");

  const [managedUsers, allDepartments] = await Promise.all([
    listUsers(actor),
    listDepartments(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="المستخدمون" />
      <UsersManager
        users={managedUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          departmentId: u.departmentId,
          capacityPoints: u.capacityPoints,
          isActive: u.isActive,
        }))}
        departments={allDepartments.map((d) => ({ id: d.id, name: d.name }))}
        currentUserId={actor.id}
        saveAction={saveUser}
        toggleAction={toggleUserActive}
      />
    </div>
  );
}
