/**
 * הגדרות הכלים בפורמט שכל הספקים החינמיים מבינים.
 *
 * כל ספק מקבל תת-קבוצה אחרת של JSON Schema. לכן מפשטים פעם אחת:
 * איחוד של כמה צורות אובייקט (למשל רכב או ויתור) הופך לאובייקט אחד עם שדה kind,
 * ומשמיטים מילות מפתח שחלק מהספקים לא מכירים. הבדיקה המלאה של הקלט נשארת ב-zod שבכלי עצמו.
 */
import { Type, type FunctionDeclaration, type Schema } from "@google/genai";
import type OpenAI from "openai";
import { z } from "zod";
import { tools } from "./tools";

type Json = Record<string, unknown>;

/** גבולות ענקיים ש-zod מוסיף למספרים שלמים לא אומרים כלום למודל */
const MEANINGFUL_LIMIT = 1e12;

function mergeObjectVariants(variants: Json[]): Json {
  const properties: Record<string, Json> = {};
  for (const variant of variants) {
    for (const [key, prop] of Object.entries((variant.properties ?? {}) as Record<string, Json>)) {
      const existing = properties[key];
      if (!existing) properties[key] = prop;
      else if (Array.isArray(existing.enum) && Array.isArray(prop.enum)) {
        properties[key] = { ...existing, enum: [...new Set([...existing.enum, ...prop.enum])] };
      }
    }
  }
  const requiredLists = variants.map((v) => (Array.isArray(v.required) ? (v.required as string[]) : []));
  const required = requiredLists.reduce((acc, list) => acc.filter((k) => list.includes(k)));
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** JSON Schema פשוט: בלי oneOf, anyOf, const, additionalProperties או גבולות חסרי משמעות */
export function flattenSchema(s: Json): Json {
  const variants = (s.oneOf ?? s.anyOf) as Json[] | undefined;
  if (Array.isArray(variants)) {
    const merged = mergeObjectVariants(variants.map(flattenSchema));
    return typeof s.description === "string" ? { ...merged, description: s.description } : merged;
  }

  const out: Json = {};
  if (typeof s.description === "string") out.description = s.description;
  if (s.const !== undefined) {
    out.type = typeof s.const === "number" ? "number" : "string";
    out.enum = [s.const];
    return out;
  }
  if (typeof s.type === "string") out.type = s.type;
  if (Array.isArray(s.enum)) out.enum = s.enum;

  if (s.type === "object") {
    const props = (s.properties ?? {}) as Record<string, Json>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, flattenSchema(v)]));
    if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  }
  if (s.type === "array" && s.items && typeof s.items === "object") out.items = flattenSchema(s.items as Json);
  if (s.type === "number" || s.type === "integer") {
    const min = typeof s.minimum === "number" ? s.minimum : typeof s.exclusiveMinimum === "number" ? s.exclusiveMinimum : undefined;
    if (min !== undefined && Math.abs(min) < MEANINGFUL_LIMIT) out.minimum = min;
    if (typeof s.maximum === "number" && Math.abs(s.maximum) < MEANINGFUL_LIMIT) out.maximum = s.maximum;
  }
  return out;
}

const GEMINI_TYPES: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/** Gemini מצפה לשמות סוגים באותיות גדולות, ולערכי enum כמחרוזות */
export function toGeminiSchema(flat: Json): Schema {
  const out: Schema = {};
  if (typeof flat.description === "string") out.description = flat.description;
  const type = GEMINI_TYPES[String(flat.type)];
  if (type) out.type = type;
  if (Array.isArray(flat.enum)) out.enum = flat.enum.map(String);
  if (flat.properties) {
    out.properties = Object.fromEntries(
      Object.entries(flat.properties as Record<string, Json>).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (Array.isArray(flat.required)) out.required = flat.required as string[];
  if (flat.items) out.items = toGeminiSchema(flat.items as Json);
  if (typeof flat.minimum === "number") out.minimum = flat.minimum;
  if (typeof flat.maximum === "number") out.maximum = flat.maximum;
  return out;
}

const flatSchemas = Object.entries(tools).map(([name, t]) => ({
  name,
  description: t.description,
  schema: flattenSchema(z.toJSONSchema(t.schema) as Json),
}));

const hasParameters = (schema: Json) => Object.keys((schema.properties ?? {}) as object).length > 0;

/** כל הכלים בפורמט של Gemini. נבנים פעם אחת ונשארים זהים לאורך כל שיחה. */
export const geminiFunctionDeclarations: FunctionDeclaration[] = flatSchemas.map(({ name, description, schema }) => ({
  name,
  description,
  ...(hasParameters(schema) ? { parameters: toGeminiSchema(schema) } : {}),
}));

/** כל הכלים בפורמט של OpenAI, שבו משתמשים Groq ו-OpenRouter */
export const openAITools: OpenAI.Chat.Completions.ChatCompletionFunctionTool[] = flatSchemas.map(
  ({ name, description, schema }) => ({
    type: "function",
    function: {
      name,
      description,
      parameters: hasParameters(schema) ? schema : { type: "object", properties: {} },
    },
  }),
);
