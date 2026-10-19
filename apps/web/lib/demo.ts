/**
 * מצב הדגמה: 6 העובדים לדוגמה מהקובץ של המארגנים, עם השאלה של כל אחד והנטו הייחוס שלו.
 * כל חישוב עובר באותם כלים שהבוט משתמש בהם, והתוצאה נבדקת מול נטו הייחוס.
 */
import { findCatalogCar, type CatalogCar, type EmployeeProfile } from "@strauss/engine";

export interface SampleEmployee extends EmployeeProfile {
  id: string;
  name: string;
  occupation: string;
  todayCar: string;
  todayParticipation: number;
  question: string;
}

export interface ReferenceResult {
  id: string;
  today: string;
  alternative: string;
  netToday: number;
  netAlternative: number;
  diff: number;
}

/** מצב בפורמט שהכלים מקבלים: רכב מהקטלוג או ויתור */
export type SituationInput =
  | { kind: "car"; car: string; participation?: number }
  | { kind: "waiver"; maintenance?: number };

export interface DemoScenario {
  employee: SampleEmployee;
  reference: ReferenceResult;
  profile: Record<string, unknown>;
  today: SituationInput;
  /** החלופה שהעובד שאל עליה, עם ההשתתפות הרגילה בקטלוג כמו בחישוב הייחוס */
  alternative: SituationInput;
}

export interface ReferenceCheck {
  matches: boolean;
  expected: { netToday: number; netAlternative: number; diff: number };
}

/** בונה את התרחיש של כל עובד לדוגמה מהקבצים של המארגנים */
export function demoScenarios(employees: SampleEmployee[], references: ReferenceResult[], catalog: CatalogCar[]): DemoScenario[] {
  return employees.flatMap((e) => {
    const reference = references.find((r) => r.id === e.id);
    if (!reference) return [];
    const maintenance = /אחזקה (\d+)/.exec(e.todayCar);
    const today: SituationInput = maintenance
      ? { kind: "waiver", maintenance: Number(maintenance[1]) }
      : { kind: "car", car: e.todayCar, participation: e.todayParticipation };
    let alternative: SituationInput;
    if (reference.alternative.startsWith("ויתור")) alternative = { kind: "waiver" };
    else {
      const car = findCatalogCar(catalog, reference.alternative.replace(/\s*\(\d{4}\)$/, ""));
      if (!car) return [];
      alternative = { kind: "car", car: car.model, participation: car.defaultParticipation };
    }
    const { group, occupation, baseSalary, commissions, bonus, pensionRate, studyFundRate, creditPoints, childrenUnder23 } = e;
    const profile = { group, occupation, baseSalary, commissions, bonus, pensionRate, studyFundRate, creditPoints, childrenUnder23 };
    return [{ employee: e, reference, profile, today, alternative }];
  });
}

/** האם התוצאה של המסך זהה לנטו הייחוס של המארגנים, עד השקל */
export function checkAgainstReference(result: Record<string, unknown>, ref: ReferenceResult): ReferenceCheck {
  const today = result.today as { net: number } | null;
  const alt = result.alternative as { net: number } | null;
  const expected = { netToday: ref.netToday, netAlternative: ref.netAlternative, diff: ref.diff };
  const matches = today?.net === ref.netToday && alt?.net === ref.netAlternative && result.diffNet === ref.diff;
  return { matches, expected };
}

/** מה כרטיס העובד לדוגמה במסך צריך */
export function personaCard(s: DemoScenario, catalog: CatalogCar[]) {
  const side = (input: SituationInput, fallback: string) => {
    if (input.kind === "waiver") return { kind: "waiver" as const, label: "ויתור על הרכב" };
    const car = findCatalogCar(catalog, input.car);
    return { kind: "car" as const, carId: car?.id, label: car?.model ?? fallback };
  };
  return {
    id: s.employee.id,
    name: s.employee.name,
    occupation: s.employee.occupation,
    group: s.employee.group,
    question: s.employee.question,
    today: s.today.kind === "waiver" ? { kind: "waiver" as const, label: "אחזקת רכב" } : side(s.today, s.employee.todayCar),
    alternative: side(s.alternative, s.reference.alternative),
  };
}
