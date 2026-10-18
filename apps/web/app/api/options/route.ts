import { requireSessionId, respond } from "@/lib/http";
import { getOptions } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** הרכבים שהעובד יכול לבחור, והאם מותר לו לוותר על הרכב */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  return respond(() => getOptions(requireSessionId(sessionId)));
}
