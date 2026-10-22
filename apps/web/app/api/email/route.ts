import { currentUser } from "@/auth";
import { readJson, requireSessionId, respond } from "@/lib/http";
import { mailEnabled } from "@/lib/mail";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { emailDraft, emailSummary } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * כל האפשרויות של העובד למייל.
 * עם שירות שליחה ועובד מחובר: המערכת שולחת בעצמה, רק לכתובת של החשבון, כדי שאי אפשר יהיה לשלוח דרכה לאחרים.
 * אחרת: מחזירה טיוטה, והדפדפן פותח אותה בתיבת הדואר של העובד.
 */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(async () => {
    const sessionId = requireSessionId(body.sessionId);
    const user = await currentUser();
    checkRateLimit(`email:${user?.email ?? clientIp(req)}`, 10, 10 * 60_000);
    const appUrl = process.env.AUTH_URL || new URL(req.url).origin;
    if (user && mailEnabled()) {
      return { sentTo: user.email, view: await emailSummary(sessionId, user, appUrl) };
    }
    return { draft: { to: user?.email ?? "", ...(await emailDraft(sessionId, user?.name ?? null, appUrl)) } };
  });
}
