/** מה שמשותף ללולאת Claude וללולאת Gemini: איסוף התשובה, תוצאות ההשוואה והשאלות לנציג בתור אחד. */
import type { RepQuestionRecord } from "./session";
import { runTool, type ToolContext } from "./tools";

/** תוצאת חישוב השוואה שהתקבלה בתור הזה. המסך משתמש בה להצגת טבלת ההשוואה. */
export interface ComparisonRecord {
  input: unknown;
  result: Record<string, unknown>;
}

/** רכבים שהבוט ביקש להציג בתמונות בתור הזה */
export interface CarGroup {
  purpose: "options" | "current" | "interest";
  cars: Record<string, unknown>[];
}

export interface TurnResult {
  /** מה שמציגים לעובד */
  reply: string;
  status: "done" | "refused" | "truncated" | "too_many_steps";
  comparisons: ComparisonRecord[];
  /** רכבים להצגה בתמונות */
  carGroups: CarGroup[];
  /** שאלות שנשלחו לנציג בתור הזה */
  repQuestions: RepQuestionRecord[];
  /** כל השאלות שעדיין מחכות לנציג */
  openQuestions: RepQuestionRecord[];
  /** אילו ספקים ענו בתור הזה, לפי הסדר. למשל ["Gemini"] או ["Gemini", "Groq"] אם המכסה נגמרה באמצע. */
  via: string[];
}

const REPLIES = {
  refused: "מצטער, לא הצלחתי לענות על ההודעה הזו. אפשר לנסח אותה אחרת, או לשאול אותי על הרכב והנטו שלך.",
  truncated: "התשובה שלי נקטעה באמצע. אפשר לכתוב לי \"המשך\".",
  too_many_steps: "סליחה, לא הצלחתי להשלים את הבדיקה הפעם. אפשר לנסות שוב, או לפרט מה בדיוק לבדוק.",
  empty: "אני כאן. ספר/י לי מה תרצה/י לבדוק.",
};

export class TurnCollector {
  private texts: string[] = [];
  private comparisons: ComparisonRecord[] = [];
  private carGroups: CarGroup[] = [];
  private repQuestions: RepQuestionRecord[] = [];
  private via: string[] = [];

  constructor(private readonly ctx: ToolContext) {}

  /** רושם איזה ספק ענה. ספק שענה כמה פעמים ברצף נרשם פעם אחת. */
  answeredBy(label: string) {
    if (this.via.at(-1) !== label) this.via.push(label);
  }

  addText(text: string) {
    const t = text.trim();
    if (t) this.texts.push(t);
  }

  /** מריץ כלי ושומר את מה שהמסך צריך: תוצאות השוואה ושאלות לנציג */
  async runTool(name: string, input: unknown): Promise<Record<string, unknown>> {
    const output = await runTool(name, input, this.ctx);
    if (name === "calculate_comparison" && output.ok === true) {
      this.comparisons.push({ input, result: output });
    }
    if (name === "show_cars" && output.ok === true) {
      this.carGroups.push({ purpose: output.purpose as CarGroup["purpose"], cars: output.shown as Record<string, unknown>[] });
    }
    if (name === "ask_representative" && output.ok === true) {
      const asked = this.ctx.session.pendingQuestions.find((q) => q.ticketId === output.ticketId);
      if (asked) this.repQuestions.push(asked);
    }
    return output;
  }

  finish(status: TurnResult["status"]): TurnResult {
    const fallback = status === "done" ? REPLIES.empty : REPLIES[status];
    const reply = status === "done" || status === "truncated" ? this.texts.join("\n\n") || fallback : fallback;
    return {
      reply,
      status,
      comparisons: this.comparisons,
      carGroups: this.carGroups,
      repQuestions: this.repQuestions,
      openQuestions: [...this.ctx.session.pendingQuestions],
      via: this.via,
    };
  }
}
