import type { SensorType } from "../types";

export interface SensorThreshold {
  label: string;
  unit: string;
  /** Chart/gauge axis range — not a safety bound, just the display domain. */
  min: number;
  max: number;
  /** Inclusive "safe" range — green. */
  okRange: [number, number];
  /** Inclusive range beyond okRange that's still tolerable — yellow.
   * Anything outside this range is red. */
  warnRange: [number, number];
}

/**
 * Single source of truth for alert coloring across every UI that renders
 * sensor data (the laptop dashboard's live/playback views, and the
 * website's live/history views). Tune these here — nothing else needs to
 * change.
 *
 * These starting values are placeholders, not verified physiological/suit
 * safety limits — get them reviewed against the actual suit spec (see the
 * project brief's ~4.3 psi / 29.6 kPa internal pressure note) before
 * trusting the coloring for anything real.
 */
export const THRESHOLDS: Record<SensorType, SensorThreshold> = {
  o2: {
    label: "O2",
    unit: "kPa",
    min: 0,
    max: 30,
    okRange: [19.5, 23.5],
    warnRange: [16, 25],
  },
  co2: {
    label: "CO2",
    unit: "ppm",
    min: 0,
    max: 5000,
    okRange: [0, 1000],
    warnRange: [0, 2000],
  },
  temperature: {
    label: "Temperature",
    unit: "degC",
    min: -10,
    max: 50,
    okRange: [15, 30],
    warnRange: [5, 40],
  },
  humidity: {
    label: "Humidity",
    unit: "%RH",
    min: 0,
    max: 100,
    okRange: [20, 60],
    warnRange: [10, 80],
  },
  pressure: {
    label: "Pressure",
    unit: "kPa",
    min: 0,
    max: 150,
    okRange: [95, 105],
    warnRange: [80, 120],
  },
};

export const SENSOR_TYPES = Object.keys(THRESHOLDS) as SensorType[];
