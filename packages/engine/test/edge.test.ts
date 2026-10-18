import { describe, expect, it } from "vitest";
import { compare, type EmployeeProfile } from "../src";
import { carSituation, occupations, rules } from "./fixtures";

const base: EmployeeProfile = {
  group: "ב",
  occupation: "מפתח/ת תוכנה",
  baseSalary: 15000,
  commissions: 0,
  bonus: 0,
  pensionRate: 6,
  studyFundRate: 2.5,
  creditPoints: 2.25,
  childrenUnder23: 1,
};

const run = (profile: EmployeeProfile, today = carSituation("NIRO"), alternative = carSituation("MG4")) =>
  compare({ profile, today, alternative, occupations, rules });

describe("מקרי קצה", () => {
  it("עובדת קבוצה ב' בעיסוק שמאפשר ויתור: מקבלת אחזקה לפי הטבלה", () => {
    const r = run(base, carSituation("NIRO"), { kind: "waiver" });
    expect(r.eligibility.status).toBe("eligible");
    expect(r.alternative!.breakdown.maintenance).toBe(1500);
    expect(r.alternative!.breakdown.valueOfUse).toBe(0);
    expect(r.alternative!.breakdown.participation).toBe(0);
    expect(r.diff).not.toBeNull();
  });

  it("עובד קבוצה ב' בתפקיד שטח עם רכב חובה: אין ויתור", () => {
    const r = run({ ...base, occupation: "נציג/ת מכירות שטח" }, carSituation("NIRO"), { kind: "waiver" });
    expect(r.eligibility.status).toBe("not_eligible");
    expect(r.alternative).toBeNull();
    expect(r.today).not.toBeNull();
    expect(r.explanation[0]).toContain("לא אפשרית");
  });

  it("עובד קבוצה ג' לא יכול לבחור רכב מקבוצה ד'", () => {
    const r = run({ ...base, group: "ג", occupation: "מנהל/ת מוצר" }, carSituation("TUCSON"), carSituation("MODEL 3"));
    expect(r.eligibility.status).toBe("not_eligible");
    expect(r.alternative).toBeNull();
  });

  it("עובד קבוצה ד' יכול לבחור רכב מקבוצה ג'", () => {
    const r = run({ ...base, group: "ד", occupation: "מנהל/ת מחלקה" }, carSituation("OCTAVIA"), carSituation("EV3"));
    expect(r.eligibility.status).toBe("eligible");
  });

  it("3 ילדים לא מספיקים למסלול ברוכת ילדים", () => {
    const r = run({ ...base, childrenUnder23: 3 }, carSituation("NIRO"), carSituation("CARNIVAL"));
    expect(r.eligibility.status).toBe("not_eligible");
  });

  it("סנטה פה במסלול המשפחתי: העובד משלם 50% מהפער מעל התקציב", () => {
    const r = run({ ...base, childrenUnder23: 4 }, carSituation("NIRO"), carSituation("SANTA FE"));
    // תקציב ב' 3,700, עלות 5,600, פער 1,900 → העובד 950
    expect(r.alternative!.breakdown.familyGapEmployee).toBe(950);
  });

  it("פלאג-אין לא מקבל החזר חשמל", () => {
    const r = run({ ...base, group: "ד", occupation: "מנהל/ת מחלקה" }, carSituation("OCTAVIA"), carSituation("SPORTAGE HEV"));
    expect(r.alternative!.breakdown.electricGross).toBe(0);
  });

  it("השתתפות חסרה ברכב החדש: לא מנחשים, מחזירים את היום ומבקשים את החסר", () => {
    const alt = carSituation("MG4");
    if (alt.kind === "car") delete alt.participation;
    const r = run(base, carSituation("NIRO"), alt);
    expect(r.today).not.toBeNull();
    expect(r.alternative).toBeNull();
    expect(r.diff).toBeNull();
    expect(r.missing).toEqual(["ההשתתפות שלך ברכב החדש"]);
    expect(r.explanation[0]).toContain("חסר לי");
  });

  it("קבוצה שלא תואמת לעיסוק: שולחים לנציג", () => {
    const r = run({ ...base, group: "ד" });
    expect(r.eligibility.status).toBe("needs_info");
    expect(r.missing).toContain("אישור קבוצת הזכאות מהנציג");
  });

  it("שינוי תקציב בקובץ הכללים משנה את התוצאה בלי לגעת בקוד", () => {
    const profile = { ...base, childrenUnder23: 5 };
    const a = compare({ profile, today: carSituation("NIRO"), alternative: carSituation("CARNIVAL"), occupations, rules });
    const richer = { ...rules, budgets: { ...rules.budgets, ב: 5000 } };
    const b = compare({ profile, today: carSituation("NIRO"), alternative: carSituation("CARNIVAL"), occupations, rules: richer });
    expect(a.alternative!.breakdown.familyGapEmployee).toBe(1150);
    expect(b.alternative!.breakdown.familyGapEmployee).toBe(500);
  });

  it("אותם נתונים נותנים תמיד אותה תוצאה", () => {
    expect(run(base)).toEqual(run(base));
  });
});
