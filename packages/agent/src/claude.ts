/**
 * לולאת השיחה מול Claude (בתשלום).
 *
 * - ההיסטוריה (session.messages) רק גדלה בסוף. ההנחיות ורשימת הכלים זהות בכל בקשה,
 *   כך שה"חשיבה" של Claude נשארת תקפה וה-cache עובד.
 * - תשובת נציג נכנסת כהודעת מערכת בסוף השיחה, כדי שעובד לא יוכל להתחזות לנציג.
 */
import Anthropic from "@anthropic-ai/sdk";
import { REP_ANSWER_MARKER, SYSTEM_PROMPT, repAnswerSystemMessage } from "./prompt";
import type { RepAnswerRecord } from "./session";
import { toolDefinitions, type ToolContext } from "./tools";
import { TurnCollector, type TurnResult } from "./turn";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT: Effort = "medium";

/**
 * server-side-fallback: אם מסנן הבטיחות של המודל דוחה בקשה תמימה בטעות, השרת מנסה מודל חלופי במקום להחזיר סירוב.
 * thinking-binding-controls: מאפשר לבקש drop_block, כך ששינוי בהנחיות בין גרסאות לא מפיל שיחות שמורות.
 */
const BETAS = ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"];

/** רק החלק של לקוח Anthropic שהבוט צריך. בבדיקות מעבירים לקוח מזויף. */
export type ClaudeClient = Pick<Anthropic, "beta">;

export interface ClaudeOptions {
  mode?: "claude";
  client: ClaudeClient;
  model?: string;
  effort?: Effort;
  /** כמה סבבי כלים מותר בתור אחד, כדי שבאג לא ירוץ בלי סוף */
  maxToolRounds?: number;
}

/** לקוח אמיתי. קורא את המפתח מ-ANTHROPIC_API_KEY. */
export function createClaudeClient(): Anthropic {
  return new Anthropic();
}

/** תשובת נציג: הודעת משתמש קבועה ואחריה הודעת מערכת עם התשובה */
export function appendClaudeRepAnswer(ctx: ToolContext, answer: RepAnswerRecord) {
  ctx.session.messages.push({ role: "user", content: REP_ANSWER_MARKER });
  ctx.session.messages.push({ role: "system", content: repAnswerSystemMessage(answer, answer.answer) });
}

export async function continueClaude(ctx: ToolContext, opts: ClaudeOptions): Promise<TurnResult> {
  const { client, model = DEFAULT_CLAUDE_MODEL, effort = DEFAULT_EFFORT, maxToolRounds = 8 } = opts;
  const messages = ctx.session.messages;
  const turn = new TurnCollector(ctx);

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

    turn.answeredBy("Claude");
    // סירוב: לא מוסיפים את התשובה להיסטוריה ולא מריצים כלים
    if (response.stop_reason === "refusal") return turn.finish("refused");

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    // קלט של כלי שנקטע באמצע לא מריצים, וגם לא שומרים, כי אין לו תוצאה
    if (response.stop_reason === "max_tokens" && toolUses.length) return turn.finish("truncated");

    messages.push({ role: "assistant", content: response.content });
    for (const block of response.content) {
      if (block.type === "text") turn.addText(block.text);
    }

    if (response.stop_reason === "pause_turn") continue;
    if (toolUses.length === 0) return turn.finish(response.stop_reason === "max_tokens" ? "truncated" : "done");

    // מריצים לפי הסדר, כי כלי אחד יכול להשתמש בנתון שכלי קודם שמר
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const output = await turn.runTool(toolUse.name, toolUse.input);
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

  return turn.finish("too_many_steps");
}
