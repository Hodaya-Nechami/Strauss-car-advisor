import { respond } from "@/lib/http";
import { ChatError, readPayslip } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** קריאת תלוש שכר שהעובד העלה. מחזיר את מה שנקרא לאישור, ולא שומר את התלוש. */
export async function POST(req: Request) {
  return respond(async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new ChatError(400, "לא התקבל קובץ");
    return readPayslip(new Uint8Array(await file.arrayBuffer()), file.type);
  });
}
