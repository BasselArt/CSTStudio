// الإعدادات العامة (للمسؤول فقط): هوية النظام — الاسم والشعار وقنوات الاستخدام.

import { redirect } from "next/navigation";
import { BrandingSettingsForm } from "@/components/domain/branding-settings-form";
import { PageHeader } from "@/components/domain/page-header";
import { requireActor } from "@/lib/auth";
import { getSettings } from "@/services/settings";
import { saveBrandingSettings } from "./actions";

export default async function SettingsPage() {
  const actor = await requireActor();
  if (actor.role !== "studio_manager") redirect("/");

  const settingsRow = await getSettings();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="الإعدادات" />
      <BrandingSettingsForm
        branding={{
          orgName: settingsRow.orgName,
          orgSubtitle: settingsRow.orgSubtitle,
          hasLogo: !!settingsRow.logoPath,
          channels: settingsRow.channels,
        }}
        action={saveBrandingSettings}
      />
    </div>
  );
}
