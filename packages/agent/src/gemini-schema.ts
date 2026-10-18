/**
 * הגדרות הכלים בפורמט של Gemini.
 * Gemini מקבל תת-קבוצה של JSON Schema, ולכן ממירים בזהירות:
 * איחוד של כמה צורות אובייקט (למשל רכב או ויתור) הופך לאובייקט אחד עם שדה kind,
 * ומשמיטים מילות מפתח שהוא לא מכיר. הבדיקה המלאה של הקלט נשארת ב-zod שבכלי עצמו.
 */
import { Type, type FunctionDeclaration, type Schema } from "@google/genai";
import { z } from "zod";
import { tools } from "./tools";

type Json = Record<string, unknown>;

const TYPES: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/** גבולות ענקיים ש-zod מוסיף למספרים שלמים לא אומרים כלום למודל */
const MEANINGFUL_LIMIT = 1e12;

function mergeObjectVariants(variants: Schema[]): Schema {
  const properties: Record<string, Schema> = {};
  for (const variant of variants) {
    for (const [key, prop] of Object.entries(variant.properties ?? {})) {
      const existing = properties[key];
      if (!existing) properties[key] = prop;
      else if (existing.enum && prop.enum) {
        properties[key] = { ...existing, enum: [...new Set([...existing.enum, ...prop.enum])] };
      }
    }
  }
  const requiredLists = variants.map((v) => v.required ?? []);
  const required = requiredLists.reduce((acc, list) => acc.filter((k) => list.includes(k)));
  return { type: Type.OBJECT, properties, ...(required.length ? { required } : {}) };
}

export function toGeminiSchema(s: Json): Schema {
  const variants = (s.oneOf ?? s.anyOf) as Json[] | undefined;
  if (Array.isArray(variants)) {
    const merged = mergeObjectVariants(variants.map(toGeminiSchema));
    return typeof s.description === "string" ? { ...merged, description: s.description } : merged;
  }

  const out: Schema = {};
  if (typeof s.description === "string") out.description = s.description;

  if (s.const !== undefined) {
    out.type = Type.STRING;
    out.enum = [String(s.const)];
    return out;
  }

  const type = TYPES[String(s.type)];
  if (type) out.type = type;
  if (Array.isArray(s.enum)) out.enum = s.enum.map(String);

  if (type === Type.OBJECT) {
    const props = (s.properties ?? {}) as Record<string, Json>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
    if (Array.isArray(s.required) && s.required.length) out.required = s.required.map(String);
  }
  if (type === Type.ARRAY && s.items && typeof s.items === "object") out.items = toGeminiSchema(s.items as Json);
  if (type === Type.NUMBER || type === Type.INTEGER) {
    const min = typeof s.minimum === "number" ? s.minimum : typeof s.exclusiveMinimum === "number" ? s.exclusiveMinimum : undefined;
    if (min !== undefined && Math.abs(min) < MEANINGFUL_LIMIT) out.minimum = min;
    if (typeof s.maximum === "number" && Math.abs(s.maximum) < MEANINGFUL_LIMIT) out.maximum = s.maximum;
  }
  return out;
}

export function toGeminiDeclaration(name: string, description: string, jsonSchema: Json): FunctionDeclaration {
  const parameters = toGeminiSchema(jsonSchema);
  const hasParameters = Object.keys(parameters.properties ?? {}).length > 0;
  return { name, description, ...(hasParameters ? { parameters } : {}) };
}

/** כל הכלים בפורמט של Gemini. נבנים פעם אחת ונשארים זהים לאורך כל שיחה. */
export const geminiFunctionDeclarations: FunctionDeclaration[] = Object.entries(tools).map(([name, t]) =>
  toGeminiDeclaration(name, t.description, z.toJSONSchema(t.schema) as Json),
);
