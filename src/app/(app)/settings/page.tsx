// إعدادات SLA (SPEC §12/05) — المصفوفة + تقويم العمل + قواعد التشغيل، للمسؤول فقط.

import { redirect } from "next/navigation";
import { PageHeader } from "@/components/domain/page-header";
import { SlaSettingsForm } from "@/components/domain/sla-settings-form";
import { requireActor } from "@/lib/auth";
import { getSettings, listRequestTypes } from "@/services/settings";
import { saveSlaSettings } from "./actions";

export default async function SettingsPage() {
  const actor = await requireActor();
  if (actor.role !== "studio_manager") redirect("/");

  const [settingsRow, types] = await Promise.all([getSettings(), listRequestTypes()]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="إعدادات SLA" />
      <SlaSettingsForm
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          effortPoints: t.effortPoints,
          slaNormalH: t.slaNormalH,
          slaHighH: t.slaHighH,
          slaUrgentH: t.slaUrgentH,
          unitLabel: t.unitLabel,
          baseUnits: t.baseUnits,
          extraUnitH: t.extraUnitH,
        }))}
        settings={{
          workDays: settingsRow.workDays,
          workStart: settingsRow.workStart,
          workEnd: settingsRow.workEnd,
          holidays: settingsRow.holidays,
          alertThresholdPct: settingsRow.alertThresholdPct,
          autoCloseWorkDays: settingsRow.autoCloseWorkDays,
          maxReviewRounds: settingsRow.maxReviewRounds,
          loadLowPct: settingsRow.loadLowPct,
          loadHighPct: settingsRow.loadHighPct,
          responseSlaH: settingsRow.responseSlaH,
          toolFactors: settingsRow.toolFactors,
        }}
        action={saveSlaSettings}
      />
    </div>
  );
}
