import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "storage/studio.db";

function createDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// كائن واحد عبر hot-reload في التطوير
const globalForDb = globalThis as unknown as {
  __studioDb?: ReturnType<typeof createDb>;
};

export const db = (globalForDb.__studioDb ??= createDb());

export type Db = typeof db;
/** نوع المنفّذ داخل transaction — تستقبله الدوال الداخلية للخدمات */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
