import type Anthropic from "@anthropic-ai/sdk";
import type { EmployeeProfile } from "@strauss/engine";

/**
 * כל מה שנשמר על שיחה אחת. נשמר במסד הנתונים כמו שהוא (משימה N6).
 * messages היא ההיסטוריה המלאה שנשלחת ל-Claude: מוסיפים בסוף בלבד, ואף פעם לא עורכים הודעה קודמת.
 */
export interface SessionState {
  id: string;
  profile: Partial<EmployeeProfile>;
  /** שאלות שנשלחו לנציג ועוד לא נענו */
  pendingQuestions: { ticketId: string; about: string; question: string }[];
  messages: Anthropic.Beta.BetaMessageParam[];
}

export function newSession(id: string): SessionState {
  return { id, profile: {}, pendingQuestions: [], messages: [] };
}

/** שדות חובה לכל חישוב נטו, עם השם שלהם בעברית לשאלה לעובד */
export const REQUIRED_PROFILE_FIELDS: { key: keyof EmployeeProfile; label: string }[] = [
  { key: "group", label: "קבוצת זכאות (א-ד)" },
  { key: "baseSalary", label: "שכר בסיס חודשי" },
  { key: "commissions", label: "עמלות חודשיות (0 אם אין)" },
  { key: "bonus", label: "בונוס חודשי (0 אם אין)" },
  { key: "pensionRate", label: "אחוז הפרשה לפנסיה" },
  { key: "studyFundRate", label: "אחוז הפרשה לקרן השתלמות (0 אם אין)" },
  { key: "creditPoints", label: "נקודות זיכוי" },
];

export function missingProfileFields(profile: Partial<EmployeeProfile>): string[] {
  return REQUIRED_PROFILE_FIELDS.filter((f) => profile[f.key] === undefined).map((f) => f.label);
}

/** פרופיל מלא לחישוב. מספר ילדים לא ידוע נחשב 0: הוא משפיע רק על מסלול ברוכת ילדים, ושם בודקים אותו בנפרד. */
export function completeProfile(profile: Partial<EmployeeProfile>): EmployeeProfile | null {
  if (missingProfileFields(profile).length) return null;
  return { childrenUnder23: 0, ...profile } as EmployeeProfile;
}
