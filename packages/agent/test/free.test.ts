import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiError, Type, type Schema } from "@google/genai";
import OpenAI from "openai";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import {
  AllProvidersFailedError,
  CatalogDataSource,
  MemoryRepQueue,
  ProviderHealth,
  ProviderMismatchError,
  SYSTEM_PROMPT,
  createAgentOptionsFromEnv,
  createFreeProviders,
  describeAgentError,
  geminiFunctionDeclarations,
  geminiProvider,
  newSession,
  openAICompatProvider,
  openAITools,
  resolveMode,
  resumeWithRepAnswer,
  runTurn,
  toGeminiContents,
  tools,
  type FreeOptions,
  type FreeProvider,
  type GeminiClient,
  type OpenAICompatClient,
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
    session: newSession("F-1"),
    rules,
    catalog,
    occupations,
    data: new CatalogDataSource(catalog),
    rep: new MemoryRepQueue(),
  };
}

const fullProfile = {
  group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0,
  pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75,
};

/* ---------- Gemini מזויף ---------- */
const gText = (t: string) => ({ text: t });
const gCall = (id: string, name: string, args: unknown) => ({ functionCall: { id, name, args }, thoughtSignature: `sig-${id}` });
const gReply = (parts: unknown[], finishReason = "STOP") => ({ candidates: [{ content: { role: "model", parts }, finishReason }] });
const gError = (status: number, message = "error") => new ApiError({ message, status });

/* ---------- Groq / OpenRouter מזויף ---------- */
const oReply = (content: string | null, calls: { name: string; args: unknown; raw?: string }[] = [], finish?: string) => ({
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content,
        ...(calls.length
          ? {
              tool_calls: calls.map((c, i) => ({
                id: `groq_${i}`,
                type: "function",
                function: { name: c.name, arguments: c.raw ?? JSON.stringify(c.args) },
              })),
            }
          : {}),
      },
      finish_reason: finish ?? (calls.length ? "tool_calls" : "stop"),
    },
  ],
});
const oError = (status: number) => new OpenAI.APIError(status, { message: "error" }, "error", new Headers());

/** לקוח מזויף: מחזיר תשובות לפי תסריט ושומר עותק של כל בקשה. Error בתסריט נזרק. */
function scripted(script: unknown[]) {
  const requests: any[] = [];
  let i = 0;
  const next = async (params: unknown) => {
    requests.push(structuredClone(params));
    const item = script[i++];
    if (!item) throw new Error("התסריט נגמר");
    if (item instanceof Error) throw item;
    return item;
  };
  return { requests, next };
}

function fakeGemini(script: unknown[]) {
  const s = scripted(script);
  const client = { models: { generateContent: s.next } } as unknown as GeminiClient;
  return { provider: geminiProvider(client), requests: s.requests };
}

function fakeGroq(script: unknown[]) {
  const s = scripted(script);
  const client = { chat: { completions: { create: s.next } } } as unknown as OpenAICompatClient;
  return { provider: openAICompatProvider("groq", "Groq", client, "test-model"), requests: s.requests };
}

function freeOptions(providers: FreeProvider[], now: () => number = () => 0): FreeOptions {
  return { mode: "free", providers, health: new ProviderHealth(now), retryDelayMs: 1 };
}

/** מחפש מילות מפתח שחלק מהספקים לא מכירים, בכל עומק */
function forbiddenKeys(node: unknown, path = ""): string[] {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([k, v]) => [
    ...(["oneOf", "anyOf", "const", "additionalProperties", "$schema", "exclusiveMinimum"].includes(k) ? [`${path}.${k}`] : []),
    ...forbiddenKeys(v, `${path}.${k}`),
  ]);
}

describe("הגדרות הכלים לספקים החינמיים", () => {
  it("כל הכלים מוגדרים בשני הפורמטים, בלי מילות מפתח בעייתיות", () => {
    expect(geminiFunctionDeclarations.map((d) => d.name)).toEqual(Object.keys(tools));
    expect(openAITools.map((t) => t.function.name)).toEqual(Object.keys(tools));
    expect(forbiddenKeys(geminiFunctionDeclarations)).toEqual([]);
    expect(forbiddenKeys(openAITools)).toEqual([]);
  });

  it("רכב או ויתור הופכים לאובייקט אחד עם שדה kind", () => {
    const calc = geminiFunctionDeclarations.find((d) => d.name === "calculate_comparison")!;
    const today = calc.parameters!.properties!.today as Schema;
    expect(today.type).toBe(Type.OBJECT);
    expect(today.properties!.kind!.enum).toEqual(["car", "waiver"]);
    expect(today.required).toEqual(["kind"]);

    const oCalc = openAITools.find((t) => t.function.name === "calculate_comparison")!;
    const oToday = (oCalc.function.parameters as any).properties.today;
    expect(oToday.type).toBe("object");
    expect(oToday.properties.kind.enum).toEqual(["car", "waiver"]);
  });

  it("כלי בלי פרמטרים", () => {
    expect(geminiFunctionDeclarations.find((d) => d.name === "list_catalog")!.parameters).toBeUndefined();
    expect(openAITools.find((t) => t.function.name === "list_catalog")!.function.parameters).toEqual({
      type: "object",
      properties: {},
    });
  });
});

describe("Gemini לבד", () => {
  it("מריץ כלי, מחזיר את החתימות ואת המזהה המקורי, ועונה", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([gReply([gCall("g1", "save_employee_profile", { group: "ג", baseSalary: 14200 })]), gReply([gText("תודה!")])]);

    const r = await runTurn(ctx, "קבוצה ג, 14,200 ₪", freeOptions([g.provider]));

    expect(r.reply).toBe("תודה!");
    expect(r.via).toEqual(["Gemini"]);
    expect(ctx.session.mode).toBe("free");
    expect(ctx.session.profile).toMatchObject({ group: "ג", baseSalary: 14200 });

    expect(g.requests[0].model).toBe("gemini-3.8-flash");
    expect(g.requests[0].config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(g.requests[0].config.systemInstruction).toBe(SYSTEM_PROMPT);
    const contents = g.requests[1].contents;
    expect(contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
    expect(contents[1].parts[0].thoughtSignature).toBe("sig-g1");
    expect(contents[2].parts[0].functionResponse).toMatchObject({ id: "g1", name: "save_employee_profile" });
  });

  it("נועה לוי: נטו הייחוס דרך Gemini", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([
      gReply([
        gCall("g1", "save_employee_profile", fullProfile),
        gCall("g2", "calculate_comparison", {
          today: { kind: "car", car: "COROLLA CROSS", participation: 300 },
          alternative: { kind: "car", car: "ATTO 3", participation: 300 },
        }),
      ]),
      gReply([gText("הנטו שלך עולה ב-661 ₪ בחודש.")]),
    ]);

    const r = await runTurn(ctx, "כמה ארוויח במעבר ל-ATTO 3?", freeOptions([g.provider]));
    expect((r.comparisons[0]!.result as any).diffNet).toBe(661);
  });

  it("תשובת נציג נקראת מהכלי get_rep_answers", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([
      gReply([gCall("g1", "ask_representative", { about: "השתתפות ברכב החדש", question: "מה ההשתתפות ב-EV3?" })]),
      gReply([gText("שאלתי את הנציג.")]),
      gReply([gCall("g2", "get_rep_answers", {})]),
      gReply([gText("הנציג ענה: 350 ₪.")]),
    ]);
    const opts = freeOptions([g.provider]);

    await runTurn(ctx, "אני רוצה EV3", opts);
    const resumed = await resumeWithRepAnswer(ctx, "Q-1", "350 ₪", opts);

    expect(resumed.reply).toContain("350");
    expect(g.requests[2].contents.at(-1).parts[0].text).toContain("get_rep_answers");
    expect(g.requests[2].contents.at(-1).parts[0].text).not.toContain("350");
    expect(g.requests[3].contents.at(-1).parts[0].functionResponse.response.answers[0].answer).toBe("350 ₪");
  });

  it("כשיש רק ספק אחד: מחכה ומנסה שוב על מכסה ועל עומס", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([gError(429), gError(503), gReply([gText("שלום!")])]);

    const r = await runTurn(ctx, "שלום", freeOptions([g.provider]));
    expect(r.reply).toBe("שלום!");
    expect(g.requests).toHaveLength(3);
  });

  it("תשובה חסומה לא נשמרת, וקריאה קטועה לא מורצת", async () => {
    const blocked = makeCtx();
    const g1 = fakeGemini([gReply([gText("...")], "SAFETY")]);
    expect((await runTurn(blocked, "משהו", freeOptions([g1.provider]))).status).toBe("refused");
    expect(blocked.session.log.map((e) => e.role)).toEqual(["user"]);

    const cut = makeCtx();
    const g2 = fakeGemini([gReply([gCall("g1", "save_employee_profile", { group: "ג" })], "MAX_TOKENS")]);
    expect((await runTurn(cut, "קבוצה ג", freeOptions([g2.provider]))).status).toBe("truncated");
    expect(cut.session.profile).toEqual({});
  });
});

describe("Groq לבד (פורמט OpenAI)", () => {
  it("שולח הנחיות, כלים והיסטוריה בפורמט הנכון, בלי השדה name", async () => {
    const ctx = makeCtx();
    const q = fakeGroq([oReply(null, [{ name: "save_employee_profile", args: { group: "ג" } }]), oReply("תודה!")]);

    const r = await runTurn(ctx, "קבוצה ג", freeOptions([q.provider]));

    expect(r.reply).toBe("תודה!");
    expect(r.via).toEqual(["Groq"]);
    expect(q.requests[0].model).toBe("test-model");
    expect(q.requests[0].tools.map((t: any) => t.function.name)).toEqual(Object.keys(tools));
    expect(q.requests[0].messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });

    const msgs = q.requests[1].messages;
    expect(msgs.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    // מזהה של 9 תווים, אותיות וספרות: הפורמט שגם Mistral מקבל
    expect(msgs[2].tool_calls[0]).toEqual({
      id: "c00000001",
      type: "function",
      function: { name: "save_employee_profile", arguments: JSON.stringify({ group: "ג" }) },
    });
    expect(msgs[2].content).toBe("");
    expect(msgs[3].tool_call_id).toBe("c00000001");
    expect(msgs.some((m: any) => "name" in m)).toBe(false);
    expect("models" in q.requests[0]).toBe(false);
  });

  it("OpenRouter: שולח רשימת מודלים חלופיים, והשרת שלו עובר ביניהם", async () => {
    const s = scripted([oReply("שלום!")]);
    const client = { chat: { completions: { create: s.next } } } as unknown as OpenAICompatClient;
    const provider = openAICompatProvider("openrouter", "OpenRouter", client, "a:free", ["b:free", "c:free"]);

    await runTurn(makeCtx(), "שלום", freeOptions([provider]));
    expect(s.requests[0].model).toBe("a:free");
    expect(s.requests[0].models).toEqual(["a:free", "b:free", "c:free"]);
  });

  it("ארגומנטים שבורים: מבקש שוב בלי לשמור", async () => {
    const ctx = makeCtx();
    const q = fakeGroq([oReply(null, [{ name: "save_employee_profile", args: {}, raw: "{not json" }]), oReply("איך אפשר לעזור?")]);

    const r = await runTurn(ctx, "שלום", freeOptions([q.provider]));
    expect(r.reply).toBe("איך אפשר לעזור?");
    expect(ctx.session.log.map((e) => e.role)).toEqual(["user", "model"]);
  });
});

describe("מעבר אוטומטי בין ספקים", () => {
  it("Gemini הגיע למכסה: Groq עונה, ו-Gemini מקבל המתנה של דקה", async () => {
    let now = 0;
    const g = fakeGemini([gError(429), gReply([gText("שוב Gemini")])]);
    const q = fakeGroq([oReply("Groq כאן"), oReply("שוב Groq")]);
    const opts = freeOptions([g.provider, q.provider], () => now);
    const ctx = makeCtx();

    const first = await runTurn(ctx, "שלום", opts);
    expect(first.reply).toBe("Groq כאן");
    expect(first.via).toEqual(["Groq"]);

    // בזמן ההמתנה לא פונים ל-Gemini בכלל
    now = 30_000;
    const second = await runTurn(ctx, "ועוד שאלה", opts);
    expect(second.via).toEqual(["Groq"]);
    expect(g.requests).toHaveLength(1);

    // אחרי ההמתנה חוזרים ל-Gemini
    now = 61_000;
    const third = await runTurn(ctx, "ועוד אחת", opts);
    expect(third.via).toEqual(["Gemini"]);
  });

  it("מעבר באמצע חישוב: Groq ממשיך מאותה נקודה, עם הקריאה והתוצאה של Gemini", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([gReply([gCall("g1", "save_employee_profile", { group: "ג" })]), gError(429)]);
    const q = fakeGroq([oReply("שמרתי. מה השכר שלך?")]);

    const r = await runTurn(ctx, "קבוצה ג", freeOptions([g.provider, q.provider]));

    expect(r.reply).toBe("שמרתי. מה השכר שלך?");
    expect(r.via).toEqual(["Gemini", "Groq"]);
    const msgs = q.requests[0].messages;
    expect(msgs.map((m: any) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(msgs[2].tool_calls[0].function.name).toBe("save_employee_profile");
    expect(msgs[3].tool_call_id).toBe(msgs[2].tool_calls[0].id);
    expect(JSON.parse(msgs[3].content).ok).toBe(true);
  });

  it("קריאות לכלים שספק אחר כתב מגיעות ל-Gemini כטקסט, בלי חתימות חסרות", async () => {
    const ctx = makeCtx();
    const q = fakeGroq([oReply(null, [{ name: "list_catalog", args: {} }]), oReply("הנה הקטלוג")]);
    await runTurn(ctx, "קבוצה ג", freeOptions([q.provider]));

    const contents = toGeminiContents(ctx.session.log);
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user", "model"]);
    expect(contents[1]!.parts![0]!.text).toBe("[קריאה לכלי list_catalog עם הקלט {}]");
    // אין קבוצה שמורה בשיחה הזו, ולכן הכלי מחזיר מה חסר. מה שבודקים כאן הוא הצורה: טקסט ולא functionResponse.
    expect(contents[2]!.parts![0]!.text).toMatch(/^\[תוצאת הכלי list_catalog: \{"ok":false,"missing":/);
    const all = JSON.stringify(contents);
    expect(all).not.toContain("functionCall");
    expect(all).not.toContain("functionResponse");
  });

  it("מעבר מ-Groq ל-Gemini באמצע חישוב: Gemini ממשיך מהטקסט", async () => {
    const ctx = makeCtx();
    const q = fakeGroq([oReply(null, [{ name: "save_employee_profile", args: { group: "ג" } }]), oError(429)]);
    const g = fakeGemini([gReply([gText("שמרתי את הקבוצה.")])]);

    const r = await runTurn(ctx, "קבוצה ג", freeOptions([q.provider, g.provider]));
    expect(r.via).toEqual(["Groq", "Gemini"]);
    const last = g.requests[0].contents.at(-1);
    expect(last.role).toBe("user");
    expect(last.parts[0].text).toContain("[תוצאת הכלי save_employee_profile");
  });

  it("מפתח Gemini לא תקין: עובר ל-Groq ולא חוזר ל-Gemini חצי שעה", async () => {
    let now = 0;
    const invalidKey = JSON.stringify({ error: { message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } });
    const g = fakeGemini([gError(400, invalidKey)]);
    const q = fakeGroq([oReply("Groq כאן"), oReply("שוב Groq")]);
    const opts = freeOptions([g.provider, q.provider], () => now);
    const ctx = makeCtx();

    expect((await runTurn(ctx, "שלום", opts)).via).toEqual(["Groq"]);
    now = 10 * 60_000;
    expect((await runTurn(ctx, "שוב", opts)).via).toEqual(["Groq"]);
    expect(g.requests).toHaveLength(1);
  });

  it("כל הספקים במכסה: הודעה בעברית שמבקשת לחכות", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([gError(429)]);
    const q = fakeGroq([oError(429)]);

    const err = await runTurn(ctx, "שלום", freeOptions([g.provider, q.provider])).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(describeAgentError(err)).toMatchObject({
      status: 429,
      message: expect.stringContaining("כל המפתחות החינמיים הגיעו למכסה כרגע (Gemini, Groq)"),
    });
  });

  it("תקלות שונות: ההודעה אומרת מה קרה לכל ספק, עם הסיבה כשהבקשה נדחתה", () => {
    const err = new AllProvidersFailedError([
      { provider: "Gemini", kind: "rate", error: null },
      { provider: "Groq", kind: "auth", error: null },
    ]);
    expect(describeAgentError(err).message).toContain("Gemini הגיע למכסה, Groq המפתח לא תקין");

    // כמו שגוגל החזירה בבדיקה אמיתית, כשהמודל הישן הוצא משימוש
    const notFound = JSON.stringify({
      error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available to new users.", status: "NOT_FOUND" },
    });
    const rejected = new AllProvidersFailedError([{ provider: "Gemini", kind: "bad_request", error: gError(404, notFound) }]);
    expect(describeAgentError(rejected).message).toContain(
      "Gemini דחה את הבקשה (This model models/gemini-2.5-flash is no longer available to new users.)",
    );
  });

  it("סינון אינטרנט (נטפרי, קוד 418): עובר לספק הבא ומסביר בעברית", async () => {
    let now = 0;
    const q = fakeGroq([oError(418)]);
    const g = fakeGemini([gReply([gText("Gemini כאן")]), gReply([gText("שוב Gemini")])]);
    const opts = freeOptions([q.provider, g.provider], () => now);

    expect((await runTurn(makeCtx(), "שלום", opts)).via).toEqual(["Gemini"]);
    now = 20 * 60_000;
    await runTurn(makeCtx(), "שוב", opts);
    expect(q.requests).toHaveLength(1);

    const err = new AllProvidersFailedError([{ provider: "Groq", kind: "filtered", error: null }]);
    expect(describeAgentError(err).message).toContain("Groq חסום על ידי סינון האינטרנט");
    expect(describeAgentError(err).message).toContain("נטפרי");
  });

  it("באג אצלנו לא מוסתר מאחורי מעבר ספק", async () => {
    const ctx = makeCtx();
    const g = fakeGemini([new RangeError("bug")]);
    const q = fakeGroq([oReply("לא אמור להגיע לפה")]);
    await expect(runTurn(ctx, "שלום", freeOptions([g.provider, q.provider]))).rejects.toThrow("bug");
    expect(q.requests).toHaveLength(0);
  });
});

describe("בחירה לפי המפתחות", () => {
  it("מפתחות חינמיים קודמים ל-Claude, אלא אם ביקשו Claude", () => {
    expect(resolveMode({})).toBeNull();
    expect(resolveMode({ GROQ_API_KEY: "q" })).toBe("free");
    expect(resolveMode({ ANTHROPIC_API_KEY: "a" })).toBe("claude");
    expect(resolveMode({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("free");
    expect(resolveMode({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LLM_PROVIDER: "claude" })).toBe("claude");
  });

  it("סדר הספקים: Gemini, Cohere, Mistral, OpenRouter, Groq, ו-LLM_PROVIDER מקדים אחד מהם", () => {
    const all = {
      GEMINI_API_KEY: "g",
      COHERE_API_KEY: "c",
      MISTRAL_API_KEY: "m",
      OPENROUTER_API_KEY: "o",
      GROQ_API_KEY: "q",
    };
    expect(createFreeProviders(all).map((p) => p.name)).toEqual(["gemini", "cohere", "mistral", "openrouter", "groq"]);
    expect(createFreeProviders({ ...all, LLM_PROVIDER: "mistral" }).map((p) => p.name)).toEqual([
      "mistral", "gemini", "cohere", "openrouter", "groq",
    ]);
    const models = Object.fromEntries(createFreeProviders(all).map((p) => [p.name, p.model]));
    expect(models).toEqual({
      gemini: "gemini-3.8-flash",
      cohere: "command-a-plus-05-2026",
      mistral: "mistral-medium-latest",
      openrouter: "google/gemma-4-31b-it:free",
      groq: "openai/gpt-oss-120b",
    });
    expect(createFreeProviders({ OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "x:free, y:free" })[0]!.model).toBe("x:free");
    expect(createAgentOptionsFromEnv(all).mode).toBe("free");
    expect(resolveMode({ COHERE_API_KEY: "c" })).toBe("free");
    expect(resolveMode({ MISTRAL_API_KEY: "m" })).toBe("free");
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

  it("שיחה שהתחילה עם Claude לא ממשיכה בספקים החינמיים", async () => {
    const ctx = makeCtx();
    ctx.session.mode = "claude";
    const g = fakeGemini([]);
    await expect(runTurn(ctx, "שלום", freeOptions([g.provider]))).rejects.toBeInstanceOf(ProviderMismatchError);
  });

  it("מפתח Gemini לא תקין מחוץ לשרשרת: הודעה בעברית במקום ה-JSON של גוגל", () => {
    const body = JSON.stringify({ error: { code: 400, message: "API key not valid", details: [{ reason: "API_KEY_INVALID" }] } });
    expect(describeAgentError(new ApiError({ message: body, status: 400 })).status).toBe(401);
  });
});
