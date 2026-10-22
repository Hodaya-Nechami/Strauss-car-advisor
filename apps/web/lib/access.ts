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
  if (!email) return false;
  const address = email.toLowerCase();
  // מי שנכנס עם המייל והסיסמה הקבועים נכנס גם למסך הנציג
  if (passwordLoginEnabled(env) && address === env.LOGIN_EMAIL!.trim().toLowerCase()) return true;
  return allowedRepEmails(env).includes(address);
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

/**
 * כניסה קבועה במייל וסיסמה, למי שאין לנו את המייל שלו מראש (למשל שופטים בהדגמה).
 * פעילה רק כשמוגדרים LOGIN_EMAIL ו-LOGIN_PASSWORD, והמייל הזה נכנס גם למסך הנציג.
 */
export function passwordLoginEnabled(env: Env = process.env): boolean {
  return Boolean(env.LOGIN_EMAIL?.trim() && env.LOGIN_PASSWORD);
}

/** השוואה באורך זמן קבוע, כדי שזמן התשובה לא יסגיר כמה תווים מהסיסמה נכונים */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** המייל המחובר אם המייל והסיסמה נכונים, אחרת null */
export function checkPasswordLogin(email: unknown, password: unknown, env: Env = process.env): string | null {
  if (!passwordLoginEnabled(env) || typeof email !== "string" || typeof password !== "string") return null;
  const address = env.LOGIN_EMAIL!.trim().toLowerCase();
  const emailOk = email.trim().toLowerCase() === address;
  const passwordOk = sameText(password, env.LOGIN_PASSWORD!);
  return emailOk && passwordOk ? address : null;
}
