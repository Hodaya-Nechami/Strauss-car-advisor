import { describe, expect, it } from "vitest";
import { compare, rankAlternatives, roundToTotal } from "../src";
import { alternativeOf, carSituation, catalog, employee, occupations, reference, rules, todayOf } from "./fixtures";

const run = (id: string) => {
  const e = employee(id);
  return compare({ profile: e, today: todayOf(e), alternative: alternativeOf[id]!, occupations, rules });
};

describe("לאן הלך כל שקל: פירוק ההפרש לסיבות", () => {
  for (const ref of reference) {
    it(`${ref.id}: הסיבות מסתכמות בדיוק להפרש, גם לפני עיגול וגם אחריו`, () => {
      const r = run(ref.id);
      const raw = r.bridge.reduce((s, b) => s + b.amount, 0);
      expect(raw).toBeCloseTo(r.diff!, 6);
      expect(r.bridge.reduce((s, b) => s + b.display, 0)).toBe(ref.diff);
    });
  }

  it("נועה לוי: שווי שימוש נמוך יותר חוסך 411 ₪, והחזר החשמל מוסיף 250 ₪", () => {
    expect(run("E-001").bridge.map((b) => [b.kind, b.display])).toEqual([
      ["valueOfUse", 411],
      ["electric", 250],
    ]);
  });

  it("מיכל אברהם, ויתור: בלי שווי שימוש, עם אחזקה חייבת במס ובלי השתתפות", () => {
    const b = run("E-005").bridge;
    expect(b.map((s) => s.kind)).toEqual(["valueOfUse", "maintenance", "participation"]);
    expect(b[0]!.detail).toBe("בוטל שווי שימוש 4,570 ₪");
    expect(b[1]!.display).toBeLessThan(2000);
    expect(b[2]!.display).toBe(350);
  });

  it("דוד כהן, מסלול משפחתי: חלק העובד בפער יורד מהנטו", () => {
    const gap = run("E-002").bridge.find((s) => s.kind === "familyGap")!;
    expect(gap.display).toBe(-1150);
  });

  it("אין הפרש לחשב: אין פירוק", () => {
    const e = employee("E-001");
    const r = compare({ profile: e, today: todayOf(e), alternative: carSituation("MODEL 3"), occupations, rules });
    expect(r.bridge).toEqual([]);
  });

  it("עיגול לסכום מדויק: השקל החסר הולך למי שהעיגול הזיז הכי רחוק", () => {
    expect(roundToTotal([10.2, 20.45], 31)).toEqual([10, 21]);
    expect(roundToTotal([0.6, 0.55, 0.7], 2)).toEqual([1, 0, 1]);
    expect(roundToTotal([-0.4, -0.45], -1)).toEqual([0, -1]);
    expect(roundToTotal([], 0)).toEqual([]);
  });
});

describe("מה הכי משתלם לי: דירוג החלופות", () => {
  it("נועה לוי: כל הרכבים עד קבוצה ג וויתור, מסודרים מהמשתלם ביותר", () => {
    const e = employee("E-001");
    const k = rankAlternatives({ profile: e, today: todayOf(e), catalog, occupations, rules });

    const diffs = k.options.map((o) => o.comparison.diff!);
    expect(diffs).toEqual([...diffs].sort((a, b) => b - a));
    expect(k.options.every((o) => o.comparison.eligibility.status === "eligible")).toBe(true);
    expect(k.options.some((o) => o.car?.model === "COROLLA CROSS")).toBe(false);
    expect(k.options.some((o) => o.car?.group === "ד")).toBe(false);
    expect(k.options.some((o) => o.car?.group === "משפחתי")).toBe(false);
    expect(k.options[0]!.alternative.kind).toBe("waiver");
    expect(k.waiver?.status).toBe("eligible");
    expect(k.today!.label).toBe("COROLLA CROSS (2025)");
  });

  it("כל רכב מחושב עם ההשתתפות הרגילה שלו, ולכן ATTO 3 נותן את נטו הייחוס", () => {
    const e = employee("E-001");
    const k = rankAlternatives({ profile: e, today: todayOf(e), catalog, occupations, rules });
    const atto = k.options.find((o) => o.car?.model === "ATTO 3")!;
    expect(atto.comparison.diffDisplay).toBe(661);
  });

  it("4 ילדים ומעלה: רכבי המסלול המשפחתי נכנסים לדירוג", () => {
    const e = employee("E-002");
    const k = rankAlternatives({ profile: e, today: todayOf(e), catalog, occupations, rules });
    expect(k.options.map((o) => o.car?.model)).toContain("CARNIVAL");
    expect(k.waiver?.status).toBe("not_eligible");
    expect(k.options.some((o) => o.alternative.kind === "waiver")).toBe(false);
  });

  it("עובדת שמקבלת היום אחזקה: הוויתור הוא המצב היום ולא חלופה", () => {
    const e = employee("E-003");
    const k = rankAlternatives({ profile: e, today: todayOf(e), catalog, occupations, rules });
    expect(k.waiver).toBeNull();
    expect(k.options.every((o) => o.alternative.kind === "car")).toBe(true);
    expect(k.options.find((o) => o.car?.model === "MG4")!.comparison.diffDisplay).toBe(-1938);
  });

  it("השתתפות לא ידועה ברכב של היום: לא מדרגים, ואומרים מה חסר", () => {
    const e = employee("E-001");
    const today = { ...carSituation("COROLLA CROSS"), participation: undefined };
    const k = rankAlternatives({ profile: e, today, catalog, occupations, rules });
    expect(k.options).toEqual([]);
    expect(k.missing).toEqual(["ההשתתפות שלך ברכב היום"]);
  });
});
