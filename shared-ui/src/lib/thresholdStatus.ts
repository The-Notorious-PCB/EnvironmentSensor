import { THRESHOLDS } from "../config/thresholds";
import type { SensorType } from "../types";

export type ThresholdStatus = "ok" | "warn" | "danger" | "unknown";

export function getStatus(sensorType: SensorType, value: number): ThresholdStatus {
  const threshold = THRESHOLDS[sensorType];
  if (!threshold) return "unknown";

  const [okLow, okHigh] = threshold.okRange;
  if (value >= okLow && value <= okHigh) return "ok";

  const [warnLow, warnHigh] = threshold.warnRange;
  if (value >= warnLow && value <= warnHigh) return "warn";

  return "danger";
}

export const STATUS_COLOR: Record<ThresholdStatus, string> = {
  ok: "#22c55e",
  warn: "#eab308",
  danger: "#ef4444",
  unknown: "#94a3b8",
};
