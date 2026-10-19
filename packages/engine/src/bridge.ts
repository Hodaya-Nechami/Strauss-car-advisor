import { formatShekel as f } from "./format";
import { netWithoutElectric } from "./net";
import type { Rules } from "./rules";
import type { EmployeeProfile, NetBreakdown, Situation } from "./types";

export type BridgeKind = "valueOfUse" | "maintenance" | "electric" | "participation" | "familyGap";

/** סיבה אחת לשינוי בנטו, עם הסכום שהיא מוסיפה לנטו או מורידה ממנו */
export interface BridgeStep {
  kind: BridgeKind;
  /** כותרת קצרה, למשל "החזר חשמל" */
  label: string;
  /** מה השתנה, למשל "שווי שימוש 4,070 → 3,130 ₪" */
  detail: string;
  /** ההשפעה על הנטו בחודש, ללא עיגול */
  amount: number;
  /** ההשפעה לתצוגה, בשקלים שלמים. סכום כל השלבים שווה בדיוק להפרש שמוצג. */
  display: number;
}

/**
 * עיגול לשקל כך שסכום הערכים המעוגלים שווה בדיוק לסכום המבוקש (שיטת השארית הגדולה).
 * את השקל שחסר או עודף מקבל הערך שהעיגול הזיז הכי רחוק בכיוון ההפוך.
 */
export function roundToTotal(values: number[], total: number): number[] {
  const out = values.map((v) => Math.round(v) || 0);
  let residual = total - out.reduce((s, v) => s + v, 0);
  const dir = Math.sign(residual);
  const order = values.map((_, i) => i).sort((i, j) => dir * (values[j]! - out[j]! - (values[i]! - out[i]!)));
  for (let k = 0; residual !== 0 && order.length > 0; k++) {
    const i = order[k % order.length]!;
    out[i] = out[i]! + dir;
    residual -= dir;
  }
  return out;
}

/** נטו בלי החזר חשמל, בלי השתתפות ובלי חלק העובד במסלול המשפחתי: השכר, פחות מה שהמס לוקח */
function taxedNet(profile: EmployeeProfile, s: Situation, rules: Rules): number {
  const b = netWithoutElectric(profile, s, rules);
  return b.net + b.participation + b.familyGapEmployee;
}

/**
 * מפרק את ההפרש בנטו לסיבות, לתרשים "לאן הלך כל שקל".
 * כל שלב מחושב במנוע, והשלבים מסתכמים בדיוק להפרש, בלי שארית שלא מוסברת.
 * שווי שימוש ואחזקה משפיעים דרך המס, ולכן הסכום שלהם הוא ההשפעה אחרי מס הכנסה, ביטוח לאומי ומס בריאות.
 * כשהמצב משתנה מרכב לוויתור או להפך, עוברים דרך "בלי רכב ובלי אחזקה" כדי להפריד בין השניים.
 */
export function netBridge(
  profile: EmployeeProfile,
  today: Situation,
  alt: Situation,
  t: NetBreakdown,
  a: NetBreakdown,
  rules: Rules,
  diffDisplay: number,
): BridgeStep[] {
  const steps: Omit<BridgeStep, "display">[] = [];
  const add = (kind: BridgeKind, label: string, detail: string, amount: number) => {
    if (Math.abs(amount) >= 0.005) steps.push({ kind, label, detail, amount });
  };
  const net = (s: Situation) => taxedNet(profile, s, rules);
  const vou = "מס על שווי השימוש";
  const maint = "אחזקת רכב, אחרי מס";

  if (today.kind === alt.kind) {
    if (today.kind === "car") add("valueOfUse", vou, `שווי שימוש ${f(t.valueOfUse)} → ${f(a.valueOfUse)} ₪`, net(alt) - net(today));
    if (today.kind === "waiver") add("maintenance", maint, `אחזקה ${f(t.maintenance)} → ${f(a.maintenance)} ₪ ברוטו`, net(alt) - net(today));
  } else {
    const between = net({ kind: "none" });
    if (today.kind === "car") add("valueOfUse", vou, `בוטל שווי שימוש ${f(t.valueOfUse)} ₪`, between - net(today));
    if (today.kind === "waiver") add("maintenance", maint, `בוטלה אחזקה ${f(t.maintenance)} ₪ ברוטו`, between - net(today));
    if (alt.kind === "car") add("valueOfUse", vou, `נוסף שווי שימוש ${f(a.valueOfUse)} ₪`, net(alt) - between);
    if (alt.kind === "waiver") add("maintenance", maint, `נוספה אחזקה ${f(a.maintenance)} ₪ ברוטו`, net(alt) - between);
  }

  const elecToday = t.net - netWithoutElectric(profile, today, rules).net;
  const elecAlt = a.net - netWithoutElectric(profile, alt, rules).net;
  const kind = rules.electric.method === "gross_up" ? "נטו, מגולם" : "ברוטו";
  const elecDetail =
    elecToday < 0.005 ? `${f(rules.electric.netBonus)} ₪ ${kind}` : elecAlt < 0.005 ? "ההחזר מתבטל" : "החזר בשני המצבים";
  add("electric", "החזר חשמל", elecDetail, elecAlt - elecToday);

  add("participation", "השתתפות ברכב", `השתתפות ${f(t.participation)} → ${f(a.participation)} ₪`, t.participation - a.participation);

  const pct = Math.round(rules.familyTrack.gapSplitEmployee * 100);
  add(
    "familyGap",
    "חלקך במסלול המשפחתי",
    `${pct}% מהפער מעל התקציב: ${f(t.familyGapEmployee)} → ${f(a.familyGapEmployee)} ₪`,
    t.familyGapEmployee - a.familyGapEmployee,
  );

  const shown = roundToTotal(
    steps.map((s) => s.amount),
    diffDisplay,
  );
  return steps.map((s, i) => ({ ...s, display: shown[i]! })).filter((s) => s.display !== 0);
}
