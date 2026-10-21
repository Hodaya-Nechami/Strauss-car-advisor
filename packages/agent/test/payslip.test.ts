/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import {
  NotAPayslipError,
  OPENROUTER_VISION_MODELS,
  claudePayslipSource,
  geminiPayslipSource,
  normalizePayslip,
  openRouterPayslipSource,
  readPayslipFrom,
  type GeminiClient,
  type PayslipSource,
  type PrintedPayslip,
} from "../src";

const file = { data: "QUJD", mimeType: "application/pdf" };

const none = { amount: null, label: null };
const printed = (over: Partial<PrintedPayslip> = {}): PrintedPayslip => ({
  isPayslip: true,
  period: "09/2026",
  baseSalary: { amount: 14200, label: "שכר יסוד" },
  commissions: { amount: 1000, label: "עמלות מכירה" },
  bonus: none,
  pensionEmployee: { rate: null, amount: 912, label: "קרן פנסיה - עובד" },
  studyFundEmployee: { rate: 2.5, amount: 380, label: "קרן השתלמות - עובד" },
  creditPoints: { value: 2.25, label: "נקודות זיכוי" },
  carValueOfUse: { amount: 4070, label: "שווי רכב" },
  carParticipation: { amount: 300, label: "השתתפות ברכב" },
  ...over,
});

describe("קריאת תלוש שכר", () => {
  it("לוקח מהתלוש את מה שמודפס, עם הכותרת שממנה כל ערך נלקח", () => {
    const r = normalizePayslip(printed());
    expect(r.fields.baseSalary).toEqual({ value: 14200, source: 'בתלוש: "שכר יסוד"' });
    expect(r.fields.commissions!.value).toBe(1000);
    expect(r.fields.studyFundRate).toEqual({ value: 2.5, source: 'בתלוש: "קרן השתלמות - עובד"' });
    expect(r.fields.creditPoints!.value).toBe(2.25);
    expect(r.car.valueOfUse!.value).toBe(4070);
    expect(r.car.participation!.value).toBe(300);
    expect(r.notes).toEqual([]);
  });

  it("אחוז פנסיה שלא מודפס מחושב בקוד מהסכום ומהשכר, לא על ידי המודל", () => {
    const r = normalizePayslip(printed());
    expect(r.fields.pensionRate).toEqual({ value: 6, source: "חושב: 912 ₪ מתוך שכר של 15,200 ₪" });
  });

  it("בונוס שלא מופיע מוצע כ-0, ומסומן כך שהעובד יראה", () => {
    expect(normalizePayslip(printed()).fields.bonus).toEqual({ value: 0, source: "לא מופיע בתלוש", assumedZero: true });
  });

  it("ערכים לא סבירים נפסלים, ומה שחסר נאמר בעברית", () => {
    const r = normalizePayslip(
      printed({ baseSalary: { amount: 12, label: "?" }, pensionEmployee: { rate: 60, amount: null, label: null }, creditPoints: { value: null, label: null } }),
    );
    expect(r.fields.baseSalary).toBeUndefined();
    expect(r.fields.pensionRate).toBeUndefined();
    expect(r.notes).toEqual([
      "לא מצאתי בתלוש שכר בסיס. כדאי להקליד אותו.",
      "לא מצאתי בתלוש את אחוז ההפרשה שלך לפנסיה.",
      "לא מצאתי בתלוש נקודות זיכוי.",
    ]);
  });

  it("מסמך שאינו תלוש נדחה בהודעה ברורה", () => {
    expect(() => normalizePayslip(printed({ isPayslip: false }))).toThrow(NotAPayslipError);
  });

  it("שולח ל-Gemini את הקובץ עם סכמה קבועה", async () => {
    const requests: any[] = [];
    const client = {
      models: {
        generateContent: async (req: unknown) => {
          requests.push(req);
          return { text: JSON.stringify(printed()) };
        },
      },
    } as unknown as GeminiClient;

    const r = await readPayslipFrom([geminiPayslipSource(client, "gemini-test")], file);
    expect(r.fields.baseSalary!.value).toBe(14200);
    expect(r.via).toBe("Gemini");
    const req = requests[0];
    expect(req.model).toBe("gemini-test");
    expect(req.contents[0].parts[0].inlineData).toEqual({ mimeType: "application/pdf", data: "QUJD" });
    expect(req.config.responseMimeType).toBe("application/json");
    expect(req.config.responseJsonSchema.required).toContain("baseSalary");
  });

  it("Gemini לא עונה: OpenRouter קורא את ה-PDF דרך מפענח הטקסט החינמי", async () => {
    const slowGemini: PayslipSource = {
      label: "Gemini",
      read: async () => {
        throw Object.assign(new Error("Deadline expired"), { status: 504 });
      },
    };
    const sent: any[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      // מודל חלש מחזיר מספרים כמחרוזות ועוטף ב-```json
      const content = "```json\n" + JSON.stringify({ ...printed(), baseSalary: { amount: "14,200.00", label: "שכר יסוד" } }) + "\n```";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await readPayslipFrom([slowGemini, openRouterPayslipSource("key", ["m1", "m2"], fakeFetch)], file);
    expect(r.via).toBe("OpenRouter");
    expect(r.fields.baseSalary!.value).toBe(14200);
    expect(sent[0].models).toEqual(["m1", "m2"]);
    expect(sent[0].plugins).toEqual([{ id: "file-parser", pdf: { engine: "pdf-text" } }]);
    expect(sent[0].messages[0].content[1].file.file_data).toBe("data:application/pdf;base64,QUJD");
  });

  it("תמונה נשלחת ל-OpenRouter רק למודלים שמבינים תמונות", async () => {
    const sent: any[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(printed()) } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await readPayslipFrom([openRouterPayslipSource("key", ["text-only"], fakeFetch)], { data: "QUJD", mimeType: "image/png" });
    expect(sent[0].models).toEqual(OPENROUTER_VISION_MODELS);
    expect(sent[0].plugins).toBeUndefined();
    expect(sent[0].messages[0].content[1].image_url.url).toBe("data:image/png;base64,QUJD");
  });

  it("כל הספקים נכשלו: הודעה בעברית עם הסיבה של כל אחד", async () => {
    const busy = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    const down: PayslipSource = { label: "Gemini", read: async () => Promise.reject(Object.assign(new Error("x"), { status: 503 })) };
    await expect(readPayslipFrom([down, openRouterPayslipSource("key", ["m"], busy)], file)).rejects.toThrow(
      "לא הצלחתי לקרוא את התלוש כרגע (Gemini: לא ענה בזמן; OpenRouter: עמוס או הגיע למכסה)",
    );
  });

  it("שולח ל-Claude את הקובץ כ-document עם tool_choice כפוי על כלי יחיד", async () => {
    const requests: any[] = [];
    const client = {
      messages: {
        create: async (req: unknown) => {
          requests.push(req);
          return { content: [{ type: "tool_use", id: "t1", name: "report_payslip", input: printed() }] };
        },
      },
    } as any;

    const r = await readPayslipFrom([claudePayslipSource(client, "claude-test")], file);
    expect(r.fields.baseSalary!.value).toBe(14200);
    expect(r.via).toBe("Claude");
    const req = requests[0];
    expect(req.model).toBe("claude-test");
    expect(req.tool_choice).toEqual({ type: "tool", name: "report_payslip" });
    expect(req.tools[0].name).toBe("report_payslip");
    expect(req.messages[0].content[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "QUJD" },
    });
  });

  it("Claude לא תומך ב-HEIC: נכשל מיד ועובר לספק הבא בלי לשלוח בקשה", async () => {
    let called = false;
    const client = { messages: { create: async () => ((called = true), { content: [] }) } } as any;
    const next: PayslipSource = { label: "next", read: async () => printed() };

    const r = await readPayslipFrom([claudePayslipSource(client, "claude-test"), next], {
      data: "QUJD",
      mimeType: "image/heic",
    });
    expect(called).toBe(false);
    expect(r.via).toBe("next");
  });

  it("מסמך שאינו תלוש עוצר מיד, בלי לשלוח אותו לספק נוסף", async () => {
    let calls = 0;
    const source = (): PayslipSource => ({ label: "x", read: async () => (calls++, { isPayslip: false }) });
    await expect(readPayslipFrom([source(), source()], file)).rejects.toThrow(NotAPayslipError);
    expect(calls).toBe(1);
  });
});
