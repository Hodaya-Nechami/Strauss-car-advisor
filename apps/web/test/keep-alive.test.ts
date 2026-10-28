import { afterEach, describe, expect, it, vi } from "vitest";
import { KEEP_ALIVE_EVERY_MS, register } from "../instrumentation";

describe("שמירה על השרת ער", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ב-Render פונה לבדיקת החיים בכתובת הציבורית כל 10 דקות", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response("{}");
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    register({ NEXT_RUNTIME: "nodejs", RENDER_EXTERNAL_URL: "https://site.onrender.com" });

    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_EVERY_MS);
    expect(calls).toEqual(["https://site.onrender.com/api/health"]);
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_EVERY_MS);
    expect(calls).toHaveLength(2);
  });

  it("במחשב מקומי, או עם KEEP_ALIVE=0, לא פונה לשום מקום", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    register({ NEXT_RUNTIME: "nodejs" });
    register({ NEXT_RUNTIME: "nodejs", RENDER_EXTERNAL_URL: "https://site.onrender.com", KEEP_ALIVE: "0" });
    register({ NEXT_RUNTIME: "edge", RENDER_EXTERNAL_URL: "https://site.onrender.com" });
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_EVERY_MS * 2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
