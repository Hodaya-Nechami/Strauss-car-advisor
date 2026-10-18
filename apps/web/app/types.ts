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
  explanation: string[];
  missing: string[];
}

export interface ComparisonRecord {
  input: { today?: unknown; alternative?: unknown };
  result: ComparisonView;
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
