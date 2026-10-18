/**
 * לולאת השיחה של הבוט (משימה A6).
 *
 * עקרונות:
 * - ההיסטוריה (session.messages) רק גדלה בסוף. אף פעם לא עורכים הודעה קודמת,
 *   וההנחיות ורשימת הכלים זהות בכל בקשה. כך ה"חשיבה" של Claude נשארת תקפה וה-cache עובד.
 * - כל מספר מגיע מהכלים. הבוט רק מפעיל אותם ומסביר.
 * - תשובת נציג נכנסת כהודעת מערכת בסוף השיחה, כדי שעובד לא יוכל להתחזות לנציג.
 */
import Anthropic from "@anthropic-ai/sdk";
import { REP_ANSWER_MARKER, SYSTEM_PROMPT, repAnswerSystemMessage } from "./prompt";
import { runTool, toolDefinitions, type ToolContext } from "./tools";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "medium";

/**
 * server-side-fallback: אם מסנן הבטיחות של המודל דוחה בקשה תמימה בטעות, השרת מנסה מודל חלופי במקום להחזיר סירוב.
 * thinking-binding-controls: מאפשר לבקש drop_block, כך ששינוי בהנחיות בין גרסאות לא מפיל שיחות שמורות.
 */
const BETAS = ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"];

/** רק החלק של לקוח Anthropic שהבוט צריך. בבדיקות מעבירים לקוח מזויף. */
export type ClaudeClient = Pick<Anthropic, "beta">;

export interface AgentOptions {
  client: ClaudeClient;
  model?: string;
  effort?: Effort;
  /** כמה סבבי כלים מותר בתור אחד, כדי שבאג לא ירוץ בלי סוף */
  maxToolRounds?: number;
}

/** תוצאת חישוב השוואה שהתקבלה בתור הזה. המסך משתמש בה להצגת טבלת ההשוואה. */
export interface ComparisonRecord {
  input: unknown;
  result: Record<string, unknown>;
}

export interface TurnResult {
  /** מה שמציגים לעובד */
  reply: string;
  status: "done" | "refused" | "truncated" | "too_many_steps";
  comparisons: ComparisonRecord[];
  /** שאלות שנשלחו לנציג בתור הזה */
  repQuestions: { ticketId: string; about: string; question: string }[];
  /** כל השאלות שעדיין מחכות לנציג */
  openQuestions: { ticketId: string; about: string; question: string }[];
}

const REPLIES = {
  refused: "מצטער, לא הצלחתי לענות על ההודעה הזו. אפשר לנסח אותה אחרת, או לשאול אותי על הרכב והנטו שלך.",
  truncated: "התשובה שלי נקטעה באמצע. אפשר לכתוב לי \"המשך\".",
  too_many_steps: "סליחה, לא הצלחתי להשלים את הבדיקה הפעם. אפשר לנסות שוב, או לפרט מה בדיוק לבדוק.",
  empty: "אני כאן. ספר/י לי מה תרצה/י לבדוק.",
};

/** לקוח אמיתי. קורא את המפתח מ-ANTHROPIC_API_KEY. */
export function createClaudeClient(): Anthropic {
  return new Anthropic();
}

/** מתרגם שגיאה מ-Claude להודעה בעברית ולקוד HTTP. מהספציפי לכללי. */
export function describeAgentError(err: unknown): { status: number; message: string } {
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

/** הגדרות מהסביבה: CLAUDE_MODEL ו-CLAUDE_EFFORT, עם ברירות מחדל */
export function agentOptionsFromEnv(client: ClaudeClient, env: Record<string, string | undefined> = process.env): AgentOptions {
  const effort = EFFORTS.includes(env.CLAUDE_EFFORT as Effort) ? (env.CLAUDE_EFFORT as Effort) : DEFAULT_EFFORT;
  return { client, model: env.CLAUDE_MODEL || DEFAULT_MODEL, effort };
}

/** הודעה חדשה מהעובד */
export async function runTurn(ctx: ToolContext, userText: string, opts: AgentOptions): Promise<TurnResult> {
  ctx.session.messages.push({ role: "user", content: userText });
  return continueConversation(ctx, opts);
}

/**
 * הנציג ענה על שאלה פתוחה. מוסיפים את התשובה לסוף השיחה והבוט ממשיך מאותה נקודה.
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
  const [question] = ctx.session.pendingQuestions.splice(idx, 1);
  // הודעת מערכת באמצע שיחה חייבת לבוא אחרי הודעת משתמש
  ctx.session.messages.push({ role: "user", content: REP_ANSWER_MARKER });
  ctx.session.messages.push({ role: "system", content: repAnswerSystemMessage(question!, answer) });
  return continueConversation(ctx, opts);
}

async function continueConversation(ctx: ToolContext, opts: AgentOptions): Promise<TurnResult> {
  const { client, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT, maxToolRounds = 8 } = opts;
  const messages = ctx.session.messages;
  const texts: string[] = [];
  const comparisons: ComparisonRecord[] = [];
  const repQuestions: TurnResult["repQuestions"] = [];

  const finish = (status: TurnResult["status"]): TurnResult => {
    const fallback = status === "done" ? REPLIES.empty : REPLIES[status];
    const reply = status === "done" || status === "truncated" ? texts.join("\n\n") || fallback : fallback;
    return { reply, status, comparisons, repQuestions, openQuestions: [...ctx.session.pendingQuestions] };
  };

  for (let round = 0; round <= maxToolRounds; round++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
      output_config: { effort },
      cache_control: { type: "ephemeral" },
      system: SYSTEM_PROMPT,
      tools: toolDefinitions,
      messages,
    });

    if (response.input_transformations?.length) {
      console.warn("[agent] Claude dropped thinking blocks:", JSON.stringify(response.input_transformations));
    }

    // סירוב: לא מוסיפים את התשובה להיסטוריה ולא מריצים כלים
    if (response.stop_reason === "refusal") return finish("refused");

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    // קלט של כלי שנקטע באמצע לא מריצים, וגם לא שומרים, כי אין לו תוצאה
    if (response.stop_reason === "max_tokens" && toolUses.length) return finish("truncated");

    messages.push({ role: "assistant", content: response.content });
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) texts.push(block.text.trim());
    }

    if (response.stop_reason === "pause_turn") continue;
    if (toolUses.length === 0) return finish(response.stop_reason === "max_tokens" ? "truncated" : "done");

    // מריצים לפי הסדר, כי כלי אחד יכול להשתמש בנתון שכלי קודם שמר
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const output = await runTool(toolUse.name, toolUse.input, ctx);
      if (toolUse.name === "calculate_comparison" && output.ok === true) {
        comparisons.push({ input: toolUse.input, result: output });
      }
      if (toolUse.name === "ask_representative" && output.ok === true) {
        const asked = ctx.session.pendingQuestions.find((q) => q.ticketId === output.ticketId);
        if (asked) repQuestions.push(asked);
      }
      results.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(output),
        ...(typeof output.error === "string" ? { is_error: true } : {}),
      });
    }
    // כל התוצאות של סבב אחד נשלחות יחד, בהודעה אחת
    messages.push({ role: "user", content: results });
  }

  return finish("too_many_steps");
}
