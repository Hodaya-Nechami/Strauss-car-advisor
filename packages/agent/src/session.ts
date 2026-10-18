import type Anthropic from "@anthropic-ai/sdk";
import type { Content } from "@google/genai";
import type { EmployeeProfile } from "@strauss/engine";

export type Provider = "claude" | "gemini";

export interface RepQuestionRecord {
  ticketId: string;
  about: string;
  question: string;
}

export interface RepAnswerRecord extends RepQuestionRecord {
  answer: string;
  answeredAt: string;
}

/**
 * כל מה שנשמר על שיחה אחת. נשמר במסד הנתונים כמו שהוא (משימה N6).
 * ההיסטוריה נשמרת בפורמט של המודל שהשיחה התחילה איתו: messages ל-Claude, או geminiContents ל-Gemini.
 * בשתיהן מוסיפים בסוף בלבד, ואף פעם לא עורכים הודעה קודמת.
 */
export interface SessionState {
  id: string;
  /** המודל שהשיחה התחילה איתו. נקבע בתור הראשון ולא משתנה. */
  provider?: Provider;
  profile: Partial<EmployeeProfile>;
  /** שאלות שנשלחו לנציג ועוד לא נענו */
  pendingQuestions: RepQuestionRecord[];
  /** שאלות שהנציג כבר ענה עליהן */
  repAnswers: RepAnswerRecord[];
  messages: Anthropic.Beta.BetaMessageParam[];
  geminiContents: Content[];
}

export function newSession(id: string): SessionState {
  return { id, profile: {}, pendingQuestions: [], repAnswers: [], messages: [], geminiContents: [] };
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
