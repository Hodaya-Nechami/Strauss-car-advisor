import { NextResponse } from "next/server";
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
