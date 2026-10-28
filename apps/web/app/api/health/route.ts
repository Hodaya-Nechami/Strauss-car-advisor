export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** בדיקת חיים קלה, בלי כניסה ובלי נתונים. משמשת לשמירה על השרת ער (instrumentation.ts). */
export function GET() {
  return Response.json({ ok: true });
}
