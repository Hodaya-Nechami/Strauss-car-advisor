"use client";

/**
 * "התלוש של החודש הבא": איך ייראה תלוש השכר עם החלופה, בשורות של תלוש אמיתי.
 * כל שורה שהשתנתה מסומנת: הסכום של היום מחוק לידה, והשינוי בצבע לפי ההשפעה על הנטו.
 * כל המספרים מגיעים מפירוט החישוב של המנוע (breakdown), לא מהבוט.
 */
import { shekel } from "./cars";
import { Icon } from "./Icon";
import type { SideView } from "./types";

/** effect: איך עלייה בשורה משפיעה על הנטו. שווי שימוש לא משולם, אבל מעלה את המס. */
type Row = { key: string; label: string; effect: 1 | -1 };

const SECTIONS: { title: string; note?: string; rows: Row[]; total?: { key: string; label: string } }[] = [
  {
    title: "תשלומים",
    rows: [
      { key: "salary", label: "שכר: בסיס, עמלות ובונוס", effect: 1 },
      { key: "maintenance", label: "אחזקת רכב", effect: 1 },
      { key: "electricGross", label: "החזר חשמל (מגולם)", effect: 1 },
    ],
    total: { key: "gross", label: "סה״כ תשלומים" },
  },
  {
    title: "זקיפות לצורכי מס",
    note: "לא משולם לך. רק מעלה את ההכנסה שעליה משלמים מס.",
    rows: [{ key: "valueOfUse", label: "שווי שימוש ברכב", effect: -1 }],
  },
  {
    title: "ניכויי חובה",
    rows: [
      { key: "tax", label: "מס הכנסה", effect: -1 },
      { key: "nationalInsurance", label: "ביטוח לאומי", effect: -1 },
      { key: "health", label: "מס בריאות", effect: -1 },
    ],
  },
  {
    title: "ניכויים נוספים",
    rows: [
      { key: "pensionEmployee", label: "פנסיה: חלק העובד", effect: -1 },
      { key: "studyFundEmployee", label: "קרן השתלמות: חלק העובד", effect: -1 },
      { key: "participation", label: "השתתפות ברכב", effect: -1 },
      { key: "familyGapEmployee", label: "חלקך במסלול המשפחתי", effect: -1 },
    ],
  },
];

const amount = (side: SideView, key: string) => Math.round(side.breakdown?.[key] ?? 0);

/** החודש הבא, למשל "נובמבר 2026" */
function nextMonthName(now = new Date()) {
  return new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
    new Date(now.getFullYear(), now.getMonth() + 1, 1),
  );
}

function Line({ label, today, next, effect, total }: { label: string; today: number; next: number; effect: 1 | -1; total?: boolean }) {
  const change = next - today;
  const good = change * effect > 0;
  return (
    <div className={`slip-row${total ? " total" : ""}${change ? " changed" : ""}`}>
      <span className="slip-label">{label}</span>
      <span className="slip-values">
        {change !== 0 && (
          <s className="slip-old" aria-label={`היום ${shekel(today)}`}>
            <bdi>{shekel(today)}</bdi>
          </s>
        )}
        <bdi className="slip-amount">{shekel(next)}</bdi>
        {change !== 0 && (
          <span className={`slip-chip ${good ? "up" : "down"}`}>
            <bdi>
              {change > 0 ? "+" : "−"}
              {shekel(Math.abs(change))}
            </bdi>
          </span>
        )}
      </span>
    </div>
  );
}

export function NextPayslip({ today, next, label }: { today: SideView; next: SideView; label: string }) {
  const netChange = Math.round(next.net) - Math.round(today.net);
  return (
    <details className="more next-slip">
      <summary>
        <Icon name="doc" size={18} /> איך ייראה התלוש שלי בחודש הבא?
      </summary>
      <article className="slip" aria-label="תלוש השכר המשוער של החודש הבא">
        <header className="slip-head">
          <div>
            <div className="slip-kicker">תלוש שכר משוער</div>
            <div className="slip-month">{nextMonthName()}</div>
          </div>
          <div className="slip-with">
            עם <strong>{label}</strong>
          </div>
        </header>

        {SECTIONS.map((section) => {
          const rows = section.rows.filter((r) => amount(today, r.key) !== 0 || amount(next, r.key) !== 0);
          if (!rows.length) return null;
          return (
            <section key={section.title} className="slip-section">
              <div className="slip-title">{section.title}</div>
              {section.note && <div className="slip-note">{section.note}</div>}
              {rows.map((r) => (
                <Line key={r.key} label={r.label} today={amount(today, r.key)} next={amount(next, r.key)} effect={r.effect} />
              ))}
              {section.total && (
                <Line
                  label={section.total.label}
                  today={amount(today, section.total.key)}
                  next={amount(next, section.total.key)}
                  effect={1}
                  total
                />
              )}
            </section>
          );
        })}

        <footer className={`slip-net ${netChange > 0 ? "up" : netChange < 0 ? "down" : "same"}`}>
          <span>נטו לתשלום</span>
          <span className="slip-net-values">
            <bdi className="slip-net-amount">{shekel(Math.round(next.net))}</bdi>
            <span className="slip-net-caption">
              {netChange === 0 ? (
                "כמו היום"
              ) : (
                <>
                  <bdi>
                    {netChange > 0 ? "+" : "−"}
                    {shekel(Math.abs(netChange))}
                  </bdi>{" "}
                  לעומת היום
                </>
              )}
            </span>
          </span>
        </footer>
        <p className="slip-foot">
          תלוש משוער לפי לוחות המס של 2025 וכללי החברה, לא תלוש רשמי. השורות שהשתנו מסומנות, והסכום של היום מחוק לידן.
        </p>
      </article>
    </details>
  );
}
