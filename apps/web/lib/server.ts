/**
 * צד השרת של האתר: טעינת ההגדרות, שמירת שיחות והפעלת הבוט.
 *
 * כרגע הכול נשמר בזיכרון של השרת, ונמחק כשהשרת עולה מחדש.
 * נחמי מחליפה את זה במסד נתונים (N6), במאגר רשות המסים (N4) ובטעינת כללים עם ולידציה (N5).
 * מסך הנציג (N7, N8) משתמש ב-listOpenRepQuestions וב-answerRepQuestion שבסוף הקובץ.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import {
  CatalogDataSource,
  MemoryRepQueue,
  agentOptionsFromEnv,
  createClaudeClient,
  describeAgentError,
  newSession,
  resumeWithRepAnswer,
  runTurn,
  type AgentOptions,
  type ComparisonRecord,
  type SessionState,
  type ToolContext,
  type TurnResult,
} from "@strauss/agent";

export interface TranscriptEntry {
  role: "employee" | "bot" | "notice";
  text: string;
  comparisons?: ComparisonRecord[];
  at: string;
}

export interface ChatView {
  sessionId: string | null;
  transcript: TranscriptEntry[];
  openQuestions: { ticketId: string; about: string; question: string }[];
}

interface StoredChat {
  session: SessionState;
  transcript: TranscriptEntry[];
  busy: boolean;
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CONFIG_DIR = process.env.CONFIG_DIR ?? resolve(process.cwd(), "..", "..", "config");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(CONFIG_DIR, name), "utf-8")) as T;
}

interface ServerState {
  rules: Rules;
  catalog: CatalogCar[];
  occupations: Occupation[];
  data: CatalogDataSource;
  rep: MemoryRepQueue;
  chats: Map<string, StoredChat>;
  agent?: AgentOptions;
}

/** מצב אחד לכל תהליך שרת. נשמר על globalThis כדי לשרוד טעינה מחדש של קוד בזמן פיתוח. */
function state(): ServerState {
  const g = globalThis as unknown as { __straussState?: ServerState };
  if (!g.__straussState) {
    const catalog = loadJson<CatalogCar[]>("catalog.json");
    g.__straussState = {
      rules: loadJson<Rules>("rules.json"),
      catalog,
      occupations: loadJson<Occupation[]>("occupations.json"),
      data: new CatalogDataSource(catalog),
      rep: new MemoryRepQueue(),
      chats: new Map(),
    };
  }
  return g.__straussState;
}

function agentOptions(s: ServerState): AgentOptions {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ChatError(
      503,
      "חסר מפתח API של Claude. צרו את הקובץ apps/web/.env.local עם השורה ANTHROPIC_API_KEY=המפתח שלכם, ואז הפעילו את השרת מחדש.",
    );
  }
  s.agent ??= agentOptionsFromEnv(createClaudeClient());
  return s.agent;
}

function context(s: ServerState, chat: StoredChat): ToolContext {
  return {
    session: chat.session,
    rules: s.rules,
    catalog: s.catalog,
    occupations: s.occupations,
    data: s.data,
    rep: s.rep,
  };
}

function view(chat: StoredChat | undefined): ChatView {
  if (!chat) return { sessionId: null, transcript: [], openQuestions: [] };
  return {
    sessionId: chat.session.id,
    transcript: chat.transcript,
    openQuestions: chat.session.pendingQuestions,
  };
}

function now() {
  return new Date().toISOString();
}

/** מריץ פעולה על שיחה, ומונע שתי פעולות בו-זמנית על אותה שיחה */
async function withChat(chat: StoredChat, action: () => Promise<TurnResult>): Promise<TurnResult> {
  if (chat.busy) throw new ChatError(409, "הבוט עדיין עונה על ההודעה הקודמת. רגע אחד.");
  chat.busy = true;
  try {
    return await action();
  } catch (err) {
    if (err instanceof ChatError) throw err;
    const e = describeAgentError(err);
    console.error("[chat] agent error:", err);
    throw new ChatError(e.status, e.message);
  } finally {
    chat.busy = false;
  }
}

export function getChatView(sessionId: string | null): ChatView {
  return view(sessionId ? state().chats.get(sessionId) : undefined);
}

export async function sendMessage(sessionId: string | null, text: string): Promise<ChatView> {
  const s = state();
  const options = agentOptions(s);
  let chat = sessionId ? s.chats.get(sessionId) : undefined;
  if (!chat) {
    chat = { session: newSession(randomUUID()), transcript: [], busy: false };
    s.chats.set(chat.session.id, chat);
  }
  const current = chat;
  const result = await withChat(current, async () => {
    current.transcript.push({ role: "employee", text, at: now() });
    return runTurn(context(s, current), text, options);
  });
  current.transcript.push({ role: "bot", text: result.reply, comparisons: result.comparisons, at: now() });
  return view(current);
}

/** בשביל מסך הנציג: כל השאלות הפתוחות מכל השיחות */
export function listOpenRepQuestions() {
  return [...state().chats.values()].flatMap((chat) =>
    chat.session.pendingQuestions.map((q) => ({ sessionId: chat.session.id, ...q })),
  );
}

/** בשביל מסך הנציג: הנציג ענה, והשיחה של העובד ממשיכה מאותה נקודה */
export async function answerRepQuestion(sessionId: string, ticketId: string, answer: string): Promise<ChatView> {
  const s = state();
  const options = agentOptions(s);
  const chat = s.chats.get(sessionId);
  if (!chat) throw new ChatError(404, "השיחה לא נמצאה");
  const result = await withChat(chat, async () => {
    chat.transcript.push({ role: "notice", text: `הנציג ענה: ${answer}`, at: now() });
    return resumeWithRepAnswer(context(s, chat), ticketId, answer, options);
  });
  chat.transcript.push({ role: "bot", text: result.reply, comparisons: result.comparisons, at: now() });
  return view(chat);
}
