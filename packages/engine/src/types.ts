/**
 * חוזה הטיפוסים המשותף של הפרויקט.
 * המנוע, שכבת הנתונים (נחמי) והסוכן משתמשים כולם בטיפוסים האלה.
 * שינוי כאן = לתאם בין שתינו.
 */

/** קבוצת זכאות: "א" | "ב" | "ג" | "ד" (נקבע בקובץ הכללים, לא בקוד) */
export type Group = string;

/** קבוצה בקטלוג: קבוצת זכאות רגילה, או "משפחתי" למסלול ברוכת ילדים */
export type CatalogGroup = Group | "משפחתי";

export type Drive = "בנזין" | "היברידי" | "פלאג-אין" | "חשמלי";

/** רכב מהקטלוג (config/catalog.json) */
export interface CatalogCar {
  id: string;
  group: CatalogGroup;
  manufacturer: string;
  manufacturerCode: string;
  model: string;
  modelCode: string;
  modelDescription: string;
  registrationYear: number;
  drive: Drive;
  listPrice: number;
  /** שווי שימוש חודשי מהמאגר של רשות המסים */
  valueOfUse: number;
  /** עלות חודשית לחברה */
  monthlyCost: number;
  /** השתתפות עובד ברירת מחדל */
  defaultParticipation: number;
}

/** עיסוק (config/occupations.json) */
export interface Occupation {
  name: string;
  group: Group;
  carMandatory: boolean;
  waiverAllowed: boolean;
  /** אחזקת רכב חודשית בוויתור (₪) */
  waiverMaintenance: number;
}

/** נתוני השכר של העובד */
export interface EmployeeProfile {
  group: Group;
  occupation?: string;
  baseSalary: number;
  commissions: number;
  bonus: number;
  /** אחוז הפרשת עובד לפנסיה, למשל 6 */
  pensionRate: number;
  /** אחוז הפרשת עובד לקרן השתלמות, למשל 2.5 */
  studyFundRate: number;
  creditPoints: number;
  childrenUnder23: number;
}

/** רכב בתוך מצב (היום או חלופה). לא חייב להיות מהקטלוג. */
export interface CarInSituation {
  label: string;
  catalogGroup?: CatalogGroup;
  drive: Drive;
  valueOfUse: number;
  /** עלות חודשית לחברה. נדרש רק למסלול המשפחתי. */
  monthlyCost?: number;
  registrationYear?: number;
  catalogId?: string;
}

/**
 * מצב רכב: היום או חלופה.
 * participation חסר (undefined) = עוד לא ידוע. המנוע לא מנחש, אלא מחזיר אותו ברשימת החוסרים.
 */
export type Situation =
  | { kind: "car"; car: CarInSituation; participation?: number }
  | { kind: "waiver"; maintenance?: number }
  | { kind: "none" };

/** פירוט חישוב נטו. כל הסכומים חודשיים, ללא עיגול. */
export interface NetBreakdown {
  salary: number;
  maintenance: number;
  electricGross: number;
  valueOfUse: number;
  gross: number;
  taxable: number;
  taxBeforeCredits: number;
  creditPointsAmount: number;
  pensionCredit: number;
  tax: number;
  nationalInsurance: number;
  health: number;
  pensionEmployee: number;
  studyFundEmployee: number;
  participation: number;
  familyGapEmployee: number;
  net: number;
}

export type EligibilityStatus = "eligible" | "not_eligible" | "needs_info";

export interface Eligibility {
  status: EligibilityStatus;
  /** הסבר בעברית פשוטה */
  reason: string;
  /** מה חסר כדי להכריע (לשאול את העובד או את הנציג) */
  missing: string[];
}

export interface SituationResult {
  label: string;
  breakdown: NetBreakdown;
}

export interface Comparison {
  eligibility: Eligibility;
  /** null כשחסר מידע על המצב היום */
  today: SituationResult | null;
  /** null כשהחלופה לא זכאית או שחסר מידע לחישוב שלה */
  alternative: SituationResult | null;
  /** נטו בחלופה פחות נטו היום, ללא עיגול */
  diff: number | null;
  /** הפרש לתצוגה: נטו מעוגל בחלופה פחות נטו מעוגל היום, כדי שהמספרים על המסך יסתכמו */
  diffDisplay: number | null;
  /** שורות "מה השתנה", כמו עמודת "למה" באקסל */
  changes: string[];
  /** הסבר של שתי שורות בשפה פשוטה */
  explanation: string[];
  /** מידע שחסר לחישוב. הבוט שואל את העובד או שולח שאלה לנציג. */
  missing: string[];
}
