/**
 * מבנה קובץ הכללים (config/rules.json).
 * הטעינה והוולידציה עם zod הן משימה N5 של נחמי. כאן רק הטיפוס.
 */
export interface Rules {
  version: string;
  budgets: Record<string, number>;
  groupOrder: string[];
  chooseFrom: "own_group_or_lower";
  electric: {
    netBonus: number;
    /** gross_up = העובד רואה netBonus נטו בדיוק. gross = netBonus כרכיב ברוטו. */
    method: "gross_up" | "gross";
    /** סוגי הנעה שזכאים להחזר חשמל */
    eligibleDrives?: string[];
  };
  familyTrack: {
    minChildren: number;
    childMaxAge: number;
    cars: string[];
    gapSplitEmployee: number;
  };
  waiver: {
    allowedBy: "occupation";
    maintenanceIsTaxable: boolean;
    maintenanceIsPensionable: boolean;
  };
  unusedBudget: "not_paid";
  netMethod: {
    creditPointValue: number;
    /** [תקרת מדרגה, שיעור]. null = ללא תקרה */
    brackets: [number | null, number][];
    nationalInsurance: { threshold: number; ceiling: number; lowRate: number; highRate: number };
    health: { threshold: number; ceiling: number; lowRate: number; highRate: number };
    pensionCredit: { rate: number; maxContributionRate: number; incomeCeiling: number };
  };
}
