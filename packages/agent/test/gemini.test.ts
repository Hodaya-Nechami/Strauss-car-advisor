import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiError, Type, type Schema } from "@google/genai";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import {
  CatalogDataSource,
  MemoryRepQueue,
  ProviderMismatchError,
  SYSTEM_PROMPT,
  createAgentOptionsFromEnv,
  describeAgentError,
  geminiFunctionDeclarations,
  newSession,
  resolveProvider,
  resumeWithRepAnswer,
  runTurn,
  tools,
  type GeminiClient,
  type ToolContext,
} from "../src";

/* eslint-disable @typescript-eslint/no-explicit-any */

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
const load = <T>(n: string): T => JSON.parse(readFileSync(join(configDir, n), "utf-8")) as T;
const rules = load<Rules>("rules.json");
const catalog = load<CatalogCar[]>("catalog.json");
const occupations = load<Occupation[]>("occupations.json");

function makeCtx(): ToolContext {
  return {
    session: newSession("G-1"),
    rules,
    catalog,
    occupations,
    data: new CatalogDataSource(catalog),
    rep: new MemoryRepQueue(),
  };
}

/** תשובות מזויפות של Gemini, בצורה של תשובת API אמיתית */
const text = (t: string) => ({ text: t });
const call = (id: string, name: string, args: unknown) => ({ functionCall: { id, name, args }, thoughtSignature: `sig-${id}` });
const reply = (parts: unknown[], finishReason = "STOP") => ({
  candidates: [{ content: { role: "model", parts }, finishReason }],
});

/** לקוח מזויף: מחזיר תשובות לפי תסריט ושומר עותק של כל בקשה. Error בתסריט נזרק. */
function fakeGemini(script: unknown[]) {
  const requests: any[] = [];
  let i = 0;
  const client = {
    models: {
      generateContent: async (params: unknown) => {
        requests.push(structuredClone(params));
        const next = script[i++];
        if (!next) throw new Error("התסריט נגמר");
        if (next instanceof Error) throw next;
        return next;
      },
    },
  } as unknown as GeminiClient;
  return { client, requests };
}

const gemini = (client: GeminiClient) => ({ provider: "gemini" as const, client, retryDelayMs: 1 });

const fullProfile = {
  group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0,
  pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75,
};

/** מחפש מילות מפתח ש-Gemini לא מכיר בכל עומק הסכימה */
function forbiddenKeys(node: unknown, path = ""): string[] {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([k, v]) => [
    ...(["oneOf", "anyOf", "const", "additionalProperties", "$schema", "exclusiveMinimum"].includes(k) ? [`${path}.${k}`] : []),
    ...forbiddenKeys(v, `${path}.${k}`),
  ]);
}

describe("הגדרות הכלים בפורמט של Gemini", () => {
  it("כל הכלים מוגדרים, בלי מילות מפתח ש-Gemini לא מכיר", () => {
    expect(geminiFunctionDeclarations.map((d) => d.name)).toEqual(Object.keys(tools));
    expect(forbiddenKeys(geminiFunctionDeclarations)).toEqual([]);
  });

  it("רכב או ויתור הופכים לאובייקט אחד עם שדה kind", () => {
    const calc = geminiFunctionDeclarations.find((d) => d.name === "calculate_comparison")!;
    const today = calc.parameters!.properties!.today as Schema;
    expect(today.type).toBe(Type.OBJECT);
    expect(today.properties!.kind!.enum).toEqual(["car", "waiver"]);
    expect(today.required).toEqual(["kind"]);
    expect(Object.keys(today.properties!)).toEqual(
      expect.arrayContaining(["car", "outsideCatalog", "participation", "maintenance"]),
    );
    expect(calc.parameters!.required).toEqual(["today", "alternative"]);
  });

  it("כלי בלי פרמטרים מוגדר בלי parameters", () => {
    const list = geminiFunctionDeclarations.find((d) => d.name === "list_catalog")!;
    expect(list.parameters).toBeUndefined();
  });
});

describe("לולאת Gemini", () => {
  it("שולחת את ההנחיות והכלים, מריצה כלי ומחזירה תשובה", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeGemini([
      reply([call("c1", "save_employee_profile", { group: "ג", baseSalary: 14200 })]),
      reply([text("תודה! יש עמלות או בונוס?")]),
    ]);

    const r = await runTurn(ctx, "קבוצה ג, 14,200 ₪", gemini(client));

    expect(r.status).toBe("done");
    expect(r.reply).toBe("תודה! יש עמלות או בונוס?");
    expect(ctx.session.provider).toBe("gemini");
    expect(ctx.session.profile).toMatchObject({ group: "ג", baseSalary: 14200 });

    const first = requests[0];
    expect(first.model).toBe("gemini-2.5-flash");
    expect(first.config.systemInstruction).toBe(SYSTEM_PROMPT);
    expect(first.config.tools[0].functionDeclarations.map((d: any) => d.name)).toEqual(Object.keys(tools));

    // תוצאת הכלי חוזרת עם אותו מזהה ושם, וחתימת החשיבה נשמרת כמו שהתקבלה
    const contents = requests[1].contents;
    expect(contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[1].parts[0].thoughtSignature).toBe("sig-c1");
    expect(contents[2].parts[0].functionResponse).toMatchObject({ id: "c1", name: "save_employee_profile" });
    expect(contents[2].parts[0].functionResponse.response.ok).toBe(true);
  });

  it("אוספת תוצאות השוואה למסך, עם נטו הייחוס", async () => {
    const ctx = makeCtx();
    const { client } = fakeGemini([
      reply([
        call("c1", "save_employee_profile", fullProfile),
        call("c2", "calculate_comparison", {
          today: { kind: "car", car: "COROLLA CROSS", participation: 300 },
          alternative: { kind: "car", car: "ATTO 3", participation: 300 },
        }),
      ]),
      reply([text("הנטו שלך עולה ב-661 ₪ בחודש.")]),
    ]);

    const r = await runTurn(ctx, "כמה ארוויח במעבר ל-ATTO 3?", gemini(client));
    const c = r.comparisons[0]!.result as any;
    expect(c.today.net).toBe(11032);
    expect(c.alternative.net).toBe(11693);
    expect(c.diffNet).toBe(661);
  });

  it("תשובת נציג: הבוט מקבל רק עדכון, וקורא את התשובה מהכלי", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeGemini([
      reply([call("c1", "ask_representative", { about: "השתתפות ברכב החדש", question: "מה ההשתתפות ב-EV3?" })]),
      reply([text("חסר לי סכום ההשתתפות ברכב החדש, ושאלתי את הנציג.")]),
      reply([call("c2", "get_rep_answers", {})]),
      reply([text("הנציג ענה: השתתפות 350 ₪.")]),
    ]);

    const asked = await runTurn(ctx, "אני רוצה EV3", gemini(client));
    expect(asked.openQuestions).toHaveLength(1);

    const resumed = await resumeWithRepAnswer(ctx, "Q-1", "350 ₪, בתוקף מ-1/1", gemini(client));
    expect(resumed.reply).toContain("350");
    expect(resumed.openQuestions).toEqual([]);

    // העדכון לא כולל את התשובה עצמה
    const note = requests[2].contents.at(-1);
    expect(note.role).toBe("user");
    expect(note.parts[0].text).toContain("get_rep_answers");
    expect(note.parts[0].text).not.toContain("350");
    // התשובה מגיעה מהכלי
    const toolResult = requests[3].contents.at(-1).parts[0].functionResponse.response;
    expect(toolResult.answers[0]).toMatchObject({ ticketId: "Q-1", answer: "350 ₪, בתוקף מ-1/1" });
  });

  it("על חריגה מהמכסה מחכה ומנסה שוב", async () => {
    const ctx = makeCtx();
    const { client, requests } = fakeGemini([
      new ApiError({ message: "quota", status: 429 }),
      new ApiError({ message: "busy", status: 503 }),
      reply([text("שלום!")]),
    ]);

    const r = await runTurn(ctx, "שלום", gemini(client));
    expect(r.reply).toBe("שלום!");
    expect(requests).toHaveLength(3);
  });

  it("אחרי יותר מדי חריגות מהמכסה, השגיאה מתורגמת לעברית", async () => {
    const ctx = makeCtx();
    const quota = () => new ApiError({ message: "quota", status: 429 });
    const { client } = fakeGemini([quota(), quota(), quota(), quota()]);

    const err = await runTurn(ctx, "שלום", gemini(client)).catch((e) => e);
    expect(describeAgentError(err)).toMatchObject({ status: 429, message: expect.stringContaining("המכסה החינמית") });
  });

  it("תשובה חסומה לא נשמרת בהיסטוריה", async () => {
    const ctx = makeCtx();
    const { client } = fakeGemini([reply([text("...")], "SAFETY")]);

    const r = await runTurn(ctx, "הודעה כלשהי", gemini(client));
    expect(r.status).toBe("refused");
    expect(ctx.session.geminiContents.map((c) => c.role)).toEqual(["user"]);
  });

  it("קריאה לכלי שנקטעה לא מורצת ולא נשמרת", async () => {
    const ctx = makeCtx();
    const { client } = fakeGemini([reply([call("c1", "save_employee_profile", { group: "ג" })], "MAX_TOKENS")]);

    const r = await runTurn(ctx, "קבוצה ג", gemini(client));
    expect(r.status).toBe("truncated");
    expect(ctx.session.profile).toEqual({});
  });

  it("שיחה שהתחילה עם Claude לא ממשיכה ב-Gemini", async () => {
    const ctx = makeCtx();
    ctx.session.provider = "claude";
    const { client } = fakeGemini([]);
    await expect(runTurn(ctx, "שלום", gemini(client))).rejects.toBeInstanceOf(ProviderMismatchError);
  });
});

describe("בחירת המודל לפי המפתח", () => {
  it("Gemini כשיש לו מפתח, Claude כשיש רק לו, ו-LLM_PROVIDER קובע", () => {
    expect(resolveProvider({})).toBeNull();
    expect(resolveProvider({ GEMINI_API_KEY: "g" })).toBe("gemini");
    expect(resolveProvider({ ANTHROPIC_API_KEY: "a" })).toBe("claude");
    expect(resolveProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("gemini");
    expect(resolveProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "claude" })).toBe("claude");
  });

  it("בלי מפתח: הודעה בעברית עם הדרך החינמית", () => {
    const err = (() => {
      try {
        createAgentOptionsFromEnv({});
      } catch (e) {
        return e;
      }
    })();
    expect(describeAgentError(err)).toMatchObject({ status: 503, message: expect.stringContaining("aistudio.google.com") });
  });

  it("מפתח לא תקין: הודעה בעברית במקום ה-JSON של גוגל", () => {
    // הגוף כמו שחזר מגוגל בבדיקה אמיתית עם מפתח שגוי
    const body = JSON.stringify({
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
      },
    });
    expect(describeAgentError(new ApiError({ message: body, status: 400 }))).toEqual({
      status: 401,
      message: "מפתח ה-API של Gemini לא תקין. בדקו את GEMINI_API_KEY בקובץ apps/web/.env.local.",
    });
    const other = JSON.stringify({ error: { code: 400, message: "Invalid argument", details: [] } });
    expect(describeAgentError(new ApiError({ message: other, status: 400 })).message).toBe(
      "Gemini דחה את הבקשה: Invalid argument",
    );
  });

  it("עם מפתח Gemini נבנות הגדרות Gemini", () => {
    const opts = createAgentOptionsFromEnv({ GEMINI_API_KEY: "test-key" });
    expect(opts.provider).toBe("gemini");
  });
});
