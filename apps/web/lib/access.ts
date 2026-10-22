/**
 * מי נכנס לאן. פונקציות טהורות, בלי next-auth, כדי שאפשר לבדוק אותן בלי שרת.
 * עובדים: ALLOWED_EMAILS (ריק = כל חשבון Google). נציגים: REP_EMAILS, והם נכנסים גם לאתר עצמו.
 */
type Env = Record<string, string | undefined>;

const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** התחברות עם גוגל פעילה רק כשהוגדרו המפתחות שלה. אחרת האתר פתוח ומסך הנציג חוזר לסיסמה המשותפת. */
export function googleLoginEnabled(env: Env = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET && env.AUTH_SECRET);
}

/** המיילים שמורשים להיכנס למסך הנציג, מ-REP_EMAILS (מופרדים בפסיקים) */
export function allowedRepEmails(env: Env = process.env): string[] {
  return list(env.REP_EMAILS);
}

export function isAllowedRep(email: string | null | undefined, env: Env = process.env): boolean {
  return Boolean(email) && allowedRepEmails(env).includes(email!.toLowerCase());
}

/**
 * עובד שמורשה להיכנס לאתר: כתובת מלאה, או דומיין שלם שמתחיל ב-@, מ-ALLOWED_EMAILS.
 * למשל "@strauss-group.com, judge@gmail.com". ריק: כל חשבון Google.
 */
export function isAllowedEmployee(email: string | null | undefined, env: Env = process.env): boolean {
  if (!email) return false;
  const rules = list(env.ALLOWED_EMAILS);
  if (!rules.length) return true;
  const address = email.trim().toLowerCase();
  return rules.some((r) => (r.startsWith("@") ? address.endsWith(r) : address === r));
}
