import { describe, expect, it } from "vitest";
import { THRESHOLDS } from "../src/config/thresholds";
import { getStatus } from "../src/lib/thresholdStatus";

describe("getStatus", () => {
  it("returns ok inside the configured safe range", () => {
    const [low, high] = THRESHOLDS.co2.okRange;
    expect(getStatus("co2", (low + high) / 2)).toBe("ok");
  });

  it("returns ok at the exact boundary of the safe range", () => {
    const [low, high] = THRESHOLDS.co2.okRange;
    expect(getStatus("co2", low)).toBe("ok");
    expect(getStatus("co2", high)).toBe("ok");
  });

  it("returns warn just outside the safe range but inside the warn range", () => {
    const [, okHigh] = THRESHOLDS.co2.okRange;
    const [, warnHigh] = THRESHOLDS.co2.warnRange;
    const midpoint = (okHigh + warnHigh) / 2;
    expect(getStatus("co2", midpoint)).toBe("warn");
  });

  it("returns danger outside the warn range", () => {
    const [, warnHigh] = THRESHOLDS.co2.warnRange;
    expect(getStatus("co2", warnHigh + 1000)).toBe("danger");
  });

  it("treats warnRange as inclusive of its own boundary", () => {
    const [, warnHigh] = THRESHOLDS.co2.warnRange;
    expect(getStatus("co2", warnHigh)).toBe("warn");
  });
});
