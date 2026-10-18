import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogCar, Occupation, Rules } from "@strauss/engine";
import { CatalogDataSource, MemoryRepQueue, newSession, runTool, type ToolContext } from "@strauss/agent";
import { ComparisonCard } from "../app/ComparisonCard";
import type { ComparisonView } from "../app/types";

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
