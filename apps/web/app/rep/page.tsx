import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, googleLoginEnabled, isAllowedRep, passwordLoginEnabled, signIn, signOut } from "@/auth";
import { Icon } from "../Icon";
import RepDesk from "./RepDesk";

export const dynamic = "force-dynamic";

/** בלי מפתחות של גוגל, נשארים עם הסיסמה המשותפת. עם המפתחות, רק מייל מורשה נכנס. */
export default async function RepPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!googleLoginEnabled()) return <RepDesk mode="password" />;

  const session = await auth();
  const email = session?.user?.email;
  if (email && isAllowedRep(email)) {
    async function logout() {
      "use server";
      await signOut({ redirectTo: "/rep" });
    }
    return <RepDesk mode="google" email={email} onLogout={logout} />;
  }

  async function login() {
    "use server";
    await signIn("google", { redirectTo: "/rep" });
  }
  async function passwordLogin(form: FormData) {
    "use server";
    try {
      await signIn("password", { email: form.get("email"), password: form.get("password"), redirectTo: "/rep" });
    } catch (e) {
      // מייל או סיסמה שגויים. הפניה מוצלחת נזרקת גם היא, ועוברת הלאה.
      if (e instanceof AuthError) redirect("/rep?error=CredentialsSignin");
      throw e;
    }
  }
  const { error } = await searchParams;

  return (
    <div className="rep-shell rep-center">
      <form className="card rep-login" action={login}>
        <div className="card-title">
          <span className="title-icon">
            <Icon name="lock" size={18} />
          </span>
          מסך הנציג
        </div>
        <p className="rep-hint">התחברו עם חשבון הגוגל של הצוות כדי לראות פניות פתוחות ולענות לעובדים.</p>
        <button type="submit" className="ghost-button rep-primary">
          התחברות עם Google
        </button>
        {/* עובד שנכנס לאתר עם חשבון שאינו ב-REP_EMAILS: מחובר, אבל לא לכאן */}
        {email && !error && (
          <div className="rep-error">
            החשבון <bdi>{email}</bdi> לא מורשה למסך הנציג. אפשר להתחבר עם חשבון אחר של הצוות.
          </div>
        )}
        {error && (
          <div className="rep-error">
            {error === "AccessDenied"
              ? "החשבון הזה לא מורשה להיכנס למסך הנציג"
              : error === "CredentialsSignin"
                ? "המייל או הסיסמה לא נכונים"
                : "ההתחברות נכשלה, נסו שוב"}
          </div>
        )}
      </form>
      {passwordLoginEnabled() && (
        <form className="card rep-login" action={passwordLogin}>
          <p className="rep-hint">או כניסה במייל וסיסמה:</p>
          <input className="rep-input" type="email" name="email" placeholder="מייל" autoComplete="username" dir="ltr" required />
          <input
            className="rep-input"
            type="password"
            name="password"
            placeholder="סיסמה"
            autoComplete="current-password"
            dir="ltr"
            required
          />
          <button type="submit" className="ghost-button rep-primary">
            כניסה
          </button>
        </form>
      )}
    </div>
  );
}
