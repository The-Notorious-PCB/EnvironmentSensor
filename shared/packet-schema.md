# Packet + storage schema

Human-readable companion to [`packet-schema.json`](packet-schema.json)
(machine-readable, for anyone validating packets outside Python). The
SQLModel implementation lives in
[`collector/app/models`](../collector/app/models); this doc is the spec it
implements, not a duplicate of it.

## Sensor packet (wire format)

One NDJSON line, one sensor reading:

```json
{"node_id": "helmet-01", "sensor_type": "co2", "value": 812.4, "unit": "ppm", "timestamp": "2026-09-17T14:03:21.482Z", "seq": 10432, "crc16": "3af1"}
```

| Field | Type | Notes |
|---|---|---|
| `node_id` | string | `<location>-<index>`, lowercase-hyphenated, e.g. `helmet-01` |
| `sensor_type` | enum (string) | see below |
| `value` | number | raw reading, unit given separately |
| `unit` | string | always explicit — never inferred from `sensor_type` (e.g. `degC`, `kPa`, `%RH`, `ppm`) |
| `timestamp` | string, ISO 8601 UTC | set by the relay box, not the sensor node |
| `seq` | integer, 0–4294967295 | monotonic **per `node_id`**, assigned by the relay box |
| `crc16` | string, 4 lowercase hex chars | CRC-16/CCITT-FALSE over the compact-JSON, sorted-key encoding of every other field, checked by the collector on ingest — see `firmware/README.md` for the exact algorithm and encoding, provisional pending firmware review |

### `sensor_type` enum

Currently defined:

- `o2`
- `co2`
- `temperature`
- `humidity`
- `pressure`

More will be added later (particulates per the project's "bonus" requirement,
possibly others). Two deliberate design choices to keep that cheap:

1. **[`sensor-types.json`](sensor-types.json) is the single canonical
   list.** `SensorType` in
   [`collector/app/models/enums.py`](../collector/app/models/enums.py) is
   *built from* this file at import time (Python's functional `Enum()` API),
   not hand-written — adding a type there needs no Python code change.
   `packet-schema.json`'s `sensor_type.enum` array still has to be updated
   by hand (a plain JSON Schema file can't import Python or read another
   JSON file for its `enum` keyword), but
   [`collector/tests/test_sensor_types.py`](../collector/tests/test_sensor_types.py)
   fails if the two drift apart, so it can't go silently stale. **To add a
   sensor type: add it to `sensor-types.json`, add it to
   `packet-schema.json`'s enum array, run the tests.** Extend the list,
   don't repurpose an existing value for something new.
2. **The DB does not enforce the enum at the schema level.** `readings.sensor_type`
   is a plain indexed string column, not a SQL-level `ENUM`/`CHECK`. Adding a
   new sensor type is validated in application code (the `SensorType` enum,
   checked when a packet is parsed) and needs no SQLite migration. A
   SQL-level enum would bake the current member list into the table
   definition and require a migration for every new sensor type — not worth
   it for a field that's expected to grow.

## `sessions` table

One row per data-collection run (one "put the suit on and do an exercise"
session).

| Column | Type | Notes |
|---|---|---|
| `session_id` | string, PK | opaque id (UUID4 hex), generated when the session starts |
| `subject_id` | string | identifies the human test subject wearing the suit |
| `suit_config` | string | free-text description of the suit/sensor loadout used |
| `start_time` | datetime (UTC) | when the session started |
| `end_time` | datetime (UTC), nullable | null while the session is in progress |
| `notes` | string, nullable | free-text session notes |

## `readings` table

One row per stored sensor reading — the packet fields plus which session it
belongs to.

| Column | Type | Notes |
|---|---|---|
| `id` | integer, PK, autoincrement | surrogate key; `(node_id, seq)` alone isn't unique across sessions |
| `session_id` | string, FK -> `sessions.session_id` | |
| `node_id` | string | |
| `sensor_type` | string | see enum note above |
| `value` | float | |
| `unit` | string | |
| `timestamp` | datetime (UTC) | from the packet, not insert time |
| `seq` | integer | from the packet |

`(session_id, node_id, seq)` has a unique constraint. This makes storage
idempotent: replaying an NDJSON log (a test fixture, or a re-import from the
relay's SD backup after a session) can be inserted with "insert or ignore"
semantics and will never double-count a reading.

`crc16` is not persisted — it's a wire-transit check, verified once when the
packet is ingested. A packet that fails CRC is logged and dropped, not
stored. If we later want to audit "which stored rows had firmware-computed
values we independently re-verified," that's an argument for storing it,
but nothing today needs it.

Sync-tracking columns (e.g. `synced_at`, for the Supabase sync worker) are
deliberately not part of this table yet — they land with the sync worker
milestone so this schema stays scoped to what M1–M2 actually need.

## Using `seq` to detect gaps between the relay's SD log and the collector

Every packet the relay box emits over serial, it also writes to its SD card.
The two logs can diverge if the serial link drops bytes, the collector was
briefly not listening, or a packet fails CRC and gets discarded on arrival.
`seq` is what makes that divergence detectable and fixable:

1. **Within a session, live**: for each `node_id`, `seq` should increase by
   exactly 1 packet-to-packet (per sensor type interleaving aside — track
   per `(node_id)`, not per `(node_id, sensor_type)`, matching how the relay
   assigns it). A jump larger than expected means the collector missed one
   or more packets over serial; this can be surfaced during a session as a
   live "packets lost" counter.
2. **After a session, reconciled**: pull the relay's SD card log and diff
   the set of `(node_id, seq)` pairs it contains against what's in
   `readings` for that `session_id`. Any pair present on the SD card but
   absent from `readings` was lost in transit (or rejected on CRC) and can
   be backfilled by importing the SD log — the `(session_id, node_id, seq)`
   unique constraint makes that import safe to run even if some rows were
   already received live.
3. **What it can't catch**: if the relay itself failed to write a reading
   (sensor read error, relay crash) before assigning it a `seq`, no `seq`
   was ever allocated for that reading and no side has a record of it. Gap
   detection catches transit loss between relay and collector, not sensor
   or firmware-side loss.
