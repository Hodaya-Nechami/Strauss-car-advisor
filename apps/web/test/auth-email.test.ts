import { describe, expect, it } from "vitest";
import { draftLinks } from "../app/mail-links";
import { googleLoginEnabled, isAllowedEmployee, isAllowedRep } from "../lib/access";
import { BREVO_URL, sendMail } from "../lib/mail";
import { buildSummaryEmail, escapeHtml } from "../lib/summary-email";
import type { ComparisonView, RankingView } from "../app/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("כניסה עם Google", () => {
  it("בלי שלושת המפתחות הכניסה כבויה", () => {
    expect(googleLoginEnabled({})).toBe(false);
    expect(googleLoginEnabled({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).toBe(false);
    expect(googleLoginEnabled({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s", AUTH_SECRET: "x" })).toBe(true);
  });

  it("ALLOWED_EMAILS: ריק פותח לכולם, דומיין עם @ או כתובת מלאה, בלי תלות באותיות גדולות", () => {
    expect(isAllowedEmployee("a@gmail.com", {})).toBe(true);
    expect(isAllowedEmployee(null, {})).toBe(false);
    const env = { ALLOWED_EMAILS: "@strauss-group.com, Judge@Gmail.com" };
    expect(isAllowedEmployee("dana@STRAUSS-group.com", env)).toBe(true);
    expect(isAllowedEmployee("judge@gmail.com", env)).toBe(true);
    expect(isAllowedEmployee("other@gmail.com", env)).toBe(false);
    // דומיין שרק נגמר באותן אותיות לא נכנס
    expect(isAllowedEmployee("x@evilstrauss-group.com", env)).toBe(false);
  });

  it("מסך הנציג: רק מי שב-REP_EMAILS", () => {
    const env = { REP_EMAILS: "Rep@Strauss.com" };
    expect(isAllowedRep("rep@strauss.com", env)).toBe(true);
    expect(isAllowedRep("dana@strauss.com", env)).toBe(false);
    expect(isAllowedRep("rep@strauss.com", {})).toBe(false);
  });
});

describe("מייל מוכן בתיבת הדואר", () => {
  it("Gmail נפתח בחשבון של העובד עם הנושא והתוכן, וגם mailto לתוכנת מייל", () => {
    const links = draftLinks({ to: "noa@gmail.com", subject: "כל האפשרויות", body: "שורה 1\nשורה 2 & עוד" });
    const gmail = new URL(links.gmail);
    expect(gmail.origin).toBe("https://mail.google.com");
    expect(gmail.searchParams.get("authuser")).toBe("noa@gmail.com");
    expect(gmail.searchParams.get("view")).toBe("cm");
    expect(gmail.searchParams.get("to")).toBe("noa@gmail.com");
    expect(gmail.searchParams.get("su")).toBe("כל האפשרויות");
    expect(gmail.searchParams.get("body")).toBe("שורה 1\nשורה 2 & עוד");
    expect(links.mailto.startsWith("mailto:noa%40gmail.com?subject=")).toBe(true);
    // בלי כתובת: בלי authuser, והעובד ממלא למי לשלוח
    expect(draftLinks({ to: "", subject: "s", body: "b" }).gmail).not.toContain("authuser");
  });
});

const side = (label: string, net: number, extra: Partial<ComparisonView["today"] & object> = {}) => ({
  label, net, tax: 1000, nationalInsuranceAndHealth: 900, valueOfUse: 4070, participation: 300,
  maintenance: 0, electricRefundNet: 0, familyGapEmployee: 0, breakdown: {}, ...extra,
});

const comparison: ComparisonView = {
  eligibility: { status: "eligible", reason: "" },
  today: side("COROLLA CROSS", 11032),
  alternative: side("<b>ATTO 3</b>", 11693, { valueOfUse: 3130, electricRefundNet: 250 }),
  diffNet: 661,
  changes: [],
  explanation: ["שווי השימוש נמוך ב-940 ₪", "פלוס 250 ₪ החזר חשמל"],
  missing: [],
};

const ranking: RankingView = {
  today: { label: "COROLLA CROSS", net: 11032, side: { kind: "car" } },
  options: [
    { kind: "car", label: "ATTO 3", electricRefund: true, net: 11693, diffNet: 661 },
    { kind: "waiver", label: "ויתור על הרכב", electricRefund: false, net: 10900, diffNet: -132 },
  ],
  waiver: null,
  notes: [],
  basis: "כל רכב חושב עם ההשתתפות הרגילה שלו בקטלוג",
};

describe("המייל עם כל האפשרויות", () => {
  it("כולל את הדירוג ואת ההשוואה, עם צבע לפי כיוון ההפרש", () => {
    const mail = buildSummaryEmail({ name: "דנה כהן", comparison, ranking, appUrl: "https://example.org" });
    expect(mail.subject).toContain("ATTO 3");
    expect(mail.html).toContain("שלום דנה,");
    expect(mail.html).toContain("11,693 ₪");
    expect(mail.html).toMatch(/color:#00806a" dir="ltr" align="left">\+661 ₪/);
    expect(mail.html).toMatch(/color:#e0592a" dir="ltr" align="left">−132 ₪/);
    expect(mail.html).toContain("שווי השימוש נמוך ב-940 ₪");
    expect(mail.text).toContain("1. ATTO 3: נטו 11,693 ₪ (+661 ₪)");
    expect(mail.text).toContain("https://example.org");
  });

  it("טקסט שהעובד הקליד לא הופך ל-HTML", () => {
    const mail = buildSummaryEmail({ name: "<script>", comparison, ranking: null, appUrl: "https://example.org" });
    expect(mail.html).not.toContain("<b>ATTO 3</b>");
    expect(mail.html).toContain("&lt;b&gt;ATTO 3&lt;/b&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });

  it("נשלח ל-Brevo עם השולח המאומת, ובלי הגדרה מחזיר הודעה בעברית", async () => {
    const mail = { to: "dana@example.org", toName: "דנה", subject: "s", html: "<p>h</p>", text: "t" };
    const saved = { key: process.env.BREVO_API_KEY, from: process.env.MAIL_FROM };
    try {
      delete process.env.BREVO_API_KEY;
      await expect(sendMail(mail)).rejects.toMatchObject({ status: 503 });

      process.env.BREVO_API_KEY = "test-key";
      process.env.MAIL_FROM = "bot@example.org";
      const calls: any[] = [];
      const ok = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 201 });
      }) as unknown as typeof fetch;
      await sendMail(mail, ok);
      expect(calls[0].url).toBe(BREVO_URL);
      expect(calls[0].init.headers["api-key"]).toBe("test-key");
      const body = JSON.parse(calls[0].init.body);
      expect(body.sender.email).toBe("bot@example.org");
      expect(body.to).toEqual([{ email: "dana@example.org", name: "דנה" }]);

      const denied = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
      await expect(sendMail(mail, denied)).rejects.toMatchObject({ status: 503 });
    } finally {
      if (saved.key === undefined) delete process.env.BREVO_API_KEY;
      else process.env.BREVO_API_KEY = saved.key;
      if (saved.from === undefined) delete process.env.MAIL_FROM;
      else process.env.MAIL_FROM = saved.from;
    }
  });
});
