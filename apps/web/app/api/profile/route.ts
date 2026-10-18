import { readJson, requireSessionId, respond } from "@/lib/http";
import { ChatError, updateProfile } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** תיקון נתוני שכר מהטופס */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => {
    const profile = body.profile;
    if (!profile || typeof profile !== "object") throw new ChatError(400, "חסרים נתונים לעדכון");
    return updateProfile(requireSessionId(body.sessionId), profile as Record<string, unknown>);
  });
}
