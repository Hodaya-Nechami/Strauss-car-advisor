/**
 * צד השרת של האתר: טעינת ההגדרות, שמירת שיחות והפעלת הבוט.
 *
 * השיחות נשמרות ב-SQLite דרך ChatStore (N6), כולל מנעול שעובד גם בין כמה שרתים.
 * מסך הנציג (N7, N8) משתמש ב-listOpenRepQuestions וב-answerRepQuestion.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { CatalogCar, EmployeeProfile, Occupation, Rules } from "@strauss/engine";
import { ChatStore, ChatStoreBusyError, ChatStoreNotFoundError, type ChatRecord } from "@strauss/data";
import {
  type CarGroup,
  CatalogDataSource,
  MemoryRepQueue,
  appendUserNote,
  createAgentOptionsFromEnv,
  describeAgentError,
  NotAPayslipError,
  PayslipReadError,
  PAYSLIP_MAX_BYTES,
  PAYSLIP_MIME_TYPES,
  payslipReaderFromEnv,
  type PayslipReading,
  resolveMode,
  newSession,
  resumeWithRepAnswer,
  runTool,
  runTurn,
  type AgentOptions,
  type ComparisonRecord,
  type RankingRecord,
  type ToolContext,
  type TurnResult,
} from "@strauss/agent";
import {
  checkAgainstReference,
  demoScenarios,
  personaCard,
  type DemoScenario,
  type ReferenceCheck,
  type ReferenceResult,
  type SampleEmployee,
} from "./demo";
import { redactIdNumbers } from "./privacy";

/** השוואה במסך. בהדגמה מצורפת גם הבדיקה מול נטו הייחוס של המארגנים. */
export type ScreenComparison = ComparisonRecord & { reference?: ReferenceCheck };

export interface TranscriptEntry {
  /** employee: העובד כתב · bot: הבוט ענה · notice: הודעת מצב · calc: חישוב מהמסך, בלי הבוט */
  role: "employee" | "bot" | "notice" | "calc";
  text: string;
  comparisons?: ScreenComparison[];
  /** דירוג כל החלופות, לגרף "מה הכי משתלם לי" */
  rankings?: RankingRecord[];
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

type StoredChat = ChatRecord<TranscriptEntry>;

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
  chats: ChatStore<TranscriptEntry>;
  agent?: AgentOptions;
  demo?: DemoScenario[];
}

/**
 * מצב אחד לכל תהליך שרת. נשמר על globalThis כדי לשרוד טעינה מחדש של קוד בזמן פיתוח.
 * כשמבנה השיחות משתנה, מעלים את הגרסה במפתח: השרת מתחיל מזיכרון נקי במקום לקרוס על שיחות במבנה ישן.
 */
export const STATE_KEY = "__straussState_v6";

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
      chats: new ChatStore<TranscriptEntry>(),
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
 * המנעול חי ב-DB (ChatStore), אז זה עובד גם בין כמה שרתים, לא רק בתוך תהליך אחד.
 * חשוב: אסור להוסיף הודעה להיסטוריה בזמן שהבוט באמצע תור, אחרת ההיסטוריה נשברת.
 */
async function withLock<T>(sessionId: string, action: (chat: StoredChat) => Promise<T>): Promise<T> {
  try {
    return await state().chats.withLock(sessionId, action);
  } catch (err) {
    if (err instanceof ChatStoreBusyError) throw new ChatError(409, "הבוט עדיין עונה על ההודעה הקודמת. רגע אחד.");
    if (err instanceof ChatStoreNotFoundError) throw new ChatError(404, "השיחה לא נמצאה. אפשר להתחיל שיחה חדשה.");
    if (err instanceof ChatError) throw err;
    const e = describeAgentError(err);
    console.error("[chat] error:", err);
    throw new ChatError(e.status, e.message);
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
  const session = newSession(randomUUID());
  state().chats.create(session);
  return view({ session, transcript: [] });
}

export async function sendMessage(sessionId: string | null, text: string): Promise<ChatView> {
  const s = state();
  const options = agentOptions(s);
  const id = sessionId && s.chats.get(sessionId) ? sessionId : createChat().sessionId!;
  const safeText = redactIdNumbers(text);
  await withLock(id, async (chat) => {
    chat.transcript.push({ role: "employee", text: safeText, at: now() });
    const result = await runTurn(context(s, chat), safeText, options);
    chat.transcript.push(botEntry(result));
  });
  return view(s.chats.get(id));
}

function botEntry(result: TurnResult): TranscriptEntry {
  return {
    role: "bot",
    text: result.reply,
    comparisons: result.comparisons,
    rankings: result.rankings,
    cars: result.carGroups,
    via: result.via,
    at: now(),
  };
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
  await withLock(sessionId, async (chat) => {
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
  return view(s.chats.get(sessionId));
}

/** דירוג כל החלופות מהמסך, בלי הבוט. הבוט מקבל הודעה עם החלופה המובילה. */
export async function rankFromScreen(sessionId: string, today: unknown): Promise<ChatView> {
  const s = state();
  await withLock(sessionId, async (chat) => {
    const result = await runTool("rank_alternatives", { today }, context(s, chat));
    if (result.ok !== true) throw new ChatError(400, toolProblem(result));
    const best = (result.options as { label: string; diffNet: number }[])[0];
    note(
      chat,
      `[בדיקה מטבלת ההשוואה, לא בצ'אט] העובד ביקש לראות את כל החלופות שלו, מדורגות לפי הנטו. ` +
        (best ? `המובילה: ${best.label}, הפרש ${best.diffNet} ₪ בחודש.` : "אין חלופות שאפשר לחשב."),
    );
    chat.transcript.push({ role: "calc", text: "כל האפשרויות שלך, מהמשתלמת ביותר", rankings: [{ input: { today }, result }], at: now() });
  });
  return view(s.chats.get(sessionId));
}

function scenarios(s: ServerState): DemoScenario[] {
  s.demo ??= demoScenarios(
    loadJson<SampleEmployee[]>("sample-employees.json"),
    loadJson<ReferenceResult[]>("reference-results.json"),
    s.catalog,
  );
  return s.demo;
}

/** הקשר זמני לחישוב בלי שיחה, באותם כלים */
function scratchContext(s: ServerState): ToolContext {
  return { session: newSession(randomUUID()), rules: s.rules, catalog: s.catalog, occupations: s.occupations, data: s.data, rep: s.rep };
}

/**
 * העובדים לדוגמה למסך הפתיחה, ובדיקה חיה: כל אחד מחושב עכשיו ונבדק מול נטו הייחוס של המארגנים.
 */
export async function getDemo() {
  const s = state();
  const all = scenarios(s);
  let matched = 0;
  for (const sc of all) {
    const ctx = scratchContext(s);
    await runTool("save_employee_profile", sc.profile, ctx);
    const result = await runTool("calculate_comparison", { today: sc.today, alternative: sc.alternative }, ctx);
    if (result.ok === true && checkAgainstReference(result, sc.reference).matches) matched++;
  }
  return { personas: all.map((sc) => personaCard(sc, s.catalog)), verified: { matched, total: all.length } };
}

/**
 * מתחיל שיחה עם עובד לדוגמה: הנתונים נשמרים, והשאלה שלו מחושבת מיד, בלי לחכות למודל שפה.
 * הבוט מקבל הודעה עם כל מה שהוצג, כדי שהשיחה תוכל להמשיך מכאן.
 */
export async function startDemo(personaId: string): Promise<ChatView> {
  const s = state();
  const sc = scenarios(s).find((x) => x.employee.id === personaId);
  if (!sc) throw new ChatError(404, "העובד לדוגמה לא נמצא");
  const id = createChat().sessionId!;
  const e = sc.employee;
  await withLock(id, async (chat) => {
    const ctx = context(s, chat);
    const saved = await runTool("save_employee_profile", sc.profile, ctx);
    if (saved.ok !== true) throw new ChatError(400, toolProblem(saved));
    const comparison = await runTool("calculate_comparison", { today: sc.today, alternative: sc.alternative }, ctx);
    if (comparison.ok !== true) throw new ChatError(400, toolProblem(comparison));
    const ranking = await runTool("rank_alternatives", { today: sc.today }, ctx);
    const reference = checkAgainstReference(comparison, sc.reference);

    chat.transcript.push(
      { role: "notice", text: `הדגמה: ${e.name}, ${e.occupation}, קבוצה ${e.group}`, at: now() },
      { role: "employee", text: e.question, at: now() },
      {
        role: "calc",
        text: `חישוב מיידי לפי הנתונים של ${e.name}`,
        comparisons: [{ input: { today: sc.today, alternative: sc.alternative }, result: comparison, reference }],
        rankings: ranking.ok === true ? [{ input: { today: sc.today }, result: ranking }] : [],
        at: now(),
      },
    );

    const t = comparison.today as { label: string; net: number };
    const a = comparison.alternative as { label: string; net: number } | null;
    const best = ranking.ok === true ? (ranking.options as { label: string; diffNet: number }[])[0] : undefined;
    note(
      chat,
      `[הדגמה מהמסך, לא בצ'אט] נבחר העובד לדוגמה "${e.name}" (${e.occupation}) מהקובץ של המארגנים. ` +
        `הנתונים שלו כבר נשמרו. המצב היום: ${t.label}${sc.today.kind === "car" ? `, השתתפות ${sc.today.participation} ₪` : ""}. ` +
        `השאלה שלו: "${e.question}". ` +
        (a
          ? `המסך כבר הציג את ההשוואה: נטו היום ${t.net} ₪, עם ${a.label} ${a.net} ₪, הפרש ${comparison.diffNet} ₪ בחודש (ההשתתפות ברכב החדש לפי ההשתתפות הרגילה בקטלוג). `
          : "") +
        (best ? `המסך הציג גם דירוג של כל החלופות. המובילה: ${best.label}, הפרש ${best.diffNet} ₪. ` : "") +
        "אם העובד ממשיך לשאול, המשך מכאן.",
    );
  });
  return view(s.chats.get(id));
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

/** מה העובד אישר מתוך תלוש שכר, מעבר לנתוני השכר */
export interface PayslipConfirmation {
  /** ההשתתפות שלו ברכב היום, כמו שמופיעה בתלוש ואושרה */
  carParticipation?: number;
  /** שווי השימוש של הרכב היום, כמו שמופיע בתלוש */
  carValueOfUse?: number;
}

/**
 * תיקון נתונים מהטופס או מתלוש שאושר. נבדק באותו כלי שהבוט משתמש בו, והבוט מקבל הודעה על השינוי.
 * בלי מזהה שיחה נפתחת שיחה חדשה, למשל כשמעלים תלוש לפני ההודעה הראשונה.
 */
export async function updateProfile(
  sessionId: string | null,
  patch: Record<string, unknown>,
  payslip?: PayslipConfirmation,
): Promise<ChatView> {
  const s = state();
  const id = sessionId ?? createChat().sessionId!;
  await withLock(id, async (chat) => {
    const result = await runTool("save_employee_profile", patch, context(s, chat));
    if (result.ok !== true) throw new ChatError(400, toolProblem(result));
    const changed = Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${PROFILE_LABELS[k] ?? k}: ${String(v)}`)
      .join(", ");
    if (payslip) {
      const car = [
        payslip.carParticipation !== undefined ? `ההשתתפות שלו ברכב היום: ${payslip.carParticipation} ₪` : "",
        payslip.carValueOfUse !== undefined ? `שווי השימוש של הרכב היום לפי התלוש: ${payslip.carValueOfUse} ₪` : "",
      ].filter(Boolean);
      note(
        chat,
        `[עדכון מטופס הנתונים, לא בצ'אט] העובד העלה תלוש שכר ואישר את הנתונים שנקראו ממנו: ${changed}. ` +
          (car.length ? `הוא אישר גם: ${car.join("; ")}. ` : "") +
          "הנתונים כבר נשמרו, ואין צורך לשאול עליהם שוב. עדיין צריך לברר מה שלא מופיע בתלוש, למשל קבוצת הזכאות ואיזה רכב יש לו היום.",
      );
      chat.transcript.push({ role: "notice", text: "הנתונים מהתלוש נשמרו. התלוש עצמו לא נשמר.", at: now() });
    } else {
      note(chat, `[עדכון מטופס הנתונים, לא בצ'אט] העובד עדכן את הנתונים שלו: ${changed}. הנתונים כבר נשמרו.`);
      chat.transcript.push({ role: "notice", text: "הנתונים עודכנו", at: now() });
    }
  });
  return view(s.chats.get(id));
}

/**
 * קורא תלוש שכר ומחזיר את מה שנקרא, לאישור העובד. לא שומר כלום: לא את התלוש ולא את הנתונים.
 */
export async function readPayslip(data: Uint8Array, mimeType: string): Promise<PayslipReading> {
  if (!(PAYSLIP_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new ChatError(415, "אפשר להעלות תלוש כקובץ PDF או כתמונה (JPG או PNG).");
  }
  if (data.byteLength > PAYSLIP_MAX_BYTES) throw new ChatError(413, "הקובץ גדול מדי. אפשר להעלות קובץ עד 8MB.");
  const read = payslipReaderFromEnv(process.env);
  if (!read) {
    throw new ChatError(
      503,
      "קריאת תלוש צריכה מפתח של Gemini או של OpenRouter בקובץ apps/web/.env. בינתיים אפשר לכתוב את הנתונים בצ'אט.",
    );
  }
  try {
    return await read({ data: Buffer.from(data).toString("base64"), mimeType });
  } catch (err) {
    if (err instanceof NotAPayslipError) throw new ChatError(422, err.message);
    if (err instanceof PayslipReadError) throw new ChatError(503, err.message);
    console.error("[payslip] read failed:", err instanceof Error ? err.message.slice(0, 300) : "unknown");
    throw new ChatError(500, "לא הצלחתי לקרוא את התלוש. נסו שוב, או כתבו את הנתונים בצ'אט.");
  }
}

/** בשביל מסך הנציג: כל השאלות הפתוחות מכל השיחות */
export function listOpenRepQuestions() {
  return state()
    .chats.all()
    .flatMap((chat) => chat.session.pendingQuestions.map((q) => ({ sessionId: chat.session.id, ...q })));
}

/** בשביל מסך הנציג: היסטוריית השאלות שכבר נענו, מכל השיחות, החדשות קודם */
export function listRepHistory() {
  return state()
    .chats.all()
    .flatMap((chat) => chat.session.repAnswers.map((a) => ({ sessionId: chat.session.id, ...a })))
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
}

/** בשביל מסך הנציג: הנציג ענה, והשיחה של העובד ממשיכה מאותה נקודה */
export async function answerRepQuestion(sessionId: string, ticketId: string, answer: string): Promise<ChatView> {
  const s = state();
  const options = agentOptions(s);
  const safeAnswer = redactIdNumbers(answer);
  await withLock(sessionId, async (chat) => {
    chat.transcript.push({ role: "notice", text: `הנציג ענה: ${safeAnswer}`, at: now() });
    const result = await resumeWithRepAnswer(context(s, chat), ticketId, safeAnswer, options);
    chat.transcript.push(botEntry(result));
  });
  return view(s.chats.get(sessionId));
}
