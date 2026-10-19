/** הטיפוסים שהמסך מקבל מהשרת. תואמים לתוצאות הכלים ול-ChatView שב-lib/server.ts. */

export interface SideView {
  label: string;
  net: number;
  tax: number;
  nationalInsuranceAndHealth: number;
  valueOfUse: number;
  participation: number;
  maintenance: number;
  electricRefundNet: number;
  familyGapEmployee: number;
  breakdown: Record<string, number>;
}

/** סוג המצב בכל צד, ומזהה הרכב בקטלוג אם יש. בשביל התמונות. */
export interface SideInfo {
  kind: "car" | "waiver" | "none";
  carId?: string;
}

export interface ComparisonView {
  todaySide?: SideInfo;
  alternativeSide?: SideInfo;
  eligibility: { status: "eligible" | "not_eligible" | "needs_info"; reason: string };
  today: SideView | null;
  alternative: SideView | null;
  diffNet: number | null;
  changes: string[];
  /** ההפרש מפורק לסיבות. הסכומים מסתכמים בדיוק ל-diffNet. */
  bridge?: BridgeStepView[];
  explanation: string[];
  missing: string[];
}

export interface BridgeStepView {
  kind: "valueOfUse" | "maintenance" | "electric" | "participation" | "familyGap";
  label: string;
  detail: string;
  amount: number;
}

/** בדיקה מול נטו הייחוס של המארגנים, בהדגמה */
export interface ReferenceCheck {
  matches: boolean;
  expected: { netToday: number; netAlternative: number; diff: number };
}

export interface ComparisonRecord {
  input: { today?: unknown; alternative?: unknown };
  result: ComparisonView;
  reference?: ReferenceCheck;
}

/** חלופה אחת בדירוג, כמו שהכלי rank_alternatives מחזיר */
export interface RankedOptionView {
  kind: "car" | "waiver";
  carId?: string;
  label: string;
  model?: string;
  manufacturer?: string;
  group?: string;
  drive?: string;
  participation?: number;
  maintenance?: number;
  electricRefund: boolean;
  net: number;
  diffNet: number;
}

export interface RankingView {
  today: { label: string; net: number; side: SideInfo };
  options: RankedOptionView[];
  waiver: { status: string; reason: string } | null;
  notes: string[];
  basis: string;
}

export interface RankingRecord {
  input: { today?: unknown };
  result: RankingView;
}

/** ערך שנקרא מתלוש, ומאיפה הוא הגיע */
export interface PayslipValue {
  value: number;
  source: string;
  assumedZero?: boolean;
}

export type PayslipFieldKey = "baseSalary" | "commissions" | "bonus" | "pensionRate" | "studyFundRate" | "creditPoints";

/** מה שנקרא מתלוש השכר, לאישור העובד */
export interface PayslipReading {
  period: string | null;
  fields: Partial<Record<PayslipFieldKey, PayslipValue>>;
  car: Partial<Record<"valueOfUse" | "participation", PayslipValue>>;
  notes: string[];
  via?: string;
}

/** עובד לדוגמה במסך הפתיחה */
export interface Persona {
  id: string;
  name: string;
  occupation: string;
  group: string;
  question: string;
  today: { kind: "car" | "waiver"; carId?: string; label: string };
  alternative: { kind: "car" | "waiver"; carId?: string; label: string };
}

/** רכב מהקטלוג, כמו שהכלי show_cars מחזיר */
export interface CarSummary {
  id: string;
  model: string;
  manufacturer: string;
  group: string;
  drive: string;
  registrationYear: number;
  valueOfUse: number;
}

export interface CarGroup {
  purpose: "options" | "current" | "interest";
  cars: CarSummary[];
}

export interface TranscriptEntry {
  role: "employee" | "bot" | "notice" | "calc";
  text: string;
  comparisons?: ComparisonRecord[];
  rankings?: RankingRecord[];
  cars?: CarGroup[];
  via?: string[];
  at: string;
}

export interface Profile {
  group?: string;
  occupation?: string;
  baseSalary?: number;
  commissions?: number;
  bonus?: number;
  pensionRate?: number;
  studyFundRate?: number;
  creditPoints?: number;
  childrenUnder23?: number;
}

export interface ChatView {
  sessionId: string | null;
  transcript: TranscriptEntry[];
  openQuestions: { ticketId: string; about: string; question: string }[];
  profile: Profile;
}
