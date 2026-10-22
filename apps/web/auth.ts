import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** המיילים שמורשים להיכנס למסך הנציג, מ-REP_EMAILS (מופרדים בפסיקים) */
export function allowedRepEmails(): string[] {
  return (process.env.REP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** התחברות עם גוגל פעילה רק כשהוגדרו המפתחות שלה. אחרת מסך הנציג חוזר לסיסמה המשותפת. */
export function googleLoginEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
}

export function isAllowedRep(email: string | null | undefined): boolean {
  return Boolean(email) && allowedRepEmails().includes(email!.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  // מאחורי Docker ו-Render הכתובת מגיעה מה-proxy
  trustHost: true,
  pages: { signIn: "/rep", error: "/rep" },
  callbacks: {
    // רק מייל מאומת שמופיע ב-REP_EMAILS מקבל session
    signIn({ profile }) {
      return profile?.email_verified === true && isAllowedRep(profile.email);
    },
  },
});
