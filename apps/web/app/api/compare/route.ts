import { readJson, requireSessionId, respond } from "@/lib/http";
import { recalculate } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** חישוב מחדש מטבלת ההשוואה, בלי הבוט */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => recalculate(requireSessionId(body.sessionId), body.today, body.alternative));
}
