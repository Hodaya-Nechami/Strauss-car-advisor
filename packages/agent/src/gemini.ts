/**
 * לולאת השיחה מול Gemini (יש מפתח חינמי, בלי כרטיס אשראי).
 *
 * - ההיסטוריה (session.geminiContents) נשמרת בדיוק כמו שהתקבלה מהמודל, כולל חתימות החשיבה, ורק גדלה בסוף.
 * - אין ל-Gemini הודעות מערכת באמצע שיחה. לכן תשובת נציג לא נכתבת בשיחה עצמה:
 *   הבוט מקבל עדכון שהנציג ענה, וקורא את התשובה מהכלי get_rep_answers. עובד לא יכול לזייף תוצאה של כלי.
 * - במכסה החינמית יש הגבלת בקשות לדקה. על שגיאת 429 מחכים ומנסים שוב, בהמתנה שהולכת וגדלה.
 */
import { ApiError, FinishReason, GoogleGenAI, type Content, type Part } from "@google/genai";
import { geminiFunctionDeclarations } from "./gemini-schema";
import { SYSTEM_PROMPT } from "./prompt";
import type { RepAnswerRecord } from "./session";
import type { ToolContext } from "./tools";
import { TurnCollector, type TurnResult } from "./turn";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** רק החלק של לקוח Gemini שהבוט צריך. בבדיקות מעבירים לקוח מזויף. */
export type GeminiClient = Pick<GoogleGenAI, "models">;

export interface GeminiOptions {
  provider: "gemini";
  client: GeminiClient;
  model?: string;
  maxToolRounds?: number;
  /** ההמתנה הראשונה לפני ניסיון חוזר, במילישניות. מוכפלת בכל ניסיון. */
  retryDelayMs?: number;
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

/** סיבות סיום שאומרות שהתשובה נחסמה. לא שומרים אותה בהיסטוריה. */
const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

const RETRY_STATUSES = new Set([429, 500, 503]);

async function withRetry<T>(call: () => Promise<T>, baseDelayMs: number, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await call();
    } catch (err) {
      const retriable = err instanceof ApiError && RETRY_STATUSES.has(err.status);
      if (!retriable || i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** i));
    }
  }
}

export function geminiUserContent(text: string): Content {
  return { role: "user", parts: [{ text }] };
}

/** תשובת נציג: רק עדכון שהיא הגיעה. את התשובה עצמה הבוט קורא מהכלי get_rep_answers. */
export function appendGeminiRepAnswer(ctx: ToolContext, answer: RepAnswerRecord) {
  ctx.session.geminiContents.push(
    geminiUserContent(
      `[עדכון אוטומטי מהמערכת: הנציג ענה על פנייה ${answer.ticketId}. ` +
        "קרא את התשובה עם get_rep_answers, עדכן את החישוב לפיה, והצג לעובד את ההשוואה המעודכנת.]",
    ),
  );
}

export async function continueGemini(ctx: ToolContext, opts: GeminiOptions): Promise<TurnResult> {
  const { client, model = DEFAULT_GEMINI_MODEL, maxToolRounds = 8, retryDelayMs = 2000 } = opts;
  const contents = ctx.session.geminiContents;
  const turn = new TurnCollector(ctx);

  for (let round = 0; round <= maxToolRounds; round++) {
    const response = await withRetry(
      () =>
        client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations: geminiFunctionDeclarations }],
          },
        }),
      retryDelayMs,
    );

    const candidate = response.candidates?.[0];
    const finish = candidate?.finishReason;
    const parts: Part[] = candidate?.content?.parts ?? [];

    // תשובה חסומה: לא שומרים ולא מריצים כלים
    if (response.promptFeedback?.blockReason || (finish && BLOCKED.has(finish))) return turn.finish("refused");
    // קריאה לכלי שנכתבה לא תקין: מבקשים שוב, בלי לשמור את הניסיון הפגום
    if (finish === FinishReason.MALFORMED_FUNCTION_CALL) continue;

    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    // קריאה לכלי שנקטעה באמצע לא מריצים ולא שומרים
    if (finish === FinishReason.MAX_TOKENS && calls.length) return turn.finish("truncated");
    if (!candidate?.content || parts.length === 0) {
      return turn.finish(finish === FinishReason.MAX_TOKENS ? "truncated" : "done");
    }

    contents.push(candidate.content);
    for (const part of parts) {
      if (part.text && !part.thought) turn.addText(part.text);
    }

    if (calls.length === 0) return turn.finish(finish === FinishReason.MAX_TOKENS ? "truncated" : "done");

    // מריצים לפי הסדר, ומחזירים את כל התוצאות של הסבב יחד
    const responses: Part[] = [];
    for (const call of calls) {
      const output = await turn.runTool(call.name ?? "", call.args ?? {});
      responses.push({ functionResponse: { id: call.id, name: call.name, response: output } });
    }
    contents.push({ role: "user", parts: responses });
  }

  return turn.finish("too_many_steps");
}
