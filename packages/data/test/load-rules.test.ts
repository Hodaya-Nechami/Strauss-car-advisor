import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRules, RulesLoadError } from "../src/load-rules";

const realRulesPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config", "rules.json");

describe("loadRules", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "strauss-rules-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("טוען בהצלחה את config/rules.json האמיתי", () => {
    const rules = loadRules(realRulesPath);
    expect(rules.chooseFrom).toBe("own_group_or_lower");
    expect(rules.electric.method).toBe("gross_up");
    expect(rules.netMethod.brackets.at(-1)).toEqual([null, 0.5]);
    // שדות שלא מוצהרים בטיפוס Rules (כמו valueOfUse, note) נשמטים מהתוצאה
    expect(rules).not.toHaveProperty("valueOfUse");
  });

  it("זורקת RulesLoadError ברורה אם הקובץ לא קיים", () => {
    const missing = join(dir, "does-not-exist.json");
    expect(() => loadRules(missing)).toThrow(RulesLoadError);
    expect(() => loadRules(missing)).toThrow(/לא ניתן לקרוא/);
  });

  it("זורקת RulesLoadError ברורה על JSON שבור", () => {
    const broken = join(dir, "rules.json");
    writeFileSync(broken, "{ זה לא json תקין", "utf-8");
    expect(() => loadRules(broken)).toThrow(RulesLoadError);
    expect(() => loadRules(broken)).toThrow(/אינו JSON תקין/);
  });

  it("זורקת RulesLoadError ברורה כששדה חסר או מהסוג הלא נכון", () => {
    const invalid = join(dir, "rules.json");
    writeFileSync(
      invalid,
      JSON.stringify({
        version: "x",
        budgets: { א: 1000 },
        groupOrder: ["א"],
        chooseFrom: "own_group_or_lower",
        electric: { netBonus: "לא מספר", method: "gross_up" }, // netBonus צריך להיות מספר
        familyTrack: { minChildren: 4, childMaxAge: 23, cars: [], gapSplitEmployee: 0.5 },
        waiver: { allowedBy: "occupation", maintenanceIsTaxable: true, maintenanceIsPensionable: false },
        unusedBudget: "not_paid",
        netMethod: {
          creditPointValue: 242,
          brackets: [[null, 0.5]],
          nationalInsurance: { threshold: 1, ceiling: 2, lowRate: 0.1, highRate: 0.2 },
          health: { threshold: 1, ceiling: 2, lowRate: 0.1, highRate: 0.2 },
          pensionCredit: { rate: 0.35, maxContributionRate: 0.07, incomeCeiling: 9500 },
        },
      }),
      "utf-8"
    );
    expect(() => loadRules(invalid)).toThrow(RulesLoadError);
    expect(() => loadRules(invalid)).toThrow(/netBonus/);
  });
});
