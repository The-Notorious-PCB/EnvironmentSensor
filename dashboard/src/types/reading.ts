// SensorType itself now lives in shared-ui (mirrored by hand from
// shared/sensor-types.json — see shared-ui/src/types.ts for the update
// note). Re-exported here so existing imports of `SensorType` from this
// module keep working.
export type { SensorType } from "shared-ui";
import type { SensorType } from "shared-ui";

/** One message as broadcast by the collector's /ws/live WebSocket
 * (app/writer.py's broadcast payload). No `id`/`synced` — those are local
 * to the collector's SQLite row, not part of the live feed.
 */
export interface LiveReading {
  session_id: string;
  node_id: string;
  sensor_type: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  seq: number;
}

/** One row as returned by GET /sessions/{id}/readings
 * (collector/app/models/db.py's Reading table).
 */
export interface StoredReading extends LiveReading {
  id: number;
  synced: boolean;
}

/** One row as returned by GET /sessions and POST /sessions
 * (collector/app/models/db.py's Session table).
 */
export interface SessionSummary {
  session_id: string;
  subject_id: string;
  suit_config: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
}
