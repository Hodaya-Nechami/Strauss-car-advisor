/**
 * שמירת שיחות (N6): כל שיחה נשמרת כאובייקט SessionState אחד ועוד רשימת transcript,
 * בדיוק כמו שהם. מחליף את השמירה בזיכרון ב-apps/web/lib/server.ts.
 *
 * המנעול (busy) חי ב-DB, לא בזיכרון התהליך - כדי שיעבוד גם בין כמה שרתים.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { SessionState } from "@strauss/agent";
import { resolveChatsDbPath } from "./paths";

export class ChatStoreBusyError extends Error {}
export class ChatStoreNotFoundError extends Error {}

export interface ChatRecord<Transcript> {
  session: SessionState;
  transcript: Transcript[];
}

interface Row {
  session_json: string;
  transcript_json: string;
}

export class ChatStore<Transcript = unknown> {
  private readonly db: Database.Database;

  constructor(dbPath: string = resolveChatsDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        session_json TEXT NOT NULL,
        transcript_json TEXT NOT NULL,
        busy INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
  }

  create(session: SessionState): void {
    this.db
      .prepare(`INSERT INTO chats (id, session_json, transcript_json, busy, updated_at) VALUES (@id, @session, '[]', 0, @now)`)
      .run({ id: session.id, session: JSON.stringify(session), now: new Date().toISOString() });
  }

  get(id: string): ChatRecord<Transcript> | undefined {
    const row = this.db.prepare(`SELECT session_json, transcript_json FROM chats WHERE id = ?`).get(id) as Row | undefined;
    return row ? this.deserialize(row) : undefined;
  }

  all(): ChatRecord<Transcript>[] {
    const rows = this.db.prepare(`SELECT session_json, transcript_json FROM chats`).all() as Row[];
    return rows.map((r) => this.deserialize(r));
  }

  private deserialize(row: Row): ChatRecord<Transcript> {
    return { session: JSON.parse(row.session_json), transcript: JSON.parse(row.transcript_json) };
  }

  /**
   * תופס את המנעול באופן אטומי. true אם הצליח, false אם כבר תפוס.
   * זורקת ChatStoreNotFoundError אם השיחה לא קיימת בכלל.
   */
  claim(id: string): boolean {
    const result = this.db.prepare(`UPDATE chats SET busy = 1 WHERE id = ? AND busy = 0`).run(id);
    if (result.changes === 1) return true;
    const exists = this.db.prepare(`SELECT 1 FROM chats WHERE id = ?`).get(id);
    if (!exists) throw new ChatStoreNotFoundError(id);
    return false;
  }

  release(id: string): void {
    this.db.prepare(`UPDATE chats SET busy = 0 WHERE id = ?`).run(id);
  }

  save(id: string, chat: ChatRecord<Transcript>): void {
    this.db
      .prepare(`UPDATE chats SET session_json = @session, transcript_json = @transcript, updated_at = @now WHERE id = @id`)
      .run({
        id,
        session: JSON.stringify(chat.session),
        transcript: JSON.stringify(chat.transcript),
        now: new Date().toISOString(),
      });
  }

  /**
   * מנעול בין-תהליכי: תופס, מריץ את הפעולה על עותק חי בזיכרון, שומר את המצב
   * בסוף - גם אם הפעולה נכשלה, בדיוק כמו ההתנהגות הקודמת בזיכרון - ומשחרר תמיד.
   */
  async withLock<T>(id: string, action: (chat: ChatRecord<Transcript>) => Promise<T>): Promise<T> {
    if (!this.claim(id)) throw new ChatStoreBusyError(id);
    const chat = this.get(id)!;
    try {
      return await action(chat);
    } finally {
      this.save(id, chat);
      this.release(id);
    }
  }

  close(): void {
    this.db.close();
  }
}
