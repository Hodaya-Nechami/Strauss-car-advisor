import { respond } from "@/lib/http";
import { ChatError, readPayslip } from "@/lib/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** קריאת תלוש שכר שהעובד העלה. מחזיר את מה שנקרא לאישור, ולא שומר את התלוש. מוגבל בקצב כי זו קריאת מודל ראיה, היקרה ביותר. */
export async function POST(req: Request) {
  return respond(async () => {
    checkRateLimit(`payslip:${clientIp(req)}`, 5, 60_000);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new ChatError(400, "לא התקבל קובץ");
    return readPayslip(new Uint8Array(await file.arrayBuffer()), file.type);
  });
}
