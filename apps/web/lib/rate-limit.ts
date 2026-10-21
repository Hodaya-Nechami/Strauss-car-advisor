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
let callsSinceSweep = 0;

/** מנקה מפתחות שפג תוקפם, כדי שהמפה לא תגדל בלי סוף בהרצה ארוכה */
function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  if (++callsSinceSweep >= 1000) {
    callsSinceSweep = 0;
    sweepExpired(now);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new ChatError(429, "יותר מדי בקשות. נסו שוב בעוד רגע.");
}

/**
 * כתובת ה-IP של הלקוח, מתוך הכותרת שמוסיף פרוקסי אמין (TRUST_PROXY=1, למשל Nginx מול docker-compose ב-N9).
 * בלי TRUST_PROXY, ההדר הזה מגיע מהלקוח עצמו וכל בקשה יכולה להצהיר על IP אחר - מפתח קבוע אחד
 * לכולם לפחות מגביל את הקצב הכולל, במקום לתת לכל בקשה "IP" חדש ולבטל את ההגבלה כליל.
 */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== "1") return "shared";
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
