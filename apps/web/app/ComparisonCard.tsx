/** כרטיס השוואה: היום מול החלופה. כל המספרים מגיעים ממנוע החישוב, לא מהבוט. */

interface SideView {
  label: string;
  net: number;
  tax: number;
  nationalInsuranceAndHealth: number;
  valueOfUse: number;
  participation: number;
  maintenance: number;
  electricRefundNet: number;
  familyGapEmployee: number;
}

export interface ComparisonView {
  eligibility: { status: "eligible" | "not_eligible" | "needs_info"; reason: string };
  today: SideView | null;
  alternative: SideView | null;
  diffNet: number | null;
  changes: string[];
  explanation: string[];
  missing: string[];
}

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

const shekel = (n: number) => `${n.toLocaleString("en-US")} ₪`;

function cell(side: SideView | null, key: keyof SideView) {
  if (!side) return "—";
  const v = side[key];
  return typeof v === "number" ? shekel(v) : v;
}

export function ComparisonCard({ data }: { data: ComparisonView }) {
  const { today, alternative, diffNet, eligibility } = data;
  const rows = ROWS.filter(
    (r) => r.always || (today && today[r.key] !== 0) || (alternative && alternative[r.key] !== 0),
  );

  return (
    <section className="card" aria-label="השוואת נטו">
      <div className="card-head">
        <div>
          <div className="card-title">השוואה: היום מול החלופה</div>
          <div className="card-sub">
            {today?.label ?? "המצב היום"} · {alternative?.label ?? "החלופה"}
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
                  <bdi>{cell(today, r.key)}</bdi>
                </td>
                <td className="num">
                  <bdi>{cell(alternative, r.key)}</bdi>
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
    </section>
  );
}
