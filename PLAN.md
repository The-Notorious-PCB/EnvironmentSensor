# PLAN

Milestone-based task breakdown for the collector + dashboard system described
in [CLAUDE.md](CLAUDE.md). Each milestone is independently demoable — it
produces something you can run and show, not just code that compiles.
Firmware is out of scope (see [firmware/README.md](firmware/README.md)); each
milestone that would need live serial input instead uses a recorded/synthetic
NDJSON log so the collector doesn't block on hardware.

## M1 — Packet schema + validation

Demo: feed a recorded NDJSON log (valid and deliberately corrupted lines)
through a standalone validator script; it prints accept/reject per line with
a reason.

- Finalize [shared/packet-schema.json](shared/packet-schema.json) (lock the
  crc16 field order with the firmware owner).
- `collector/app/serial`: NDJSON line parser + schema validation + CRC16
  check, as a pure function (bytes/line in, `SensorPacket` or rejection out).
- Fixture files: a handful of recorded `.ndjson` logs (clean session, dropped
  packets, corrupt CRC, out-of-order seq) checked into `collector/tests/`.
- Unit tests for the parser against those fixtures.

## M2 — SQLite storage layer

Demo: a script replays an M1 fixture log through the storage layer, then a
query prints all rows back out with a synced/unsynced count.

- `collector/app/models`: SQLModel table matching the packet schema, plus a
  synced/unsynced marker and insert timestamp.
- Insert path with idempotency on `(node_id, seq)` so a replayed/duplicated
  line doesn't double-write.
- Basic query helpers: by session/time range, by node, unsynced rows.
- Unit tests against a temp/in-memory SQLite DB.

## M3 — Serial ingestion

Demo: with a real or simulated serial port (e.g. `socat`-paired virtual
ports, one end fed by a script replaying an NDJSON log), run the collector
and watch rows land in SQLite in real time via a CLI tail/query.

- `collector/app/serial`: async pyserial reader loop — read line, run it
  through the M1 validator, write accepted packets via the M2 storage layer,
  log/count rejected lines without crashing the loop.
- Reconnect handling if the serial port drops and comes back.
- Integration test using a virtual serial port or an injected fake
  serial-like stream.

## M4 — WebSocket live feed

Demo: start the FastAPI app, connect a WebSocket client (browser devtools or
`websocat`), replay a log into the serial reader, and watch readings arrive
live on the socket.

- `collector/app/api`: FastAPI app with a `/ws/live` endpoint that broadcasts
  each newly-stored packet to connected clients.
- Wire the serial reader (M3) to publish into the broadcast on successful
  insert.
- Basic REST endpoints: list recent readings, list sessions — enough for the
  dashboard to have something to call in M6.
- Test: WebSocket test client receives a broadcast after a simulated insert.

## M5 — Cloud sync worker

Demo: run the collector against a Supabase test project with the network
toggled off/on (or a mocked endpoint); unsynced rows queue up while "offline"
and drain once "online" resumes, visible via the unsynced-count query from
M2.

- `collector/app/sync`: background task, polls for unsynced SQLite rows,
  batches them, POSTs to Supabase REST, marks them synced on success.
- tenacity retry/backoff on failure; never marks a row synced unless the
  POST actually succeeded.
- Test: mocked Supabase client — verify retry/backoff behavior and that
  rows aren't marked synced on failure.

## M6 — Dashboard live view

Demo: run collector + dashboard together, replay a log, watch gauges/line
charts update live with threshold-based alert coloring.

- `dashboard/src/hooks`: WebSocket client hook consuming `/ws/live`.
- `dashboard/src/components`: gauge + line chart components per
  `sensor_type`, with threshold-based coloring.
- `dashboard/src/pages`: live view page assembling the above.
- Component tests with a mocked WebSocket.

## M7 — Dashboard playback view

Demo: pick a past session from the REST-backed session list and scrub/replay
its recorded readings through the same chart components used in M6.

- REST endpoints (extend M4) for session listing + fetching a session's
  readings.
- `dashboard/src/pages`: playback page — session picker + timeline
  scrub/play controls, reusing the M6 chart components.
- Component tests with mocked REST responses.

## M8 — Tests + hardening pass

Demo: `pytest` (collector) and `vitest` (dashboard) both green end-to-end,
plus one scripted full-path run: replay a log through serial ingestion ->
storage -> WebSocket -> dashboard live view -> sync worker -> confirm rows
in Supabase (or mock).

- Fill test gaps left by earlier milestones (edge cases in CRC/seq
  handling, reconnect logic, retry/backoff timing).
- One end-to-end smoke test/script wiring M3 through M5 together.
- README pass on `collector/` and `dashboard/` reflecting what's actually
  built vs. still planned.
