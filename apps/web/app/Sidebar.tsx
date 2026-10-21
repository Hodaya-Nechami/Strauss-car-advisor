"use client";

/**
 * תפריט הצד: הסמל, פעולות מהירות, הנתונים של העובד, והבדיקה מול המארגנים.
 * במחשב הוא קבוע בצד. בטלפון הוא נפתח מכפתור התפריט.
 */
import { Bloom } from "./Bloom";
import { Icon, type IconName } from "./Icon";
import { PickPayslip } from "./Payslip";
import { ProfilePanel } from "./ProfilePanel";
import type { ChatView, Profile } from "./types";

export const QUICK_ASKS: { icon: IconName; label: string; text: string }[] = [
  { icon: "trophy", label: "מה הכי משתלם לי?", text: "מה הכי משתלם לי מכל הרכבים שמגיעים לי?" },
  { icon: "bolt", label: "מעבר לרכב חשמלי", text: "אני שוקל/ת לעבור לרכב חשמלי. כמה זה ישנה לי בנטו?" },
  { icon: "key", label: "ויתור על הרכב", text: "אני רוצה לוותר על הרכב ולקבל אחזקה. כמה אקבל?" },
  { icon: "family", label: "מסלול ברוכת ילדים", text: "יש לי 5 ילדים. אפשר לקבל רכב משפחתי?" },
];

export function Sidebar({
  open,
  busy,
  sessionId,
  profile,
  proof,
  onClose,
  onNewChat,
  onAsk,
  onUpload,
  onDemo,
  onView,
}: {
  open: boolean;
  busy: boolean;
  sessionId: string | null;
  profile: Profile;
  proof: { matched: number; total: number } | null;
  onClose: () => void;
  onNewChat: () => void;
  onAsk: (text: string) => void;
  onUpload: (f: File) => void;
  onDemo: () => void;
  onView: (v: ChatView) => void;
}) {
  const hasProfile = Boolean(sessionId) && Object.keys(profile).length > 0;
  return (
    <>
      <div className={`scrim${open ? " show" : ""}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="תפריט">
        <div className="rail-brand">
          <Bloom size={58} variant={busy ? "thinking" : "mark"} />
          <div className="rail-brand-text">
            <div className="rail-title">יועץ הרכב</div>
            <div className="rail-sub">
              של <span>שטראוס</span>
            </div>
          </div>
          <button type="button" className="icon-button rail-close" onClick={onClose} aria-label="סגירת התפריט">
            <Icon name="close" />
          </button>
        </div>

        <button type="button" className="rail-new" onClick={onNewChat}>
          <Icon name="plus" /> שיחה חדשה
        </button>

        <nav className="rail-section" aria-label="פעולות מהירות">
          <div className="rail-label">מה אפשר לבדוק</div>
          {QUICK_ASKS.map((a) => (
            <button key={a.label} type="button" className="rail-item" onClick={() => onAsk(a.text)} disabled={busy}>
              <Icon name={a.icon} /> {a.label}
            </button>
          ))}
          <PickPayslip className="rail-item" onFile={onUpload}>
            <Icon name="doc" /> העלאת תלוש שכר
          </PickPayslip>
          <button type="button" className="rail-item" onClick={onDemo}>
            <Icon name="play" /> עובדים לדוגמה
          </button>
        </nav>

        <section className="rail-section">
          <div className="rail-label">הנתונים שלי</div>
          {hasProfile ? (
            <ProfilePanel sessionId={sessionId!} profile={profile} onView={onView} />
          ) : (
            <p className="rail-empty">עוד לא מסרת נתונים. אפשר לספר לנטבוט בצ'אט, או להעלות תלוש והוא ימלא הכול.</p>
          )}
        </section>

        <div className="rail-foot">
          {proof && (
            <div className="rail-proof">
              <Icon name="shield" />
              <span>
                <strong>
                  {proof.matched} מתוך {proof.total}
                </strong>{" "}
                העובדים לדוגמה של המארגנים זהים עד השקל
              </span>
            </div>
          )}
          <div className="rail-meta">לוחות מס 2025 · מאגר שווי השימוש של רשות המסים 2026</div>
        </div>
      </aside>
    </>
  );
}
