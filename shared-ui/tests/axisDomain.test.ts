import { describe, expect, it } from "vitest";
import { fitAxis } from "../src/lib/axisDomain";

describe("fitAxis", () => {
  it("zooms to the data instead of the full display range", () => {
    // ~1 h of CO2 drifting 1030 -> 1370 ppm; display range is 0..5000.
    const { domain } = fitAxis([1030, 1200, 1370], 100, [0, 5000]);
    expect(domain[0]).toBeLessThanOrEqual(1030);
    expect(domain[1]).toBeGreaterThanOrEqual(1370);
    // The data fills at least half the axis, after margin and rounding.
    expect((1370 - 1030) / (domain[1] - domain[0])).toBeGreaterThanOrEqual(0.5);
  });

  it("never zooms tighter than minSpan, so noise doesn't look like a swing", () => {
    // Pressure jittering by 3 Pa around 84.9 kPa, minSpan 0.1 kPa.
    const { domain } = fitAxis([84.901, 84.903, 84.904], 0.1, [0, 150]);
    expect(domain[1] - domain[0]).toBeGreaterThanOrEqual(0.1);
    expect(domain[0]).toBeLessThanOrEqual(84.901);
    expect(domain[1]).toBeGreaterThanOrEqual(84.904);
  });

  it("puts ticks on round numbers covering the domain", () => {
    const { domain, ticks } = fitAxis([23.41, 23.88], 0.5, [-10, 50]);
    expect(ticks[0]).toBe(domain[0]);
    expect(ticks[ticks.length - 1]).toBe(domain[1]);
    for (const t of ticks) {
      // No float noise like 23.400000000000002 in the labels.
      expect(String(t).length).toBeLessThanOrEqual(5);
    }
  });

  it("falls back to the display range with no data", () => {
    expect(fitAxis([], 1, [0, 100])).toEqual({ domain: [0, 100], ticks: [] });
    expect(fitAxis([NaN], 1, [0, 100]).domain).toEqual([0, 100]);
  });

  it("handles a single point", () => {
    const { domain } = fitAxis([1000], 100, [0, 5000]);
    expect(domain[0]).toBeLessThanOrEqual(950);
    expect(domain[1]).toBeGreaterThanOrEqual(1050);
  });

  it("handles a very long series without a stack overflow", () => {
    const values = Array.from({ length: 500_000 }, (_, i) => 20 + (i % 100) / 100);
    expect(() => fitAxis(values, 0.5, [-10, 50])).not.toThrow();
  });
});
