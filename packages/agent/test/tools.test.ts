import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import { CatalogDataSource, MemoryRepQueue, memoryAudit, newSession, runTool, type ToolContext } from "../src";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
const load = <T>(n: string): T => JSON.parse(readFileSync(join(configDir, n), "utf-8")) as T;
const rules = load<Rules>("rules.json");
const catalog = load<CatalogCar[]>("catalog.json");
const occupations = load<Occupation[]>("occupations.json");

function makeCtx() {
  const rep = new MemoryRepQueue();
  const audit = memoryAudit();
  const ctx: ToolContext = {
    session: newSession("S-1"),
    rules,
    catalog,
    occupations,
    data: new CatalogDataSource(catalog),
    rep,
    audit: audit.log,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = (name: string, input: unknown = {}) => runTool(name, input, ctx) as Promise<any>;
  return { ctx, rep, audit, call };
}

const groupC = { group: "ג", baseSalary: 14200, commissions: 1000, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.25 };

describe("התסריט מה-PDF: עובד קבוצה ג' עובר לחשמלי, וחסרה ההשתתפות", () => {
  it("אוסף נתונים, מחשב חלקית, שולח לנציג וממשיך אחרי התשובה", async () => {
    const { ctx, rep, call } = makeCtx();

    let r = await call("save_employee_profile", { group: "ג", baseSalary: 14200 });
    expect(r.ok).toBe(true);
    expect(r.missing).toContain("נקודות זיכוי");

    r = await call("save_employee_profile", { commissions: 1000, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.25 });
    expect(r.missing).toEqual([]);

    r = await call("list_catalog");
    expect(new Set(r.cars.map((c: { group: string }) => c.group))).toEqual(new Set(["א", "ב", "ג"]));
    expect(r.note).toContain("מספר הילדים");

    const today = { kind: "car", car: "COROLLA CROSS", participation: 300 };
    r = await call("calculate_comparison", { today, alternative: { kind: "car", car: "EV3" } });
    expect(r.ok).toBe(true);
    expect(r.today.net).toBeGreaterThan(0);
    expect(r.alternative).toBeNull();
    expect(r.missing).toEqual(["ההשתתפות שלך ברכב החדש"]);
    expect(r.explanation[0]).toContain("חסר לי");

    r = await call("ask_representative", { about: "השתתפות ברכב החדש", question: "מה ההשתתפות של העובד ב-EV3?" });
    expect(r.ticketId).toBe("Q-1");
    expect(ctx.session.pendingQuestions).toHaveLength(1);
    expect(rep.questions[0]!.sessionId).toBe("S-1");

    // הנציג ענה: השתתפות 350 ₪. ממשיכים מאותה נקודה.
    r = await call("calculate_comparison", { today, alternative: { kind: "car", car: "EV3", participation: 350 } });
    expect(r.missing).toEqual([]);
    expect(r.alternative.electricRefundNet).toBe(250);
    expect(r.alternative.participation).toBe(350);
    expect(r.diffNet).toBe(r.alternative.net - r.today.net);
    expect(r.changes).toEqual(["שווי שימוש 4,070 → 2,930 ₪", "+250 ₪ נטו החזר חשמל (מגולם)", "השתתפות 300 → 350 ₪"]);
  });
});

describe("דרך הכלים מקבלים בדיוק את הנטו של המארגנים", () => {
  it("נועה לוי (E-001): קורולה קרוס ל-ATTO 3", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", {
      group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0,
      pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75, childrenUnder23: 2,
    });
    const r = await call("calculate_comparison", {
      today: { kind: "car", car: "COROLLA CROSS", participation: 300 },
      alternative: { kind: "car", car: "ATTO 3", participation: 300 },
    });
    expect(r.today.net).toBe(11032);
    expect(r.alternative.net).toBe(11693);
    expect(r.diffNet).toBe(661);
    // בשביל התמונות במסך
    expect(r.todaySide).toEqual({ kind: "car", carId: "CAR-09" });
    expect(r.alternativeSide).toEqual({ kind: "car", carId: "CAR-10" });
  });
});

describe("הצגת רכבים בתמונות", () => {
  it("מחזיר את הרכבים שביקשו, לפי מזהה או שם דגם, בלי כפילויות", async () => {
    const { call } = makeCtx();
    const r = await call("show_cars", { cars: ["CAR-10", "ev3", "ATTO 3"], purpose: "options" });
    expect(r.ok).toBe(true);
    expect(r.purpose).toBe("options");
    expect(r.shown.map((c: { id: string }) => c.id)).toEqual(["CAR-10", "CAR-11"]);
    expect(r.shown[1]).toMatchObject({ model: "EV3", group: "ג", drive: "חשמלי", valueOfUse: 2930 });
    expect(r.notFound).toEqual([]);
  });

  it("רכב שלא בקטלוג: מדווח עליו ולא ממציא תמונה", async () => {
    const { call } = makeCtx();
    const r = await call("show_cars", { cars: ["CYBERTRUCK"], purpose: "interest" });
    expect(r.ok).toBe(false);
    expect(r.notFound).toEqual(["CYBERTRUCK"]);
    expect(r.note).toContain("find_car_value_of_use");
  });

  it("מטרה לא מוכרת נדחית", async () => {
    const { call } = makeCtx();
    const r = await call("show_cars", { cars: ["EV3"], purpose: "random" });
    expect(r.error).toBe("קלט לא תקין");
  });
});

describe("עובדת קבוצה ב' שרוצה לוותר על הרכב", () => {
  const profile = { group: "ב", occupation: "מפתח/ת תוכנה", baseSalary: 15000, commissions: 0, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75 };

  it("זכאית לוויתור ומקבלת אחזקה לפי טבלת העיסוקים", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", profile);
    let r = await call("check_eligibility", { alternative: { kind: "waiver" } });
    expect(r.status).toBe("eligible");
    r = await call("calculate_comparison", {
      today: { kind: "car", car: "NIRO", participation: 250 },
      alternative: { kind: "waiver" },
    });
    expect(r.alternative.maintenance).toBe(1500);
    expect(r.alternative.valueOfUse).toBe(0);
    expect(r.alternative.participation).toBe(0);
    expect(r.changes[0]).toBe("בוטל שווי שימוש 2,950 ₪, נוספה אחזקה 1,500 ₪ (חייבת במס)");
  });

  it("בתפקיד שטח עם רכב חובה אין ויתור", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", { ...profile, occupation: "נציג/ת מכירות שטח" });
    const r = await call("check_eligibility", { alternative: { kind: "waiver" } });
    expect(r.status).toBe("not_eligible");
  });
});

describe("הבוט לא מנחש", () => {
  it("בלי נתוני שכר אין חישוב, וחוזרת רשימת החוסרים", async () => {
    const { call } = makeCtx();
    const r = await call("calculate_comparison", {
      today: { kind: "car", car: "NIRO", participation: 250 },
      alternative: { kind: "car", car: "MG4" },
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toHaveLength(7);
  });

  it("רכב משפחתי בלי מספר ילדים: שואלים", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", { ...groupC, group: "ב" });
    const r = await call("calculate_comparison", {
      today: { kind: "car", car: "NIRO", participation: 250 },
      alternative: { kind: "car", car: "CARNIVAL", participation: 500 },
    });
    expect(r.missing).toEqual(["מספר ילדים עד גיל 23"]);
  });

  it("עם 5 ילדים, רכבי המסלול המשפחתי מופיעים בקטלוג", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", { group: "ב", childrenUnder23: 5 });
    const r = await call("list_catalog");
    expect(r.cars.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining(["CAR-19", "CAR-20"]));
  });

  it("רכב שלא בקטלוג: מחזיר שגיאה ומפנה לחיפוש במאגר", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", groupC);
    const r = await call("calculate_comparison", {
      today: { kind: "car", car: "TUCSON", participation: 400 },
      alternative: { kind: "car", car: "CYBERTRUCK", participation: 500 },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("לא בקטלוג");
  });

  it("חיפוש במאגר עם כמה התאמות בשווי שונה מסומן כלא חד-משמעי", async () => {
    const { call } = makeCtx();
    const r = await call("find_car_value_of_use", { text: "COROLLA" });
    expect(r.matches).toHaveLength(2);
    expect(r.ambiguous).toBe(true);
  });

  it("רכב היום מחוץ לקטלוג: מחשבים. חלופה מחוץ לקטלוג: צריך נציג", async () => {
    const { call } = makeCtx();
    await call("save_employee_profile", groupC);
    const outside = { label: "COROLLA", drive: "בנזין", valueOfUse: 4120, registrationYear: 2026 };

    let r = await call("calculate_comparison", {
      today: { kind: "car", outsideCatalog: outside, participation: 250 },
      alternative: { kind: "car", car: "EV3", participation: 300 },
    });
    expect(r.today.valueOfUse).toBe(4120);
    expect(r.alternative).not.toBeNull();

    r = await call("calculate_comparison", {
      today: { kind: "car", car: "TUCSON", participation: 400 },
      alternative: { kind: "car", outsideCatalog: outside, participation: 250 },
    });
    expect(r.eligibility.status).toBe("needs_info");
    expect(r.alternative).toBeNull();
  });
});

describe("בדיקת קלט ויומן", () => {
  it("קבוצה שלא קיימת נדחית", async () => {
    const { call } = makeCtx();
    const r = await call("save_employee_profile", { group: "ה" });
    expect(r.ok).toBe(false);
  });

  it("קלט מסוג לא נכון נדחה עם פירוט", async () => {
    const { call } = makeCtx();
    const r = await call("save_employee_profile", { pensionRate: "שש" });
    expect(r.error).toBe("קלט לא תקין");
    expect(r.issues[0]).toContain("pensionRate");
  });

  it("כל קריאה נרשמת ביומן, גם קריאה לכלי שלא קיים", async () => {
    const { call, audit } = makeCtx();
    await call("list_catalog");
    const r = await call("no_such_tool");
    expect(r.ok).toBe(false);
    expect(audit.entries.map((e) => e.tool)).toEqual(["list_catalog", "no_such_tool"]);
  });
});
