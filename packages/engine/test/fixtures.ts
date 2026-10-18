import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { CatalogCar, EmployeeProfile, Occupation, Rules, Situation } from "../src";
import { carFromCatalog, findCatalogCar } from "../src";

const configDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(configDir, name), "utf-8")) as T;

export const rules = load<Rules>("rules.json");
export const catalog = load<CatalogCar[]>("catalog.json");
export const occupations = load<Occupation[]>("occupations.json");

export interface SampleEmployee extends EmployeeProfile {
  id: string;
  name: string;
  todayCar: string;
  todayParticipation: number;
}
export const employees = load<SampleEmployee[]>("sample-employees.json");

export interface ReferenceResult {
  id: string;
  eligible: boolean;
  reason: string;
  netToday: number;
  netAlternative: number;
  diff: number;
  taxToday: number;
  taxAlternative: number;
  niHealthToday: number;
  niHealthAlternative: number;
  electricGross: number;
  familyGapEmployee: number;
  why: string;
}
export const reference = load<ReferenceResult[]>("reference-results.json");

export function catalogCar(idOrModel: string): CatalogCar {
  const c = findCatalogCar(catalog, idOrModel);
  if (!c) throw new Error(`car not in catalog: ${idOrModel}`);
  return c;
}

/** רכב מהקטלוג עם השתתפות. ברירת מחדל: ההשתתפות מהקטלוג */
export function carSituation(idOrModel: string, participation?: number): Situation {
  const c = catalogCar(idOrModel);
  return { kind: "car", car: carFromCatalog(c), participation: participation ?? c.defaultParticipation };
}

export function employee(id: string): SampleEmployee {
  const e = employees.find((x) => x.id === id);
  if (!e) throw new Error(`no employee ${id}`);
  return e;
}

/** המצב היום של עובד לדוגמה, לפי גיליון "עובדים לדוגמה" */
export function todayOf(e: SampleEmployee): Situation {
  const m = /אחזקה (\d+)/.exec(e.todayCar);
  if (m) return { kind: "waiver", maintenance: Number(m[1]) };
  return carSituation(e.todayCar, e.todayParticipation);
}

/** החלופה שכל עובד לדוגמה שאל עליה (עמודת "השאלה" / "החלופה") */
export const alternativeOf: Record<string, Situation> = {
  "E-001": carSituation("ATTO 3"),
  "E-002": carSituation("CARNIVAL"),
  "E-003": carSituation("MG4"),
  "E-004": carSituation("EV3"),
  "E-005": { kind: "waiver" },
  "E-006": carSituation("MODEL 3"),
};
