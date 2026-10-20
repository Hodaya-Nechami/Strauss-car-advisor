/**
 * טוען ומאמת את config/rules.json מול המבנה שה-engine מצפה לו
 * (packages/engine/src/rules.ts). שגיאה ברורה אם הקובץ חסר, לא JSON תקין,
 * או לא תואם למבנה.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Rules } from "@strauss/engine";

const rateBand = z.object({
  threshold: z.number(),
  ceiling: z.number(),
  lowRate: z.number(),
  highRate: z.number(),
});

const rulesSchema = z.object({
  version: z.string(),
  budgets: z.record(z.string(), z.number()),
  groupOrder: z.array(z.string()),
  chooseFrom: z.literal("own_group_or_lower"),
  electric: z.object({
    netBonus: z.number(),
    method: z.enum(["gross_up", "gross"]),
    eligibleDrives: z.array(z.string()).optional(),
  }),
  familyTrack: z.object({
    minChildren: z.number(),
    childMaxAge: z.number(),
    cars: z.array(z.string()),
    gapSplitEmployee: z.number(),
  }),
  waiver: z.object({
    allowedBy: z.literal("occupation"),
    maintenanceIsTaxable: z.boolean(),
    maintenanceIsPensionable: z.boolean(),
  }),
  unusedBudget: z.literal("not_paid"),
  netMethod: z.object({
    creditPointValue: z.number(),
    brackets: z.array(z.tuple([z.number().nullable(), z.number()])),
    nationalInsurance: rateBand,
    health: rateBand,
    pensionCredit: z.object({
      rate: z.number(),
      maxContributionRate: z.number(),
      incomeCeiling: z.number(),
    }),
  }),
}) satisfies z.ZodType<Rules>;

/** נזרקת על קובץ חסר, JSON שבור, או כללים שלא תואמים למבנה הצפוי. */
export class RulesLoadError extends Error {}

function defaultPath(): string {
  const configDir = process.env.CONFIG_DIR ?? resolve(process.cwd(), "..", "..", "config");
  return resolve(configDir, "rules.json");
}

export function loadRules(path: string = defaultPath()): Rules {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (err) {
    throw new RulesLoadError(`לא ניתן לקרוא את קובץ הכללים ב-${path}: ${(err as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new RulesLoadError(`קובץ הכללים ${path} אינו JSON תקין: ${(err as Error).message}`);
  }

  const result = rulesSchema.safeParse(raw);
  if (!result.success) {
    throw new RulesLoadError(`קובץ הכללים ${path} לא תואם למבנה הצפוי:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
