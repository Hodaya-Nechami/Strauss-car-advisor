import { currentUser } from "@/auth";
import { respond } from "@/lib/http";
import { ChatError, payslipJobStatus, startPayslipJob } from "@/lib/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * העלאת תלוש: מתחיל לקרוא ברקע ומחזיר מזהה מיד, כדי שאף בקשה לא תחכה מספיק זמן כדי להיחתך בדרך.
 * מוגבל בקצב כי זו קריאת מודל ראיה, היקרה ביותר. התלוש עצמו לא נשמר.
 */
export async function POST(req: Request) {
  return respond(async () => {
    checkRateLimit(`payslip:${clientIp(req)}`, 5, 60_000);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new ChatError(400, "לא התקבל קובץ");
    const user = await currentUser();
    return startPayslipJob(new Uint8Array(await file.arrayBuffer()), file.type, user?.email ?? null);
  });
}

/** האם הקריאה הסתיימה. המסך שואל כל כמה שניות. */
export async function GET(req: Request) {
  return respond(async () => {
    const jobId = new URL(req.url).searchParams.get("job");
    if (!jobId) throw new ChatError(400, "חסר מזהה של קריאת התלוש");
    const user = await currentUser();
    return payslipJobStatus(jobId, user?.email ?? null);
  });
}
