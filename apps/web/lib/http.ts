import { NextResponse } from "next/server";
import { auth, googleLoginEnabled, isAllowedRep } from "@/auth";
import { ChatError } from "./server";

/** מריץ פעולה של API ומחזיר JSON, עם הודעת שגיאה בעברית */
export async function respond(action: () => Promise<unknown> | unknown) {
  try {
    return NextResponse.json(await action());
  } catch (err) {
    if (err instanceof ChatError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[api]", err);
    return NextResponse.json({ error: "שגיאה פנימית" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const body = (await req.json().catch(() => null)) as unknown;
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export function requireSessionId(value: unknown): string {
  if (typeof value !== "string" || !value) throw new ChatError(400, "חסר מזהה שיחה");
  return value;
}

/**
 * מסך הנציג: כשמוגדרת התחברות עם גוגל, רק מי שמחובר עם מייל מ-REP_EMAILS.
 * אחרת, סיסמה אחת לכל הצוות מ-REP_PASSWORD. בלי אף אחד מהם, המסך חסום.
 */
export async function requireRep(req: Request) {
  if (googleLoginEnabled()) {
    const session = await auth();
    if (!isAllowedRep(session?.user?.email)) throw new ChatError(401, "יש להתחבר עם חשבון גוגל מורשה");
    return;
  }
  const configured = process.env.REP_PASSWORD;
  if (!configured) throw new ChatError(503, "מסך הנציג לא מוגדר. יש להגדיר REP_PASSWORD בקובץ apps/web/.env.");
  if (req.headers.get("x-rep-password") !== configured) throw new ChatError(401, "סיסמה שגויה");
}
