import { auth, googleLoginEnabled, isAllowedRep, signIn, signOut } from "@/auth";
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
        {error && (
          <div className="rep-error">
            {error === "AccessDenied" ? "החשבון הזה לא מורשה להיכנס למסך הנציג" : "ההתחברות נכשלה, נסו שוב"}
          </div>
        )}
      </form>
    </div>
  );
}
