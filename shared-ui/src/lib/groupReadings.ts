import type { MinimalReading, SensorType } from "../types";

export interface SeriesPoint {
  timestamp: string;
  value: number;
}

export type SeriesByNode = Record<string, SeriesPoint[]>;

/** Groups a flat list of readings into sensor_type -> node_id ->
 * chronological series, ready for ThresholdLineChart, which renders one
 * line per node. Works on any reading shape that has at least
 * sensor_type/node_id/timestamp/value — the collector's local rows, its
 * live WebSocket payload, and Supabase's `readings` rows all qualify as-is.
 */
export function groupBySensorAndNode(
  readings: MinimalReading[],
): Partial<Record<SensorType, SeriesByNode>> {
  const grouped: Partial<Record<SensorType, SeriesByNode>> = {};

  for (const reading of readings) {
    const bySensor = (grouped[reading.sensor_type] ??= {});
    const series = (bySensor[reading.node_id] ??= []);
    series.push({ timestamp: reading.timestamp, value: reading.value });
  }

  return grouped;
}
