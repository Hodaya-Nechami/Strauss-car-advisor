import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

// השרת קורא את קבצי ההגדרות מהתיקייה הזו
process.env.CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
// מסד נתונים זמני ונקי לכל הרצה - לא נשמר בריפו ולא נצבר בין הרצות
process.env.CHATS_DB_PATH = join(mkdtempSync(join(tmpdir(), "strauss-server-test-")), "chats.db");
let server: typeof import("../lib/server");

beforeAll(async () => {
  server = await import("../lib/server");
});

const profile = {
  group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0,
  pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75, childrenUnder23: 2,
};

function sessionMessages(id: string) {
  return (globalThis as any)[server.STATE_KEY].chats.get(id).session.messages as { role: string; content: string }[];
}

describe("פעולות מסך בלי הבוט", () => {
  it("תיקון נתונים נשמר, והבוט מקבל הודעה על השינוי", async () => {
    const id = server.createChat().sessionId!;
    const v = await server.updateProfile(id, profile);

    expect(v.profile).toMatchObject({ group: "ג", baseSalary: 18500 });
    expect(v.transcript.at(-1)).toMatchObject({ role: "notice", text: "הנתונים עודכנו" });
    const last = sessionMessages(id).at(-1)!;
    expect(last.role).toBe("user");
    expect(last.content).toContain("[עדכון מטופס הנתונים");
    expect(last.content).toContain("שכר בסיס: 18500");
  });

  it("ערך לא תקין נדחה ולא נשמר", async () => {
    const id = server.createChat().sessionId!;
    await expect(server.updateProfile(id, { group: "ה" })).rejects.toMatchObject({ status: 400 });
    expect(server.getChatView(id).profile).toEqual({});
    expect(sessionMessages(id)).toEqual([]);
  });

  it("חישוב מחדש מהטבלה נותן את נטו הייחוס ומעדכן את הבוט", async () => {
    const id = server.createChat().sessionId!;
    await server.updateProfile(id, profile);
    const v = await server.recalculate(
      id,
      { kind: "car", car: "COROLLA CROSS", participation: 300 },
      { kind: "car", car: "ATTO 3", participation: 300 },
    );

    const entry = v.transcript.at(-1)!;
    expect(entry.role).toBe("calc");
    const result = entry.comparisons![0]!.result as any;
    expect(result.diffNet).toBe(661);
    expect(result.alternative.breakdown.electricGross).toBe(440);
    expect(sessionMessages(id).at(-1)!.content).toContain("הפרש 661 ₪");
  });

  it("חישוב בלי נתוני שכר מחזיר מה חסר", async () => {
    const id = server.createChat().sessionId!;
    await expect(
      server.recalculate(id, { kind: "car", car: "NIRO", participation: 250 }, { kind: "car", car: "MG4" }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("חסרים נתונים") });
  });

  it("אפשרויות לבחירה: רכבים עד הקבוצה של העובד, וויתור לפי העיסוק", async () => {
    const id = server.createChat().sessionId!;
    await server.updateProfile(id, profile);
    const o = await server.getOptions(id);

    expect(new Set(o.cars.map((c) => c.group))).toEqual(new Set(["א", "ב", "ג"]));
    expect(o.waiver.status).toBe("eligible");
  });

  it("לא מוסיפים להיסטוריה בזמן שהבוט באמצע תור", async () => {
    const id = server.createChat().sessionId!;
    (globalThis as any)[server.STATE_KEY].chats.claim(id);
    await expect(server.updateProfile(id, profile)).rejects.toMatchObject({ status: 409 });
    (globalThis as any)[server.STATE_KEY].chats.release(id);
  });

  it("שיחה שלא קיימת מחזירה 404", async () => {
    await expect(server.getOptions("no-such-chat")).rejects.toMatchObject({ status: 404 });
  });
});

describe("מה הכי משתלם, ומצב הדגמה", () => {
  it("דירוג מהמסך: נוסף לשיחה, והבוט שומע מה החלופה המובילה", async () => {
    const id = server.createChat().sessionId!;
    await server.updateProfile(id, profile);
    const v = await server.rankFromScreen(id, { kind: "car", car: "COROLLA CROSS", participation: 300 });

    const entry = v.transcript.at(-1)!;
    expect(entry.role).toBe("calc");
    const result = entry.rankings![0]!.result as any;
    expect(result.options[0]).toMatchObject({ kind: "waiver", diffNet: 3199 });
    expect(sessionMessages(id).at(-1)!.content).toContain("המובילה: ויתור");
  });

  it("כל 6 העובדים לדוגמה זהים עכשיו לנטו הייחוס של המארגנים", async () => {
    const d = await server.getDemo();
    expect(d.verified).toEqual({ matched: 6, total: 6 });
    expect(d.personas.map((p) => p.name)).toContain("נועה לוי");
    expect(d.personas.find((p) => p.id === "E-003")!.today.kind).toBe("waiver");
  });

  it("הדגמה: שאלת העובד מחושבת מיד, עם בדיקה מול הייחוס ועם דירוג", async () => {
    const v = await server.startDemo("E-001");
    expect(v.profile).toMatchObject({ group: "ג", baseSalary: 18500, childrenUnder23: 2 });
    expect(v.transcript.map((t) => t.role)).toEqual(["notice", "employee", "calc"]);

    const calc = v.transcript[2]!;
    expect((calc.comparisons![0]!.result as any).diffNet).toBe(661);
    expect(calc.comparisons![0]!.reference).toMatchObject({ matches: true, expected: { diff: 661 } });
    expect((calc.rankings![0]!.result as any).options.length).toBeGreaterThan(5);
    expect(sessionMessages(v.sessionId!).at(-1)!.content).toContain("[הדגמה מהמסך");
  });

  it("עובד לדוגמה שלא קיים מחזיר 404", async () => {
    await expect(server.startDemo("E-999")).rejects.toMatchObject({ status: 404 });
  });
});

describe("תלוש שכר", () => {
  it("נתונים מתלוש שאושרו נשמרים גם בלי שיחה קיימת, והבוט יודע מה כבר ידוע", async () => {
    const v = await server.updateProfile(
      null,
      { baseSalary: 14200, commissions: 1000, bonus: 0, pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.25 },
      { carParticipation: 300, carValueOfUse: 4070 },
    );
    expect(v.sessionId).toBeTruthy();
    expect(v.profile).toMatchObject({ baseSalary: 14200, pensionRate: 6 });
    expect(v.transcript.at(-1)!.text).toContain("הנתונים מהתלוש נשמרו");
    const last = sessionMessages(v.sessionId!).at(-1)!.content;
    expect(last).toContain("העלה תלוש שכר ואישר");
    expect(last).toContain("ההשתתפות שלו ברכב היום: 300 ₪");
    expect(last).toContain("קבוצת הזכאות");
  });

  it("קובץ שאינו PDF או תמונה נדחה לפני שליחה לספק", async () => {
    await expect(server.readPayslip(new Uint8Array([1, 2, 3]), "text/plain")).rejects.toMatchObject({ status: 415 });
  });
});

describe("קריאת תלוש ברקע, כדי שאף בקשה לא תיחתך בדרך", () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const reading = { period: "09/2026", fields: { baseSalary: { value: 14200, source: "שכר יסוד" } }, car: {}, notes: [], via: "Claude" };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("ההעלאה מחזירה מזהה מיד, והתוצאה נמסרת כשהיא מוכנה, פעם אחת", async () => {
    let finish!: () => void;
    const read = () => new Promise<any>((resolve) => (finish = () => resolve(reading)));
    const { jobId } = server.startPayslipJob(pdf, "application/pdf", "noa@x.com", read);

    expect(server.payslipJobStatus(jobId, "noa@x.com")).toEqual({ status: "pending" });
    finish();
    await tick();
    expect(server.payslipJobStatus(jobId, "noa@x.com")).toEqual({ status: "done", reading });
    // התוצאה לא נשמרת אחרי שנמסרה
    expect(() => server.payslipJobStatus(jobId, "noa@x.com")).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("רק מי שהעלה רואה את התוצאה", async () => {
    const { jobId } = server.startPayslipJob(pdf, "application/pdf", "noa@x.com", async () => reading as any);
    await tick();
    expect(() => server.payslipJobStatus(jobId, "other@x.com")).toThrow(expect.objectContaining({ status: 404 }));
  });

  it("כשכל הספקים נכשלו, ההודעה בעברית מגיעה בבדיקה הבאה", async () => {
    const { PayslipReadError } = await import("@strauss/agent");
    const read = async () => {
      throw new PayslipReadError([{ provider: "Gemini", reason: "לא ענה בזמן" }]);
    };
    const { jobId } = server.startPayslipJob(pdf, "application/pdf", null, read);
    await tick();
    expect(() => server.payslipJobStatus(jobId, null)).toThrow(
      expect.objectContaining({ status: 503, message: expect.stringContaining("Gemini: לא ענה בזמן") }),
    );
  });

  it("בעיה בקובץ עצמו חוזרת מיד, בלי מזהה", () => {
    expect(() => server.startPayslipJob(new Uint8Array([1]), "text/plain", null, async () => reading as any)).toThrow(
      expect.objectContaining({ status: 415 }),
    );
  });
});

describe("שליחת האפשרויות למייל", () => {
  it("נבנה מהשיחה השמורה, נשלח לכתובת של המחובר, ונרשם בשיחה", async () => {
    const v = await server.startDemo("E-001");
    const sent: any[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 201 });
    });
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "bot@example.org";
    try {
      const after = await server.emailSummary(v.sessionId!, { email: "noa@example.org", name: "נועה לוי" }, "https://example.org");
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toEqual([{ email: "noa@example.org", name: "נועה לוי" }]);
      expect(sent[0].htmlContent).toContain("שלום נועה,");
      expect(sent[0].htmlContent).toContain("ההשוואה האחרונה שבדקת");
      expect(sent[0].textContent).toMatch(/^1\. /m);
      expect(after.transcript.at(-1)).toMatchObject({ role: "notice", text: "סיכום האפשרויות נשלח למייל noa@example.org" });
      expect(sessionMessages(v.sessionId!).at(-1)!.content).toContain("שלח לעצמו למייל");
    } finally {
      vi.unstubAllGlobals();
      delete process.env.BREVO_API_KEY;
      delete process.env.MAIL_FROM;
    }
  });

  it("טיוטה בלי שירות שליחה: כל האפשרויות בטקסט, וקישור Gmail שלא ארוך מדי", async () => {
    const v = await server.startDemo("E-001");
    const draft = await server.emailDraft(v.sessionId!, "נועה לוי", "https://example.org");
    expect(draft.subject).toContain("כל האפשרויות שלך");
    expect(draft.body).toMatch(/^1\. .+נטו .+₪/m);
    expect(draft.body).toContain("https://example.org");
    // דפדפנים ו-Gmail מגבילים את אורך הכתובת. עם כל הרכבים בקטלוג עדיין רחוק מהגבול.
    const { draftLinks } = await import("../app/mail-links");
    expect(draftLinks({ to: "noa@example.org", ...draft }).gmail.length).toBeLessThan(12_000);
  });

  it("בלי השוואה בשיחה אין מה לשלוח", async () => {
    const id = server.createChat().sessionId!;
    await expect(server.emailSummary(id, { email: "a@example.org", name: null }, "https://example.org")).rejects.toMatchObject({ status: 400 });
  });
});
