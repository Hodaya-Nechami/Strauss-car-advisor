/** הטיפוסים שהמסך מקבל מהשרת. תואמים לתוצאת calculate_comparison ול-ChatView שב-lib/server.ts. */

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

export interface ComparisonView {
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

export interface TranscriptEntry {
  role: "employee" | "bot" | "notice" | "calc";
  text: string;
  comparisons?: ComparisonRecord[];
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
