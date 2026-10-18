/**
 * שרשרת הספקים החינמיים: Gemini, Groq ו-OpenRouter.
 *
 * - ההיסטוריה נשמרת בפורמט שלנו (session.log), ומתורגמת לפורמט של כל ספק בכל בקשה.
 *   לכן אפשר לעבור ספק באמצע שיחה, ואפילו באמצע חישוב.
 * - ספק שנכשל, למשל כי נגמרה המכסה, מקבל זמן המתנה, והבקשה עוברת מיד לספק הבא בתור.
 *   כשזמן ההמתנה עובר, חוזרים אליו לפי הסדר.
 * - מפתח אחד לכל ספק. לא מחליפים בין כמה מפתחות של אותו ספק כדי לעקוף את המכסה שלו.
 */
import { ApiError as GeminiApiError, FinishReason, GoogleGenAI, type Content, type Part } from "@google/genai";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./prompt";
import { geminiFunctionDeclarations, openAITools } from "./schemas";
import type { LogEntry, LoggedCall, LoggedResult, RepAnswerRecord } from "./session";
import type { ToolContext } from "./tools";
import { TurnCollector, type TurnResult } from "./turn";

export type FreeProviderName = "gemini" | "groq" | "openrouter";

/** תשובת מודל אחרי נרמול: אותה צורה מכל ספק */
export interface ModelReply {
  text?: string;
  calls: LoggedCall[];
  finish: "stop" | "tool_calls" | "length" | "blocked" | "malformed";
  geminiParts?: Part[];
}

export interface FreeProvider {
  name: FreeProviderName;
  /** השם שמוצג לעובד */
  label: string;
  model: string;
  generate(log: LogEntry[], newCallId: () => string): Promise<ModelReply>;
}

const REQUEST_TIMEOUT_MS = 60_000;

/* ------------------------------ Gemini ------------------------------ */

export type GeminiClient = Pick<GoogleGenAI, "models">;
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const GEMINI_BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/** ההיסטוריה בפורמט של Gemini. תשובות ש-Gemini כתב נשלחות בדיוק כמו שהתקבלו. */
export function toGeminiContents(log: LogEntry[]): Content[] {
  const contents: Content[] = [];
  let lastModel: Extract<LogEntry, { role: "model" }> | undefined;
  for (const entry of log) {
    if (entry.role === "user") {
      contents.push({ role: "user", parts: [{ text: entry.text }] });
    } else if (entry.role === "model") {
      lastModel = entry;
      contents.push({
        role: "model",
        parts: entry.geminiParts ?? [
          ...(entry.text ? [{ text: entry.text }] : []),
          ...entry.calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
        ],
      });
    } else {
      contents.push({
        role: "user",
        parts: entry.results.map((r) => {
          // מזהה מקורי רק לקריאה ש-Gemini עצמו כתב ונתן לה מזהה
          const original = lastModel?.geminiParts ? lastModel.calls.find((c) => c.id === r.id)?.providerId : undefined;
          return { functionResponse: { ...(original ? { id: original } : {}), name: r.name, response: r.output } };
        }),
      });
    }
  }
  return contents;
}

export function geminiProvider(client: GeminiClient, model = DEFAULT_GEMINI_MODEL): FreeProvider {
  return {
    name: "gemini",
    label: "Gemini",
    model,
    async generate(log, newCallId) {
      const response = await client.models.generateContent({
        model,
        contents: toGeminiContents(log),
        config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: geminiFunctionDeclarations }] },
      });
      const candidate = response.candidates?.[0];
      const finish = candidate?.finishReason;
      if (response.promptFeedback?.blockReason || (finish && GEMINI_BLOCKED.has(finish))) {
        return { calls: [], finish: "blocked" };
      }
      if (finish === FinishReason.MALFORMED_FUNCTION_CALL) return { calls: [], finish: "malformed" };

      const parts = candidate?.content?.parts ?? [];
      const calls: LoggedCall[] = parts
        .filter((p) => p.functionCall)
        .map((p) => ({
          id: newCallId(),
          ...(p.functionCall!.id ? { providerId: p.functionCall!.id } : {}),
          name: p.functionCall!.name ?? "",
          args: p.functionCall!.args ?? {},
        }));
      const text = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      return {
        ...(text ? { text } : {}),
        calls,
        finish: finish === FinishReason.MAX_TOKENS ? "length" : calls.length ? "tool_calls" : "stop",
        ...(parts.length ? { geminiParts: parts } : {}),
      };
    },
  };
}

/* ----------------------- Groq ו-OpenRouter (פורמט OpenAI) ----------------------- */

export type OpenAICompatClient = Pick<OpenAI, "chat">;
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_OPENROUTER_MODEL = "google/gemma-4-31b-it:free";

/** ההיסטוריה בפורמט של OpenAI. בלי השדה name בהודעות, כי Groq דוחה אותו. */
export function toOpenAIMessages(log: LogEntry[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const entry of log) {
    if (entry.role === "user") {
      messages.push({ role: "user", content: entry.text });
    } else if (entry.role === "model") {
      messages.push({
        role: "assistant",
        content: entry.text ?? null,
        ...(entry.calls.length
          ? {
              tool_calls: entry.calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.args) },
              })),
            }
          : {}),
      });
    } else {
      for (const r of entry.results) {
        messages.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.output) });
      }
    }
  }
  return messages;
}

export function openAICompatProvider(
  name: "groq" | "openrouter",
  label: string,
  client: OpenAICompatClient,
  model: string,
): FreeProvider {
  return {
    name,
    label,
    model,
    async generate(log, newCallId) {
      const response = await client.chat.completions.create({
        model,
        messages: toOpenAIMessages(log),
        tools: openAITools,
        tool_choice: "auto",
      });
      const choice = response.choices[0];
      if (!choice) return { calls: [], finish: "stop" };
      if (choice.finish_reason === "content_filter") return { calls: [], finish: "blocked" };

      const calls: LoggedCall[] = [];
      for (const toolCall of choice.message.tool_calls ?? []) {
        if (toolCall.type !== "function") continue;
        let args: unknown;
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          return { calls: [], finish: "malformed" };
        }
        if (!args || typeof args !== "object" || Array.isArray(args)) return { calls: [], finish: "malformed" };
        calls.push({ id: newCallId(), name: toolCall.function.name, args: args as Record<string, unknown> });
      }
      const text = choice.message.content?.trim();
      return {
        ...(text ? { text } : {}),
        calls,
        finish: choice.finish_reason === "length" ? "length" : calls.length ? "tool_calls" : "stop",
      };
    },
  };
}

/* ------------------------------ החלפת ספקים ------------------------------ */

/**
 * rate: נגמרה המכסה · server: הספק לא זמין · auth: מפתח לא תקין · bad_request: הספק דחה את הבקשה
 * filtered: סינון אינטרנט (כמו נטפרי) חוסם את הכתובת של הספק. נטפרי מחזיר קוד 418 ודף חסימה.
 */
export type FailureKind = "rate" | "server" | "auth" | "bad_request" | "filtered";

/** גוף השגיאה של Google מגיע כ-JSON בתוך ההודעה. מוציאים ממנו את ההסבר ואת קודי הסיבה. */
export function parseGeminiError(raw: string): { message?: string; reasons: string[] } {
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

function kindByStatus(status: number): FailureKind {
  if (status === 429) return "rate";
  if (status === 418) return "filtered";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "server";
  return "bad_request";
}

/** איזו תקלה של ספק זו. null = לא תקלה של ספק אלא באג אצלנו, ואותו לא מסתירים. */
export function classifyProviderError(err: unknown): FailureKind | null {
  if (err instanceof GeminiApiError) {
    return parseGeminiError(err.message).reasons.includes("API_KEY_INVALID") ? "auth" : kindByStatus(err.status);
  }
  if (err instanceof OpenAI.APIError) return typeof err.status === "number" ? kindByStatus(err.status) : "server";
  // תקלת רשת (fetch failed)
  if (err instanceof TypeError && /fetch/i.test(err.message)) return "server";
  return null;
}

const COOLDOWN_MS: Record<FailureKind, number> = {
  rate: 60_000,
  server: 30_000,
  auth: 30 * 60_000,
  bad_request: 5 * 60_000,
  filtered: 30 * 60_000,
};
const MAX_COOLDOWN_MS = 60 * 60_000;

/** זוכר אילו ספקים נכשלו לאחרונה, ועד מתי לא לפנות אליהם. אחד לכל תהליך שרת. */
export class ProviderHealth {
  private state = new Map<string, { until: number; strikes: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  isCooling(name: string): boolean {
    const s = this.state.get(name);
    return !!s && s.until > this.now();
  }

  failed(name: string, kind: FailureKind) {
    const strikes = (this.state.get(name)?.strikes ?? 0) + 1;
    const base = COOLDOWN_MS[kind];
    // כישלון חוזר מאריך את ההמתנה, עד שעה
    const ms = kind === "rate" || kind === "server" ? Math.min(base * 2 ** (strikes - 1), MAX_COOLDOWN_MS) : base;
    this.state.set(name, { until: this.now() + ms, strikes });
  }

  succeeded(name: string) {
    this.state.delete(name);
  }

  /** סדר הניסיון: ספקים זמינים לפי הסדר שהוגדר, ואחריהם ספקים בהמתנה, מי שמתפנה ראשון קודם */
  order<T extends { name: string }>(providers: T[]): T[] {
    const ready = providers.filter((p) => !this.isCooling(p.name));
    const cooling = providers
      .filter((p) => this.isCooling(p.name))
      .sort((a, b) => this.state.get(a.name)!.until - this.state.get(b.name)!.until);
    return [...ready, ...cooling];
  }
}

export interface ProviderFailure {
  provider: string;
  kind: FailureKind;
  error: unknown;
}

export class AllProvidersFailedError extends Error {
  constructor(readonly failures: ProviderFailure[]) {
    super(`All free providers failed: ${failures.map((f) => `${f.provider}=${f.kind}`).join(", ")}`);
  }
}

export interface FreeOptions {
  mode: "free";
  /** לפי סדר העדיפות */
  providers: FreeProvider[];
  health: ProviderHealth;
  maxToolRounds?: number;
  /** ההמתנה הראשונה לפני ניסיון חוזר באותו ספק, במילישניות. מוכפלת בכל ניסיון. */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callModel(
  opts: FreeOptions,
  log: LogEntry[],
  newCallId: () => string,
): Promise<{ reply: ModelReply; provider: FreeProvider }> {
  const { providers, health, retryDelayMs = 2000 } = opts;
  const failures: ProviderFailure[] = [];
  const onlyOne = providers.length === 1;

  for (const provider of health.order(providers)) {
    for (let attempt = 0; ; attempt++) {
      try {
        const reply = await provider.generate(log, newCallId);
        health.succeeded(provider.name);
        return { reply, provider };
      } catch (err) {
        const kind = classifyProviderError(err);
        if (!kind) throw err;
        // כשיש רק ספק אחד, מחכים ומנסים שוב. כשיש עוד ספקים, עוברים מיד לבא בתור.
        const retries = onlyOne ? (kind === "rate" || kind === "server" ? 3 : 0) : kind === "server" ? 1 : 0;
        if (attempt < retries) {
          await sleep(retryDelayMs * 2 ** attempt);
          continue;
        }
        health.failed(provider.name, kind);
        failures.push({ provider: provider.label, kind, error: err });
        console.warn(`[agent] ${provider.label} failed (${kind}); trying the next provider`);
        break;
      }
    }
  }
  throw new AllProvidersFailedError(failures);
}

/** תשובת נציג: רק עדכון שהיא הגיעה. את התשובה עצמה הבוט קורא מהכלי get_rep_answers, שעובד לא יכול לזייף. */
export function appendFreeRepAnswer(ctx: ToolContext, answer: RepAnswerRecord) {
  ctx.session.log.push({
    role: "user",
    text:
      `[עדכון אוטומטי מהמערכת: הנציג ענה על פנייה ${answer.ticketId}. ` +
      "קרא את התשובה עם get_rep_answers, עדכן את החישוב לפיה, והצג לעובד את ההשוואה המעודכנת.]",
  });
}

export async function continueFree(ctx: ToolContext, opts: FreeOptions): Promise<TurnResult> {
  if (opts.providers.length === 0) throw new Error("no free providers configured");
  const { maxToolRounds = 8 } = opts;
  const log = ctx.session.log;
  const turn = new TurnCollector(ctx);
  let seq = log.reduce((n, e) => n + (e.role === "model" ? e.calls.length : 0), 0);
  const newCallId = () => `call_${++seq}`;

  for (let round = 0; round <= maxToolRounds; round++) {
    const { reply, provider } = await callModel(opts, log, newCallId);
    turn.answeredBy(provider.label);

    // תשובה חסומה: לא שומרים ולא מריצים כלים
    if (reply.finish === "blocked") return turn.finish("refused");
    // קריאה לכלי שנכתבה לא תקין: מבקשים שוב, בלי לשמור את הניסיון הפגום
    if (reply.finish === "malformed") continue;
    // קריאה לכלי שנקטעה באמצע לא מריצים ולא שומרים
    if (reply.finish === "length" && reply.calls.length) return turn.finish("truncated");
    if (!reply.text && reply.calls.length === 0) return turn.finish(reply.finish === "length" ? "truncated" : "done");

    log.push({
      role: "model",
      provider: provider.name,
      ...(reply.text ? { text: reply.text } : {}),
      calls: reply.calls,
      ...(reply.geminiParts ? { geminiParts: reply.geminiParts } : {}),
    });
    if (reply.text) turn.addText(reply.text);
    if (reply.calls.length === 0) return turn.finish(reply.finish === "length" ? "truncated" : "done");

    // מריצים לפי הסדר, ושומרים את כל התוצאות של הסבב יחד
    const results: LoggedResult[] = [];
    for (const call of reply.calls) {
      results.push({ id: call.id, name: call.name, output: await turn.runTool(call.name, call.args) });
    }
    log.push({ role: "tools", results });
  }

  return turn.finish("too_many_steps");
}

/** הספקים שיש להם מפתח, לפי הסדר: Gemini, Groq, OpenRouter. LLM_PROVIDER יכול להקדים אחד מהם. */
export function createFreeProviders(env: Record<string, string | undefined>): FreeProvider[] {
  const providers: FreeProvider[] = [];
  if (env.GEMINI_API_KEY) {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
    providers.push(geminiProvider(client, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL));
  }
  if (env.GROQ_API_KEY) {
    const client = new OpenAI({ apiKey: env.GROQ_API_KEY, baseURL: GROQ_BASE_URL, maxRetries: 0, timeout: REQUEST_TIMEOUT_MS });
    providers.push(openAICompatProvider("groq", "Groq", client, env.GROQ_MODEL || DEFAULT_GROQ_MODEL));
  }
  if (env.OPENROUTER_API_KEY) {
    const client = new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
      defaultHeaders: { "X-OpenRouter-Title": "Strauss Car Advisor" },
    });
    providers.push(openAICompatProvider("openrouter", "OpenRouter", client, env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL));
  }
  const first = env.LLM_PROVIDER?.trim().toLowerCase();
  return [...providers.filter((p) => p.name === first), ...providers.filter((p) => p.name !== first)];
}
