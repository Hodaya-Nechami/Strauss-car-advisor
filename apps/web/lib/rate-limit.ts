/**
 * הגבלת קצב בזיכרון של השרת, לפי מפתח חופשי (למשל נתיב + כתובת IP).
 * מתאימה למופע שרת יחיד; לא משותפת בין כמה מופעים, בדיוק כמו MemoryRepQueue שהייתה פה לפני N6.
 */
import { ChatError } from "./server";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new ChatError(429, "יותר מדי בקשות. נסו שוב בעוד רגע.");
}

/** כתובת ה-IP של הלקוח, מתוך הכותרת שמוסיף פרוקסי. בלי פרוקסי, כל הבקשות חולקות מפתח אחד. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
