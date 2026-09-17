# shared

Cross-language contract between `firmware/` (packet producer), `collector/`
(packet consumer + storage), and `dashboard/` (packet display). Not a build
package — there's nothing to install here, just the schema both sides
implement against and keep in sync by hand.

- [`packet-schema.json`](packet-schema.json) — JSON Schema for one sensor
  reading, as emitted over serial (NDJSON), stored in collector SQLite, and
  synced to Supabase. `collector/app/models` and any dashboard-side TS types
  should be kept consistent with this file; if you change a field here,
  update both.

Changing `sensor_type`, `unit`, or the packet shape is a breaking-change
surface for the separate digital-twin team, who consume synced rows via the
Supabase REST API — see [CLAUDE.md](../CLAUDE.md#for-the-digital-twin-team).
