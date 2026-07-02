# نظام إدارة طلبات استوديو التصميم — CST

نظام داخلي لإدارة طلبات استوديو التصميم بواجهة عربية RTL كاملة.
المرجع التفصيلي: `SPEC-نظام-طلبات-استوديو-التصميم.md` وملف `CLAUDE.md`.

## التشغيل

```bash
pnpm install
cp .env.example .env.local   # ثم ولّد AUTH_SECRET بـ: openssl rand -base64 32
pnpm db:push                 # إنشاء الجداول
pnpm db:seed                 # بذور تجريبية (~34 طلبًا)
pnpm dev
```

## حسابات التطوير

كلمة المرور الموحدة للجميع: **`Cst@2026`**

| الدور | الاسم | البريد |
|---|---|---|
| مسؤول الاستوديو | أحمد العتيبي | `a.alotaibi@cst.gov.sa` |
| مصممة | نورة الشهري | `n.alshahri@cst.gov.sa` |
| مصممة | سارة المطيري | `s.almutairi@cst.gov.sa` |
| مصمم | محمد الزهراني | `m.alzahrani@cst.gov.sa` |
| مصمم | علي الحربي | `a.alharbi@cst.gov.sa` |
| مصمم | خالد الزهراني | `k.alzahrani@cst.gov.sa` |
| مصممة | ريم العتيبي | `r.alotaibi@cst.gov.sa` |
| طالبة خدمة — الاتصال المؤسسي | مها القحطاني | `m.alqahtani@cst.gov.sa` |
| طالب خدمة — الشؤون القانونية | فهد العنزي | `f.alanazi@cst.gov.sa` |
| طالب خدمة — تقنية المعلومات | عبدالله السبيعي | `a.alsubaie@cst.gov.sa` |
| طالبة خدمة — الموارد البشرية | سلمى الدوسري | `s.aldossari@cst.gov.sa` |
| طالب خدمة — إدارة المشاريع | يوسف الشمري | `y.alshammari@cst.gov.sa` |
| المدير (قراءة فقط) | د. سلطان الرشيد | `s.alrashid@cst.gov.sa` |

## الأوامر

```bash
pnpm dev          # التشغيل المحلي
pnpm build        # بناء الإنتاج
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run (src/core فقط)
pnpm db:push      # drizzle-kit push
pnpm db:seed      # بذور حتمية قابلة لإعادة التشغيل
```

## مهمة sla-sweep المجدولة

`POST /api/jobs/sla-sweep` محمية بترويسة `x-job-token` (قيمة `JOB_TOKEN` في البيئة)
وidempotent بالكامل — تُستدعى من مجدول خارجي كل 15 دقيقة:

```bash
curl -X POST -H "x-job-token: $JOB_TOKEN" http://localhost:3000/api/jobs/sla-sweep
```

(يُبنى المسار في Phase 6.)
