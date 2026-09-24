import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { THRESHOLDS } from "../config/thresholds";
import type { SeriesByNode } from "../lib/groupReadings";
import type { SensorType } from "../types";

const NODE_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#ea580c", "#4d7c0f", "#be185d"];

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export interface ThresholdLineChartProps {
  sensorType: SensorType;
  seriesByNode: SeriesByNode;
  height?: number;
}

/** One chart per sensor_type — used by the laptop dashboard's live view
 * (rolling recent history) and playback view (full session timeline), and
 * by the website's live view (Realtime-fed) and history view (Supabase
 * REST-fed). Same component everywhere, different data source, so every
 * view stays visually consistent by construction. Each node_id reporting
 * this sensor gets its own line; threshold bands from config/thresholds.ts
 * are drawn as background shading rather than coloring the line itself,
 * since a single node can have multiple points at different statuses.
 *
 * Consuming apps must define the CSS custom properties `--chart-grid` and
 * `--chart-axis` (see shared-ui/README.md).
 */
export function ThresholdLineChart({ sensorType, seriesByNode, height = 200 }: ThresholdLineChartProps) {
  const threshold = THRESHOLDS[sensorType];
  const nodeIds = Object.keys(seriesByNode);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTime}
          type="category"
          allowDuplicatedCategory={false}
          stroke="var(--chart-axis)"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[threshold.min, threshold.max]}
          stroke="var(--chart-axis)"
          tick={{ fontSize: 11 }}
          width={44}
        />
        <Tooltip
          labelFormatter={formatTime}
          formatter={(value: number) => [`${value} ${threshold.unit}`, sensorType]}
        />
        <ReferenceArea y1={threshold.min} y2={threshold.warnRange[0]} fill="#ef4444" fillOpacity={0.08} />
        <ReferenceArea
          y1={threshold.warnRange[0]}
          y2={threshold.okRange[0]}
          fill="#eab308"
          fillOpacity={0.08}
        />
        <ReferenceArea y1={threshold.okRange[0]} y2={threshold.okRange[1]} fill="#22c55e" fillOpacity={0.06} />
        <ReferenceArea
          y1={threshold.okRange[1]}
          y2={threshold.warnRange[1]}
          fill="#eab308"
          fillOpacity={0.08}
        />
        <ReferenceArea y1={threshold.warnRange[1]} y2={threshold.max} fill="#ef4444" fillOpacity={0.08} />
        {nodeIds.map((nodeId, i) => (
          <Line
            key={nodeId}
            data={seriesByNode[nodeId]}
            dataKey="value"
            name={nodeId}
            stroke={NODE_COLORS[i % NODE_COLORS.length]}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        {nodeIds.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
