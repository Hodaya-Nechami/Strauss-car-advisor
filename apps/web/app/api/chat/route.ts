import { readJson, respond } from "@/lib/http";
import { ChatError, getChatView, sendMessage } from "@/lib/server";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;

/** מצב השיחה, לטעינה אחרי רענון ולבדיקה אם הנציג כבר ענה */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  return respond(() => getChatView(sessionId));
}

/** הודעה חדשה מהעובד. מוגבל בקצב כי כל הודעה מפעילה את מודל השפה */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => {
    checkRateLimit(`chat:${clientIp(req)}`, 20, 60_000);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) throw new ChatError(400, "ההודעה ריקה");
    if (message.length > MAX_MESSAGE_LENGTH) throw new ChatError(400, "ההודעה ארוכה מדי");
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    return sendMessage(sessionId, message);
  });
}
