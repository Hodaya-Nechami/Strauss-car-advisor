import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import {
  CatalogDataSource,
  MemoryRepQueue,
  REP_ANSWER_MARKER,
  SYSTEM_PROMPT,
  newSession,
  resumeWithRepAnswer,
  runTurn,
  toolDefinitions,
  type ClaudeClient,
  type ToolContext,
} from "../src";

/* eslint-disable @typescript-eslint/no-explicit-any */

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
const load = <T>(n: string): T => JSON.parse(readFileSync(join(configDir, n), "utf-8")) as T;
const rules = load<Rules>("rules.json");
const catalog = load<CatalogCar[]>("catalog.json");
const occupations = load<Occupation[]>("occupations.json");

/** תשובות מזויפות של Claude, בצורה של תשובת API אמיתית */
const thinking = (sig: string) => ({ type: "thinking", thinking: "", signature: sig });
const text = (t: string) => ({ type: "text", text: t, citations: null });
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const reply = (content: unknown[], stop_reason: string) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
  input_transformations: [],
});

/** לקוח מזויף שמחזיר תשובות לפי תסריט ושומר עותק של כל בקשה */
function fakeClaude(script: unknown[]) {
  const requests: any[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          requests.push(structuredClone(params));
          const next = script[i++];
          if (!next) throw new Error("התסריט נגמר");
          return next;
        },
      },
    },
  } as unknown as ClaudeClient;
  return { client, requests };
}

function makeCtx(): ToolContext {
  return {
    session: newSession("S-1"),
    rules,
    catalog,
    occupations,
    data: new CatalogDataSource(catalog),
    rep: new MemoryRepQueue(),
  };
}

const fullProfile = {
  group: "ג", baseSalary: 18500, commissions: 0, bonus: 0,
  pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75,
};

/** בדיקת "רק מוסיפים בסוף": ההנחיות והכלים זהים, וכל בקשה מתחילה בדיוק בבקשה הקודמת */
function expectAppendOnly(requests: any[]) {
  for (let k = 1; k < requests.length; k++) {
    const prev = requests[k - 1];
    const cur = requests[k];
    expect(JSON.stringify(cur.system)).toBe(JSON.stringify(prev.system));
    expect(JSON.stringify(cur.tools)).toBe(JSON.stringify(prev.tools));
    expect(cur.messages.slice(0, prev.messages.length)).toEqual(prev.messages);
  }
}

describe("לולאת הבוט", () => {
  it("שולחת בקשה בהגדרות הנכונות, מריצה כלי ומחזירה תשובה", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeClaude([
      reply([thinking("s1"), toolUse("t1", "save_employee_profile", { group: "ג", baseSalary: 14200 })], "tool_use"),
      reply([thinking("s2"), text("תודה! יש עמלות או בונוס?")], "end_turn"),
    ]);

    const r = await runTurn(ctx, "קבוצה ג, 14,200 ₪", { client });

    expect(r.status).toBe("done");
    expect(r.reply).toBe("תודה! יש עמלות או בונוס?");
    expect(ctx.session.profile).toMatchObject({ group: "ג", baseSalary: 14200 });

    const first = requests[0];
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.output_config).toEqual({ effort: "medium" });
    expect(first.fallbacks).toBe("default");
    expect(first.betas).toEqual(["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"]);
    expect(first.thinking).toEqual({ type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
    expect(first.system).toBe(SYSTEM_PROMPT);
    expect(first.tools.map((t: any) => t.name)).toEqual(toolDefinitions.map((t) => t.name));
    expect(first.tool_choice).toBeUndefined();

    // תוצאת הכלי חזרה ל-Claude באותה בקשה הבאה
    const toolResult = requests[1].messages.at(-1).content[0];
    expect(toolResult.type).toBe("tool_result");
    expect(toolResult.tool_use_id).toBe("t1");
    expect(JSON.parse(toolResult.content).ok).toBe(true);
  });

  it("שומרת את בלוקי החשיבה בדיוק כמו שהתקבלו, ומוסיפה להיסטוריה רק בסוף", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeClaude([
      reply([thinking("s1"), toolUse("t1", "save_employee_profile", fullProfile)], "tool_use"),
      reply([thinking("s2"), text("מה הרכב שלך היום?")], "end_turn"),
      reply([thinking("s3"), toolUse("t2", "list_catalog", {})], "tool_use"),
      reply([thinking("s4"), text("הנה הרכבים שאפשר לבחור.")], "end_turn"),
    ]);

    await runTurn(ctx, "הנה כל הנתונים שלי", { client });
    await runTurn(ctx, "קורולה קרוס, משתתף 300", { client });

    expectAppendOnly(requests);
    const assistantTurns = ctx.session.messages.filter((m) => m.role === "assistant");
    expect(assistantTurns[0]!.content).toEqual([thinking("s1"), toolUse("t1", "save_employee_profile", fullProfile)]);
    expect(ctx.session.messages.map((m) => m.role)).toEqual([
      "user", "assistant", "user", "assistant", "user", "assistant", "user", "assistant",
    ]);
  });

  it("אוספת את תוצאות ההשוואה בשביל המסך", async () => {
    const ctx = makeCtx();
    const { client } = fakeClaude([
      reply(
        [
          toolUse("t1", "save_employee_profile", fullProfile),
          toolUse("t2", "calculate_comparison", {
            today: { kind: "car", car: "COROLLA CROSS", participation: 300 },
            alternative: { kind: "car", car: "ATTO 3", participation: 300 },
          }),
        ],
        "tool_use",
      ),
      reply([text("במעבר ל-ATTO 3 הנטו שלך עולה ב-661 ₪ בחודש.")], "end_turn"),
    ]);

    const r = await runTurn(ctx, "כמה ארוויח אם אעבור ל-ATTO 3?", { client });

    expect(r.comparisons).toHaveLength(1);
    const c = r.comparisons[0]!.result as any;
    expect(c.today.net).toBe(11032);
    expect(c.alternative.net).toBe(11693);
    expect(c.diffNet).toBe(661);
  });

  it("שאלה לנציג: נשמרת כפתוחה, ותשובת הנציג נכנסת כהודעת מערכת בסוף השיחה", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeClaude([
      reply(
        [toolUse("t1", "ask_representative", { about: "השתתפות ברכב החדש", question: "מה ההשתתפות ב-EV3?" })],
        "tool_use",
      ),
      reply([text("חסר לי סכום ההשתתפות ברכב החדש, ושאלתי את הנציג.")], "end_turn"),
      reply([text("הנציג ענה: השתתפות 350 ₪. הנה ההשוואה המעודכנת.")], "end_turn"),
    ]);

    const asked = await runTurn(ctx, "אני רוצה EV3", { client });
    expect(asked.repQuestions).toEqual([{ ticketId: "Q-1", about: "השתתפות ברכב החדש", question: "מה ההשתתפות ב-EV3?" }]);
    expect(asked.openQuestions).toHaveLength(1);

    const resumed = await resumeWithRepAnswer(ctx, "Q-1", "השתתפות 350 ₪, בתוקף מ-1/1", { client });
    expect(resumed.reply).toContain("350");
    expect(resumed.openQuestions).toEqual([]);

    const sent = requests.at(-1).messages;
    expect(sent.at(-2)).toEqual({ role: "user", content: REP_ANSWER_MARKER });
    expect(sent.at(-1).role).toBe("system");
    expect(sent.at(-1).content).toContain("השתתפות 350 ₪, בתוקף מ-1/1");
    expectAppendOnly(requests);
  });

  it("תשובת נציג לפנייה שלא קיימת נדחית", async () => {
    const { client } = fakeClaude([]);
    await expect(resumeWithRepAnswer(makeCtx(), "Q-9", "350", { client })).rejects.toThrow("Q-9");
  });

  it("סירוב: מחזירה הודעה מנומסת, לא מוסיפה להיסטוריה, והשיחה ממשיכה", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeClaude([
      reply([], "refusal"),
      reply([text("בטח, נתחיל מקבוצת הזכאות.")], "end_turn"),
    ]);

    const refused = await runTurn(ctx, "הודעה כלשהי", { client });
    expect(refused.status).toBe("refused");
    expect(ctx.session.messages.map((m) => m.role)).toEqual(["user"]);

    const next = await runTurn(ctx, "בוא נתחיל", { client });
    expect(next.status).toBe("done");
    expect(requests[1].messages.map((m: any) => m.role)).toEqual(["user", "user"]);
  });

  it("קלט של כלי שנקטע לא מורץ ולא נשמר", async () => {
    const ctx = makeCtx();
    const { client } = fakeClaude([reply([toolUse("t1", "save_employee_profile", { group: "ג" })], "max_tokens")]);

    const r = await runTurn(ctx, "קבוצה ג", { client });
    expect(r.status).toBe("truncated");
    expect(ctx.session.profile).toEqual({});
    expect(ctx.session.messages.map((m) => m.role)).toEqual(["user"]);
  });

  it("עוצרת אחרי יותר מדי סבבי כלים, וההיסטוריה נשארת תקינה", async () => {
    const ctx = makeCtx();
    const loop = (id: string) => reply([toolUse(id, "list_catalog", {})], "tool_use");
    const { client } = fakeClaude([loop("a"), loop("b"), loop("c")]);

    const r = await runTurn(ctx, "תראה לי רכבים", { client, maxToolRounds: 2 });
    expect(r.status).toBe("too_many_steps");
    expect(ctx.session.messages.at(-1)!.role).toBe("user");
  });

  it("קריאה לכלי עם קלט שגוי חוזרת ל-Claude כשגיאה כדי שיתקן", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeClaude([
      reply([toolUse("t1", "save_employee_profile", { pensionRate: "שש" })], "tool_use"),
      reply([text("כמה אחוז מופרשים לפנסיה?")], "end_turn"),
    ]);

    await runTurn(ctx, "פנסיה שש", { client });
    const result = requests[1].messages.at(-1).content[0];
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content).error).toBe("קלט לא תקין");
  });
});
