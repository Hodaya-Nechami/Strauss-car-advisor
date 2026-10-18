import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/* eslint-disable @typescript-eslint/no-explicit-any */

// השרת קורא את קבצי ההגדרות מהתיקייה הזו
process.env.CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "config");
let server: typeof import("../lib/server");

beforeAll(async () => {
  server = await import("../lib/server");
});

const profile = {
  group: "ג", occupation: "מנהל/ת מוצר", baseSalary: 18500, commissions: 0, bonus: 0,
  pensionRate: 6, studyFundRate: 2.5, creditPoints: 2.75, childrenUnder23: 2,
};

function sessionMessages(id: string) {
  return (globalThis as any).__straussState.chats.get(id).session.messages as { role: string; content: string }[];
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
    (globalThis as any).__straussState.chats.get(id).busy = true;
    await expect(server.updateProfile(id, profile)).rejects.toMatchObject({ status: 409 });
    (globalThis as any).__straussState.chats.get(id).busy = false;
  });

  it("שיחה שלא קיימת מחזירה 404", async () => {
    await expect(server.getOptions("no-such-chat")).rejects.toMatchObject({ status: 404 });
  });
});
