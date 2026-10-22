/**
 * כניסה עם Google לכל המערכת: המערכת פנימית לעובדי החברה.
 * עם המפתחות, כל מסך וכל API דורשים כניסה (middleware.ts). עובדים נכנסים לפי ALLOWED_EMAILS,
 * ומסך הנציג פתוח רק למיילים שב-REP_EMAILS. בלי המפתחות האתר פתוח, ומסך הנציג חוזר לסיסמה.
 * אפשר להוסיף גם כניסה במייל וסיסמה קבועים (LOGIN_EMAIL, LOGIN_PASSWORD), למשל לשופטים.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { checkPasswordLogin, googleLoginEnabled, isAllowedEmployee, isAllowedRep } from "./lib/access";

export {
  allowedRepEmails,
  googleLoginEnabled,
  isAllowedEmployee,
  isAllowedRep,
  passwordLoginEnabled,
} from "./lib/access";

/**
 * ניסיונות סיסמה בדקה, לכל השרת יחד, כדי שאי אפשר יהיה לנחש אותה.
 * מונה מקומי ולא lib/rate-limit, כי הקובץ הזה נטען גם ב-middleware ושם לא רוצים את כל השרת.
 */
const PASSWORD_ATTEMPTS = 20;
let attempts = { count: 0, resetAt: 0 };

function tooManyAttempts(now = Date.now()): boolean {
  if (attempts.resetAt <= now) attempts = { count: 0, resetAt: now + 60_000 };
  return ++attempts.count > PASSWORD_ATTEMPTS;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // select_account: אפשר לבחור חשבון אחר, למשל לעבור מחשבון פרטי לחשבון של הצוות
    Google({ authorization: { params: { prompt: "select_account" } } }),
    Credentials({
      id: "password",
      credentials: { email: {}, password: {} },
      authorize(credentials) {
        if (tooManyAttempts()) return null;
        const email = checkPasswordLogin(credentials?.email, credentials?.password);
        return email ? { id: email, email, name: email } : null;
      },
    }),
  ],
  // מאחורי Docker ו-Render הכתובת מגיעה מה-proxy
  trustHost: true,
  // יום עבודה. אחרי זה נכנסים שוב.
  session: { maxAge: 10 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Google: רק מייל מאומת, של עובד מורשה, או של נציג מ-REP_EMAILS
    signIn({ account, profile }) {
      // המייל והסיסמה כבר נבדקו ב-authorize
      if (account?.provider === "password") return true;
      return profile?.email_verified === true && (isAllowedEmployee(profile.email) || isAllowedRep(profile.email));
    },
  },
});

/** העובד המחובר, או null כשהכניסה כבויה או שאין חיבור */
export async function currentUser(): Promise<{ email: string; name: string | null } | null> {
  if (!googleLoginEnabled()) return null;
  const session = await auth();
  const email = session?.user?.email;
  return email ? { email, name: session.user?.name ?? null } : null;
}
