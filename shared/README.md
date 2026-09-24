# shared

Cross-language contract between `firmware/` (packet producer), `collector/`
(packet consumer + storage), and `dashboard/` (packet display). Not a build
package — there's nothing to install here, just the schema both sides
implement against and keep in sync by hand.

- [`packet-schema.md`](packet-schema.md) — human-readable spec for the
  sensor packet, the `sessions`/`readings` SQLite tables, and how `seq` is
  used to detect gaps between the relay's SD log and what the collector
  received. Read this first.
- [`sensor-types.json`](sensor-types.json) — canonical list of valid
  `sensor_type` values. `collector`'s `SensorType` enum is built from this
  file at import time; `packet-schema.json`'s enum array is kept in sync
  with it by hand, checked by a test. To add a sensor type, edit this file
  first.
- [`packet-schema.json`](packet-schema.json) — JSON Schema for one sensor
  reading, as emitted over serial (NDJSON), stored in collector SQLite, and
  synced to Supabase. `collector/app/models` and any dashboard-side TS types
  should be kept consistent with this file; if you change a field here,
  update both.
- [`device-registration.md`](device-registration.md) — how a relay-box
  device gets registered to a website account and authenticates the
  collector's cloud sync via a per-device API key. Implemented by
  [`supabase/migrations`](../supabase/migrations); **read this before
  applying that migration against a collector that's already syncing** —
  it changes what the collector's current sync calls are allowed to do.

Changing `sensor_type`, `unit`, or the packet shape is a breaking-change
surface for the separate digital-twin team, who consume synced rows via the
Supabase REST API — see [CLAUDE.md](../CLAUDE.md#for-the-digital-twin-team).
