"use client";

/** כרטיס השוואה: היום מול החלופה. כל המספרים מגיעים ממנוע החישוב, לא מהבוט. */
import { useState, type FormEvent } from "react";
import type { ChatView, ComparisonView, SideView } from "./types";

const BADGE: Record<ComparisonView["eligibility"]["status"], string> = {
  eligible: "זכאי/ת",
  not_eligible: "לא זכאי/ת",
  needs_info: "חסר מידע",
};

const ROWS: { key: keyof SideView; label: string; always?: boolean }[] = [
  { key: "net", label: "נטו בחודש", always: true },
  { key: "tax", label: "מס הכנסה", always: true },
  { key: "nationalInsuranceAndHealth", label: "ביטוח לאומי ובריאות", always: true },
  { key: "valueOfUse", label: "שווי שימוש (נוסף להכנסה החייבת)" },
  { key: "participation", label: "השתתפות ברכב" },
  { key: "maintenance", label: "אחזקת רכב" },
  { key: "electricRefundNet", label: "החזר חשמל (נטו)" },
  { key: "familyGapEmployee", label: "חלק העובד במסלול המשפחתי" },
];

/** שלבי החישוב המלאים, לפירוט "איך חושב?" */
const DETAIL_ROWS: { key: string; label: string; total?: boolean }[] = [
  { key: "salary", label: "שכר: בסיס, עמלות ובונוס" },
  { key: "maintenance", label: "אחזקת רכב" },
  { key: "electricGross", label: "החזר חשמל, ברוטו אחרי גילום" },
  { key: "gross", label: "ברוטו", total: true },
  { key: "valueOfUse", label: "שווי שימוש: לא כסף, רק מעלה את המס" },
  { key: "taxable", label: "הכנסה חייבת במס", total: true },
  { key: "taxBeforeCredits", label: "מס לפי מדרגות" },
  { key: "creditPointsAmount", label: "פחות זיכוי נקודות זיכוי" },
  { key: "pensionCredit", label: "פחות זיכוי על ההפרשה לפנסיה" },
  { key: "tax", label: "מס הכנסה לתשלום", total: true },
  { key: "nationalInsurance", label: "ביטוח לאומי" },
  { key: "health", label: "מס בריאות" },
  { key: "pensionEmployee", label: "הפרשת עובד לפנסיה" },
  { key: "studyFundEmployee", label: "הפרשת עובד לקרן השתלמות" },
  { key: "participation", label: "השתתפות ברכב" },
  { key: "familyGapEmployee", label: "חלק העובד במסלול המשפחתי" },
  { key: "net", label: "נטו", total: true },
];

const shekel = (n: number) => `${n.toLocaleString("en-US")} ₪`;

function cell(side: SideView | null, key: keyof SideView) {
  if (!side) return "—";
  const v = side[key];
  return typeof v === "number" ? shekel(v) : "—";
}

function detail(side: SideView | null, key: string) {
  const v = side?.breakdown?.[key];
  return typeof v === "number" ? shekel(v) : "—";
}

interface Options {
  cars: { id: string; group: string; manufacturer: string; model: string; drive: string; valueOfUse: number }[];
  waiver: { status: string; reason: string };
}

/** בדיקת חלופה אחרת מתוך הכרטיס, בלי לחכות לבוט */
function Recalculate({ sessionId, today, onView }: { sessionId: string; today: unknown; onView: (v: ChatView) => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [choice, setChoice] = useState("");
  const [participation, setParticipation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadOptions() {
    if (options) return;
    try {
      const res = await fetch(`/api/options?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      const data = (await res.json()) as Options & { error?: string };
      if (!res.ok) setError(data.error ?? "לא הצלחתי לטעון את הרכבים");
      else setOptions(data);
    } catch {
      setError("אין חיבור לשרת");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    const alternative =
      choice === "waiver"
        ? { kind: "waiver" }
        : { kind: "car", car: choice, ...(participation.trim() === "" ? {} : { participation: Number(participation) }) };
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, today, alternative }),
      });
      const data = (await res.json()) as ChatView & { error?: string };
      if (!res.ok) setError(data.error ?? "החישוב נכשל");
      else onView(data);
    } catch {
      setError("אין חיבור לשרת");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="more"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) void loadOptions();
      }}
    >
      <summary>לבדוק רכב אחר</summary>
      {!options && !error && <div className="muted">טוען...</div>}
      {options && (
        <form onSubmit={submit} className="inline-form">
          <label>
            חלופה
            <select value={choice} onChange={(e) => setChoice(e.target.value)} required>
              <option value="">בחרו</option>
              {options.cars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.model} · {c.manufacturer} · קבוצה {c.group} · {c.drive}
                </option>
              ))}
              {options.waiver.status === "eligible" && <option value="waiver">ויתור על הרכב</option>}
            </select>
          </label>
          {choice && choice !== "waiver" && (
            <label>
              השתתפות חודשית ברכב (₪)
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={participation}
                placeholder="לא יודעים? השאירו ריק"
                onChange={(e) => setParticipation(e.target.value)}
              />
            </label>
          )}
          <button type="submit" className="small-button" disabled={!choice || busy}>
            {busy ? "מחשב..." : "חשב"}
          </button>
        </form>
      )}
      {options && options.waiver.status !== "eligible" && (
        <div className="muted">ויתור על הרכב: {options.waiver.reason}</div>
      )}
      {error && <div className="error">{error}</div>}
    </details>
  );
}

export function ComparisonCard({
  data,
  today,
  sessionId,
  onView,
}: {
  data: ComparisonView;
  today?: unknown;
  sessionId?: string | null;
  onView?: (v: ChatView) => void;
}) {
  const { today: t, alternative: a, diffNet, eligibility } = data;
  const rows = ROWS.filter((r) => r.always || (t && t[r.key] !== 0) || (a && a[r.key] !== 0));
  const details = DETAIL_ROWS.filter(
    (r) => r.total || (t?.breakdown?.[r.key] ?? 0) !== 0 || (a?.breakdown?.[r.key] ?? 0) !== 0,
  );

  return (
    <section className="card" aria-label="השוואת נטו">
      <div className="card-head">
        <div>
          <div className="card-title">השוואה: היום מול החלופה</div>
          <div className="card-sub">
            {t?.label ?? "המצב היום"} · {a?.label ?? "החלופה"}
          </div>
        </div>
        <span className={`badge ${eligibility.status}`}>{BADGE[eligibility.status]}</span>
      </div>

      {diffNet !== null && (
        <div className={`diff ${diffNet >= 0 ? "up" : "down"}`}>
          <bdi>
            {diffNet > 0 ? "+" : diffNet < 0 ? "−" : ""}
            {shekel(Math.abs(diffNet))}
          </bdi>{" "}
          <small>בחודש בנטו</small>
        </div>
      )}

      <div className="table-wrap">
        <table className="compare">
          <thead>
            <tr>
              <th scope="col">רכיב</th>
              <th scope="col" className="num">היום</th>
              <th scope="col" className="num">בחלופה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.key === "net" ? "net" : undefined}>
                <td>{r.label}</td>
                <td className="num">
                  <bdi>{cell(t, r.key)}</bdi>
                </td>
                <td className="num">
                  <bdi>{cell(a, r.key)}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="explain">
        {data.explanation.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {eligibility.status !== "eligible" && <li>{eligibility.reason}</li>}
      </ul>

      {data.missing.length > 0 && <div className="missing">חסר: {data.missing.join(", ")}</div>}

      {(t || a) && (
        <details className="more">
          <summary>איך חושב?</summary>
          <div className="table-wrap">
            <table className="compare details">
              <thead>
                <tr>
                  <th scope="col">שלב בחישוב</th>
                  <th scope="col" className="num">היום</th>
                  <th scope="col" className="num">בחלופה</th>
                </tr>
              </thead>
              <tbody>
                {details.map((r) => (
                  <tr key={r.key} className={r.total ? "total" : undefined}>
                    <td>{r.label}</td>
                    <td className="num">
                      <bdi>{detail(t, r.key)}</bdi>
                    </td>
                    <td className="num">
                      <bdi>{detail(a, r.key)}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            נטו הוא ברוטו פחות מס הכנסה, ביטוח לאומי, מס בריאות, הפרשות העובד, השתתפות ברכב וחלק העובד במסלול
            המשפחתי. כל סכום מעוגל לשקל, ולכן סיכום ידני יכול לצאת שונה בשקל אחד. החישוב לפי לוחות 2025.
          </p>
        </details>
      )}

      {sessionId && today !== undefined && onView && (
        <Recalculate sessionId={sessionId} today={today} onView={onView} />
      )}
    </section>
  );
}
