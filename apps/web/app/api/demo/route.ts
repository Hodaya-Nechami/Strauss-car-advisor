import { readJson, respond } from "@/lib/http";
import { ChatError, getDemo, startDemo } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** העובדים לדוגמה, ובדיקה חיה שלהם מול נטו הייחוס */
export async function GET() {
  return respond(() => getDemo());
}

/** שיחה חדשה עם עובד לדוגמה */
export async function POST(req: Request) {
  const body = await readJson(req);
  return respond(() => {
    if (typeof body.personaId !== "string") throw new ChatError(400, "חסר עובד לדוגמה");
    return startDemo(body.personaId);
  });
}
