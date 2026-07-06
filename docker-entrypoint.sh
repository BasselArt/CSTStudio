#!/bin/sh
# يطبّق مخطط Drizzle على قاعدة البيانات (idempotent) قبل بدء الخادم،
# ويشغّل البذور الحتمية فقط إذا SEED_ON_BOOT=true (لا يُفعَّل تلقائيًا في الإنتاج).
set -e

DB_PATH="${DATABASE_PATH:-storage/studio.db}"
mkdir -p "$(dirname "$DB_PATH")" storage/uploads

pnpm db:push

if [ "$SEED_ON_BOOT" = "true" ]; then
  pnpm db:seed
fi

exec "$@"
