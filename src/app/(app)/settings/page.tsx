// الإعدادات العامة (للمسؤول فقط): هوية النظام والقوائم المرجعية (القنوات والمقاسات والجهات).

import { redirect } from "next/navigation";
import { BrandingSettingsForm } from "@/components/domain/branding-settings-form";
import { DepartmentsEditor } from "@/components/domain/departments-editor";
import { PageHeader } from "@/components/domain/page-header";
import { requireActor } from "@/lib/auth";
import { getSettings } from "@/services/settings";
import { listDepartments } from "@/services/users";
import { saveBrandingSettings, saveDepartments } from "./actions";

export default async function SettingsPage() {
  const actor = await requireActor();
  if (actor.role !== "studio_manager") redirect("/");

  const [settingsRow, departments] = await Promise.all([getSettings(), listDepartments()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="الإعدادات" />
      <BrandingSettingsForm
        branding={{
          orgName: settingsRow.orgName,
          orgSubtitle: settingsRow.orgSubtitle,
          hasLogo: !!settingsRow.logoPath,
          channels: settingsRow.channels,
          sizeOptions: settingsRow.sizeOptions,
          allowedFileTypes: settingsRow.allowedFileTypes,
        }}
        action={saveBrandingSettings}
      />
      <DepartmentsEditor
        items={departments.map((d) => ({ id: d.id, name: d.name, isActive: d.isActive }))}
        action={saveDepartments}
      />
    </div>
  );
}
