#!/bin/sh
# يطبّق مخطط Drizzle على قاعدة البيانات (idempotent) قبل بدء الخادم،
# ويشغّل البذور الحتمية فقط إذا SEED_ON_BOOT=true (لا يُفعَّل تلقائيًا في الإنتاج).
set -e

DB_PATH="${DATABASE_PATH:-storage/studio.db}"
mkdir -p "$(dirname "$DB_PATH")" storage/uploads

# حارس ترحيل: drizzle-kit push يفشل عند إعادة بناء attachments إذا كان
# عمود url غائبًا في القاعدة القائمة (يقرأه في نسخ الصفوف) — نضيفه مسبقًا.
if [ -f "$DB_PATH" ]; then
  DB_PATH_GUARD="$DB_PATH" node -e "
    const Database = require('better-sqlite3');
    const db = new Database(process.env.DB_PATH_GUARD);
    try {
      const cols = db.prepare('PRAGMA table_info(attachments)').all().map(c => c.name);
      if (cols.length > 0 && !cols.includes('url')) {
        db.exec('ALTER TABLE attachments ADD COLUMN url text');
        console.log('migration guard: added attachments.url');
      }
    } finally { db.close(); }
  " || true
fi

pnpm db:push

if [ "$SEED_ON_BOOT" = "true" ]; then
  pnpm db:seed
fi

exec "$@"
