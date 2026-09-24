import { THRESHOLDS } from "../config/thresholds";
import type { SeriesByNode } from "../lib/groupReadings";
import type { SensorType } from "../types";
import { SensorGauge } from "./SensorGauge";
import { ThresholdLineChart } from "./ThresholdLineChart";

export interface SensorPanelProps {
  sensorType: SensorType;
  /** Just the two fields the gauge needs — deliberately not tied to any
   * one app's full reading type (a collector LiveReading, a Supabase
   * Realtime row, etc. all satisfy this as-is). */
  latest?: { value: number; unit: string };
  seriesByNode: SeriesByNode;
}

/** Live-view card for one sensor_type: current-value gauge (most recent
 * reading from any node) plus a rolling chart of recent history across all
 * nodes reporting this sensor. Used by both the laptop dashboard (fed from
 * the collector's WebSocket) and the website (fed from Supabase Realtime).
 */
export function SensorPanel({ sensorType, latest, seriesByNode }: SensorPanelProps) {
  const label = THRESHOLDS[sensorType].label;

  return (
    <div className="sensor-panel">
      <h3>{label}</h3>
      {latest ? (
        <SensorGauge sensorType={sensorType} value={latest.value} unit={latest.unit} />
      ) : (
        <div className="sensor-panel-empty">No data yet</div>
      )}
      <ThresholdLineChart sensorType={sensorType} seriesByNode={seriesByNode} height={140} />
    </div>
  );
}
