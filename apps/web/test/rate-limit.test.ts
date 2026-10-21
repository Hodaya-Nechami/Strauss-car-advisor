import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIp } from "../lib/rate-limit";

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

describe("כתובת IP של הלקוח", () => {
  const withTrustProxy = (value: string | undefined, run: () => void) => {
    const original = process.env.TRUST_PROXY;
    if (value === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = value;
    try {
      run();
    } finally {
      if (original === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = original;
    }
  };

  it("בלי TRUST_PROXY, מתעלמת מ-x-forwarded-for ומחזירה מפתח משותף", () => {
    withTrustProxy(undefined, () => {
      const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4" } });
      expect(clientIp(req)).toBe("shared");
    });
  });

  it("עם TRUST_PROXY=1, קוראת את ה-IP מהכותרת", () => {
    withTrustProxy("1", () => {
      const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
      expect(clientIp(req)).toBe("1.2.3.4");
    });
  });
});
