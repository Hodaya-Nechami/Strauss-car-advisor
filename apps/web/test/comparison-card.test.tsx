import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import { CatalogDataSource, MemoryRepQueue, newSession, runTool, type ToolContext } from "@strauss/agent";
import { ComparisonCard } from "../app/ComparisonCard";
import { PayslipCard } from "../app/Payslip";
import { RankingCard } from "../app/RankingCard";
import type { ComparisonView, PayslipReading, RankingView } from "../app/types";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
const load = <T,>(n: string): T => JSON.parse(readFileSync(join(configDir, n), "utf-8")) as T;
const catalog = load<CatalogCar[]>("catalog.json");

async function compareVia(profile: Record<string, unknown>, today: unknown, alternative: unknown) {
  const ctx: ToolContext = {
    session: newSession("S"),
    rules: load<Rules>("rules.json"),
    catalog,
    occupations: load<Occupation[]>("occupations.json"),
    data: new CatalogDataSource(catalog),
    rep: new MemoryRepQueue(),
  };
  await runTool("save_employee_profile", profile, ctx);
  return (await runTool("calculate_comparison", { today, alternative }, ctx)) as unknown as ComparisonView;
}

/** React מכניס הערות בין קטעי טקסט צמודים. מסירים אותן ואת התגיות כדי לבדוק את הטקסט שהעובד רואה. */
const visibleText = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("כרטיס ההשוואה מציג בדיוק את מספרי המנוע", () => {
  it("נועה לוי: קורולה קרוס ל-ATTO 3", async () => {
    const data = await compareVia(
      { group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75 },
      { kind: "car", car: "COROLLA CROSS", participation: 300 },
      { kind: "car", car: "ATTO 3", participation: 300 },
    );
    const text = visibleText(renderToStaticMarkup(<ComparisonCard data={data} />));

    expect(text).toContain("+661 ₪");
    expect(text).toContain("נטו בחודש 11,032 ₪ 11,693 ₪");
    expect(text).toContain("שווי שימוש (נוסף להכנסה החייבת) 4,070 ₪ 3,130 ₪");
    expect(text).toContain("החזר חשמל (נטו) 0 ₪ 250 ₪");
    expect(text).toContain("זכאי/ת");
    expect(text).not.toContain("אחזקת רכב");
  });

  it("מציג תמונות של שני הרכבים, ונטו שמח כשהנטו עולה", async () => {
    const data = await compareVia(
      { group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75 },
      { kind: "car", car: "COROLLA CROSS", participation: 300 },
      { kind: "car", car: "ATTO 3", participation: 300 },
    );
    const html = renderToStaticMarkup(<ComparisonCard data={data} />);
    expect(html).toContain('src="/cars/CAR-09.jpg"');
    expect(html).toContain('src="/cars/CAR-10.jpg"');
    expect(html).toContain("mascot-happy");
  });

  it("חלופה לא זכאית: מציג את הסיבה ואת המצב היום בלבד", async () => {
    const data = await compareVia(
      { group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75 },
      { kind: "car", car: "COROLLA CROSS", participation: 300 },
      { kind: "car", car: "MODEL 3", participation: 500 },
    );
    const text = visibleText(renderToStaticMarkup(<ComparisonCard data={data} />));

    expect(text).toContain("לא זכאי/ת");
    expect(text).toContain("גבוהה מהקבוצה שלך");
    expect(text).toContain("נטו בחודש 11,032 ₪ —");
    expect(text).not.toContain("בחודש בנטו");
  });
});

describe("לאן הלך כל שקל, ומה הכי משתלם", () => {
  const noa = { group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75 };

  it("תרשים המפל מציג כל סיבה עם הסכום שלה, מהנטו של היום לנטו בחלופה", async () => {
    const data = await compareVia(noa, { kind: "car", car: "COROLLA CROSS", participation: 300 }, { kind: "car", car: "ATTO 3", participation: 300 });
    const text = visibleText(renderToStaticMarkup(<ComparisonCard data={data} />));
    expect(text).toContain("לאן הלך כל שקל");
    expect(text).toContain("נטו היום: 11,032 ₪ מס על שווי השימוש: +411 ₪ (שווי שימוש 4,070 → 3,130 ₪) החזר חשמל: +250 ₪");
    expect(text).toContain("+661 נטו בחלופה 11,693");
  });

  it("בהדגמה מוצג אישור שהתוצאה זהה לחישוב של המארגנים", async () => {
    const data = await compareVia(noa, { kind: "car", car: "COROLLA CROSS", participation: 300 }, { kind: "car", car: "ATTO 3", participation: 300 });
    const html = renderToStaticMarkup(
      <ComparisonCard data={data} reference={{ matches: true, expected: { netToday: 11032, netAlternative: 11693, diff: 661 } }} />,
    );
    expect(visibleText(html)).toContain("זהה עד השקל לחישוב הייחוס של המארגנים");
  });

  it("דירוג: המובילה בראש, קו היום מפריד בין רווח להפסד", async () => {
    const ctx: ToolContext = {
      session: newSession("R"),
      rules: load<Rules>("rules.json"),
      catalog,
      occupations: load<Occupation[]>("occupations.json"),
      data: new CatalogDataSource(catalog),
      rep: new MemoryRepQueue(),
    };
    await runTool("save_employee_profile", noa, ctx);
    const data = (await runTool("rank_alternatives", { today: { kind: "car", car: "COROLLA CROSS", participation: 300 } }, ctx)) as unknown as RankingView;
    const html = renderToStaticMarkup(<RankingCard data={data} />);
    const text = visibleText(html);

    expect(text).toMatch(/👑 הכי משתלם לך (₪ )?ויתור על הרכב אחזקת רכב 2,000 ₪ בחודש \+3,199 ₪/);
    expect(text).toContain("+3,199 ₪");
    expect(text).toContain("+38,388 ₪ בשנה");
    expect(text).toMatch(/לעומת היום \( ?COROLLA CROSS \(2025\) ?, 11,032 ₪ נטו\)/);
    // מוצגות 6 הראשונות, כולן משתלמות יותר מהיום, ולכן קו היום עוד מוסתר
    expect(text).toContain("להציג את כל 13 האפשרויות");
    expect(html).not.toContain("rank-baseline");
  });

  it("דירוג עם חלופות שמשתלמות פחות: קו היום מפריד ביניהן", async () => {
    const data: RankingView = {
      today: { label: "NIRO (2025)", net: 10000, side: { kind: "car", carId: "CAR-05" } },
      options: [
        { kind: "car", carId: "CAR-06", label: "MG4 (2025)", model: "MG4", group: "ב", drive: "חשמלי", participation: 250, electricRefund: true, net: 10300, diffNet: 300 },
        { kind: "car", carId: "CAR-07", label: "COROLLA (2026)", model: "COROLLA", group: "ב", drive: "בנזין", participation: 250, electricRefund: false, net: 9800, diffNet: -200 },
      ],
      waiver: null,
      notes: [],
      basis: "",
    };
    const html = renderToStaticMarkup(<RankingCard data={data} />);
    const at = (s: string) => html.indexOf(s);
    expect(at("+300")).toBeLessThan(at("rank-baseline"));
    expect(at("rank-baseline")).toBeLessThan(at("−200"));
  });
});

describe("קריאת תלוש: כרטיס האישור", () => {
  it("מציג כל ערך עם המקור שלו, ומסמן מה חושב ומה לא נמצא", () => {
    const reading: PayslipReading = {
      period: "09/2026",
      fields: {
        baseSalary: { value: 14200, source: 'בתלוש: "שכר יסוד"' },
        bonus: { value: 0, source: "לא מופיע בתלוש", assumedZero: true },
        pensionRate: { value: 6, source: "חושב: 912 ₪ מתוך שכר של 15,200 ₪" },
      },
      car: { participation: { value: 300, source: 'בתלוש: "השתתפות ברכב"' } },
      notes: ["לא מצאתי בתלוש נקודות זיכוי."],
      via: "OpenRouter",
    };
    const noop = () => undefined;
    const html = renderToStaticMarkup(
      <PayslipCard slip={{ phase: "review", reading }} sessionId={null} onView={noop} onSaved={noop} onDone={noop} onSample={noop} />,
    );
    const text = visibleText(html);
    expect(text).toContain("זה מה שקראתי מהתלוש (09/2026)");
    expect(text).toContain("✓ חושב: 912 ₪ מתוך שכר של 15,200 ₪");
    expect(text).toContain("⚪ לא מופיע בתלוש");
    expect(text).toContain("⚠️ לא מצאתי בתלוש");
    expect(text).toContain("ההשתתפות שלי ברכב היום היא");
    expect(text).toContain("לא מצאתי בתלוש נקודות זיכוי.");
    expect(text).toContain("נקרא בעזרת OpenRouter");
    expect(html).toContain('value="14200"');
  });
});
