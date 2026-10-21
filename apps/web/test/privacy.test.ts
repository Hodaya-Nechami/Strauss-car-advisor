import { describe, expect, it } from "vitest";
import { redactIdNumbers } from "../lib/privacy";

describe("הסתרת תעודת זהות בטקסט חופשי", () => {
  it("מחליפה רצף של 9 ספרות ב-***", () => {
    expect(redactIdNumbers("תז שלי 123456789 תודה")).toBe("תז שלי *** תודה");
  });

  it("מחליפה גם רצף של 8 ספרות", () => {
    expect(redactIdNumbers("12345678")).toBe("***");
  });

  it("לא נוגעת במספרים קצרים כמו שכר", () => {
    expect(redactIdNumbers("השכר שלי 18500")).toBe("השכר שלי 18500");
  });

  it("לא נוגעת ברצף ארוך יותר, כמו מספר כרטיס אשראי", () => {
    expect(redactIdNumbers("1234567890123")).toBe("1234567890123");
  });

  it("טקסט בלי מספרים חוזר כמו שהוא", () => {
    expect(redactIdNumbers("אני רוצה להחליף רכב")).toBe("אני רוצה להחליף רכב");
  });

  it("מחליפה כמה מספרים באותו טקסט", () => {
    expect(redactIdNumbers("תז שלי 123456789 ושל בן הזוג 987654321")).toBe("תז שלי *** ושל בן הזוג ***");
  });
});
