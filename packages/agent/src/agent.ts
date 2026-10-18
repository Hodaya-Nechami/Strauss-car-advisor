/**
 * נקודת הכניסה של הבוט, בלי תלות במודל.
 * free: שרשרת ספקים חינמיים (Gemini, Cohere, Mistral, OpenRouter, Groq) שמחליפים זה את זה כשהמכסה נגמרת.
 * claude: Claude בתשלום. נבחר רק אם הוגדר לו מפתח ואין מפתחות חינמיים, או אם LLM_PROVIDER=claude.
 * בכל המצבים: אותם כלים ואותו מנוע.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError } from "@google/genai";
import {
  DEFAULT_EFFORT,
  EFFORTS,
  appendClaudeRepAnswer,
  continueClaude,
  createClaudeClient,
  type ClaudeOptions,
  type Effort,
} from "./claude";
import {
  AllProvidersFailedError,
  ProviderHealth,
  appendFreeRepAnswer,
  continueFree,
  createFreeProviders,
  parseGeminiError,
  providerErrorDetail,
  type FailureKind,
  type FreeOptions,
} from "./free";
import type { Mode, SessionState } from "./session";
import type { ToolContext } from "./tools";
import type { TurnResult } from "./turn";

export type AgentOptions = ClaudeOptions | FreeOptions;

export class MissingApiKeyError extends Error {}

export class ProviderMismatchError extends Error {
  constructor() {
    super("השיחה הזו התחילה עם מודל אחר. התחילו שיחה חדשה.");
  }
}

export function modeOf(opts: AgentOptions): Mode {
  return opts.mode === "free" ? "free" : "claude";
}

function bindMode(session: SessionState, mode: Mode) {
  if (!session.mode) session.mode = mode;
  else if (session.mode !== mode) throw new ProviderMismatchError();
}

/**
 * הודעה בשם העובד, למשל מה שכתב בצ'אט או עדכון מטופס הנתונים.
 * נכנסת להיסטוריה של המצב שהשיחה התחילה בו.
 */
export function appendUserNote(session: SessionState, text: string, fallbackMode: Mode) {
  const mode = session.mode ?? fallbackMode;
  session.mode = mode;
  if (mode === "free") session.log.push({ role: "user", text });
  else session.messages.push({ role: "user", content: text });
}

/** הודעה חדשה מהעובד */
export async function runTurn(ctx: ToolContext, userText: string, opts: AgentOptions): Promise<TurnResult> {
  const mode = modeOf(opts);
  bindMode(ctx.session, mode);
  appendUserNote(ctx.session, userText, mode);
  return opts.mode === "free" ? continueFree(ctx, opts) : continueClaude(ctx, opts);
}

/**
 * הנציג ענה על שאלה פתוחה. התשובה נשמרת, והבוט ממשיך מאותה נקודה.
 * מסך הנציג (משימה N7 של נחמי) קורא לפונקציה הזו.
 */
export async function resumeWithRepAnswer(
  ctx: ToolContext,
  ticketId: string,
  answer: string,
  opts: AgentOptions,
): Promise<TurnResult> {
  const idx = ctx.session.pendingQuestions.findIndex((q) => q.ticketId === ticketId);
  if (idx === -1) throw new Error(`אין פנייה פתוחה בשם ${ticketId}`);
  bindMode(ctx.session, modeOf(opts));
  const [question] = ctx.session.pendingQuestions.splice(idx, 1);
  const record = { ...question!, answer, answeredAt: new Date().toISOString() };
  ctx.session.repAnswers.push(record);

  if (opts.mode === "free") {
    appendFreeRepAnswer(ctx, record);
    return continueFree(ctx, opts);
  }
  appendClaudeRepAnswer(ctx, record);
  return continueClaude(ctx, opts);
}

const FREE_KEYS = ["GEMINI_API_KEY", "COHERE_API_KEY", "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"] as const;

/** באיזה מצב לעבוד לפי הסביבה. מפתחות חינמיים קודמים ל-Claude, אלא אם LLM_PROVIDER=claude. */
export function resolveMode(env: Record<string, string | undefined>): Mode | null {
  if (env.LLM_PROVIDER?.trim().toLowerCase() === "claude") return "claude";
  if (FREE_KEYS.some((k) => env[k])) return "free";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

const NO_KEY_HELP =
  "חסר מפתח API. הדרך החינמית: מפתח של Gemini מהאתר aistudio.google.com, בלי כרטיס אשראי. " +
  "כתבו אותו בקובץ apps/web/.env בשורה GEMINI_API_KEY=המפתח, והפעילו את השרת מחדש. " +
  "אפשר להוסיף גם מפתחות של Cohere, Mistral ו-OpenRouter, והבוט יעבור ביניהם לבד כשהמכסה נגמרת.";

/** בונה את הגדרות הבוט מהסביבה, כולל הלקוחות של המודלים */
export function createAgentOptionsFromEnv(env: Record<string, string | undefined> = process.env): AgentOptions {
  const mode = resolveMode(env);
  if (mode === "free") {
    return { mode: "free", providers: createFreeProviders(env), health: new ProviderHealth() };
  }
  if (mode === "claude") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new MissingApiKeyError("LLM_PROVIDER מוגדר ל-claude, אבל חסר ANTHROPIC_API_KEY בקובץ apps/web/.env.");
    }
    const effort = EFFORTS.includes(env.CLAUDE_EFFORT as Effort) ? (env.CLAUDE_EFFORT as Effort) : DEFAULT_EFFORT;
    return { mode: "claude", client: createClaudeClient(), model: env.CLAUDE_MODEL || undefined, effort };
  }
  throw new MissingApiKeyError(NO_KEY_HELP);
}

const FAILURE_WORDS: Record<FailureKind, string> = {
  rate: "הגיע למכסה",
  server: "לא זמין כרגע",
  auth: "המפתח לא תקין",
  bad_request: "דחה את הבקשה",
  filtered: "חסום על ידי סינון האינטרנט",
};

/** מתרגם שגיאה מהמודל להודעה בעברית ולקוד HTTP. מהספציפי לכללי. */
export function describeAgentError(err: unknown): { status: number; message: string } {
  if (err instanceof MissingApiKeyError) return { status: 503, message: err.message };
  if (err instanceof ProviderMismatchError) return { status: 409, message: err.message };

  // שרשרת הספקים החינמיים
  if (err instanceof AllProvidersFailedError) {
    if (err.failures.every((f) => f.kind === "rate")) {
      const names = err.failures.map((f) => f.provider).join(", ");
      return {
        status: 429,
        message: `כל המפתחות החינמיים הגיעו למכסה כרגע (${names}). חכו דקה ונסו שוב. אם נגמרה המכסה היומית, היא מתחדשת מחר.`,
      };
    }
    const details = err.failures
      .map((f) => `${f.provider} ${FAILURE_WORDS[f.kind]}${f.kind === "bad_request" ? ` (${providerErrorDetail(f.error)})` : ""}`)
      .join(", ");
    const filterHint = err.failures.some((f) => f.kind === "filtered")
      ? " ספק שחסום בסינון האינטרנט אפשר לבקש לפתוח אצל ספק הסינון, למשל נטפרי."
      : "";
    return {
      status: 503,
      message: `אף ספק לא הצליח לענות: ${details}. בדקו את המפתחות בקובץ apps/web/.env ונסו שוב.${filterHint}`,
    };
  }

  // Gemini, כשהשגיאה לא עברה דרך השרשרת
  if (err instanceof GeminiApiError) {
    const details = parseGeminiError(err.message);
    if (details.reasons.includes("API_KEY_INVALID")) {
      return { status: 401, message: "מפתח ה-API של Gemini לא תקין. בדקו את GEMINI_API_KEY בקובץ apps/web/.env." };
    }
    if (err.status === 429) {
      return { status: 429, message: "עברנו את המכסה החינמית של Gemini. חכו דקה ונסו שוב." };
    }
    if (err.status === 400) return { status: 400, message: `Gemini דחה את הבקשה: ${details.message ?? "סיבה לא ידועה"}` };
    return { status: 502, message: `שגיאה מ-Gemini (קוד ${err.status}). נסו שוב.` };
  }

  // Claude
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "מפתח ה-API של Claude לא תקין. בדקו את ANTHROPIC_API_KEY בקובץ apps/web/.env." };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, message: "למפתח ה-API אין הרשאה למודל הזה. בדקו את החשבון ב-Anthropic." };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "יש כרגע יותר מדי בקשות ל-Claude. נסו שוב בעוד רגע." };
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: `Claude דחה את הבקשה: ${err.message}` };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, message: "אין חיבור ל-Claude. בדקו את החיבור לאינטרנט." };
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: `שגיאה מ-Claude (קוד ${err.status}). נסו שוב.` };
  }
  return { status: 500, message: "שגיאה פנימית. נסו שוב." };
}
