# نظام إدارة طلبات استوديو التصميم — صورة إنتاج واحدة (Next.js + better-sqlite3)
# node_modules الكاملة (بما فيها drizzle-kit وtsx) تبقى في صورة التشغيل عمدًا
# لأن docker-entrypoint.sh يشغّل `pnpm db:push` (وseed اختياري) عند الإقلاع.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat python3 make g++
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next build يُولّد صفحات ثابتة (مثل /_not-found) عبر التخطيط الجذري الذي يستدعي
# getSettings() — لذا تحتاج قاعدة بيانات بذور مؤقتة أثناء البناء فقط (لا تُنسخ لصورة التشغيل).
# AUTH_SECRET هنا قيمة وهمية لإسكات فحص NextAuth أثناء البناء فقط — القيمة الحقيقية تُمرَّر
# وقت التشغيل عبر متغيرات بيئة Coolify، ولا تُنسخ صورة التشغيل هذا الـ ARG.
ARG AUTH_SECRET=build-time-placeholder-not-used-at-runtime
RUN pnpm db:push && pnpm db:seed
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src ./src
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh && mkdir -p storage/uploads

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["pnpm", "start"]
