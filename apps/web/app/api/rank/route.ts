import { readJson, requireSessionId, respond } from "@/lib/http";
import { rankFromScreen } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** דירוג כל החלופות של העובד מהמסך, בלי הבוט */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => rankFromScreen(requireSessionId(body.sessionId), body.today));
}
