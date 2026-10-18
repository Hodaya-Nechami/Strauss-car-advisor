import { describe, expect, it } from "vitest";
import { compare } from "../src";
import { alternativeOf, employee, occupations, reference, rules, todayOf } from "./fixtures";

/**
 * בדיקות זהב: 6 העובדים לדוגמה מול הנטו הייחוס של המארגנים (גיליון "חישובים").
 * כל ערך חייב לצאת זהה אחרי עיגול לשקל.
 */
describe("6 העובדים לדוגמה מול נטו הייחוס", () => {
  for (const ref of reference) {
    it(`${ref.id}`, () => {
      const e = employee(ref.id);
      const r = compare({ profile: e, today: todayOf(e), alternative: alternativeOf[ref.id]!, occupations, rules });

      expect(r.missing).toEqual([]);
      expect(r.eligibility.status === "eligible").toBe(ref.eligible);
      expect(r.eligibility.reason).toBe(ref.reason);

      const t = r.today!.breakdown;
      const a = r.alternative!.breakdown;
      expect(Math.round(t.net)).toBe(ref.netToday);
      expect(Math.round(a.net)).toBe(ref.netAlternative);
      expect(r.diffDisplay).toBe(ref.diff);
      expect(Math.round(t.tax)).toBe(ref.taxToday);
      expect(Math.round(a.tax)).toBe(ref.taxAlternative);
      expect(Math.round(t.nationalInsurance + t.health)).toBe(ref.niHealthToday);
      expect(Math.round(a.nationalInsurance + a.health)).toBe(ref.niHealthAlternative);
      expect(Math.round(a.electricGross)).toBe(ref.electricGross);
      expect(Math.round(a.familyGapEmployee)).toBe(ref.familyGapEmployee);
      expect(r.changes.join(" · ")).toBe(ref.why);
      expect(r.explanation).toHaveLength(2);
    });
  }

  it("החזר החשמל המגולם מוסיף בדיוק 250 ₪ נטו, בלי עיגול", () => {
    const e = employee("E-001");
    const r = compare({ profile: e, today: todayOf(e), alternative: alternativeOf["E-001"]!, occupations, rules });
    const a = r.alternative!.breakdown;
    const withoutElectric = a.net - a.electricGross + a.tax + a.nationalInsurance + a.health;
    expect(withoutElectric).toBeGreaterThan(0);
    // ההפרש בין נטו עם החזר לנטו בלי החזר הוא 250 בדיוק (עד דיוק מספרי)
    const noRefund = compare({
      profile: e,
      today: todayOf(e),
      alternative: alternativeOf["E-001"]!,
      occupations,
      rules: { ...rules, electric: { ...rules.electric, eligibleDrives: [] } },
    }).alternative!.breakdown.net;
    expect(a.net - noRefund).toBeCloseTo(250, 6);
  });
});
