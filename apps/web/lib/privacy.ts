/**
 * מסתיר רצף של 8-9 ספרות בטקסט חופשי, כמו תעודת זהות ישראלית, לפני שהטקסט נשמר ומגיע למודל השפה.
 * נתוני שכר ופרופיל מגיעים בשדות נפרדים ומוקלדים (apps/web/app/api/profile), לא מהטקסט החופשי של הצ'אט, אז אין להם התנגשות עם זה.
 */
const ID_LIKE_NUMBER = /(?<!\d)\d{8,9}(?!\d)/g;

export function redactIdNumbers(text: string): string {
  return text.replace(ID_LIKE_NUMBER, "***");
}
