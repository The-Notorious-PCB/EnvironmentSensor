# EnvironmentSensor

Analog astronaut spacesuit environmental sensor system (Colorado Space Grant
Consortium capstone). Tracks O2, CO2, temperature, humidity, pressure, and
particulates inside a suit/helmet in real time, logs it durably, and feeds a
live laptop dashboard, a public website (near-real-time view + history, by
device), and a cloud API that a separate team consumes to drive a digital
twin.

## Architecture

```
Suit sensor nodes  --(I2C/UART)-->  Relay box (ESP32/Teensy)
                                       |  \
                                       |   \--> SD card (local backup log)
                                       |
                                    USB serial (NDJSON, one packet/line)
                                       |
                                       v
                              Laptop: Python + FastAPI
                                - pyserial reader task
                                - SQLite (SQLModel) as source of truth
                                - WebSocket broadcast -> live dashboard
                                - background sync task (batches unsynced
                                  rows, tenacity retry/backoff)
                                       |
                                       v
                              Supabase (Postgres + REST + Realtime)
                                       |
                         +-------------+-------------+
                         v                           v
              Consumed by digital-twin        website (GitHub Pages,
              team via REST                   no login, fully public)
                                               - Realtime live view
                                               - REST history view
```

Data flow is one-way and durable at every hop: sensor nodes -> relay box (with
its own SD backup) -> laptop SQLite (source of truth for the session) ->
Supabase (cloud copy for downstream consumers). Any link above SQLite can drop
without losing data; the relay box's SD card is the backup if the serial link
to the laptop itself drops.

## Serial protocol

NDJSON over USB serial, one JSON object per line, one packet per sensor
reading (not batched):

```json
{"node_id": "helmet-01", "sensor_type": "co2", "value": 812.4, "unit": "ppm", "timestamp": "2026-09-17T14:03:21.482Z", "seq": 10432, "crc16": "3af1"}
```

- `node_id`: `<location>-<index>`, e.g. `helmet-01`, `chest-01`, lowercase,
  hyphenated.
- `sensor_type`: lowercase enum — `o2`, `co2`, `temperature`, `humidity`,
  `pressure` today; see [shared/packet-schema.md](shared/packet-schema.md)
  for the authoritative list. Extend the enum rather than overloading an
  existing value (e.g. particulates are anticipated but not yet defined).
- `value`/`unit`: SI where practical (`degC`, `kPa`, `%RH`, `ppm`, `ug/m3`).
- `timestamp`: ISO 8601 UTC, set on the relay box (nodes are not assumed to
  have wall-clock time).
- `seq`: monotonic per-node uint32, used to detect dropped packets.
- `crc16`: covers the other fields; receiver discards and logs (doesn't
  crash on) a line that fails CRC — serial links drop/corrupt bytes.

One packet per line keeps the parser trivial (readline + json.loads) and
means a corrupt/partial line only costs one reading, not a whole batch.

## Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Relay box | ESP32/Teensy | Reads multiple sensor buses (I2C/UART), does the USB-serial + SD-card fan-out; runs independently of the laptop |
| Wire protocol | NDJSON + per-packet CRC16 | Human-readable/debuggable over a plain serial monitor, no framing/length-prefix logic, one bad line ≠ one bad session |
| Local backup | SD card on relay box | Survives laptop crash or serial disconnect during a session — the relay box is not trusting the laptop link |
| Serial ingest | Python + pyserial | Standard, cross-platform serial handling |
| API/server | FastAPI | Async, so serial read + WebSocket broadcast + background sync task run concurrently without blocking each other; typed models give the digital-twin team a documented schema for free |
| Local store | SQLite via SQLModel | Zero-ops embedded DB appropriate for a laptop in the field with no guaranteed network; SQLModel's Pydantic-style models double as the API schema, avoiding a second hand-written schema |
| Live push | WebSocket | Dashboard needs continuous live readings, not poll-and-diff |
| Cloud store | Supabase (Postgres + REST) | Gives the digital-twin team a REST API to consume directly, no custom endpoint needed on our side; managed Postgres avoids self-hosting |
| Cloud sync | Background task, batches unsynced SQLite rows, tenacity retry/backoff | Field/analog sites have intermittent connectivity; batching cuts REST call volume, backoff avoids hammering a flaky link, SQLite stays authoritative until a batch is confirmed synced |
| Frontend | React + Recharts | Live gauges/line charts with threshold-based alert coloring; lighter-weight than D3 for the team's timeline; chart components live in `shared-ui` and are reused across both frontends below |
| Laptop frontend | dashboard (React + Recharts) | Runs on the laptop during a session, talks to the collector's own WebSocket/REST — works with no internet, since it never needs Supabase |
| Public frontend | website (React + Recharts, Supabase JS) | Deployed to GitHub Pages, talks to Supabase directly (Realtime, REST) — no dependency on the collector or a laptop being reachable; `HashRouter` since Pages has no server-side route rewriting |
| Device auth | Postgres RPC (`ingest_readings`) checking an API key hash | No login involved — the site is fully public (see `shared/device-registration.md`'s "No login"), but a device still needs its own API key to push readings, checked inside the RPC rather than via a user session |

## Repo layout

```
firmware/          ESP32/Teensy relay box firmware (sensor read, NDJSON
                    framing, CRC16, SD logging, USB serial output) — out of
                    scope to implement here, see firmware/README.md
collector/          Python + FastAPI service (see collector/README.md)
  app/
    serial/        pyserial reader, NDJSON parsing + CRC validation
    models/        SQLModel table + API schema definitions
    api/           FastAPI routes (REST + WebSocket)
    sync/          Supabase batch sync worker (tenacity retry/backoff)
  tests/
dashboard/          React + Recharts frontend, laptop-local — talks to the
                    collector's own API (see dashboard/README.md)
  src/
    pages/         live dashboard, session playback
    hooks/         WebSocket client, data-fetching hooks
  tests/
website/            React + Recharts frontend, public/cloud, no login —
                    deployed to GitHub Pages, talks to Supabase directly,
                    separate from dashboard (see website/README.md)
  src/
    pages/         device registration/list, live, history
    hooks/         Realtime/REST data-fetching
  tests/
shared-ui/          chart components + threshold/grouping logic shared
                    between dashboard and website (see shared-ui/README.md)
shared/             cross-component contract: packet schema, sensor-type
                    list, device-registration flow — see shared/README.md
supabase/           Supabase migrations + auth config for the cloud side —
                    see supabase/README.md
.github/workflows/  CI — deploy-website.yml builds+publishes website/ to
                    GitHub Pages
PLAN.md             milestone breakdown
```

## Conventions

- **node_id**: `<location>-<index>`, lowercase-hyphenated (`helmet-01`).
- **sensor_type**: lowercase snake_case enum, extend rather than repurpose.
- **Timestamps**: ISO 8601 UTC everywhere (wire protocol, SQLite, Supabase).
- **Units**: SI/standard units only, always paired with an explicit `unit`
  field — never assume unit from `sensor_type` alone.
- **Sync flag**: SQLite rows carry a synced/unsynced marker; Supabase is a
  downstream copy, SQLite is the source of truth for a session.
- **Python**: FastAPI + SQLModel conventions (Pydantic-style models), async
  I/O for anything touching the serial port, WebSocket, or network sync.

## Testing approach

- **Firmware**: hardware-in-loop for sensor reads; packet
  encoding/CRC logic covered by native unit tests (e.g. PlatformIO/Unity) so
  it's testable off-hardware.
- **Backend**: pytest. NDJSON parsing + CRC validation tested against
  recorded serial logs (fixtures), not live hardware. SQLModel logic tested
  against an in-memory/temp SQLite DB. Sync worker tested with a mocked
  Supabase client to exercise the tenacity retry/backoff paths without a
  network dependency.
- **Frontend**: Vitest + React Testing Library for components; a mocked
  WebSocket server for live-data and alert-threshold behavior.

## For the digital-twin team

They consume readings via the Supabase REST API, not our local SQLite or
serial stream directly. Schema/field changes to the synced rows are a
breaking-change surface for them — coordinate before renaming or repurposing
fields in `sensor_type`, `unit`, or the table shape pushed by `collector/app/sync`.

[`supabase/migrations`](supabase/migrations) added Row Level Security on
`readings`, but the site has no login (see
[`shared/device-registration.md`](shared/device-registration.md)'s "No
login") and the RLS policies are deliberately fully public
(`using (true)`) — so a plain anon-key REST read already returns every
device's rows, no special access needed. This wasn't always true (an
earlier per-user-ownership design would have blocked this), so it's worth
a heads-up to the digital-twin team regardless: don't assume today's open
access is permanent if per-user accounts ever come back.
