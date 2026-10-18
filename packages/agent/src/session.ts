import type Anthropic from "@anthropic-ai/sdk";
import type { Part } from "@google/genai";
import type { EmployeeProfile } from "@strauss/engine";

/** claude: מודל אחד בתשלום. free: שרשרת של ספקים חינמיים שמחליפים זה את זה כשהמכסה נגמרת. */
export type Mode = "claude" | "free";

export interface RepQuestionRecord {
  ticketId: string;
  about: string;
  question: string;
}

export interface RepAnswerRecord extends RepQuestionRecord {
  answer: string;
  answeredAt: string;
}

export interface LoggedCall {
  /** מזהה פנימי, אחיד לכל הספקים */
  id: string;
  /** המזהה המקורי מ-Gemini, אם נתן כזה */
  providerId?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LoggedResult {
  id: string;
  name: string;
  output: Record<string, unknown>;
}

/**
 * היסטוריה בפורמט שלנו, שכל ספק חינמי מקבל מתורגמת לפורמט שלו.
 * כך שיחה יכולה לעבור מ-Gemini ל-Groq באמצע, בלי לאבד כלום.
 */
export type LogEntry =
  | { role: "user"; text: string }
  | {
      role: "model";
      /** איזה ספק כתב את התשובה */
      provider: string;
      text?: string;
      calls: LoggedCall[];
      /** התשובה המקורית של Gemini, כולל חתימות החשיבה. נשלחת חזרה ל-Gemini בדיוק כמו שהתקבלה. */
      geminiParts?: Part[];
    }
  | { role: "tools"; results: LoggedResult[] };

/**
 * כל מה שנשמר על שיחה אחת. נשמר במסד הנתונים כמו שהוא (משימה N6).
 * בשתי ההיסטוריות מוסיפים בסוף בלבד, ואף פעם לא עורכים הודעה קודמת.
 */
export interface SessionState {
  id: string;
  /** נקבע בתור הראשון ולא משתנה */
  mode?: Mode;
  profile: Partial<EmployeeProfile>;
  /** שאלות שנשלחו לנציג ועוד לא נענו */
  pendingQuestions: RepQuestionRecord[];
  /** שאלות שהנציג כבר ענה עליהן */
  repAnswers: RepAnswerRecord[];
  /** ההיסטוריה של Claude, בפורמט שלו */
  messages: Anthropic.Beta.BetaMessageParam[];
  /** ההיסטוריה של הספקים החינמיים, בפורמט שלנו */
  log: LogEntry[];
}

export function newSession(id: string): SessionState {
  return { id, profile: {}, pendingQuestions: [], repAnswers: [], messages: [], log: [] };
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
