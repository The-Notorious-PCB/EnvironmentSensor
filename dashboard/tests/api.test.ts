import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSessionReadings, liveWebSocketUrl, READINGS_PAGE_SIZE } from "../src/lib/api";

describe("liveWebSocketUrl", () => {
  it("converts the configured http(s) API base to a ws(s) URL", () => {
    // VITE_COLLECTOR_API_URL isn't set in the test env, so this exercises
    // the default (http://localhost:8000) — see src/lib/api.ts.
    expect(liveWebSocketUrl()).toBe("ws://localhost:8000/ws/live");
  });
});

describe("fetchSessionReadings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages through a session longer than one response", async () => {
    const sizes = [READINGS_PAGE_SIZE, READINGS_PAGE_SIZE, 3];
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        const n = sizes[urls.length - 1];
        return { ok: true, json: async () => Array.from({ length: n }, (_, i) => ({ id: i })) };
      }),
    );

    const readings = await fetchSessionReadings("abc");

    expect(readings).toHaveLength(2 * READINGS_PAGE_SIZE + 3);
    expect(urls.map((u) => new URL(u).searchParams.get("offset"))).toEqual([
      "0",
      String(READINGS_PAGE_SIZE),
      String(2 * READINGS_PAGE_SIZE),
    ]);
  });
});
