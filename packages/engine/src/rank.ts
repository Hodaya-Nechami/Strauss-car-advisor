import { carFromCatalog } from "./catalog";
import { compare } from "./compare";
import type { Rules } from "./rules";
import type { CatalogCar, Comparison, Eligibility, EmployeeProfile, Occupation, Situation, SituationResult } from "./types";

export interface RankInput {
  profile: EmployeeProfile;
  today: Situation;
  catalog: CatalogCar[];
  occupations: Occupation[];
  rules: Rules;
}

export interface RankedOption {
  /** החלופה כמו שחושבה: רכב מהקטלוג עם ההשתתפות הרגילה שלו בקטלוג, או ויתור */
  alternative: Situation;
  car?: CatalogCar;
  comparison: Comparison;
}

export interface Ranking {
  /** null כשחסר מידע על המצב היום */
  today: SituationResult | null;
  /** מה חסר כדי לדרג, ולמה */
  missing: string[];
  blockedReason?: string;
  /** כל החלופות שהעובד זכאי להן ושאפשר לחשב, מהמשתלמת ביותר */
  options: RankedOption[];
  /** הזכאות לוויתור על הרכב. null כשהעובד כבר מקבל אחזקה במקום רכב. */
  waiver: Eligibility | null;
}

/**
 * מדרג את כל החלופות של העובד לפי הנטו: כל רכב בקטלוג שהוא זכאי לו, וגם ויתור על הרכב.
 * כל חלופה מחושבת באותו מנוע כמו השוואה רגילה. רכב מחושב עם ההשתתפות הרגילה שלו בקטלוג.
 */
export function rankAlternatives(input: RankInput): Ranking {
  const { profile, today, catalog, occupations, rules } = input;
  const base = compare({ profile, today, alternative: { kind: "none" }, occupations, rules });
  if (!base.today || base.eligibility.status !== "eligible") {
    return {
      today: base.today,
      missing: base.missing,
      blockedReason: base.eligibility.status !== "eligible" ? base.eligibility.reason : undefined,
      options: [],
      waiver: null,
    };
  }

  const candidates: { alternative: Situation; car?: CatalogCar }[] = catalog
    .filter((c) => !(today.kind === "car" && today.car.catalogId === c.id))
    .map((c) => ({ alternative: { kind: "car", car: carFromCatalog(c), participation: c.defaultParticipation }, car: c }));
  if (today.kind !== "waiver") candidates.push({ alternative: { kind: "waiver" } });

  const computed = candidates.map((c) => ({
    ...c,
    comparison: compare({ profile, today, alternative: c.alternative, occupations, rules }),
  }));
  const waiver = today.kind === "waiver" ? null : computed.at(-1)!.comparison.eligibility;
  const options = computed
    .filter((c) => c.comparison.diff !== null)
    .sort(
      (x, y) =>
        y.comparison.diff! - x.comparison.diff! ||
        x.comparison.alternative!.label.localeCompare(y.comparison.alternative!.label),
    );

  return { today: base.today, missing: [], options, waiver };
}
