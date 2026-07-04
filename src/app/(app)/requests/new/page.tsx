// طلب تصميم جديد (SPEC §12/03).

import { redirect } from "next/navigation";
import { NewRequestForm } from "@/components/domain/new-request-form";
import { PageHeader } from "@/components/domain/page-header";
import { requireActor } from "@/lib/auth";
import { getRequestDetails } from "@/services/requests";
import { getSettings, listRequestTypes, toCalendarCfg } from "@/services/settings";
import { listDepartments } from "@/services/users";
import { submitNewRequest } from "./actions";

/** وصف قصير لكل نوع في بطاقات الاختيار (صورة 03) */
const TYPE_DESCRIPTIONS: Record<string, string> = {
  "تعديل بسيط": "تعديلات على تصميم حالي أو تصحيح فني",
  "تصميم بسيط": "تصاميم أحادية أو مواد تواصل بسيطة",
  "تصميم متوسط": "تصاميم متعددة الصفحات أو مواد ترويجية متكاملة",
  "تصميم كبير": "مشاريع معقدة متعددة الشاشات أو الحملات المتكاملة",
};

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ related?: string }>;
}) {
  const actor = await requireActor();
  if (actor.role !== "requester" && actor.role !== "studio_manager") redirect("/requests");

  const [departments, types, settingsRow, sp] = await Promise.all([
    listDepartments(),
    listRequestTypes(),
    getSettings(),
    searchParams,
  ]);

  // «طلب تعديل» مرتبط بطلب أصلي بعد استنفاد جولات المراجعة (SPEC §6)
  let related: { id: number; number: string; title: string } | null = null;
  const editType = types.find((t) => t.name === "تعديل بسيط") ?? null;
  if (sp.related) {
    try {
      const original = await getRequestDetails(Number(sp.related), actor);
      related = {
        id: original.request.id,
        number: original.request.number,
        title: original.request.title,
      };
    } catch {
      related = null; // طلب غير موجود أو بلا صلاحية — يُتجاهل الربط
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="طلب تصميم جديد" />
      <NewRequestForm
        related={related}
        defaultTypeId={related ? (editType?.id ?? null) : null}
        departments={departments.map((d) => ({ value: String(d.id), label: d.name }))}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          description: TYPE_DESCRIPTIONS[t.name] ?? "",
          effortPoints: t.effortPoints,
          slaNormalH: t.slaNormalH,
          slaHighH: t.slaHighH,
          slaUrgentH: t.slaUrgentH,
          unitLabel: t.unitLabel,
          baseUnits: t.baseUnits,
          extraUnitH: t.extraUnitH,
        }))}
        cfg={toCalendarCfg(settingsRow)}
        toolFactors={settingsRow.toolFactors}
        defaultDepartmentId={actor.departmentId}
        requesterName={actor.name}
        action={submitNewRequest}
      />
    </div>
  );
}
