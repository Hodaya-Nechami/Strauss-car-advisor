/**
 * המייל "כל האפשרויות שלך": הדירוג של כל החלופות, ההשוואה האחרונה וההסבר שלה.
 * עיצוב בטבלאות ובסגנון בתוך התגיות, כי ככה תוכנות מייל מציגות אותו נכון.
 * כל טקסט שמגיע מהשיחה עובר escape, כי חלק ממנו (למשל שם רכב מחוץ לקטלוג) העובד הקליד.
 */
import type { ComparisonView, RankingView } from "../app/types";

const RED = "#d4231a";
const INK = "#1e1a22";
const MUTED = "#6b6472";
const GAIN = "#00806a";
const LOSS = "#e0592a";
const LINE = "#eae2d8";

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const ils = (n: number) => `${Math.round(n).toLocaleString("en-US")} ₪`;
const signed = (n: number) => (n > 0 ? `+${ils(n)}` : n < 0 ? `−${ils(Math.abs(n))}` : "ללא שינוי");
const diffColor = (n: number) => (n > 0 ? GAIN : n < 0 ? LOSS : MUTED);

export interface SummaryInput {
  name: string | null;
  comparison: ComparisonView;
  ranking: RankingView | null;
  appUrl: string;
}

function rankingTable(ranking: RankingView): string {
  const rows = ranking.options
    .map(
      (o, i) => `<tr>
  <td style="padding:8px 6px;border-bottom:1px solid ${LINE};color:${MUTED}">${i + 1}</td>
  <td style="padding:8px 6px;border-bottom:1px solid ${LINE}">${escapeHtml(o.label)}</td>
  <td style="padding:8px 6px;border-bottom:1px solid ${LINE};white-space:nowrap" dir="ltr" align="left">${ils(o.net)}</td>
  <td style="padding:8px 6px;border-bottom:1px solid ${LINE};white-space:nowrap;font-weight:bold;color:${diffColor(o.diffNet)}" dir="ltr" align="left">${signed(o.diffNet)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="color:${MUTED};font-size:12px">
  <td style="padding:6px">#</td><td style="padding:6px">חלופה</td>
  <td style="padding:6px" align="left">נטו בחודש</td><td style="padding:6px" align="left">לעומת היום</td>
</tr>${rows}</table>`;
}

function comparisonBlock(c: ComparisonView): string {
  const t = c.today;
  const a = c.alternative;
  if (!t || !a) return "";
  const lines: [string, number, number][] = [
    ["נטו בחודש", t.net, a.net],
    ["מס הכנסה", t.tax, a.tax],
    ["ביטוח לאומי ובריאות", t.nationalInsuranceAndHealth, a.nationalInsuranceAndHealth],
    ["שווי שימוש", t.valueOfUse, a.valueOfUse],
    ["השתתפות ברכב", t.participation, a.participation],
    ["אחזקת רכב", t.maintenance, a.maintenance],
    ["החזר חשמל (נטו)", t.electricRefundNet, a.electricRefundNet],
    ["חלקך במסלול המשפחתי", t.familyGapEmployee, a.familyGapEmployee],
  ];
  const rows = lines
    .filter(([label, x, y]) => label === "נטו בחודש" || x !== 0 || y !== 0)
    .map(
      ([label, x, y]) => `<tr>
  <td style="padding:7px 6px;border-bottom:1px solid ${LINE}">${label}</td>
  <td style="padding:7px 6px;border-bottom:1px solid ${LINE};white-space:nowrap" dir="ltr" align="left">${ils(x)}</td>
  <td style="padding:7px 6px;border-bottom:1px solid ${LINE};white-space:nowrap" dir="ltr" align="left">${ils(y)}</td>
</tr>`,
    )
    .join("");
  const explain = c.explanation.map((l) => `<li style="margin:4px 0">${escapeHtml(l)}</li>`).join("");
  return `<h2 style="font-size:17px;margin:28px 0 4px">ההשוואה האחרונה שבדקת</h2>
<p style="margin:0 0 10px;color:${MUTED}">${escapeHtml(t.label)} מול ${escapeHtml(a.label)}${
    c.diffNet !== null ? ` · <b style="color:${diffColor(c.diffNet)}" dir="ltr">${signed(c.diffNet)}</b> בחודש` : ""
  }</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<tr style="color:${MUTED};font-size:12px"><td style="padding:6px">רכיב</td><td style="padding:6px" align="left">היום</td><td style="padding:6px" align="left">בחלופה</td></tr>
${rows}</table>
${explain ? `<ul style="padding-inline-start:18px;margin:12px 0 0;color:${INK}">${explain}</ul>` : ""}`;
}

export function buildSummaryEmail({ name, comparison, ranking, appUrl }: SummaryInput): { subject: string; html: string; text: string } {
  const best = ranking?.options[0];
  const subject = best
    ? `יועץ הרכב: כל האפשרויות שלך. המשתלמת ביותר: ${best.label}`
    : "יועץ הרכב: סיכום ההשוואה שבדקת";
  const hello = name ? `שלום ${escapeHtml(name.split(" ")[0]!)},` : "שלום,";
  const todayLine = ranking
    ? `<p style="margin:0 0 14px"><b>היום:</b> ${escapeHtml(ranking.today.label)} · נטו ${ils(ranking.today.net)} בחודש</p>`
    : "";

  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#faf6f0;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6f0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;text-align:right">
<tr><td style="background:#17121d;color:#f6f1f7;padding:20px 24px;border-top:4px solid ${RED}">
  <div style="font-size:13px;color:#bdb3c6">יועץ הרכב של שטראוס</div>
  <div style="font-size:22px;font-weight:bold;margin-top:2px">כל האפשרויות שלך</div>
</td></tr>
<tr><td style="padding:22px 24px;font-size:15px;line-height:1.6">
  <p style="margin:0 0 6px">${hello}</p>
  <p style="margin:0 0 16px">ביקשת לקבל למייל את האפשרויות שבדקת. הנה הסיכום, מהמשתלמת ביותר.</p>
  ${todayLine}
  ${ranking?.options.length ? rankingTable(ranking) : ""}
  ${ranking?.basis ? `<p style="margin:8px 0 0;font-size:12px;color:${MUTED}">${escapeHtml(ranking.basis)}</p>` : ""}
  ${comparisonBlock(comparison)}
  <p style="margin:26px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 20px;border-radius:12px">להמשיך לבדוק ביועץ הרכב</a></p>
</td></tr>
<tr><td style="padding:14px 24px;background:#f6f1ea;font-size:12px;color:${MUTED};line-height:1.5">
  חישוב משוער לפי לוחות המס של 2025 וכללי החברה. ההשתתפות הסופית ברכב נקבעת מול נציג התחבורה.
  המייל נשלח לבקשתך, רק לכתובת שאיתה נכנסת למערכת.
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    name ? `שלום ${name.split(" ")[0]},` : "שלום,",
    "הנה האפשרויות שבדקת ביועץ הרכב של שטראוס, מהמשתלמת ביותר:",
    ranking ? `היום: ${ranking.today.label}, נטו ${ils(ranking.today.net)}` : "",
    ...(ranking?.options ?? []).map((o, i) => `${i + 1}. ${o.label}: נטו ${ils(o.net)} (${signed(o.diffNet)})`),
    "",
    comparison.today && comparison.alternative
      ? `ההשוואה האחרונה: ${comparison.today.label} מול ${comparison.alternative.label}` +
        (comparison.diffNet !== null ? `, ${signed(comparison.diffNet)} בחודש` : "")
      : "",
    ...comparison.explanation.map((l) => `- ${l}`),
    "",
    `להמשיך לבדוק: ${appUrl}`,
    "חישוב משוער לפי לוחות המס של 2025 וכללי החברה. ההשתתפות הסופית ברכב נקבעת מול נציג התחבורה.",
  ]
    .filter((l, i, all) => l !== "" || all[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
