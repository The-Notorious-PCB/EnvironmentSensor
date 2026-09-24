import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { THRESHOLDS } from "../config/thresholds";
import { getStatus, STATUS_COLOR } from "../lib/thresholdStatus";
import type { SensorType } from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface SensorGaugeProps {
  sensorType: SensorType;
  value: number;
  unit: string;
}

/** Current-value-at-a-glance indicator for a live view: a half-circle
 * gauge showing where the latest reading sits in the configured
 * min/max range, colored green/yellow/red by threshold status.
 *
 * Consuming apps must define the `.sensor-gauge*` CSS classes (see
 * shared-ui/README.md).
 */
export function SensorGauge({ sensorType, value, unit }: SensorGaugeProps) {
  const threshold = THRESHOLDS[sensorType];
  const status = getStatus(sensorType, value);
  const color = STATUS_COLOR[status];
  const pct = clamp(((value - threshold.min) / (threshold.max - threshold.min)) * 100, 0, 100);
  const data = [{ value: pct, fill: color }];

  return (
    <div className="sensor-gauge">
      <ResponsiveContainer width="100%" height={110}>
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={180}
          endAngle={0}
          barSize={14}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="sensor-gauge-value" style={{ color }}>
        {value.toFixed(1)} <span className="sensor-gauge-unit">{unit}</span>
      </div>
      <div className="sensor-gauge-status" style={{ color }}>
        {status.toUpperCase()}
      </div>
    </div>
  );
}
