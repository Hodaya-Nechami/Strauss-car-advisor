/**
 * נקודת הכניסה של הבוט, בלי תלות במודל.
 * Gemini (חינם) או Claude (בתשלום) נבחרים לפי מפתח ה-API שהוגדר. אותם כלים ואותו מנוע בשניהם.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ApiError } from "@google/genai";
import {
  DEFAULT_EFFORT,
  EFFORTS,
  appendClaudeRepAnswer,
  continueClaude,
  createClaudeClient,
  type ClaudeOptions,
  type Effort,
} from "./claude";
import { appendGeminiRepAnswer, continueGemini, createGeminiClient, geminiUserContent, type GeminiOptions } from "./gemini";
import type { Provider, SessionState } from "./session";
import type { ToolContext } from "./tools";
import type { TurnResult } from "./turn";

export type AgentOptions = ClaudeOptions | GeminiOptions;

export class MissingApiKeyError extends Error {}

export class ProviderMismatchError extends Error {
  constructor() {
    super("השיחה הזו התחילה עם מודל אחר. התחילו שיחה חדשה.");
  }
}

export function providerOf(opts: AgentOptions): Provider {
  return opts.provider === "gemini" ? "gemini" : "claude";
}

function bindProvider(session: SessionState, provider: Provider) {
  if (!session.provider) session.provider = provider;
  else if (session.provider !== provider) throw new ProviderMismatchError();
}

/**
 * הודעה בשם העובד שלא נכתבה בצ'אט, למשל עדכון מטופס הנתונים.
 * נכנסת להיסטוריה של המודל שהשיחה התחילה איתו.
 */
export function appendUserNote(session: SessionState, text: string, fallbackProvider: Provider) {
  const provider = session.provider ?? fallbackProvider;
  session.provider = provider;
  if (provider === "gemini") session.geminiContents.push(geminiUserContent(text));
  else session.messages.push({ role: "user", content: text });
}

/** הודעה חדשה מהעובד */
export async function runTurn(ctx: ToolContext, userText: string, opts: AgentOptions): Promise<TurnResult> {
  const provider = providerOf(opts);
  bindProvider(ctx.session, provider);
  appendUserNote(ctx.session, userText, provider);
  return opts.provider === "gemini" ? continueGemini(ctx, opts) : continueClaude(ctx, opts);
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
  bindProvider(ctx.session, providerOf(opts));
  const [question] = ctx.session.pendingQuestions.splice(idx, 1);
  const record = { ...question!, answer, answeredAt: new Date().toISOString() };
  ctx.session.repAnswers.push(record);

  if (opts.provider === "gemini") {
    appendGeminiRepAnswer(ctx, record);
    return continueGemini(ctx, opts);
  }
  appendClaudeRepAnswer(ctx, record);
  return continueClaude(ctx, opts);
}

/** איזה מודל להפעיל לפי הסביבה. LLM_PROVIDER קובע אם הוגדר. אחרת: Gemini אם יש לו מפתח, ואז Claude. */
export function resolveProvider(env: Record<string, string | undefined>): Provider | null {
  const wanted = env.LLM_PROVIDER?.trim().toLowerCase();
  if (wanted === "gemini" || wanted === "claude") return wanted;
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

const NO_KEY_HELP =
  "חסר מפתח API. הדרך החינמית: מפתח של Gemini מהאתר aistudio.google.com, בלי כרטיס אשראי. " +
  "כתבו אותו בקובץ apps/web/.env.local בשורה GEMINI_API_KEY=המפתח, והפעילו את השרת מחדש.";

/** בונה את הגדרות הבוט מהסביבה, כולל הלקוח של המודל */
export function createAgentOptionsFromEnv(env: Record<string, string | undefined> = process.env): AgentOptions {
  const provider = resolveProvider(env);
  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new MissingApiKeyError("LLM_PROVIDER מוגדר ל-gemini, אבל חסר GEMINI_API_KEY. " + NO_KEY_HELP);
    return { provider: "gemini", client: createGeminiClient(env.GEMINI_API_KEY), model: env.GEMINI_MODEL || undefined };
  }
  if (provider === "claude") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new MissingApiKeyError("LLM_PROVIDER מוגדר ל-claude, אבל חסר ANTHROPIC_API_KEY בקובץ apps/web/.env.local.");
    }
    const effort = EFFORTS.includes(env.CLAUDE_EFFORT as Effort) ? (env.CLAUDE_EFFORT as Effort) : DEFAULT_EFFORT;
    return { provider: "claude", client: createClaudeClient(), model: env.CLAUDE_MODEL || undefined, effort };
  }
  throw new MissingApiKeyError(NO_KEY_HELP);
}

/** גוף השגיאה של Google מגיע כ-JSON בתוך ההודעה. מוציאים ממנו את ההסבר ואת קוד הסיבה. */
function parseGeminiError(raw: string): { message?: string; reasons: string[] } {
  try {
    const body = JSON.parse(raw) as { error?: { message?: string; details?: { reason?: string }[] } };
    return {
      message: body.error?.message,
      reasons: (body.error?.details ?? []).map((d) => d.reason).filter((r): r is string => typeof r === "string"),
    };
  } catch {
    return { message: raw, reasons: [] };
  }
}

/** מתרגם שגיאה מהמודל להודעה בעברית ולקוד HTTP. מהספציפי לכללי. */
export function describeAgentError(err: unknown): { status: number; message: string } {
  if (err instanceof MissingApiKeyError) return { status: 503, message: err.message };
  if (err instanceof ProviderMismatchError) return { status: 409, message: err.message };

  // Gemini
  if (err instanceof ApiError) {
    const details = parseGeminiError(err.message);
    if (details.reasons.includes("API_KEY_INVALID")) {
      return { status: 401, message: "מפתח ה-API של Gemini לא תקין. בדקו את GEMINI_API_KEY בקובץ apps/web/.env.local." };
    }
    if (err.status === 429) {
      return {
        status: 429,
        message: "עברנו את המכסה החינמית של Gemini. חכו דקה ונסו שוב. אם נגמרה המכסה היומית, היא מתחדשת מחר.",
      };
    }
    if (err.status === 401 || err.status === 403) {
      return { status: 403, message: "אין הרשאה. בדקו את GEMINI_API_KEY בקובץ apps/web/.env.local." };
    }
    if (err.status === 400) return { status: 400, message: `Gemini דחה את הבקשה: ${details.message ?? "סיבה לא ידועה"}` };
    if (err.status >= 500) return { status: 503, message: "Gemini עמוס כרגע. נסו שוב בעוד רגע." };
    return { status: 502, message: `שגיאה מ-Gemini (קוד ${err.status}). נסו שוב.` };
  }

  // Claude
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: "מפתח ה-API של Claude לא תקין. בדקו את ANTHROPIC_API_KEY בקובץ .env.local." };
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
