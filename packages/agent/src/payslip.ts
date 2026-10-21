/**
 * קריאת תלוש שכר: העובד מעלה תלוש (PDF או תמונה), והנתונים לחישוב נקראים ממנו.
 * המודל רק קורא את מה שמודפס בתלוש, בלי לחשב ובלי להשלים. החישובים (למשל אחוז מהסכום) נעשים כאן בקוד.
 * שום דבר לא נשמר: העובד רואה את מה שנקרא, מתקן ומאשר, ורק אז הנתונים נשמרים בשיחה.
 * התלוש עצמו לא נשמר ולא נרשם ביומן.
 */
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_CLAUDE_MODEL } from "./claude";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OPENROUTER_MODELS, OPENROUTER_BASE_URL, type GeminiClient } from "./free";

export const PAYSLIP_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const PAYSLIP_MAX_BYTES = 8 * 1024 * 1024;

/** סכום כמו שמודפס בתלוש, עם הכותרת שמופיעה לידו */
interface PrintedAmount {
  amount: number | null;
  label: string | null;
}
interface PrintedContribution extends PrintedAmount {
  /** האחוז, רק אם הוא מודפס בתלוש */
  rate: number | null;
}

/** מה שהמודל מחזיר: רק מה שמודפס, בלי חישובים */
export interface PrintedPayslip {
  isPayslip: boolean;
  period: string | null;
  baseSalary: PrintedAmount;
  commissions: PrintedAmount;
  bonus: PrintedAmount;
  pensionEmployee: PrintedContribution;
  studyFundEmployee: PrintedContribution;
  creditPoints: { value: number | null; label: string | null };
  carValueOfUse: PrintedAmount;
  carParticipation: PrintedAmount;
}

const amount = (what: string) => ({
  type: "object",
  description: what,
  properties: {
    amount: { type: ["number", "null"], description: "הסכום החודשי בשקלים, בדיוק כמו שמודפס. null אם לא מופיע" },
    label: { type: ["string", "null"], description: "הכותרת שמודפסת ליד הסכום, מילה במילה" },
  },
  required: ["amount", "label"],
});

const contribution = (what: string) => ({
  type: "object",
  description: what,
  properties: {
    rate: { type: ["number", "null"], description: "האחוז, רק אם הוא מודפס בתלוש. למשל 6 עבור 6%. null אם לא מודפס" },
    amount: { type: ["number", "null"], description: "הסכום החודשי שנוכה מהעובד, בשקלים. null אם לא מופיע" },
    label: { type: ["string", "null"], description: "הכותרת שמודפסת ליד הסכום, מילה במילה" },
  },
  required: ["rate", "amount", "label"],
});

export const PAYSLIP_SCHEMA = {
  type: "object",
  properties: {
    isPayslip: { type: "boolean", description: "האם המסמך הוא תלוש שכר" },
    period: { type: ["string", "null"], description: "חודש התלוש כמו שמודפס, למשל 09/2026" },
    baseSalary: amount("שכר יסוד / שכר בסיס / משכורת בסיס"),
    commissions: amount("עמלות"),
    bonus: amount("בונוס / פרמיה"),
    pensionEmployee: contribution("הפרשת העובד לפנסיה (תגמולי עובד), לא של המעסיק"),
    studyFundEmployee: contribution("הפרשת העובד לקרן השתלמות, לא של המעסיק"),
    creditPoints: {
      type: "object",
      properties: {
        value: { type: ["number", "null"], description: "מספר נקודות הזיכוי, למשל 2.25" },
        label: { type: ["string", "null"] },
      },
      required: ["value", "label"],
    },
    carValueOfUse: amount("שווי שימוש ברכב / שווי רכב (זקיפת הטבה, לא תשלום)"),
    carParticipation: amount("ניכוי השתתפות העובד ברכב"),
  },
  required: [
    "isPayslip",
    "period",
    "baseSalary",
    "commissions",
    "bonus",
    "pensionEmployee",
    "studyFundEmployee",
    "creditPoints",
    "carValueOfUse",
    "carParticipation",
  ],
};

export const PAYSLIP_PROMPT = `זה מסמך שעובד העלה כדי לחשב איך שינוי ברכב החברה ישפיע על הנטו שלו.
אם זה תלוש שכר, קרא ממנו רק את השדות שבסכמה, בדיוק כמו שהם מודפסים.
- אל תחשב, אל תשלים ואל תנחש. שדה שלא מופיע בתלוש: null.
- אחוז מחזירים רק אם הוא מודפס. אם מודפס רק סכום, מחזירים את הסכום והאחוז null.
- הפרשות: רק החלק של העובד, לא של המעסיק.
- label: הכותרת המודפסת ליד המספר, מילה במילה.
- אל תחזיר שם, תעודת זהות, כתובת, מספר חשבון או כל פרט מזהה אחר.
אם המסמך אינו תלוש שכר, החזר isPayslip=false וכל השדות null.`;

/** מה שהעובד רואה לאישור: ערך, ומאיפה הוא הגיע */
export interface PayslipValue {
  value: number;
  /** מאיפה הערך: הכותרת בתלוש, או איך הוא חושב */
  source: string;
  /** true כשהערך לא מופיע בתלוש וההצעה היא 0 */
  assumedZero?: boolean;
}

export interface PayslipReading {
  period: string | null;
  fields: Partial<
    Record<"baseSalary" | "commissions" | "bonus" | "pensionRate" | "studyFundRate" | "creditPoints", PayslipValue>
  >;
  /** מידע על הרכב היום, לא נשמר בפרופיל אלא נמסר לבוט אחרי אישור */
  car: Partial<Record<"valueOfUse" | "participation", PayslipValue>>;
  /** מה לא נמצא או נפסל, בעברית */
  notes: string[];
  /** איזה ספק קרא את התלוש */
  via?: string;
}

export class NotAPayslipError extends Error {
  constructor() {
    super("המסמך שהועלה לא נראה כמו תלוש שכר. אפשר להעלות תלוש אחר, או פשוט לכתוב את הנתונים בצ'אט.");
  }
}

const ils = (n: number) => `${Math.round(n).toLocaleString("en-US")} ₪`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const valid = (n: number | null | undefined, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

/**
 * הופך את מה שהמודל קרא לערכים לאישור העובד.
 * אחוז הפרשה שלא מודפס מחושב כאן מהסכום ומהשכר. ערך לא סביר נפסל ולא מוצע.
 */
export function normalizePayslip(p: PrintedPayslip): PayslipReading {
  if (!p.isPayslip) throw new NotAPayslipError();
  const fields: PayslipReading["fields"] = {};
  const car: PayslipReading["car"] = {};
  const notes: string[] = [];
  const from = (label: string | null, fallback: string) => `בתלוש: "${label?.trim() || fallback}"`;

  if (valid(p.baseSalary.amount, 1000, 500_000)) {
    fields.baseSalary = { value: p.baseSalary.amount, source: from(p.baseSalary.label, "שכר יסוד") };
  } else notes.push("לא מצאתי בתלוש שכר בסיס. כדאי להקליד אותו.");

  for (const key of ["commissions", "bonus"] as const) {
    const a = p[key].amount;
    if (valid(a, 0, 500_000)) fields[key] = { value: a, source: from(p[key].label, key === "commissions" ? "עמלות" : "בונוס") };
    else fields[key] = { value: 0, source: "לא מופיע בתלוש", assumedZero: true };
  }

  const salary = (fields.baseSalary?.value ?? 0) + (fields.commissions?.value ?? 0) + (fields.bonus?.value ?? 0);
  const rateOf = (c: PrintedContribution, name: string, max: number): PayslipValue | undefined => {
    if (valid(c.rate, 0, max)) return { value: c.rate, source: from(c.label, name) };
    if (valid(c.amount, 0, 100_000) && salary > 0) {
      const rate = round2((c.amount / salary) * 100);
      if (valid(rate, 0, max)) return { value: rate, source: `חושב: ${ils(c.amount)} מתוך שכר של ${ils(salary)}` };
    }
    return undefined;
  };

  const pension = rateOf(p.pensionEmployee, "פנסיה", 10);
  if (pension) fields.pensionRate = pension;
  else notes.push("לא מצאתי בתלוש את אחוז ההפרשה שלך לפנסיה.");

  fields.studyFundRate = rateOf(p.studyFundEmployee, "קרן השתלמות", 5) ?? {
    value: 0,
    source: "לא מופיע בתלוש",
    assumedZero: true,
  };

  if (valid(p.creditPoints.value, 0, 20)) {
    fields.creditPoints = { value: p.creditPoints.value, source: from(p.creditPoints.label, "נקודות זיכוי") };
  } else notes.push("לא מצאתי בתלוש נקודות זיכוי.");

  if (valid(p.carValueOfUse.amount, 100, 50_000)) {
    car.valueOfUse = { value: p.carValueOfUse.amount, source: from(p.carValueOfUse.label, "שווי רכב") };
  }
  if (valid(p.carParticipation.amount, 0, 20_000)) {
    car.participation = { value: p.carParticipation.amount, source: from(p.carParticipation.label, "השתתפות ברכב") };
  }

  return { period: p.period, fields, car, notes };
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[,%₪\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** מסדר את מה שהמודל החזיר למבנה הקבוע. מודלים חלשים לפעמים מחזירים מספר כמחרוזת, או משמיטים שדה. */
export function coercePrinted(raw: unknown): PrintedPayslip {
  const r = obj(raw);
  const printedAmount = (k: string): PrintedAmount => {
    const o = obj(r[k]);
    return { amount: num(o.amount), label: str(o.label) };
  };
  const printedContribution = (k: string): PrintedContribution => {
    const o = obj(r[k]);
    return { rate: num(o.rate), amount: num(o.amount), label: str(o.label) };
  };
  const credit = obj(r.creditPoints);
  return {
    isPayslip: r.isPayslip === true || r.isPayslip === "true",
    period: str(r.period),
    baseSalary: printedAmount("baseSalary"),
    commissions: printedAmount("commissions"),
    bonus: printedAmount("bonus"),
    pensionEmployee: printedContribution("pensionEmployee"),
    studyFundEmployee: printedContribution("studyFundEmployee"),
    creditPoints: { value: num(credit.value), label: str(credit.label) },
    carValueOfUse: printedAmount("carValueOfUse"),
    carParticipation: printedAmount("carParticipation"),
  };
}

/** תקלה אצל ספק אחד. עוברים לספק הבא. */
export class PayslipProviderError extends Error {}

/** JSON מתוך תשובת מודל, גם כשהוא עטוף בגדר קוד או בטקסט */
export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new PayslipProviderError("לא החזיר JSON");
  return JSON.parse(text.slice(start, end + 1));
}

export interface PayslipFile {
  /** הקובץ ב-base64 */
  data: string;
  mimeType: string;
}

/** ספק שיודע לקרוא תלוש. מחזיר רק את מה שמודפס, בלי חישובים. */
export interface PayslipSource {
  label: string;
  read(file: PayslipFile): Promise<unknown>;
}

/** כל הספקים נכשלו */
export class PayslipReadError extends Error {
  constructor(readonly failures: { provider: string; reason: string }[]) {
    super(
      `לא הצלחתי לקרוא את התלוש כרגע (${failures.map((f) => `${f.provider}: ${f.reason}`).join("; ")}). ` +
        "נסו שוב בעוד דקה, או כתבו את הנתונים בצ'אט.",
    );
  }
}

/** Gemini קורא PDF ותמונות בעצמו, ומחזיר JSON לפי הסכמה */
export function geminiPayslipSource(client: GeminiClient, model: string): PayslipSource {
  return {
    label: "Gemini",
    async read(file) {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: file.mimeType, data: file.data } }, { text: PAYSLIP_PROMPT }] }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: PAYSLIP_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      return parseModelJson(response.text ?? "");
    },
  };
}

/** מודלים חינמיים ב-OpenRouter שמבינים תמונות */
export const OPENROUTER_VISION_MODELS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"];

/**
 * OpenRouter: PDF עובר דרך מפענח הטקסט החינמי שלו (pdf-text), ולכן כל מודל מתאים.
 * תמונה צריכה מודל שמבין תמונות.
 */
export function openRouterPayslipSource(
  apiKey: string,
  models: string[] = DEFAULT_OPENROUTER_MODELS,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 90_000,
): PayslipSource {
  return {
    label: "OpenRouter",
    async read(file) {
      const pdf = file.mimeType === "application/pdf";
      const ask = `${PAYSLIP_PROMPT}\nהחזר JSON בלבד, בדיוק במבנה הזה (JSON Schema):\n${JSON.stringify(PAYSLIP_SCHEMA)}`;
      const attachment = pdf
        ? { type: "file", file: { filename: "payslip.pdf", file_data: `data:application/pdf;base64,${file.data}` } }
        : { type: "image_url", image_url: { url: `data:${file.mimeType};base64,${file.data}` } };
      const res = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-OpenRouter-Title": "Strauss Car Advisor" },
        body: JSON.stringify({
          models: pdf ? models : OPENROUTER_VISION_MODELS,
          messages: [{ role: "user", content: [{ type: "text", text: ask }, attachment] }],
          response_format: { type: "json_object" },
          ...(pdf ? { plugins: [{ id: "file-parser", pdf: { engine: "pdf-text" } }] } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
      const content = body?.choices?.[0]?.message?.content;
      if (!res.ok || !content) throw new PayslipProviderError(failureFromStatus(res.status));
      return parseModelJson(content);
    },
  };
}

/** תמונות שClaude קורא ישירות. HEIC לא נתמך - נופל לספק הבא. */
const CLAUDE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Claude: קורא PDF ותמונות בעצמו, ומחזיר JSON מובנה דרך כלי יחיד עם tool_choice כפוי */
export function claudePayslipSource(client: Pick<Anthropic, "messages">, model: string = DEFAULT_CLAUDE_MODEL): PayslipSource {
  return {
    label: "Claude",
    async read(file) {
      const isPdf = file.mimeType === "application/pdf";
      if (!isPdf && !CLAUDE_IMAGE_TYPES.has(file.mimeType)) {
        throw new PayslipProviderError(`לא תומך בפורמט ${file.mimeType}`);
      }
      const block: Anthropic.Messages.ContentBlockParam = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } }
        : {
            type: "image",
            source: {
              type: "base64",
              media_type: file.mimeType as Anthropic.Messages.Base64ImageSource["media_type"],
              data: file.data,
            },
          };
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        messages: [{ role: "user", content: [block, { type: "text", text: PAYSLIP_PROMPT }] }],
        tools: [
          {
            name: "report_payslip",
            description: "מחזיר את מה שמודפס בתלוש, לפי הסכמה",
            input_schema: PAYSLIP_SCHEMA as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: "report_payslip" },
      });
      const toolUse = response.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
      if (!toolUse) throw new PayslipProviderError("לא החזיר תשובה מובנית");
      return toolUse.input;
    },
  };
}

function failureFromStatus(status: number): string {
  if (status === 429) return "עמוס או הגיע למכסה";
  if (status === 401 || status === 403) return "המפתח לא תקין";
  if (status === 418) return "חסום בסינון האינטרנט";
  if (status === 408 || status === 503 || status === 504) return "לא ענה בזמן";
  return status ? `שגיאה ${status}` : "לא החזיר תשובה";
}

function failureReason(err: unknown): string {
  if (err instanceof PayslipProviderError) return err.message;
  if (err instanceof SyntaxError) return "החזיר תשובה לא תקינה";
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError" || /timed? ?out/i.test(err.message))) {
    return "לא ענה בזמן";
  }
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? failureFromStatus(status) : "לא זמין";
}

/**
 * קורא את התלוש אצל הספק הראשון שמצליח. מסמך שאינו תלוש עוצר מיד, כי ספק אחר לא ישנה את התשובה.
 */
export async function readPayslipFrom(sources: PayslipSource[], file: PayslipFile): Promise<PayslipReading> {
  const failures: { provider: string; reason: string }[] = [];
  for (const source of sources) {
    try {
      const reading = normalizePayslip(coercePrinted(await source.read(file)));
      return { ...reading, via: source.label };
    } catch (err) {
      if (err instanceof NotAPayslipError) throw err;
      failures.push({ provider: source.label, reason: failureReason(err) });
      console.warn(`[payslip] ${source.label} failed (${failures.at(-1)!.reason}). Trying the next provider.`);
    }
  }
  throw new PayslipReadError(failures);
}

export type PayslipReader = (file: PayslipFile) => Promise<PayslipReading>;

/** קורא תלושים לפי המפתחות שבסביבה: Gemini, ואם הוא לא עונה, OpenRouter, ואם יש מפתח Claude גם הוא. null כשאין אף מפתח מתאים. */
export function payslipReaderFromEnv(env: Record<string, string | undefined>): PayslipReader | null {
  const sources: PayslipSource[] = [];
  if (env.GEMINI_API_KEY) {
    const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 45_000 } });
    sources.push(geminiPayslipSource(client, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL));
  }
  if (env.OPENROUTER_API_KEY) {
    const models = env.OPENROUTER_MODEL?.split(",").map((m) => m.trim()).filter(Boolean);
    sources.push(openRouterPayslipSource(env.OPENROUTER_API_KEY, models?.length ? models : DEFAULT_OPENROUTER_MODELS));
  }
  if (env.ANTHROPIC_API_KEY) {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    sources.push(claudePayslipSource(client, env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL));
  }
  return sources.length ? (file) => readPayslipFrom(sources, file) : null;
}
