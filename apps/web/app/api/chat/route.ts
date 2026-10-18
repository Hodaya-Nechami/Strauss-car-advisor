import { NextResponse } from "next/server";
import { ChatError, getChatView, sendMessage } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 4000;

/** מצב השיחה, לטעינה אחרי רענון ולבדיקה אם הנציג כבר ענה */
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  return NextResponse.json(getChatView(sessionId));
}

/** הודעה חדשה מהעובד */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { sessionId?: unknown; message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;

  if (!message) return NextResponse.json({ error: "ההודעה ריקה" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });
  }

  try {
    return NextResponse.json(await sendMessage(sessionId, message));
  } catch (err) {
    if (err instanceof ChatError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api/chat]", err);
    return NextResponse.json({ error: "שגיאה פנימית" }, { status: 500 });
  }
}
