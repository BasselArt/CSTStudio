# نظام إدارة طلبات استوديو التصميم — CST

نظام داخلي لإدارة طلبات استوديو التصميم، واجهة عربية RTL بالكامل. مصدر الحقيقة: `SPEC-نظام-طلبات-استوديو-التصميم.md` (نسخة أصلية في `~/Desktop/StudioSystem/`)، والصور المرجعية في `design/`.

**القاعدة الحاكمة: إذا خالف الواقعُ الخطةَ المعتمدة أو الـ SPEC، توقف واعرض الأمر على المستخدم بدل الارتجال.**

## المكدس (ثابت — لا بدائل ولا إضافات دون موافقة المستخدم)

- Next.js 15 (App Router) · TypeScript `strict`
- Tailwind CSS v4 + shadcn/ui (المكونات المستخدمة فعلًا فقط) + lucide-react
- SQLite عبر Drizzle ORM (better-sqlite3) — schema بلا خصائص خاصة بـ SQLite (قابل للنقل إلى Postgres)
- Zod (مخططات مشتركة نموذج/server action) · Auth.js v5 Credentials + bcryptjs (JWT httpOnly)
- Vitest على `src/core` فقط · pnpm

**ممنوع صراحةً**: Redux/Zustand/Jotai، React Query، مكتبات رسوم بيانية (div/SVG فقط)، مكتبات تواريخ (moment/dayjs/date-fns)، CSS-in-JS، i18n، Redis/queues، microservices. Monolith واحد.

## بنية المجلدات

```
src/core/       نواة المجال — TS خالص، بلا React وبلا استيراد من db
                constants.ts state-machine.ts calendar.ts sla.ts load.ts kpi.ts types.ts
src/db/         schema.ts index.ts seed.ts
src/services/   المنفذ الوحيد للقراءة/الكتابة: requests.ts notifications.ts files.ts
                settings.ts users.ts schemas.ts
src/lib/        auth.ts format.ts csv.ts utils.ts
src/components/ ui/ (shadcn فقط) · domain/ (مكونات مشتركة بين الشاشات)
src/app/        (auth)/login · (app)/{page,requests,requests/new,requests/[id],team}
                api/jobs/sla-sweep · api/files/[id]
storage/uploads/  خارج public — يُخدَّم عبر route مع فحص صلاحية
design/         الصور المرجعية الخمس (01-dashboard … 05-team-sla)
```

## قواعد منع التكرار — إلزامية (SPEC §4)

1. نصوص الحالات/الأولويات/الأنواع وألوانها وترتيبها **حصريًا** من `core/constants.ts`. ممنوع كتابة "قيد التنفيذ" أو أي hex مباشرة في صفحة أو مكوّن.
2. كل كتابة على الطلب تمر **حصريًا** عبر `services/requests.ts` (تكتب حدثًا في `request_events` + إشعارات). لا `db.update(requests)` خارج هذا الملف إطلاقًا.
3. صحة الانتقال بين الحالات **حصريًا** عبر `core/state-machine.ts` (يرمي خطأً عند انتقال غير مسموح).
4. الشارات والجداول والبطاقات مكونات `components/domain` مشتركة. ممنوع جدول أو Badge خاص بصفحة واحدة.
5. كل تنسيق تاريخ/رقم/مدة عبر `lib/format.ts` حصريًا (تقويم ميلادي `gregory`، أرقام لاتينية `nu-latn`، Asia/Riyadh).
6. مخطط Zod لكل عملية يُعرَّف مرة واحدة في `services/schemas.ts` ويُستخدم client + server.
7. الصفحات Server Components تنادي services مباشرة. Client Components للتفاعل فقط.
8. `request_events` مصدر واحد لأربع واجهات: Timeline، سجل التغييرات، التعليقات، ومحرك SLA — لا جداول منفصلة.
9. قبل إنشاء أي مكوّن/دالة/نوع جديد: ابحث في المشروع أولًا. لا تجريد جديد إلا إذا استُخدم في موضعين+.
10. Tailwind بالخصائص المنطقية فقط (`ps- pe- ms- me- start- end-`) — ممنوع `left/right` إلا بضرورة موثقة بتعليق. الأيقونات الاتجاهية تنعكس بـ `rtl:rotate-180`.

## الأوامر

```bash
pnpm dev          # التشغيل المحلي
pnpm build        # بناء الإنتاج
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest run (src/core فقط)
pnpm db:push      # drizzle-kit push
pnpm db:seed      # بذور حتمية (~30 طلبًا)
```

معايير قبول أي مرحلة: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` كلها خضراء، ثم commit واحد بصيغة Conventional Commits.

## تنبيهات مجالية

- الأرقام في صور `design/` زخرفية وغير متسقة — المعادلات في الـ SPEC هي المرجع الحسابي الوحيد (اختبار SLA الذهبي: هدف 40، مستهلك 18، متوقف 6 → 45% و22 متبقية).
- التواريخ تُخزَّن UTC وتُحسب وتُعرض بتوقيت Asia/Riyadh عبر `Intl` فقط (بلا مكتبات).
- فخ التقويم: `ar-SA` هجري افتراضيًا — استخدم `ar-u-ca-gregory-nu-latn`.
- الأولوية ثلاث قيم فقط: عادي/عالي/عاجل. ترقيم الطلب `DSN-YYYY-NNNN` بعدّاد سنوي داخل transaction.
- العمل على مراحل (SPEC §17): بعد إنجاز كل مرحلة توقف واعرض ملخصًا ونتائج الفحوص وانتظر «أكمل».
