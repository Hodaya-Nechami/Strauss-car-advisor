import { resolve } from "node:path";

/** מיקום קובץ ה-SQLite. אפשר לדרוס עם DB_PATH (למשל בבדיקות). */
export function resolveDbPath(): string {
  return process.env.DB_PATH ?? resolve(process.cwd(), ".data", "value-of-use.db");
}
