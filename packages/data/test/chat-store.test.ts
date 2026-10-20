import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newSession } from "@strauss/agent";
import { ChatStore, ChatStoreBusyError, ChatStoreNotFoundError } from "../src/chat-store";

interface Entry {
  role: string;
  text: string;
}

describe("ChatStore", () => {
  let dir: string;
  let store: ChatStore<Entry>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "strauss-chats-test-"));
    store = new ChatStore<Entry>(join(dir, "chats.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("create + get: שיחה חדשה מתחילה עם transcript ריק", () => {
    const session = newSession("s1");
    store.create(session);
    const chat = store.get("s1");
    expect(chat?.session.id).toBe("s1");
    expect(chat?.transcript).toEqual([]);
  });

  it("get על שיחה שלא קיימת מחזיר undefined", () => {
    expect(store.get("missing")).toBeUndefined();
  });

  it("withLock שומר את השינויים שנעשו בתוך הפעולה", async () => {
    store.create(newSession("s2"));
    await store.withLock("s2", async (chat) => {
      chat.session.profile.baseSalary = 15000;
      chat.transcript.push({ role: "employee", text: "שלום" });
    });
    const chat = store.get("s2")!;
    expect(chat.session.profile.baseSalary).toBe(15000);
    expect(chat.transcript).toEqual([{ role: "employee", text: "שלום" }]);
  });

  it("withLock משחרר את המנעול אחרי שהפעולה מסתיימת", async () => {
    store.create(newSession("s3"));
    await store.withLock("s3", async () => {});
    // אם המנעול לא היה משתחרר, הקריאה הבאה הייתה נכשלת ב-ChatStoreBusyError
    await expect(store.withLock("s3", async () => "ok")).resolves.toBe("ok");
  });

  it("withLock שומר את השינויים גם כשהפעולה נכשלת, ומשחרר את המנעול", async () => {
    store.create(newSession("s4"));
    await expect(
      store.withLock("s4", async (chat) => {
        chat.transcript.push({ role: "employee", text: "לפני הכישלון" });
        throw new Error("משהו נכשל באמצע");
      }),
    ).rejects.toThrow("משהו נכשל באמצע");

    const chat = store.get("s4")!;
    expect(chat.transcript).toEqual([{ role: "employee", text: "לפני הכישלון" }]);
    // המנעול שוחרר - אפשר לנעול שוב
    await expect(store.withLock("s4", async () => "ok")).resolves.toBe("ok");
  });

  it("withLock זורק ChatStoreBusyError כשהשיחה כבר תפוסה", async () => {
    store.create(newSession("s5"));
    expect(store.claim("s5")).toBe(true);
    await expect(store.withLock("s5", async () => "ok")).rejects.toThrow(ChatStoreBusyError);
    store.release("s5");
    await expect(store.withLock("s5", async () => "ok")).resolves.toBe("ok");
  });

  it("withLock זורק ChatStoreNotFoundError כשהשיחה לא קיימת", async () => {
    await expect(store.withLock("no-such-id", async () => "ok")).rejects.toThrow(ChatStoreNotFoundError);
  });

  it("claim מחזיר false כשכבר תפוס, בלי לזרוק", () => {
    store.create(newSession("s6"));
    expect(store.claim("s6")).toBe(true);
    expect(store.claim("s6")).toBe(false);
  });

  it("all מחזיר את כל השיחות", () => {
    store.create(newSession("a"));
    store.create(newSession("b"));
    const ids = store.all().map((c) => c.session.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
