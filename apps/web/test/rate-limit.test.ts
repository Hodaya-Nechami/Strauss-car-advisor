import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/rate-limit";

describe("הגבלת קצב", () => {
  it("מאפשרת בקשות עד המכסה, וחוסמת את הבאה", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000, 1_000);
    expect(() => checkRateLimit(key, 3, 60_000, 1_000)).toThrow();
    try {
      checkRateLimit(key, 3, 60_000, 1_000);
    } catch (err) {
      expect(err).toMatchObject({ status: 429 });
    }
  });

  it("נפתחת שוב כשהחלון עובר", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 1, 1_000, 0);
    expect(() => checkRateLimit(key, 1, 1_000, 500)).toThrow();
    expect(() => checkRateLimit(key, 1, 1_000, 2_000)).not.toThrow();
  });

  it("מפתחות שונים לא משפיעים אחד על השני", () => {
    checkRateLimit("a", 1, 60_000, 0);
    expect(() => checkRateLimit("b", 1, 60_000, 0)).not.toThrow();
  });
});
