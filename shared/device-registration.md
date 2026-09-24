# Device registration & cloud sync authentication

How a physical relay-box device gets tied to a website account, and how the
collector proves it's allowed to push that device's readings to Supabase.
Implemented by
[`supabase/migrations/20260917120000_sensor_arrays_and_device_auth.sql`](../supabase/migrations/20260917120000_sensor_arrays_and_device_auth.sql)
and
[`20260924120000_device_sessions_and_realtime.sql`](../supabase/migrations/20260924120000_device_sessions_and_realtime.sql).

## What's implemented now vs. not yet

**Implemented:**
- The `sensor_arrays` table, `device_id` on `readings`, Row Level
  Security, and the three Postgres functions (`register_device`,
  `verify_device_api_key`, `ingest_readings`) — from
  `supabase/migrations`.
- The collector side: `collector/app/sync/worker.py` calls
  `ingest_readings(device_id, api_key, readings)` over
  `/rest/v1/rpc/ingest_readings`, reading `device_id`/`api_key` from
  `COLLECTOR_DEVICE_ID`/`COLLECTOR_API_KEY` (see
  [`collector/README.md`](../collector/README.md#cloud-sync-supabase)).
  Sync cycles run every 3s by default (was 10s) so the website can show a
  near-real-time view.
- The website itself: [`website`](../website) has the full flow — sign
  up/log in (Supabase Auth), a registration page that calls
  `register_device` and shows the API key once, a device list (status,
  `last_seen_at`), a Realtime-fed live view, and a history view backed by
  the `device_sessions` view (see below). Deployed to GitHub Pages via
  `.github/workflows/deploy-website.yml`.
- `device_sessions` (a view, not a table — session metadata itself still
  isn't synced, see `collector/README.md`'s "Not synced yet") and Realtime
  replication on `readings`, both from the second migration above — what
  the website's history and live pages actually query/subscribe to.

**Not yet implemented:**
- Supabase Auth's email/password provider needs to be turned on for the
  actual hosted project this migration runs against (Dashboard →
  Authentication → Providers → Email — `supabase/config.toml`'s
  `[auth.email] enable_signup = true` only governs the local CLI dev
  stack, see `supabase/README.md`) — that's what provisions `auth.users`
  and `auth.uid()`, which the migration depends on but doesn't itself turn
  on.
- API key rotation (see below) and the two migrations themselves haven't
  been applied to a real hosted Supabase project — verified locally
  against Postgres 16 (see `supabase/README.md`), not against the actual
  production project.
- Key rotation: losing an API key means registering a new device, there's
  no rotate-in-place RPC yet.

## The flow

1. **A user signs up / logs in** on the website using Supabase Auth
   (email/password). This gives their browser a Supabase session (JWT)
   with their `auth.uid()`.

2. **They register a device**, e.g. "Helmet Array 1" with a suit config
   description, by calling the `register_device(name, suit_config)`
   Postgres function as themselves (`supabase.rpc('register_device', {...})`
   using their logged-in session). The function:
   - generates a random 32-byte API key and a fresh device `id` (both
     server-side — the client never supplies either),
   - hashes the key with bcrypt (`pgcrypto`'s `crypt()` /
     `gen_salt('bf')`) and stores only the hash in
     `sensor_arrays.api_key_hash`,
   - inserts the `sensor_arrays` row with `owner_id = auth.uid()`,
   - **returns the plaintext API key in the response — once.** It is
     never stored anywhere in plaintext, so it cannot be shown again;
     losing it means issuing a new device registration (there's no
     rotate-in-place yet, see "Not yet implemented").

3. **The website shows the device_id + API key to the user once**
   (`website/src/pages/RegisterDevicePage.tsx`), with a "copy this now"
   warning, the same UX pattern as a GitHub PAT or Stripe secret key.

4. **The user configures the laptop collector** with those two values, as
   `COLLECTOR_DEVICE_ID` and `COLLECTOR_API_KEY` env vars (see
   [`collector/README.md`](../collector/README.md#cloud-sync-supabase)).

5. **The collector's cloud sync worker authenticates by calling
   `ingest_readings(device_id, api_key, readings)`** — a Postgres RPC, not
   a direct table insert. Internally it:
   - looks up `sensor_arrays` by `device_id`,
   - checks `status = 'active'`,
   - verifies `api_key` against the stored `api_key_hash` via `crypt()`,
   - if all pass: upserts the batch into `readings` on
     `(session_id, node_id, seq)` with `device_id` set, and stamps
     `sensor_arrays.last_seen_at = now()`,
   - if not: raises an error and inserts nothing.

   This runs with the Postgres **`anon` key** — the same public,
   embeddable key the collector already uses, not a per-user login. The
   device's identity comes entirely from the `(device_id, api_key)` pair
   checked *inside* the function, not from who's calling it. Neither
   `sensor_arrays` nor `readings` grants `anon` any direct table access —
   `ingest_readings` is the only door in for that role.

## Why a `security definer` RPC instead of RLS + direct inserts

The collector isn't a Supabase Auth user — it has no JWT, no `auth.uid()`.
Supabase's usual RLS pattern (`using (owner_id = auth.uid())`) has nothing
to check for a device. Two designs were possible:

- **This one**: a `security definer` Postgres function that verifies the
  API key itself and then writes with its own (elevated) privileges,
  called over PostgREST's `/rest/v1/rpc/ingest_readings`.
- **A Supabase Edge Function** (Deno/TypeScript) sitting in front of
  PostgREST, doing the same check before writing with a service-role
  client.

Went with the RPC: it's plain SQL (fits this migration, no new Deno
runtime/deploy step), and it keeps the credential-checking logic next to
the data it's protecting. The tradeoff is that the check logic lives in
PL/pgSQL rather than TypeScript — fine for something this size, worth
revisiting if the auth logic grows more complex than "hash matches and
status is active."

## Migrating an already-deployed collector

If a collector out there is still on an older build (raw
`POST /rest/v1/readings`, `SUPABASE_URL`/`SUPABASE_KEY` only) and this
migration gets applied to the Supabase project it talks to, its sync
breaks the moment that happens — `readings` gets RLS enabled with no
direct-INSERT policy for `anon`/`authenticated`:

- If its `SUPABASE_KEY` was the **anon key**: every POST starts being
  rejected by RLS. Sync silently stops — retry/backoff just keeps
  retrying a call that can never succeed, and readings pile up unsynced
  with no exception surfacing past a logged warning.
- If it was the **service-role key**: service_role bypasses RLS, so
  inserts keep working, just without `device_id` (stays `NULL`) or
  per-device revocation.

**Fix**: update to the current build, register the device
(`register_device` via the website — not built yet, see above — or
directly via `psql`/the SQL editor in the meantime), and set
`COLLECTOR_DEVICE_ID`/`COLLECTOR_API_KEY` alongside `SUPABASE_URL` (project
URL) and `SUPABASE_KEY` (**switch this to the anon key** if it was
service-role — `ingest_readings` does its own authorization, so
service-role is unnecessary privilege for this worker to hold). See
[`collector/README.md`](../collector/README.md#cloud-sync-supabase) for
the full env var list.

## Security notes

- `api_key_hash` is never returned by any query — not to the owning user,
  not to anyone. `sensor_arrays`' column grants are an explicit allowlist
  of the other columns, so a future column added to the table is excluded
  by default until someone deliberately grants it, rather than needing a
  revoke to be remembered.
- The API key is generated and hashed **inside** `register_device`, never
  client-supplied — a caller can't choose (or downgrade) their own key.
- `verify_device_api_key` has no grants to any role; it's only reachable
  through `ingest_readings`'s internal call, so it can't be used directly
  as an oracle to probe whether a given `device_id` exists.
- A device's `status` can be flipped to `'inactive'` (via the owner's
  `UPDATE` grant on `sensor_arrays`) to immediately revoke it —
  `ingest_readings` checks status on every call, so this takes effect
  without needing to also invalidate the key itself.
