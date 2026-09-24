# Device registration & cloud sync authentication

How a physical relay-box device gets registered and how the collector
proves it's allowed to push that device's readings to Supabase. There are
no user accounts — the website is fully public (see "No login" below) —
this doc is entirely about *device* identity, which is unrelated to and
unaffected by that.

Implemented by
[`supabase/migrations/20260917120000_sensor_arrays_and_device_auth.sql`](../supabase/migrations/20260917120000_sensor_arrays_and_device_auth.sql),
[`20260924120000_device_sessions_and_realtime.sql`](../supabase/migrations/20260924120000_device_sessions_and_realtime.sql),
and
[`20260925000000_remove_device_ownership.sql`](../supabase/migrations/20260925000000_remove_device_ownership.sql).

## No login

The website has no accounts, no sign-up/log-in pages, nothing gating
access. Anyone with the site URL can see every registered device and its
readings, register a new device, or rename/deactivate any existing one.

This is a deliberate simplification, not an oversight: the original design
had per-user accounts (`sensor_arrays.owner_id` → `auth.users`, RLS scoping
each user to their own devices), which the third migration above removes.
For a small-team/capstone project with no real need to keep different
people's data apart, that was pure friction — a login step nobody needed,
protecting data from nobody in particular. If that ever changes (multiple
independent teams sharing one Supabase project, say), the removed
ownership model is straightforward to reintroduce: re-add `owner_id`,
swap the `using (true)` policies back to `using (owner_id = auth.uid())`,
require a session in `register_device` again.

**What this doesn't affect:** device-to-cloud authentication. A device
still needs its own `device_id` + API key to push readings — see below.
That was always independent of user login (the collector was never a
"logged-in user"), which is exactly why removing login didn't touch
`ingest_readings` or `verify_device_api_key` at all.

## What's implemented

- The `sensor_arrays` table, `device_id` on `readings`, Row Level
  Security (now fully public rather than owner-scoped), and the three
  Postgres functions (`register_device`, `verify_device_api_key`,
  `ingest_readings`) — from `supabase/migrations`.
- The collector side: `collector/app/sync/worker.py` calls
  `ingest_readings(device_id, api_key, readings)` over
  `/rest/v1/rpc/ingest_readings`, reading `device_id`/`api_key` from
  `COLLECTOR_DEVICE_ID`/`COLLECTOR_API_KEY` (see
  [`collector/README.md`](../collector/README.md#cloud-sync-supabase)).
  Sync cycles run every 3s by default so the website can show a
  near-real-time view.
- The website: [`website`](../website) has the full flow — a registration
  page that calls `register_device` (no login needed) and shows the API
  key once, a device list (status, `last_seen_at`), a Realtime-fed live
  view, and a history view backed by the `device_sessions` view. Deployed
  to GitHub Pages via `.github/workflows/deploy-website.yml`.
- `device_sessions` (a view, not a table — session metadata itself still
  isn't synced, see `collector/README.md`'s "Not synced yet") and Realtime
  replication on `readings` — what the website's history and live pages
  actually query/subscribe to.

**Not yet implemented:** API key rotation — losing an API key means
registering a new device, there's no rotate-in-place RPC.

## The flow

1. **Anyone registers a device** on the website, e.g. "Helmet Array 1"
   with a suit config description
   (`website/src/pages/RegisterDevicePage.tsx` calling
   `supabase.rpc('register_device', {...})`, no session required). The
   function:
   - generates a random 32-byte API key and a fresh device `id` (both
     server-side — the client never supplies either),
   - hashes the key with bcrypt (`pgcrypto`'s `crypt()` /
     `gen_salt('bf')`) and stores only the hash in
     `sensor_arrays.api_key_hash`,
   - inserts the `sensor_arrays` row,
   - **returns the plaintext API key in the response — once.** It is
     never stored anywhere in plaintext, so it cannot be shown again;
     losing it means registering a new device (no rotate-in-place yet).

2. **The website shows the device_id + API key once**, with a "copy this
   now" warning, the same UX pattern as a GitHub PAT or Stripe secret key.

3. **Whoever's setting up the physical relay box configures the laptop
   collector** with those two values, as `COLLECTOR_DEVICE_ID` and
   `COLLECTOR_API_KEY` env vars (see
   [`collector/README.md`](../collector/README.md#cloud-sync-supabase)).

4. **The collector's cloud sync worker authenticates by calling
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
   embeddable key the collector and website both use. The device's
   identity comes entirely from the `(device_id, api_key)` pair checked
   *inside* the function. Even though `readings`/`sensor_arrays` are now
   publicly readable, they still have no direct-INSERT policy for
   anyone — `ingest_readings` is the only way to write a reading, and it's
   the only thing standing between "public read access" and "anyone can
   fabricate sensor data for any device."

## Why a `security definer` RPC instead of RLS + direct inserts

The collector was never going to be a Supabase Auth user — it has no JWT,
no `auth.uid()`, regardless of whether the website has logins. RLS alone
can't express "only whoever knows this device's API key." Two designs were
possible:

- **This one**: a `security definer` Postgres function that verifies the
  API key itself and then writes with its own (elevated) privileges,
  called over PostgREST's `/rest/v1/rpc/ingest_readings`.
- **A Supabase Edge Function** (Deno/TypeScript) sitting in front of
  PostgREST, doing the same check before writing with a service-role
  client.

Went with the RPC: it's plain SQL (fits the migrations, no new Deno
runtime/deploy step), and it keeps the credential-checking logic next to
the data it's protecting. The tradeoff is that the check logic lives in
PL/pgSQL rather than TypeScript — fine for something this size, worth
revisiting if the auth logic grows more complex than "hash matches and
status is active."

## Security notes

- `api_key_hash` is never returned by any query — this held true before
  removing login and still holds true after. `sensor_arrays`' column
  grants are an explicit allowlist of the other columns, so a future
  column added to the table is excluded by default until someone
  deliberately grants it, rather than needing a revoke to be remembered.
- The API key is generated and hashed **inside** `register_device`, never
  client-supplied — a caller can't choose (or downgrade) their own key.
- `verify_device_api_key` has no grants to any role; it's only reachable
  through `ingest_readings`'s internal call, so it can't be used directly
  as an oracle to probe whether a given `device_id` exists.
- A device's `status` can be flipped to `'inactive'` (anyone can now do
  this — see "No login" above) to immediately revoke it —
  `ingest_readings` checks status on every call, so this takes effect
  without needing to also invalidate the key itself. Note this also means
  anyone can deactivate *any* device, not just their own (there's no
  "own" anymore) — an accepted tradeoff of the fully-public model, not an
  oversight.
