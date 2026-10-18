/**
 * צד השרת של האתר: טעינת ההגדרות, שמירת שיחות והפעלת הבוט.
 *
 * כרגע הכול נשמר בזיכרון של השרת, ונמחק כשהשרת עולה מחדש.
 * נחמי מחליפה את זה במסד נתונים (N6), במאגר רשות המסים (N4) ובטעינת כללים עם ולידציה (N5).
 * מסך הנציג (N7, N8) משתמש ב-listOpenRepQuestions וב-answerRepQuestion.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CatalogCar, EmployeeProfile, Occupation, Rules } from "@strauss/engine";
import {
  type CarGroup,
  CatalogDataSource,
  MemoryRepQueue,
  appendUserNote,
  createAgentOptionsFromEnv,
  describeAgentError,
  resolveMode,
  newSession,
  resumeWithRepAnswer,
  runTool,
  runTurn,
  type AgentOptions,
  type ComparisonRecord,
  type SessionState,
  type ToolContext,
  type TurnResult,
} from "@strauss/agent";

export interface TranscriptEntry {
  /** employee: העובד כתב · bot: הבוט ענה · notice: הודעת מצב · calc: חישוב מחדש מהמסך, בלי הבוט */
  role: "employee" | "bot" | "notice" | "calc";
  text: string;
  comparisons?: ComparisonRecord[];
  /** רכבים להצגה בתמונות */
  cars?: CarGroup[];
  /** אילו מודלים ענו, למשל ["Gemini"] או ["Gemini", "Groq"] */
  via?: string[];
  at: string;
}

export interface ChatView {
  sessionId: string | null;
  transcript: TranscriptEntry[];
  openQuestions: { ticketId: string; about: string; question: string }[];
  profile: Partial<EmployeeProfile>;
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

function loadJson<T>(name: string): T {
  const dir = process.env.CONFIG_DIR ?? resolve(process.cwd(), "..", "..", "config");
  return JSON.parse(readFileSync(join(dir, name), "utf-8")) as T;
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

/**
 * מצב אחד לכל תהליך שרת. נשמר על globalThis כדי לשרוד טעינה מחדש של קוד בזמן פיתוח.
 * כשמבנה השיחות משתנה, מעלים את הגרסה במפתח: השרת מתחיל מזיכרון נקי במקום לקרוס על שיחות במבנה ישן.
 */
export const STATE_KEY = "__straussState_v4";

function state(): ServerState {
  const g = globalThis as unknown as Record<string, ServerState | undefined>;
  if (!g[STATE_KEY]) {
    const catalog = loadJson<CatalogCar[]>("catalog.json");
    g[STATE_KEY] = {
      rules: loadJson<Rules>("rules.json"),
      catalog,
      occupations: loadJson<Occupation[]>("occupations.json"),
      data: new CatalogDataSource(catalog),
      rep: new MemoryRepQueue(),
      chats: new Map(),
    };
  }
  return g[STATE_KEY]!;
}

/** הגדרות הבוט: Gemini אם יש GEMINI_API_KEY, אחרת Claude. נבנות פעם אחת לכל תהליך. */
function agentOptions(s: ServerState): AgentOptions {
  if (!s.agent) {
    try {
      s.agent = createAgentOptionsFromEnv(process.env);
    } catch (err) {
      const e = describeAgentError(err);
      throw new ChatError(e.status, e.message);
    }
  }
  return s.agent;
}

/** הודעה בשם העובד שלא נכתבה בצ'אט, בהיסטוריה של המודל הנכון */
function note(chat: StoredChat, text: string) {
  appendUserNote(chat.session, text, resolveMode(process.env) ?? "claude");
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
  if (!chat) return { sessionId: null, transcript: [], openQuestions: [], profile: {} };
  return {
    sessionId: chat.session.id,
    transcript: chat.transcript,
    openQuestions: chat.session.pendingQuestions,
    profile: chat.session.profile,
  };
}

function now() {
  return new Date().toISOString();
}

function findChat(sessionId: string): StoredChat {
  const chat = state().chats.get(sessionId);
  if (!chat) throw new ChatError(404, "השיחה לא נמצאה. אפשר להתחיל שיחה חדשה.");
  return chat;
}

/**
 * מריץ פעולה על שיחה, ומונע שתי פעולות בו-זמנית על אותה שיחה.
 * חשוב: אסור להוסיף הודעה להיסטוריה בזמן שהבוט באמצע תור, אחרת ההיסטוריה נשברת.
 */
async function withLock<T>(chat: StoredChat, action: () => Promise<T>): Promise<T> {
  if (chat.busy) throw new ChatError(409, "הבוט עדיין עונה על ההודעה הקודמת. רגע אחד.");
  chat.busy = true;
  try {
    return await action();
  } catch (err) {
    if (err instanceof ChatError) throw err;
    const e = describeAgentError(err);
    console.error("[chat] error:", err);
    throw new ChatError(e.status, e.message);
  } finally {
    chat.busy = false;
  }
}

/** הודעת שגיאה בעברית מתוצאה של כלי שנכשל */
function toolProblem(result: Record<string, unknown>): string {
  const issues = Array.isArray(result.issues) ? ` (${result.issues.join("; ")})` : "";
  if (typeof result.error === "string") return result.error + issues;
  if (Array.isArray(result.missing)) return `חסרים נתונים: ${result.missing.join(", ")}`;
  return "הפעולה נכשלה";
}

export function getChatView(sessionId: string | null): ChatView {
  return view(sessionId ? state().chats.get(sessionId) : undefined);
}

/** שיחה חדשה וריקה */
export function createChat(): ChatView {
  const chat: StoredChat = { session: newSession(randomUUID()), transcript: [], busy: false };
  state().chats.set(chat.session.id, chat);
  return view(chat);
}

export async function sendMessage(sessionId: string | null, text: string): Promise<ChatView> {
  const s = state();
  const options = agentOptions(s);
  const chat = (sessionId && s.chats.get(sessionId)) || findChat(createChat().sessionId!);
  const result: TurnResult = await withLock(chat, async () => {
    chat.transcript.push({ role: "employee", text, at: now() });
    return runTurn(context(s, chat), text, options);
  });
  chat.transcript.push({ role: "bot", text: result.reply, comparisons: result.comparisons, cars: result.carGroups, via: result.via, at: now() });
  return view(chat);
}

/** הרכבים שהעובד יכול לבחור, והאם מותר לו לוותר על הרכב. בלי מודל שפה. */
export async function getOptions(sessionId: string) {
  const s = state();
  const chat = findChat(sessionId);
  const ctx = context(s, chat);
  const catalog = await runTool("list_catalog", {}, ctx);
  if (catalog.ok !== true) throw new ChatError(400, toolProblem(catalog));
  const waiver = await runTool("check_eligibility", { alternative: { kind: "waiver" } }, ctx);
  return {
    cars: catalog.cars as { id: string; group: string; manufacturer: string; model: string; drive: string; valueOfUse: number }[],
    waiver: { status: waiver.status ?? "needs_info", reason: waiver.reason ?? toolProblem(waiver) },
  };
}

/**
 * חישוב מחדש מהמסך, בלי הבוט: אותו כלי ואותו מנוע שהבוט משתמש בהם.
 * הבוט מקבל הודעה על הבדיקה, כדי שיידע עליה אם העובד ימשיך לשאול.
 */
export async function recalculate(sessionId: string, today: unknown, alternative: unknown): Promise<ChatView> {
  const s = state();
  const chat = findChat(sessionId);
  await withLock(chat, async () => {
    const result = await runTool("calculate_comparison", { today, alternative }, context(s, chat));
    if (result.ok !== true) throw new ChatError(400, toolProblem(result));
    const alt = result.alternative as { label: string; net: number } | null;
    const t = result.today as { net: number } | null;
    const summary =
      alt && t
        ? `נטו היום ${t.net} ₪, נטו בחלופה ${alt.net} ₪, הפרש ${result.diffNet} ₪ בחודש.`
        : (result.explanation as string[]).join(" ");
    note(chat, `[בדיקה מטבלת ההשוואה, לא בצ'אט] העובד בדק חלופה: ${JSON.stringify(alternative)}. ${summary}`);
    chat.transcript.push({ role: "calc", text: "בדיקת חלופה מטבלת ההשוואה", comparisons: [{ input: { today, alternative }, result }], at: now() });
  });
  return view(chat);
}

const PROFILE_LABELS: Record<string, string> = {
  group: "קבוצת זכאות",
  occupation: "עיסוק",
  baseSalary: "שכר בסיס",
  commissions: "עמלות",
  bonus: "בונוס",
  pensionRate: "פנסיה %",
  studyFundRate: "קרן השתלמות %",
  creditPoints: "נקודות זיכוי",
  childrenUnder23: "ילדים עד גיל 23",
};

/** תיקון נתונים מהטופס. נבדק באותו כלי שהבוט משתמש בו, והבוט מקבל הודעה על השינוי. */
export async function updateProfile(sessionId: string, patch: Record<string, unknown>): Promise<ChatView> {
  const s = state();
  const chat = findChat(sessionId);
  await withLock(chat, async () => {
    const result = await runTool("save_employee_profile", patch, context(s, chat));
    if (result.ok !== true) throw new ChatError(400, toolProblem(result));
    const changed = Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${PROFILE_LABELS[k] ?? k}: ${String(v)}`)
      .join(", ");
    note(chat, `[עדכון מטופס הנתונים, לא בצ'אט] העובד עדכן את הנתונים שלו: ${changed}. הנתונים כבר נשמרו.`);
    chat.transcript.push({ role: "notice", text: "הנתונים עודכנו", at: now() });
  });
  return view(chat);
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
  const chat = findChat(sessionId);
  const result = await withLock(chat, async () => {
    chat.transcript.push({ role: "notice", text: `הנציג ענה: ${answer}`, at: now() });
    return resumeWithRepAnswer(context(s, chat), ticketId, answer, options);
  });
  chat.transcript.push({ role: "bot", text: result.reply, comparisons: result.comparisons, cars: result.carGroups, via: result.via, at: now() });
  return view(chat);
}
