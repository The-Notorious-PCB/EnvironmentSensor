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

## M9 — Public website (device auth, live + history)

Demo: on the (login-free, fully public) website, register a device (API
key shown once), configure a collector with it, watch readings arrive in
the website's live view within a few seconds, then browse that session in
the history view — all without the laptop dashboard or the collector's
local network involved.

- `supabase/migrations`: `sensor_arrays` table, `device_id` on `readings`,
  `register_device`/`ingest_readings` RPCs (device auth — see
  `shared/device-registration.md`), the `device_sessions` view and
  Realtime publication the pages below need, and (added after initially
  shipping with per-user accounts) fully-public RLS with no login —
  see `shared/device-registration.md`'s "No login".
- `collector/app/sync/worker.py`: calls `ingest_readings` with the
  device's id/API key instead of a raw table POST.
- `shared-ui`: chart components (`ThresholdLineChart`, `SensorGauge`,
  `SensorPanel`) and threshold/grouping logic extracted out of `dashboard`
  so `website` reuses them rather than duplicating.
- `website`: device registration/list (no login), a Realtime-fed live view
  (labeled near-real-time, not instant), a history view querying Supabase
  REST directly. `HashRouter`, deployed to GitHub Pages via
  `.github/workflows/deploy-website.yml`.
- Tests: `shared-ui` (pure logic), `website` (pure logic — `format.ts`);
  migration behavior verified by hand against local Postgres (RLS
  isolation, API-key auth, upsert idempotency), not just reviewed.

## M10 — Per-device calibration profiles (planned, not started)

Demo: calibrate a node with `calibrate_lag.py --save-params`, then open
that device's live view on the website: the dashed "(estimated)" line uses
the new calibration immediately, with no commit, push or redeploy. A second
device with the same `node_id` keeps its own calibration.

Why: lag calibrations (the time constants behind the estimated line, see the
README's "Lag-compensated estimates") live in
`shared-ui/src/config/lag-params.json`, keyed by `node_id` and built into
both frontends. That works for one bench rig per node name, but not for the
finished product with every node of every suit calibrated:

- `node_id` is only unique within one relay box: two suits that both have a
  `helmet-01` would share (overwrite) one calibration.
- Each calibration is a code change: commit, push and redeploy, by someone
  with repo access.
- Saving again overwrites the old values; past sessions can't be shown with
  the calibration that was valid at the time.
- The digital-twin team can't read calibrations.

Plan: a calibration becomes data attached to the registered device, stored
in Supabase per (device, node, sensor), newest one active, history kept.

- `supabase/migrations`: `device_calibrations` table — `device_id` (FK
  `sensor_arrays`), `node_id`, `sensor_type`, `params jsonb` (the same shape
  as today's `lag-params.json` entries: `model`, `tau` / `tau1` + `tau2` +
  `fast_share`, `window`, `min`, `max`, `part`, ...), `calibrated_at`,
  `calibrated_from`. Public read (same `using (true)` model as `readings`);
  no direct insert — a `save_calibration(device_id, api_key, node_id,
  sensor_type, params)` security-definer RPC that checks the device's API
  key exactly like `ingest_readings`. A view (or query) for the newest
  calibration per (device, node, sensor).
- BreadBoardTest `tools/calibrate_lag.py`: `--save-params --device <name>`
  uploads through that RPC using `collector/.env.<name>.local`
  (`SUPABASE_URL`/`KEY`, `COLLECTOR_DEVICE_ID`/`API_KEY`), instead of
  writing `lag-params.json`. Keep the saved run JSON so any run can be
  replayed and uploaded later.
- `shared-ui/src/lib/lagEstimate.ts`: take calibration as an input
  (`LiveEstimates` / `withEstimates` given a params lookup) instead of
  importing the JSON.
- `website`: load the device's calibrations alongside the device (live and
  history views); history could pick the calibration valid at the session's
  time.
- `collector`: fetch its own device's calibrations at startup, keep a local
  copy (SQLite) so it works offline, serve them on a REST endpoint;
  `dashboard` reads them from there.
- Migrate the existing `bench-01` entry into the breadboard device's profile
  (its `COLLECTOR_DEVICE_ID` is in `collector/.env.breadboard.local`), then
  retire `lag-params.json`.
- Tests: migration verified by hand against local Postgres from a completely
  empty database, with `pgcrypto` in an `extensions` schema like Supabase
  (see `supabase/README.md` — that layout difference caused the last
  migration bug): public read, RPC with right/wrong/deactivated key, newest
  wins. `shared-ui` estimator tests with injected params; collector tests
  for the fetch + offline cache with a mocked Supabase client.
- Deploy: the project owner applies the migration with `supabase db push`;
  the website change ships with it. Tell the digital-twin team the table
  exists (read-only for them, like `readings`).

Until then: calibrations go in `lag-params.json` keyed by `node_id`
(BreadBoardTest README, "Calibrate its lag"). A good CO2 run for
`explorir-01` (τ ≈ 11.7 s, 2026-11-13) is saved only on the bench laptop as
`BreadBoardTest/analysis/lagcal_explorir-01_20261113-114407.json`
(`analysis/` is gitignored); replay it into the new profile once it exists.
Its humidity half isn't usable (the sensor saturated near 87 %RH); redo
humidity with a smaller breath.
