import type { Rules } from "./rules";
import type { EmployeeProfile, NetBreakdown, Situation } from "./types";

/** מס לפי מדרגות על הכנסה חודשית חייבת */
export function taxByBrackets(taxable: number, brackets: Rules["netMethod"]["brackets"]): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper === null ? taxable : Math.min(taxable, upper);
    if (top > lower) tax += (top - lower) * rate;
    if (upper === null || taxable <= upper) break;
    lower = upper;
  }
  return tax;
}

/** ביטוח לאומי או מס בריאות בשתי מדרגות */
export function twoTierContribution(
  income: number,
  t: { threshold: number; ceiling: number; lowRate: number; highRate: number },
): number {
  const low = Math.min(income, t.threshold);
  const high = Math.max(0, Math.min(income, t.ceiling) - t.threshold);
  return low * t.lowRate + high * t.highRate;
}

/** האם רכב במצב הזה מזכה בהחזר חשמל */
export function isElectricEligible(situation: Situation, rules: Rules): boolean {
  if (situation.kind !== "car") return false;
  const drives = rules.electric.eligibleDrives ?? ["חשמלי"];
  return drives.includes(situation.car.drive);
}

/** חלק העובד בפער מעל תקציב הקבוצה (מסלול ברוכת ילדים בלבד) */
export function familyGapEmployee(profile: EmployeeProfile, situation: Situation, rules: Rules): number {
  if (situation.kind !== "car" || situation.car.catalogGroup !== "משפחתי") return 0;
  const budget = rules.budgets[profile.group];
  const cost = situation.car.monthlyCost;
  if (budget === undefined || cost === undefined) return 0;
  return Math.max(0, cost - budget) * rules.familyTrack.gapSplitEmployee;
}

interface NetExtras {
  electricGross: number;
}

function calcNetWith(profile: EmployeeProfile, situation: Situation, rules: Rules, extras: NetExtras): NetBreakdown {
  const nm = rules.netMethod;
  const salary = profile.baseSalary + profile.commissions + profile.bonus;
  const maintenance = situation.kind === "waiver" ? (situation.maintenance ?? 0) : 0;
  const valueOfUse = situation.kind === "car" ? situation.car.valueOfUse : 0;
  const participation = situation.kind === "car" ? (situation.participation ?? 0) : 0;
  const electricGross = extras.electricGross;

  const gross = salary + maintenance + electricGross;
  const taxable = gross + valueOfUse - (rules.waiver.maintenanceIsTaxable ? 0 : maintenance);

  // פנסיה וקרן השתלמות מחושבות על השכר בלבד (בסיס + עמלות + בונוס), לא על אחזקה או החזר חשמל
  const pensionEmployee = (salary * profile.pensionRate) / 100;
  const studyFundEmployee = (salary * profile.studyFundRate) / 100;

  const taxBeforeCredits = taxByBrackets(taxable, nm.brackets);
  const creditPointsAmount = profile.creditPoints * nm.creditPointValue;
  const pc = nm.pensionCredit;
  const pensionCredit = pc.rate * Math.min(pensionEmployee, pc.incomeCeiling * pc.maxContributionRate);
  const tax = Math.max(0, taxBeforeCredits - creditPointsAmount - pensionCredit);

  const nationalInsurance = twoTierContribution(taxable, nm.nationalInsurance);
  const health = twoTierContribution(taxable, nm.health);
  const familyGap = familyGapEmployee(profile, situation, rules);

  const net =
    gross - tax - nationalInsurance - health - pensionEmployee - studyFundEmployee - participation - familyGap;

  return {
    salary,
    maintenance,
    electricGross,
    valueOfUse,
    gross,
    taxable,
    taxBeforeCredits,
    creditPointsAmount,
    pensionCredit,
    tax,
    nationalInsurance,
    health,
    pensionEmployee,
    studyFundEmployee,
    participation,
    familyGapEmployee: familyGap,
    net,
  };
}

/**
 * גילום החזר החשמל: מוצא את הסכום ברוטו שמוסיף לעובד בדיוק netBonus נטו.
 * חיפוש בינארי, ללא עיגול.
 */
export function grossUpElectric(profile: EmployeeProfile, situation: Situation, rules: Rules): number {
  const target = rules.electric.netBonus;
  if (rules.electric.method === "gross") return target;
  const base = calcNetWith(profile, situation, rules, { electricGross: 0 }).net;
  let lo = target;
  let hi = target * 4;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const gain = calcNetWith(profile, situation, rules, { electricGross: mid }).net - base;
    if (gain < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** נטו בלי החזר החשמל, כדי לדעת כמה מהנטו מגיע מההחזר */
export function netWithoutElectric(profile: EmployeeProfile, situation: Situation, rules: Rules): NetBreakdown {
  return calcNetWith(profile, situation, rules, { electricGross: 0 });
}

/** חישוב נטו חודשי מלא למצב אחד (היום או חלופה) */
export function calcNet(profile: EmployeeProfile, situation: Situation, rules: Rules): NetBreakdown {
  const electricGross = isElectricEligible(situation, rules) ? grossUpElectric(profile, situation, rules) : 0;
  return calcNetWith(profile, situation, rules, { electricGross });
}
