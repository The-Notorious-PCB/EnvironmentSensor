// Mirrors shared/sensor-types.json by hand — same convention the collector
// uses for its own SensorType enum (see shared/packet-schema.md). Update
// both when a sensor type is added.
export type SensorType = "o2" | "co2" | "temperature" | "humidity" | "pressure";

/** The minimum shape ThresholdLineChart/groupBySensorAndNode need from a
 * reading. Deliberately structural, not tied to any one backend's row
 * shape — the collector's local SQLite rows, its /ws/live broadcast
 * payload, and Supabase's `readings` rows all satisfy this without an
 * adapter.
 */
export interface MinimalReading {
  sensor_type: SensorType;
  node_id: string;
  timestamp: string;
  value: number;
}
