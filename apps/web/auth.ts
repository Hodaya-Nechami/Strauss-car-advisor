/**
 * כניסה עם Google לכל המערכת: המערכת פנימית לעובדי החברה.
 * עם המפתחות, כל מסך וכל API דורשים כניסה (middleware.ts). עובדים נכנסים לפי ALLOWED_EMAILS,
 * ומסך הנציג פתוח רק למיילים שב-REP_EMAILS. בלי המפתחות האתר פתוח, ומסך הנציג חוזר לסיסמה.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { googleLoginEnabled, isAllowedEmployee, isAllowedRep } from "./lib/access";

export { allowedRepEmails, googleLoginEnabled, isAllowedEmployee, isAllowedRep } from "./lib/access";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // select_account: אפשר לבחור חשבון אחר, למשל לעבור מחשבון פרטי לחשבון של הצוות
  providers: [Google({ authorization: { params: { prompt: "select_account" } } })],
  // מאחורי Docker ו-Render הכתובת מגיעה מה-proxy
  trustHost: true,
  // יום עבודה. אחרי זה נכנסים שוב.
  session: { maxAge: 10 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // רק מייל מאומת: של עובד מורשה, או של נציג מ-REP_EMAILS
    signIn({ profile }) {
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
