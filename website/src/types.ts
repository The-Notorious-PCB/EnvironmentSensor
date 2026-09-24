import type { SensorType } from "shared-ui";

/** supabase_arrays row, columns per the collector's own SELECT grant (see
 * supabase/migrations) — api_key_hash and owner_id are never selectable by
 * a regular user, so they don't appear here.
 */
export interface SensorArrayRow {
  id: string;
  name: string;
  suit_config: string | null;
  status: "active" | "inactive";
  last_seen_at: string | null;
  created_at: string;
}

/** One `readings` row as returned by Supabase REST/Realtime — the cloud
 * counterpart of the collector's local SQLite row (see
 * shared/packet-schema.md), plus `device_id`. No local-only `synced`
 * field here; that's SQLite bookkeeping, not part of this table.
 */
export interface ReadingRow {
  id: number;
  session_id: string;
  node_id: string;
  sensor_type: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  seq: number;
  device_id: string;
}

/** One row from the `device_sessions` view (supabase/migrations) — a
 * derived summary of readings grouped by session, since session metadata
 * itself isn't synced to Supabase (see
 * collector/README.md#cloud-sync-supabase's "Not synced yet" note).
 */
export interface DeviceSessionRow {
  session_id: string;
  device_id: string;
  start_time: string;
  end_time: string;
  reading_count: number;
}
