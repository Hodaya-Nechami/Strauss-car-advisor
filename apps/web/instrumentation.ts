/**
 * שמירה על השרת ער ב-Render. בתוכנית החינמית שירות שלא קיבל בקשה 15 דקות נרדם,
 * והכניסה הבאה מחכה עד שהוא עולה מחדש, כולל ייבוא מאגר שווי השימוש.
 * השרת פונה לעצמו דרך הכתובת הציבורית כל 10 דקות, וזה נחשב אצל Render ביקור.
 * Render מגדיר את RENDER_EXTERNAL_URL לבד. במחשב מקומי הוא לא מוגדר, ולכן אין פניות. KEEP_ALIVE=0 מכבה.
 */
export const KEEP_ALIVE_EVERY_MS = 10 * 60_000;

export function register(env: Record<string, string | undefined> = process.env): void {
  if (env.NEXT_RUNTIME !== "nodejs" || env.KEEP_ALIVE === "0") return;
  const base = env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL;
  if (!base) return;
  const url = new URL("/api/health", base).toString();
  const ping = () =>
    fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) }).catch((err: unknown) =>
      console.warn("[keep-alive] ping failed:", err instanceof Error ? err.message : err),
    );
  setInterval(ping, KEEP_ALIVE_EVERY_MS).unref();
  console.log(`[keep-alive] pinging ${url} every 10 minutes`);
}
