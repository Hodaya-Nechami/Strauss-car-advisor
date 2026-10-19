import { readJson, respond } from "@/lib/http";
import { ChatError, updateProfile, type PayslipConfirmation } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalAmount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

/** תיקון נתוני שכר מהטופס, או שמירה של נתונים מתלוש שהעובד אישר */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => {
    const profile = body.profile;
    if (!profile || typeof profile !== "object") throw new ChatError(400, "חסרים נתונים לעדכון");
    const sessionId = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
    const slip = body.payslip && typeof body.payslip === "object" ? (body.payslip as Record<string, unknown>) : null;
    const payslip: PayslipConfirmation | undefined = slip
      ? { carParticipation: optionalAmount(slip.carParticipation), carValueOfUse: optionalAmount(slip.carValueOfUse) }
      : undefined;
    return updateProfile(sessionId, profile as Record<string, unknown>, payslip);
  });
}
