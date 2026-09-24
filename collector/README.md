# collector

Python + FastAPI service that runs on the laptop. See
[CLAUDE.md](../CLAUDE.md) for the full architecture and rationale.

```
app/
  config.py     env-configurable settings (serial port/baud, DB URL, Supabase)
  database.py   SQLModel engine setup
  state.py      SessionManager — tracks the one active session, if any
  broadcast.py  BroadcastManager — fans live readings out to WS clients
  writer.py     drains the queue: SQLite insert + broadcast
  main.py       FastAPI app factory, wires everything together in lifespan
  serial/       pyserial reader (background thread) + NDJSON/CRC parsing —
                validates against shared/packet-schema.json
  models/       SQLModel table + packet schema definitions (source of
                truth: SQLite)
  api/          FastAPI routes — REST (sessions/readings/health) + the
                /ws/live WebSocket
  sync/         background worker: pushes unsynced readings to Supabase
                via the device-authenticated ingest_readings RPC
tests/
```

Run it: `uvicorn app.main:app --reload` from this directory (needs a real
serial port at `COLLECTOR_SERIAL_PORT`, or see below to run without one).

Env vars (see `app/config.py`): `COLLECTOR_SERIAL_PORT`,
`COLLECTOR_SERIAL_BAUDRATE`, `COLLECTOR_DATABASE_URL`,
`COLLECTOR_DASHBOARD_ORIGINS` (comma-separated CORS allowlist for the
dashboard's origin — defaults to Vite's dev-server ports,
`http://localhost:5173,http://127.0.0.1:5173`; without this, the browser
silently blocks every dashboard request to this API), plus the cloud sync
vars below.

Run the tests: `pytest` from this directory (needs the `dev` extra —
`pip install -e ".[dev]"`).

Implements PLAN.md milestones M1–M5 (packet schema, SQLite storage, serial
ingestion, WebSocket live feed, cloud sync) plus the session/readings REST
API.

## Cloud sync (Supabase)

`app/sync/worker.py` runs as a background task alongside the API: every
`COLLECTOR_SYNC_INTERVAL_SECONDS` (default **3s** — short on purpose, so
the cloud-hosted website shows a near-real-time view rather than lagging a
full cycle behind) it queries SQLite for readings with `synced = false`,
and calls the **`ingest_readings` Postgres RPC** — not a raw table
insert — with a batch of up to `COLLECTOR_SYNC_BATCH_SIZE` (default 500) of
them, tagged with this collector's `device_id`. It only flips `synced` to
true for rows in a batch that actually got a successful response. A batch
that fails (network blip, Supabase down, bad credentials) is retried with
exponential backoff (via `tenacity`) within that cycle; if it's still
failing after 5 attempts, those rows stay unsynced and are retried on the
next cycle — that's what makes this tolerant of intermittent connectivity
rather than losing data on a dropped connection.

Device identity and authorization both happen inside `ingest_readings`,
not in this code — see
[`shared/device-registration.md`](../shared/device-registration.md) for
the full registration flow and why it's designed this way. This worker's
job is just: know its own `device_id`/`api_key`, send them on every call,
and handle retry/backoff. The function itself, on a successful call:
- tags every row in the batch with `device_id`,
- upserts on `(session_id, node_id, seq)` (same idempotency guarantee the
  old direct-insert path had, now inside the function instead of a
  PostgREST `on_conflict` query param),
- stamps `sensor_arrays.last_seen_at = now()` for this device.

None of that needs separate handling here — a successful RPC call means
all three already happened server-side.

**Sync is skipped entirely** (with a startup log warning, not an error)
unless *all four* of `SUPABASE_URL`, `SUPABASE_KEY`, `COLLECTOR_DEVICE_ID`,
and `COLLECTOR_API_KEY` are set — local dev without a registered device
works fine, it just doesn't sync.

### Env vars

| Var | Default | Notes |
|---|---|---|
| `SUPABASE_URL` | *(unset)* | e.g. `https://xxxx.supabase.co` |
| `SUPABASE_KEY` | *(unset)* | the project's **anon key** — not service-role; `ingest_readings` does its own authorization via device_id/api_key, the anon key alone grants nothing (see the migration's RLS/grants) |
| `COLLECTOR_DEVICE_ID` | *(unset)* | issued by `register_device()` at registration — see device-registration.md |
| `COLLECTOR_API_KEY` | *(unset)* | the plaintext key shown once at registration; never persisted server-side, only `api_key_hash` is |
| `SUPABASE_INGEST_FUNCTION` | `ingest_readings` | RPC function name, in case it's ever renamed/versioned |
| `COLLECTOR_SYNC_INTERVAL_SECONDS` | `3` | pause between sync cycles |
| `COLLECTOR_SYNC_BATCH_SIZE` | `500` | max rows per call |

### Where the schema lives

The `readings`/`sensor_arrays` tables, RLS policies, and the
`ingest_readings` function this worker calls are defined in
[`supabase/migrations`](../supabase/migrations), not here — see that
directory and [`shared/device-registration.md`](../shared/device-registration.md)
for the schema and the full registration/auth flow.

**Not synced yet:** `sessions` metadata (`subject_id`, `suit_config`, etc.)
isn't pushed to Supabase — only `readings`. A consumer reading straight from
Supabase today sees readings tagged with a `session_id` but no session
details to look it up against. That's fine for now since the only
documented consumer (the digital-twin team, see
[CLAUDE.md](../CLAUDE.md#for-the-digital-twin-team)) only needs the sensor
stream, but worth flagging if that changes.
