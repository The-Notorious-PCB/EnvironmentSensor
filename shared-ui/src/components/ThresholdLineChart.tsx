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
import { useMemo } from "react";
import { THRESHOLDS } from "../config/thresholds";
import { fitAxis } from "../lib/axisDomain";
import type { SeriesByNode } from "../lib/groupReadings";
import type { SensorType } from "../types";

// Categorical series colors, in a fixed order validated for colour-vision
// deficiency (adjacent pairs) and >= 3:1 contrast on light and dark chart
// surfaces (dataviz reference palette: blue, orange, aqua, yellow, magenta,
// green, violet, red). These are the light-surface steps; an app can swap in
// its dark-surface steps by defining --series-1..8 (see shared-ui/README.md).
const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

function seriesColor(slot: number): string {
  const i = slot % SERIES_COLORS.length;
  return `var(--series-${i + 1}, ${SERIES_COLORS[i]})`;
}

// Node i's real line takes slot 2i and its estimate slot 2i + 1, so with one
// node (the usual case) the reading is blue and the estimate orange, and
// every node's estimate is a different hue from every real line.
const realColor = (nodeIndex: number) => seriesColor(2 * nodeIndex);
const estimateColor = (nodeIndex: number) => seriesColor(2 * nodeIndex + 1);

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export interface ThresholdLineChartProps {
  sensorType: SensorType;
  seriesByNode: SeriesByNode;
  /** Pixels, or a percentage of a parent that has its own height (e.g. an
   * expanded view). */
  height?: number | `${number}%`;
  /** Draw the lag-compensated estimate lines, if the data has any. */
  showEstimate?: boolean;
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
 * The y-axis fits the data (see lib/axisDomain.ts) rather than spanning the
 * sensor's whole display range, so small changes are visible; the bands are
 * clipped to whatever range is showing.
 *
 * Points carrying an `estimate` (lib/lagEstimate.ts) get a second, dashed
 * line in a different colour (see realColor/estimateColor): the
 * lag-compensated estimate of the true level. `showEstimate={false}` hides
 * it, and the y-axis then fits the readings alone.
 *
 * Consuming apps must define the CSS custom properties `--chart-grid` and
 * `--chart-axis` (see shared-ui/README.md).
 */
export function ThresholdLineChart({
  sensorType,
  seriesByNode,
  height = 200,
  showEstimate = true,
}: ThresholdLineChartProps) {
  const threshold = THRESHOLDS[sensorType];
  const nodeIds = Object.keys(seriesByNode);
  const estimatedNodeIds = showEstimate
    ? nodeIds.filter((id) => seriesByNode[id].some((p) => p.estimate !== undefined))
    : [];
  const axis = useMemo(
    () =>
      fitAxis(
        nodeIds.flatMap((id) =>
          seriesByNode[id].flatMap((point) =>
            !showEstimate || point.estimate === undefined ? [point.value] : [point.value, point.estimate],
          ),
        ),
        threshold.minSpan,
        [threshold.min, threshold.max],
      ),
    [seriesByNode, threshold, showEstimate],
  );

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
          domain={axis.domain}
          ticks={axis.ticks.length ? axis.ticks : undefined}
          allowDataOverflow
          stroke="var(--chart-axis)"
          tick={{ fontSize: 11 }}
          width={44}
        />
        <Tooltip
          labelFormatter={formatTime}
          // The tooltip box is always white, but its label inherits the page's
          // text color, which is near-white on the dark theme.
          labelStyle={{ color: "#000" }}
          formatter={(value: number, name: string) => [
            `${Number(value.toFixed(2))} ${threshold.unit}`,
            name,
          ]}
        />
        <ReferenceArea ifOverflow="hidden" y1={threshold.min} y2={threshold.warnRange[0]} fill="#ef4444" fillOpacity={0.08} />
        <ReferenceArea
          ifOverflow="hidden"
          y1={threshold.warnRange[0]}
          y2={threshold.okRange[0]}
          fill="#eab308"
          fillOpacity={0.08}
        />
        <ReferenceArea ifOverflow="hidden" y1={threshold.okRange[0]} y2={threshold.okRange[1]} fill="#22c55e" fillOpacity={0.06} />
        <ReferenceArea
          ifOverflow="hidden"
          y1={threshold.okRange[1]}
          y2={threshold.warnRange[1]}
          fill="#eab308"
          fillOpacity={0.08}
        />
        <ReferenceArea ifOverflow="hidden" y1={threshold.warnRange[1]} y2={threshold.max} fill="#ef4444" fillOpacity={0.08} />
        {nodeIds.map((nodeId, i) => (
          <Line
            key={nodeId}
            data={seriesByNode[nodeId]}
            dataKey="value"
            name={nodeId}
            stroke={realColor(i)}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
        {estimatedNodeIds.map((nodeId) => (
          <Line
            key={`${nodeId}-estimate`}
            data={seriesByNode[nodeId]}
            dataKey="estimate"
            name={`${nodeId} (estimated)`}
            stroke={estimateColor(nodeIds.indexOf(nodeId))}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        ))}
        {(nodeIds.length > 1 || estimatedNodeIds.length > 0) && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
