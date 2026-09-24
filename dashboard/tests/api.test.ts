import { describe, expect, it } from "vitest";
import { liveWebSocketUrl } from "../src/lib/api";

describe("liveWebSocketUrl", () => {
  it("converts the configured http(s) API base to a ws(s) URL", () => {
    // VITE_COLLECTOR_API_URL isn't set in the test env, so this exercises
    // the default (http://localhost:8000) — see src/lib/api.ts.
    expect(liveWebSocketUrl()).toBe("ws://localhost:8000/ws/live");
  });
});
