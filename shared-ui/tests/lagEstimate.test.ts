import { describe, expect, it } from "vitest";
import fixture from "./fixtures/lag-estimate.json";
import { LagEstimator, LiveEstimates, lagParamsFor, withEstimates } from "../src/lib/lagEstimate";
import type { LagParams } from "../src/lib/lagEstimate";

// Real breath-test data (session 0645c07f, node bench-01; and an ExplorIR-M
// calibration run, whose CO2 comes in 125 ppm steps) with the estimates
// BreadBoardTest/tools/lag_response.py computed for it: the TypeScript port
// must give the same numbers, or the live line and the analysis disagree.
describe("LagEstimator matches lag_response.py", () => {
  for (const c of fixture.cases as { name?: string; sensor: string; params: unknown; t: number[]; y: number[]; expected: number[] }[]) {
    it(c.name ?? `${c.sensor} (${(c.params as LagParams).model})`, () => {
      const estimator = new LagEstimator(c.params as LagParams);
      c.t.forEach((t, i) => {
        const estimate = estimator.push(t, c.y[i]);
        expect(estimate).toBeCloseTo(c.expected[i], 6);
      });
    });
  }
});

describe("LagEstimator", () => {
  const oneTau: LagParams = { model: "one_tau", tau: 10, window: 3 };

  it("reads a steady signal as itself", () => {
    const e = new LagEstimator(oneTau);
    for (let t = 0; t < 10; t++) e.push(t, 25);
    expect(e.push(10, 25)).toBeCloseTo(25, 9);
  });

  it("recovers the true level of a first-order lag", () => {
    // Reading approaching 30 from 20 with tau 10 s: x = y + tau * dy/dt = 30.
    const e = new LagEstimator(oneTau);
    let estimate = 0;
    for (let t = 0; t <= 20; t++) estimate = e.push(t, 30 - 10 * Math.exp(-t / 10));
    expect(estimate).toBeCloseTo(30, 0);
  });

  it("isn't ready until the slope window has filled", () => {
    const e = new LagEstimator(oneTau);
    e.push(0, 1);
    e.push(1, 1);
    expect(e.ready).toBe(false);
    e.push(2, 1);
    expect(e.ready).toBe(true);
  });

  it("ignores duplicate and out-of-order readings", () => {
    const e = new LagEstimator(oneTau);
    e.push(0, 20);
    const at1 = e.push(1, 21);
    expect(e.push(1, 99)).toBe(at1);
    expect(e.push(0.5, 99)).toBe(at1);
  });

  it("clamps to the configured limits", () => {
    const e = new LagEstimator({ model: "one_tau", tau: 100, window: 2, min: 0, max: 100 });
    e.push(0, 50);
    expect(e.push(1, 90)).toBe(100);
  });
});

describe("LagEstimator on a stepped sensor (min_step)", () => {
  const stepped: LagParams = { model: "one_tau", tau: 12, window: 3, min_step: 62 };

  it("reads a steady signal as itself", () => {
    const e = new LagEstimator(stepped);
    let estimate = 0;
    for (let t = 0; t < 30; t += 0.5) estimate = e.push(t, 251);
    expect(estimate).toBe(251);
  });

  it("doesn't spike at each step of a slow fall, and eases onto the reading", () => {
    // Falling one 125 ppm step every 10 s, then holding: a slope through the
    // raw readings would read every step as a sudden fall.
    const e = new LagEstimator(stepped);
    const estimates: number[] = [];
    for (let t = 0; t < 100; t += 0.5) {
      const y = 1000 - 125 * Math.min(5, Math.floor(t / 10));
      estimates.push(e.push(t, y));
    }
    const falling = estimates.slice(40, 100); // 20-50 s: steady slope of 12.5 ppm/s
    for (const x of falling) expect(x).toBeGreaterThan(375 - 160);
    // 50 s after the last step: within 20 ppm of the reading (the capped
    // slope fades as 1/time, half a step per second since the last step).
    expect(Math.abs(estimates[estimates.length - 1] - 375)).toBeLessThan(20);
  });

  it("ignores changes smaller than min_step", () => {
    const e = new LagEstimator(stepped);
    for (let t = 0; t < 20; t += 0.5) e.push(t, t % 2 === 0 ? 630 : 631);
    expect(e.push(20, 630)).toBe(630);
  });
});

describe("withEstimates / LiveEstimates", () => {
  const series = Array.from({ length: 20 }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 9, 18, 21, 0, i)).toISOString(),
    value: 24,
  }));

  it("adds estimates only for calibrated nodes, after warm-up", () => {
    expect(lagParamsFor("bench-01", "temperature")).toBeDefined();
    const out = withEstimates({ temperature: { "bench-01": series, "uncalibrated-01": series } });
    const bench = out.temperature!["bench-01"];
    const window = lagParamsFor("bench-01", "temperature")!.window;
    expect(bench[window - 2].estimate).toBeUndefined();
    expect(bench[window - 1].estimate).toBeCloseTo(24, 6);
    expect(out.temperature!["uncalibrated-01"].every((p) => p.estimate === undefined)).toBe(true);
  });

  it("gives a live stream the same values as a whole-session pass", () => {
    const live = new LiveEstimates();
    const streamed = series.map((p) =>
      live.point({ node_id: "bench-01", sensor_type: "temperature", ...p }),
    );
    expect(streamed).toEqual(withEstimates({ temperature: { "bench-01": series } }).temperature!["bench-01"]);
  });
});
