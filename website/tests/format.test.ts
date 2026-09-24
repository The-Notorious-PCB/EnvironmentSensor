import { describe, expect, it } from "vitest";
import { formatLastSeen, formatSessionLabel } from "../src/lib/format";

describe("formatLastSeen", () => {
  const now = new Date("2026-09-24T12:00:00Z");

  it("returns 'never' for null", () => {
    expect(formatLastSeen(null, now)).toBe("never");
  });

  it("returns 'just now' for very recent timestamps", () => {
    expect(formatLastSeen("2026-09-24T11:59:58Z", now)).toBe("just now");
  });

  it("formats seconds", () => {
    expect(formatLastSeen("2026-09-24T11:59:30Z", now)).toBe("30s ago");
  });

  it("formats minutes", () => {
    expect(formatLastSeen("2026-09-24T11:55:00Z", now)).toBe("5m ago");
  });

  it("formats hours", () => {
    expect(formatLastSeen("2026-09-24T09:00:00Z", now)).toBe("3h ago");
  });

  it("falls back to a full date beyond a day", () => {
    const result = formatLastSeen("2026-09-20T12:00:00Z", now);
    expect(result).not.toMatch(/ago$/);
  });
});

describe("formatSessionLabel", () => {
  it("includes the start time and reading count", () => {
    const label = formatSessionLabel({
      session_id: "s1",
      device_id: "d1",
      start_time: "2026-09-24T12:00:00Z",
      end_time: "2026-09-24T12:05:00Z",
      reading_count: 42,
    });
    expect(label).toContain("42 readings");
  });
});
