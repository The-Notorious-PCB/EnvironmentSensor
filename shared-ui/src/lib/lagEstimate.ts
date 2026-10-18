import calibration from "../config/lag-params.json";
import type { MinimalReading, SensorType } from "../types";
import type { SeriesByNode, SeriesPoint } from "./groupReadings";

/** Sensors lag the air they measure (CO2 by minutes, temperature by minutes,
 * humidity by seconds), so a live reading trails a real change. These
 * estimators undo a calibrated lag to estimate the true level now. They're
 * a port of BreadBoardTest/tools/lag_response.py, which also fits the
 * parameters (its --save-params writes config/lag-params.json); the tests
 * check both give the same numbers on real data.
 *
 * one_tau: reading y lags the true level x as dy/dt = (x - y) / tau, so
 *   x = y + tau * slope, slope from a least-squares line through the last
 *   `window` readings.
 * two_tau: y = fast_share * fast + (1 - fast_share) * slow, where the slow
 *   part (e.g. a circuit board's heat, tau2) is simulated, easing toward the
 *   current estimate each step, and the one_tau rule (tau1) is applied to
 *   the fast part that's left.
 *
 * Parameters are per node_id: they depend on the mounting and airflow, not
 * just the sensor chip, so recalibrate for each setup.
 */

interface Common {
  window: number;
  min?: number | null;
  max?: number | null;
  calibrated_from?: string;
  calibrated_on?: string;
}
export interface OneTauParams extends Common {
  model: "one_tau";
  tau: number;
}
export interface TwoTauParams extends Common {
  model: "two_tau";
  tau1: number;
  tau2: number;
  fast_share: number;
}
export type LagParams = OneTauParams | TwoTauParams;

const CALIBRATION = calibration as Record<string, Partial<Record<SensorType, LagParams>>>;

export function lagParamsFor(nodeId: string, sensorType: SensorType): LagParams | undefined {
  return CALIBRATION[nodeId]?.[sensorType];
}

/** Feed readings in time order with push(); one instance per (node, sensor).
 * Keeps its own state, so it works on a live stream whose display buffer is
 * much shorter than the slow time constant. */
export class LagEstimator {
  private times: number[] = [];
  private bases: number[] = [];
  private slow: number | undefined;
  private prev = 0; // last unclamped estimate, fed back into the slow part
  private lastT: number | undefined;
  private last = 0;
  private count = 0;

  constructor(readonly params: LagParams) {}

  /** True once the slope window has filled; before that the estimate is
   * built on too few readings to show. */
  get ready(): boolean {
    return this.count >= this.params.window;
  }

  /** `t` in seconds. Returns the estimate after this reading. A reading at
   * or before the previous one (duplicate, out of order) is ignored. */
  push(t: number, y: number): number {
    if (this.lastT !== undefined && t <= this.lastT) return this.last;
    const dt = this.lastT === undefined ? 0 : t - this.lastT;
    this.lastT = t;

    const p = this.params;
    let base: number;
    let tau: number;
    if (p.model === "two_tau") {
      if (this.slow === undefined) {
        this.slow = y;
        this.prev = y;
      }
      this.slow += (dt / p.tau2) * (this.prev - this.slow);
      base = (y - (1 - p.fast_share) * this.slow) / p.fast_share;
      tau = p.tau1;
    } else {
      base = y;
      tau = p.tau;
    }

    this.times.push(t);
    this.bases.push(base);
    if (this.times.length > p.window) {
      this.times.shift();
      this.bases.shift();
    }

    const estimate = base + tau * slope(this.times, this.bases);
    this.prev = estimate;
    this.count += 1;
    this.last = Math.min(Math.max(estimate, p.min ?? -Infinity), p.max ?? Infinity);
    return this.last;
  }
}

function slope(ts: number[], vs: number[]): number {
  const n = ts.length;
  if (n < 2) return 0;
  let tMean = 0;
  let vMean = 0;
  for (let i = 0; i < n; i++) {
    tMean += ts[i];
    vMean += vs[i];
  }
  tMean /= n;
  vMean /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dt = ts[i] - tMean;
    num += dt * (vs[i] - vMean);
    den += dt * dt;
  }
  return den === 0 ? 0 : num / den;
}

/** Adds `estimate` to every point of every series that has calibration, for
 * views that have a whole session at once (history, playback). Points
 * before the estimator is ready get no estimate. */
export function withEstimates(
  grouped: Partial<Record<SensorType, SeriesByNode>>,
): Partial<Record<SensorType, SeriesByNode>> {
  const out: Partial<Record<SensorType, SeriesByNode>> = {};
  for (const [sensorType, byNode] of Object.entries(grouped) as [SensorType, SeriesByNode][]) {
    out[sensorType] = {};
    for (const [nodeId, series] of Object.entries(byNode)) {
      const params = lagParamsFor(nodeId, sensorType);
      if (!params) {
        out[sensorType]![nodeId] = series;
        continue;
      }
      const estimator = new LagEstimator(params);
      out[sensorType]![nodeId] = series.map((point) => {
        const estimate = estimator.push(Date.parse(point.timestamp) / 1000, point.value);
        return estimator.ready ? { ...point, estimate } : point;
      });
    }
  }
  return out;
}

/** For live streams: keeps one estimator per (node, sensor) for as long as
 * the stream runs, independent of how many points the chart keeps. Create one
 * per subscription; call point() once per incoming reading, outside any React
 * state updater (those can run twice in development). */
export class LiveEstimates {
  private estimators = new Map<string, LagEstimator | null>();

  point(reading: MinimalReading): SeriesPoint {
    const key = `${reading.node_id}|${reading.sensor_type}`;
    if (!this.estimators.has(key)) {
      const params = lagParamsFor(reading.node_id, reading.sensor_type);
      this.estimators.set(key, params ? new LagEstimator(params) : null);
    }
    const point: SeriesPoint = { timestamp: reading.timestamp, value: reading.value };
    const estimator = this.estimators.get(key);
    if (estimator) {
      const estimate = estimator.push(Date.parse(reading.timestamp) / 1000, reading.value);
      if (estimator.ready) point.estimate = estimate;
    }
    return point;
  }
}
