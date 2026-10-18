/**
 * כלי הבוט (משימה A5).
 * הבוט (מודל השפה) לא מחשב ולא קובע זכאות. הוא רק מפעיל את הכלים האלה ומציג את התוצאה.
 * ההגדרות כאן לא תלויות בספק מודל. החיבור ל-Vercel AI SDK נעשה בשלב הבא (A6).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  carFromCatalog,
  checkEligibility,
  compare,
  findCatalogCar,
  type CatalogCar,
  type Comparison,
  type NetBreakdown,
  type Occupation,
  type Rules,
  type Situation,
} from "@strauss/engine";
import type { AuditLog, DataSource, RepQueue } from "./ports";
import { completeProfile, missingProfileFields, type SessionState } from "./session";

export interface ToolContext {
  session: SessionState;
  rules: Rules;
  catalog: CatalogCar[];
  occupations: Occupation[];
  data: DataSource;
  rep: RepQueue;
  audit?: AuditLog;
}

const DRIVES = ["בנזין", "היברידי", "פלאג-אין", "חשמלי"] as const;

/** איך הבוט מתאר מצב רכב: היום או חלופה */
const situationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("car"),
    car: z.string().optional().describe("מזהה רכב מהקטלוג (למשל CAR-10) או שם הדגם (למשל ATTO 3)"),
    outsideCatalog: z
      .object({
        label: z.string(),
        drive: z.enum(DRIVES),
        valueOfUse: z.number().positive(),
        registrationYear: z.number().int(),
      })
      .optional()
      .describe("רק לרכב שלא בקטלוג, עם נתונים שנשלפו ב-find_car_value_of_use"),
    participation: z
      .number()
      .min(0)
      .optional()
      .describe("השתתפות העובד ברכב בשקלים לחודש. להשמיט אם לא ידוע. אסור לנחש."),
  }),
  z.object({
    kind: z.literal("waiver"),
    maintenance: z
      .number()
      .min(0)
      .optional()
      .describe("אחזקת רכב חודשית. בחלופה אפשר להשמיט, והסכום נלקח מטבלת העיסוקים"),
  }),
]);
type SituationInput = z.infer<typeof situationSchema>;

const profileSchema = z.object({
  group: z.string().optional().describe("קבוצת זכאות: א, ב, ג או ד"),
  occupation: z.string().optional().describe("העיסוק, בדיוק כמו בטבלת העיסוקים"),
  baseSalary: z.number().min(0).optional(),
  commissions: z.number().min(0).optional(),
  bonus: z.number().min(0).optional(),
  pensionRate: z.number().min(0).max(100).optional().describe("אחוז, למשל 6"),
  studyFundRate: z.number().min(0).max(100).optional().describe("אחוז, למשל 2.5"),
  creditPoints: z.number().min(0).max(20).optional(),
  childrenUnder23: z.number().int().min(0).optional(),
});

type Result = Record<string, unknown>;

function resolveSituation(input: SituationInput, catalog: CatalogCar[]): Situation | { error: string } {
  if (input.kind === "waiver") return { kind: "waiver", maintenance: input.maintenance };
  if (input.car) {
    const c = findCatalogCar(catalog, input.car);
    if (!c) {
      return {
        error: `הרכב "${input.car}" לא בקטלוג. חפש אותו עם find_car_value_of_use ושלח אותו ב-outsideCatalog.`,
      };
    }
    return { kind: "car", car: carFromCatalog(c), participation: input.participation };
  }
  if (input.outsideCatalog) {
    const o = input.outsideCatalog;
    return {
      kind: "car",
      car: { label: o.label, drive: o.drive, valueOfUse: o.valueOfUse, registrationYear: o.registrationYear },
      participation: input.participation,
    };
  }
  return { error: "צריך לציין רכב: car (מהקטלוג) או outsideCatalog" };
}

/** מספרים מעוגלים לתצוגה, כדי שהמודל לא יעשה חשבון בעצמו */
function display(b: NetBreakdown, rules: Rules) {
  const r = Math.round;
  return {
    net: r(b.net),
    tax: r(b.tax),
    nationalInsuranceAndHealth: r(b.nationalInsurance + b.health),
    valueOfUse: r(b.valueOfUse),
    participation: r(b.participation),
    maintenance: r(b.maintenance),
    electricRefundNet: b.electricGross > 0 ? rules.electric.netBonus : 0,
    familyGapEmployee: r(b.familyGapEmployee),
    /** כל שלבי החישוב, מעוגלים, בשביל "איך חושב?" במסך */
    breakdown: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, r(v)])) as Record<keyof NetBreakdown, number>,
  };
}

function presentComparison(c: Comparison, rules: Rules): Result {
  return {
    eligibility: { status: c.eligibility.status, reason: c.eligibility.reason },
    today: c.today ? { label: c.today.label, ...display(c.today.breakdown, rules) } : null,
    alternative: c.alternative ? { label: c.alternative.label, ...display(c.alternative.breakdown, rules) } : null,
    diffNet: c.diffDisplay,
    changes: c.changes,
    explanation: c.explanation,
    missing: c.missing,
  };
}

interface ToolDef<S extends z.ZodType> {
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<Result>;
}
const def = <S extends z.ZodType>(t: ToolDef<S>) => t;

export const tools = {
  save_employee_profile: def({
    description:
      "שומר נתוני שכר ופרטים שהעובד מסר. אפשר לשלוח רק חלק מהשדות. מחזיר אילו נתוני חובה עוד חסרים. " +
      "שומרים רק מה שהעובד אמר במפורש. אם אמר שאין עמלות או בונוס, שולחים 0.",
    schema: profileSchema,
    run: async (input, ctx) => {
      const warnings: string[] = [];
      if (input.group !== undefined && !ctx.rules.groupOrder.includes(input.group)) {
        return { ok: false, error: `קבוצת זכאות לא מוכרת: ${input.group}. הקבוצות הן ${ctx.rules.groupOrder.join(", ")}` };
      }
      if (input.occupation !== undefined) {
        const occ = ctx.occupations.find((o) => o.name === input.occupation);
        if (!occ) warnings.push(`העיסוק "${input.occupation}" לא בטבלה. ויתור על רכב ייבדק מול נציג.`);
      }
      const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      Object.assign(ctx.session.profile, clean);
      return { ok: true, profile: ctx.session.profile, missing: missingProfileFields(ctx.session.profile), warnings };
    },
  }),

  list_occupations: def({
    description:
      "מחזיר את טבלת העיסוקים: קבוצת הזכאות של כל עיסוק, האם הרכב חובה, האם מותר לוותר ובכמה אחזקת רכב. " +
      "משתמשים בזה כשהעובד לא יודע את קבוצת הזכאות שלו, או כדי לשמור את העיסוק בשם המדויק שבטבלה.",
    schema: z.object({}),
    run: async (_input, ctx) => ({ ok: true, occupations: ctx.occupations }),
  }),

  get_rules: def({
    description:
      "מחזיר את כללי החברה המעודכנים: תקציב לכל קבוצה, החזר חשמל, מסלול ברוכת ילדים, ויתור, ותקציב שלא נוצל. " +
      "משתמשים בזה כדי להסביר כללים לעובד. לא משתמשים בזה כדי לחשב נטו.",
    schema: z.object({}),
    run: async (_input, ctx) => {
      const r = ctx.rules;
      return {
        ok: true,
        budgets: r.budgets,
        chooseFrom: "אפשר לבחור רכב מהקבוצה שלך או מקבוצה נמוכה ממנה, לא מקבוצה גבוהה",
        electric: `רכב חשמלי מקבל החזר חשמל של ${r.electric.netBonus} ₪ ${r.electric.method === "gross_up" ? "נטו (מגולם)" : "ברוטו"} בחודש`,
        electricDrives: r.electric.eligibleDrives ?? ["חשמלי"],
        familyTrack: `מסלול ברוכת ילדים: ${r.familyTrack.minChildren} ילדים ומעלה עד גיל ${r.familyTrack.childMaxAge}. על הפער מעל תקציב הקבוצה העובד משלם ${Math.round(r.familyTrack.gapSplitEmployee * 100)}% והמעסיק את השאר`,
        waiver: "ויתור על רכב רק בעיסוקים שמאפשרים זאת. במקום רכב מקבלים אחזקת רכב לפי טבלת העיסוקים. האחזקה חייבת במס ולא נכנסת לפנסיה",
        unusedBudget: "תקציב רכב שלא נוצל לא הופך לכסף בשכר",
      };
    },
  }),

  list_catalog: def({
    description:
      "מחזיר את הרכבים שהעובד יכול לבחור: מהקבוצה שלו ומהקבוצות הנמוכות ממנה, " +
      "ואת רכבי מסלול ברוכת ילדים אם יש לו 4 ילדים ומעלה עד גיל 23.",
    schema: z.object({}),
    run: async (_input, ctx) => {
      const group = ctx.session.profile.group;
      if (!group) return { ok: false, missing: ["קבוצת זכאות (א-ד)"] };
      const empIdx = ctx.rules.groupOrder.indexOf(group);
      const children = ctx.session.profile.childrenUnder23;
      const family = children !== undefined && children >= ctx.rules.familyTrack.minChildren;
      const cars = ctx.catalog
        .filter((c) =>
          c.group === "משפחתי" ? family : ctx.rules.groupOrder.indexOf(c.group) <= empIdx,
        )
        .map((c) => ({
          id: c.id,
          group: c.group,
          manufacturer: c.manufacturer,
          model: c.model,
          registrationYear: c.registrationYear,
          drive: c.drive,
          valueOfUse: c.valueOfUse,
        }));
      const note =
        children === undefined
          ? "מספר הילדים לא ידוע, ולכן רכבי מסלול ברוכת ילדים לא מוצגים."
          : undefined;
      return { ok: true, group, cars, note };
    },
  }),

  find_car_value_of_use: def({
    description:
      "מחפש רכב במאגר שווי השימוש של רשות המסים, לרכב שלא בקטלוג (למשל הרכב הנוכחי של העובד). " +
      "אם חוזרת יותר מהתאמה אחת עם שווי שימוש שונה, אסור לבחור לבד: שואלים את העובד או את הנציג.",
    schema: z.object({
      text: z.string().min(2).describe("שם מסחרי או תוצר, למשל COROLLA"),
      registrationYear: z.number().int().optional(),
    }),
    run: async (input, ctx) => {
      const rows = await ctx.data.searchCars(input.text, input.registrationYear, 10);
      const values = new Set(rows.map((r) => r.valueOfUse));
      return {
        ok: true,
        matches: rows,
        ambiguous: values.size > 1,
        instruction:
          rows.length === 0
            ? "לא נמצא. בקש מהעובד תוצר, דגם ושנת רישום מדויקים, או שאל את הנציג."
            : values.size > 1
              ? "יש כמה התאמות עם שווי שימוש שונה. בקש מהעובד לבחור, ואם אינו יודע שאל את הנציג."
              : "התאמה חד-משמעית.",
      };
    },
  }),

  check_eligibility: def({
    description: "בודק אם העובד זכאי לחלופה (רכב או ויתור), ולמה. משתמשים בזה לפני שמציעים חלופה.",
    schema: z.object({ alternative: situationSchema }),
    run: async (input, ctx) => {
      const alt = resolveSituation(input.alternative, ctx.catalog);
      if ("error" in alt) return { ok: false, error: alt.error };
      const group = ctx.session.profile.group;
      if (!group) return { ok: false, missing: ["קבוצת זכאות (א-ד)"] };
      const profile = { ...completeProfile({ ...placeholderSalary, ...ctx.session.profile })! };
      if (ctx.session.profile.childrenUnder23 === undefined && alt.kind === "car" && alt.car.catalogGroup === "משפחתי") {
        return { ok: false, missing: ["מספר ילדים עד גיל 23"] };
      }
      const e = checkEligibility(profile, alt, ctx.occupations, ctx.rules);
      return { ok: true, ...e };
    },
  }),

  calculate_comparison: def({
    description:
      "מחשב נטו היום מול נטו בחלופה, עם פירוט מה השתנה והסבר של שתי שורות. " +
      "זה המקור היחיד למספרים. מציגים לעובד את המספרים בדיוק כמו שחזרו. " +
      "אם חוזרת רשימת missing, מציגים את מה שכן חושב ושואלים על החסר (או שולחים לנציג).",
    schema: z.object({ today: situationSchema, alternative: situationSchema }),
    run: async (input, ctx) => {
      const missingProfile = missingProfileFields(ctx.session.profile);
      if (missingProfile.length) return { ok: false, missing: missingProfile, message: "חסרים נתוני שכר לחישוב" };
      const today = resolveSituation(input.today, ctx.catalog);
      if ("error" in today) return { ok: false, error: today.error };
      const alternative = resolveSituation(input.alternative, ctx.catalog);
      if ("error" in alternative) return { ok: false, error: alternative.error };
      if (
        ctx.session.profile.childrenUnder23 === undefined &&
        alternative.kind === "car" &&
        alternative.car.catalogGroup === "משפחתי"
      ) {
        return { ok: false, missing: ["מספר ילדים עד גיל 23"] };
      }
      const profile = completeProfile(ctx.session.profile)!;
      const c = compare({ profile, today, alternative, occupations: ctx.occupations, rules: ctx.rules });
      return { ok: true, ...presentComparison(c, ctx.rules) };
    },
  }),

  ask_representative: def({
    description:
      "שולח שאלה לנציג התחבורה כשחסר נתון שהעובד לא יודע (למשל השתתפות ברכב חדש), " +
      "או כשהזכאות לא ברורה. אחרי השליחה אומרים לעובד: 'חסר לי X, שאלתי את הנציג'.",
    schema: z.object({
      about: z.string().describe("על איזה נתון, למשל: השתתפות ברכב החדש"),
      question: z.string().describe("השאלה המלאה לנציג, עם ההקשר הדרוש"),
    }),
    run: async (input, ctx) => {
      const { ticketId } = await ctx.rep.ask({ sessionId: ctx.session.id, ...input });
      ctx.session.pendingQuestions.push({ ticketId, ...input });
      return { ok: true, ticketId, message: `השאלה נשלחה לנציג (פנייה ${ticketId})` };
    },
  }),
};

/** ערכי שכר זמניים לבדיקת זכאות בלבד. זכאות לא תלויה בשכר. */
const placeholderSalary = {
  baseSalary: 0,
  commissions: 0,
  bonus: 0,
  pensionRate: 0,
  studyFundRate: 0,
  creditPoints: 0,
};

export type ToolName = keyof typeof tools;

/**
 * הגדרות הכלים כמו ש-Claude מקבל אותן. נבנות פעם אחת ונשארות זהות לאורך כל השיחה:
 * שינוי ברשימת הכלים באמצע שיחה פוסל את ה"חשיבה" השמורה של המודל ואת ה-cache.
 */
export const toolDefinitions: Anthropic.Beta.BetaTool[] = Object.entries(tools).map(([name, t]) => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
  return {
    name,
    description: t.description,
    input_schema: { ...schema, type: "object" } as Anthropic.Beta.BetaTool.InputSchema,
  };
});

/**
 * מפעיל כלי לפי שם: בודק את הקלט, מריץ, רושם ביומן.
 * שגיאה לא מפילה את השיחה. היא חוזרת לבוט כדי שיתקן.
 */
export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<Result> {
  const registry = tools as unknown as Record<string, ToolDef<z.ZodType> | undefined>;
  const tool = Object.hasOwn(registry, name) ? registry[name] : undefined;
  let output: Result;
  if (!tool) {
    output = { ok: false, error: `אין כלי בשם ${name}` };
  } else {
    const parsed = tool.schema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      output = { ok: false, error: "קלט לא תקין", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    } else {
      try {
        output = await tool.run(parsed.data, ctx);
      } catch (err) {
        output = { ok: false, error: `שגיאה פנימית: ${(err as Error).message}` };
      }
    }
  }
  ctx.audit?.({ sessionId: ctx.session.id, tool: name, input: rawInput, output, at: new Date().toISOString() });
  return output;
}
