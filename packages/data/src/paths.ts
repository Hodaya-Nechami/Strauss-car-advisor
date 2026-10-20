import { resolve } from "node:path";

/** מיקום קובץ ה-SQLite של מאגר שווי השימוש. אפשר לדרוס עם DB_PATH (למשל בבדיקות). */
export function resolveDbPath(): string {
  return process.env.DB_PATH ?? resolve(process.cwd(), ".data", "value-of-use.db");
}

/** מיקום קובץ ה-SQLite של השיחות. אפשר לדרוס עם CHATS_DB_PATH (למשל בבדיקות). */
export function resolveChatsDbPath(): string {
  return process.env.CHATS_DB_PATH ?? resolve(process.cwd(), ".data", "chats.db");
}
