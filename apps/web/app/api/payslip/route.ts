import { currentUser, googleLoginEnabled } from "@/auth";
import { respond } from "@/lib/http";
import { ChatError, payslipJobStatus, startPayslipJob } from "@/lib/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * הנתיב הזה לא עובר ב-middleware (ראו middleware.ts), ולכן בודק את הכניסה בעצמו,
 * לפני שקורא את הקובץ. מחזיר את המייל של המחובר, או null כשהכניסה כבויה.
 */
async function requireUser(): Promise<string | null> {
  if (!googleLoginEnabled()) return null;
  const user = await currentUser();
  if (!user) throw new ChatError(401, "צריך להתחבר מחדש. רעננו את הדף.");
  return user.email;
}

/**
 * העלאת תלוש: מתחיל לקרוא ברקע ומחזיר מזהה מיד, כדי שאף בקשה לא תחכה מספיק זמן כדי להיחתך בדרך.
 * מוגבל בקצב כי זו קריאת מודל ראיה, היקרה ביותר. התלוש עצמו לא נשמר.
 */
export async function POST(req: Request) {
  return respond(async () => {
    const owner = await requireUser();
    checkRateLimit(`payslip:${clientIp(req)}`, 5, 60_000);
    const form = await req.formData().catch((err: unknown) => {
      console.error("[payslip] could not read the upload:", err instanceof Error ? err.message.slice(0, 200) : err);
      return null;
    });
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new ChatError(400, "הקובץ לא הגיע לשרת בשלמותו. נסו להעלות אותו שוב.");
    return startPayslipJob(new Uint8Array(await file.arrayBuffer()), file.type, owner);
  });
}

/** האם הקריאה הסתיימה. המסך שואל כל כמה שניות. */
export async function GET(req: Request) {
  return respond(async () => {
    const owner = await requireUser();
    const jobId = new URL(req.url).searchParams.get("job");
    if (!jobId) throw new ChatError(400, "חסר מזהה של קריאת התלוש");
    return payslipJobStatus(jobId, owner);
  });
}
