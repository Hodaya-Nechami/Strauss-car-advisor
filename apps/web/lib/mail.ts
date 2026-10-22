/**
 * שליחת מייל דרך Brevo (שירות שליחה, 300 מיילים ביום בחינם).
 * דרך HTTPS ולא SMTP, כי הרבה שרתי ענן חוסמים יציאה ב-SMTP.
 * צריך BREVO_API_KEY, ו-MAIL_FROM: כתובת שאומתה ב-Brevo כשולחת.
 */
import { ChatError } from "./server";

export interface Mail {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
}

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export function mailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BREVO_API_KEY && env.MAIL_FROM);
}

export async function sendMail(mail: Mail, fetchImpl: typeof fetch = fetch): Promise<void> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) {
    throw new ChatError(503, "שליחת מיילים עוד לא הוגדרה בשרת. צריך BREVO_API_KEY ו-MAIL_FROM בקובץ apps/web/.env.");
  }
  const res = await fetchImpl(BREVO_URL, {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "יועץ הרכב של שטראוס", email: from },
      to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err: unknown) => {
    console.error("[mail] network error:", err instanceof Error ? err.message : err);
    throw new ChatError(503, "אין חיבור לשירות המייל. נסו שוב בעוד רגע.");
  });
  if (!res.ok) {
    // בלי המפתח ובלי תוכן המייל: רק הקוד וההסבר של Brevo
    console.error(`[mail] Brevo ${res.status}:`, (await res.text().catch(() => "")).slice(0, 300));
    if (res.status === 401) throw new ChatError(503, "המפתח של שירות המייל לא תקין. בדקו את BREVO_API_KEY.");
    throw new ChatError(502, "שליחת המייל נכשלה. נסו שוב בעוד רגע.");
  }
}
