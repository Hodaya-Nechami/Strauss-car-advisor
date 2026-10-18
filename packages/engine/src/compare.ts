import { checkEligibility } from "./eligibility";
import { formatShekel as f } from "./format";
import { calcNet, isElectricEligible } from "./net";
import type { Rules } from "./rules";
import type { Comparison, EmployeeProfile, NetBreakdown, Occupation, Situation } from "./types";

export interface CompareInput {
  profile: EmployeeProfile;
  today: Situation;
  alternative: Situation;
  occupations: Occupation[];
  rules: Rules;
}

export function situationLabel(s: Situation): string {
  if (s.kind === "car") return s.car.registrationYear ? `${s.car.label} (${s.car.registrationYear})` : s.car.label;
  if (s.kind === "waiver") return `ויתור - אחזקת רכב ${s.maintenance ?? "?"} ₪`;
  return "ללא רכב";
}

/** מה חסר כדי לחשב מצב. ריק = אפשר לחשב. */
function missingFor(s: Situation, when: "today" | "alternative"): string[] {
  const out: string[] = [];
  const carWord = when === "today" ? "ברכב היום" : "ברכב החדש";
  if (s.kind === "car") {
    if (s.participation === undefined) out.push(`ההשתתפות שלך ${carWord}`);
    if (s.car.catalogGroup === "משפחתי" && s.car.monthlyCost === undefined) out.push(`העלות החודשית של הרכב ${carWord}`);
  }
  if (s.kind === "waiver" && s.maintenance === undefined) {
    out.push(when === "today" ? "סכום אחזקת הרכב שאת/ה מקבל/ת היום" : "סכום אחזקת הרכב בוויתור");
  }
  return out;
}

/** אם בחלופת ויתור לא צוין סכום אחזקה, לוקחים אותו מטבלת העיסוקים */
function withOccupationMaintenance(s: Situation, profile: EmployeeProfile, occupations: Occupation[]): Situation {
  if (s.kind !== "waiver" || s.maintenance !== undefined) return s;
  const occ = occupations.find((o) => o.name === profile.occupation);
  return occ && occ.waiverAllowed ? { kind: "waiver", maintenance: occ.waiverMaintenance } : s;
}

/** שורות "מה השתנה" בין היום לחלופה, באותו סגנון כמו עמודת "למה" באקסל */
export function describeChanges(
  today: Situation,
  alt: Situation,
  t: NetBreakdown,
  a: NetBreakdown,
  rules: Rules,
): string[] {
  const lines: string[] = [];

  if (today.kind === "car" && alt.kind === "car") {
    if (t.valueOfUse !== a.valueOfUse) lines.push(`שווי שימוש ${f(t.valueOfUse)} → ${f(a.valueOfUse)} ₪`);
  } else if (today.kind !== "car" && alt.kind === "car") {
    lines.push(
      t.maintenance > 0
        ? `נוסף שווי שימוש ${f(a.valueOfUse)} ₪ ובוטלה אחזקה ${f(t.maintenance)} ₪`
        : `נוסף שווי שימוש ${f(a.valueOfUse)} ₪`,
    );
  } else if (today.kind === "car" && alt.kind === "waiver") {
    lines.push(`בוטל שווי שימוש ${f(t.valueOfUse)} ₪, נוספה אחזקה ${f(a.maintenance)} ₪ (חייבת במס)`);
  } else if (t.maintenance !== a.maintenance) {
    lines.push(`אחזקת רכב ${f(t.maintenance)} → ${f(a.maintenance)} ₪`);
  }

  const elecToday = isElectricEligible(today, rules);
  const elecAlt = isElectricEligible(alt, rules);
  const bonus = f(rules.electric.netBonus);
  const kind = rules.electric.method === "gross_up" ? "נטו" : "ברוטו";
  if (elecAlt && !elecToday) lines.push(`+${bonus} ₪ ${kind} החזר חשמל${kind === "נטו" ? " (מגולם)" : ""}`);
  if (elecToday && !elecAlt) lines.push(`בוטל החזר חשמל ${bonus} ₪ ${kind}`);

  if (t.participation !== a.participation) lines.push(`השתתפות ${f(t.participation)} → ${f(a.participation)} ₪`);

  if (a.familyGapEmployee > 0) lines.push(`חלק העובד בפער המסלול המשפחתי ${f(a.familyGapEmployee)} ₪`);
  else if (t.familyGapEmployee > 0) lines.push(`בוטל חלק העובד בפער המסלול המשפחתי ${f(t.familyGapEmployee)} ₪`);

  return lines;
}

/**
 * השוואה מלאה: היום מול חלופה.
 * כל המספרים מכאן. הבוט רק מציג ומסביר אותם.
 */
export function compare(input: CompareInput): Comparison {
  const { profile, occupations, rules } = input;
  const today = withOccupationMaintenance(input.today, profile, occupations);
  const alternative = withOccupationMaintenance(input.alternative, profile, occupations);

  const eligibility = checkEligibility(profile, alternative, occupations, rules);
  const missingToday = missingFor(today, "today");
  const missingAlt = eligibility.status === "eligible" ? missingFor(alternative, "alternative") : [];
  const missing = [...missingToday, ...eligibility.missing, ...missingAlt];

  const todayResult =
    missingToday.length === 0 ? { label: situationLabel(today), breakdown: calcNet(profile, today, rules) } : null;
  const altResult =
    eligibility.status === "eligible" && missingAlt.length === 0
      ? { label: situationLabel(alternative), breakdown: calcNet(profile, alternative, rules) }
      : null;

  const diff = todayResult && altResult ? altResult.breakdown.net - todayResult.breakdown.net : null;
  const diffDisplay =
    todayResult && altResult ? Math.round(altResult.breakdown.net) - Math.round(todayResult.breakdown.net) : null;
  const changes =
    todayResult && altResult
      ? describeChanges(today, alternative, todayResult.breakdown, altResult.breakdown, rules)
      : [];

  const explanation: string[] = [];
  if (eligibility.status === "not_eligible") {
    explanation.push(`החלופה לא אפשרית: ${eligibility.reason}.`);
    if (todayResult) explanation.push(`הנטו שלך היום נשאר ${f(todayResult.breakdown.net)} ₪ בחודש.`);
  } else if (diffDisplay === null) {
    explanation.push(`חסר לי מידע כדי לחשב את החלופה: ${missing.join(", ")}.`);
    if (todayResult) explanation.push(`בינתיים, הנטו שלך היום הוא ${f(todayResult.breakdown.net)} ₪ בחודש.`);
  } else {
    const t = todayResult!.breakdown.net;
    const a = altResult!.breakdown.net;
    if (diffDisplay === 0) explanation.push(`הנטו שלך כמעט לא משתנה: בערך ${f(t)} ₪ בחודש.`);
    else
      explanation.push(
        `בחלופה הנטו שלך ${diffDisplay > 0 ? "עולה" : "יורד"} ב-${f(Math.abs(diffDisplay))} ₪ בחודש: מ-${f(t)} ₪ ל-${f(a)} ₪.`,
      );
    explanation.push(changes.length ? `הסיבות: ${changes.join(", ")}.` : "אין שינוי ברכיבי הרכב.");
  }

  return { eligibility, today: todayResult, alternative: altResult, diff, diffDisplay, changes, explanation, missing };
}
