/**
 * נקודות החיבור בין הבוט לתשתית.
 * נחמי מממשת אותן מול SQLite (משימות N4, N6, N7).
 * עד אז יש מימוש זמני בזיכרון ב-memory.ts.
 */
import type { Drive } from "@strauss/engine";

/** שורה ממאגר שווי השימוש של רשות המסים */
export interface ValueOfUseRow {
  taxYear: number;
  registrationYear: number;
  vehicleTypeCode: string;
  manufacturerCode: string;
  manufacturer: string;
  modelCode: string;
  modelDescription: string;
  commercialName: string;
  /** לפי rules.valueOfUse.driveField: 0 בנזין, 1 היברידי, 2 פלאג-אין, 3 חשמלי */
  drive: Drive;
  listPrice: number;
  valueOfUse: number;
}

export interface ValueOfUseKey {
  registrationYear: number;
  manufacturerCode: string;
  modelCode: string;
  /** מומלץ תמיד לשלוח. בלי זה, רכבים שונים יכולים לחלוק מפתח (ATTO 3 ו-TANG) */
  vehicleTypeCode?: string;
}

export interface DataSource {
  /** שליפה לפי המפתח הרשמי. יכולה להחזיר 0, 1 או כמה שורות. */
  lookupValueOfUse(key: ValueOfUseKey): Promise<ValueOfUseRow[]>;
  /** חיפוש חופשי לפי שם מסחרי או תוצר, אופציונלית לפי שנת רישום */
  searchCars(text: string, registrationYear?: number, limit?: number): Promise<ValueOfUseRow[]>;
}

export interface RepQuestion {
  sessionId: string;
  /** השאלה לנציג, בעברית */
  question: string;
  /** על איזה נתון השאלה, למשל "השתתפות ברכב החדש" */
  about: string;
}

export interface RepQueue {
  /** שולח שאלה לנציג ומחזיר מזהה פנייה */
  ask(q: RepQuestion): Promise<{ ticketId: string }>;
}

/** יומן קריאות לכלים. כל מספר שהבוט מציג אפשר לעקוב אחריו לכאן. */
export type AuditLog = (entry: { sessionId: string; tool: string; input: unknown; output: unknown; at: string }) => void;
