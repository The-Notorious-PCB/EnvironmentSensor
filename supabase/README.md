# supabase

Cloud schema for the project's Supabase backend — what
[`collector`](../collector)'s sync worker pushes into and
[`website`](../website) reads/subscribes to. See [CLAUDE.md](../CLAUDE.md)
for how this fits into the overall architecture and
[`shared/device-registration.md`](../shared/device-registration.md) for
the device-registration flow this schema implements (device auth only —
the site itself has no login, see that doc's "No login" section).

```
supabase/
  config.toml      Supabase CLI project config — local dev stack settings
  migrations/       versioned SQL migrations, applied in filename order
```

## Applying this

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli). Not
installed/run as part of this repo's setup — a real Supabase project (or
local Docker-based dev stack) is a prerequisite.

- **Local dev stack**: `supabase start` (needs Docker) brings up local
  Postgres + Auth + PostgREST using `config.toml`, then
  `supabase db reset` applies every migration in `migrations/` in order.
- **Deploying to a real hosted project**: `supabase link --project-ref
  <ref>` once, then `supabase db push` to apply new migrations.

## Auth

Not used by this schema anymore. `config.toml` still has an `[auth.email]`
block left over from when the website had per-user accounts (see
`20260925000000_remove_device_ownership.sql` and
`shared/device-registration.md`'s "No login") — it's harmless to leave
enabled on the project (nothing here depends on it one way or the other),
just no longer load-bearing. Device-to-cloud authentication (a device's
own API key, checked by `ingest_readings`) is unrelated to this and still
applies regardless of whether user auth is on.

## Migrations

Run in this order (filename timestamp order — `supabase db push`/`db reset`
already do this automatically; applying by hand in the SQL Editor, do them
in this sequence):

1. [`20260901000000_readings_table.sql`](migrations/20260901000000_readings_table.sql)
   — the base `readings` table (the cloud counterpart of the collector's
   local SQLite table). Everything else builds on this; it has an earlier
   timestamp specifically so it always applies first.
2. [`20260917120000_sensor_arrays_and_device_auth.sql`](migrations/20260917120000_sensor_arrays_and_device_auth.sql)
   — adds `sensor_arrays` (registered devices) and `readings.device_id`,
   Row Level Security on both tables, and the `register_device` /
   `ingest_readings` functions that implement the registration and
   API-key-authenticated sync flow. **Read
   [`shared/device-registration.md`](../shared/device-registration.md)
   before applying this against a collector that's already syncing** — it
   changes what the collector's current (anon-key) sync calls are allowed
   to do.
3. [`20260924120000_device_sessions_and_realtime.sql`](migrations/20260924120000_device_sessions_and_realtime.sql)
   — adds the `device_sessions` view (derived session summaries, since
   session metadata itself isn't synced — see `collector/README.md`'s "Not
   synced yet") and Realtime replication on `readings`, both needed by
   `website`'s history and live pages.
4. [`20260925000000_remove_device_ownership.sql`](migrations/20260925000000_remove_device_ownership.sql)
   — removes the website's login system: drops `sensor_arrays.owner_id`
   and the owner-scoped RLS policies from migration 2, replaces them with
   fully-public ones, and makes `register_device` callable by anyone (no
   `auth.uid()` check). See `shared/device-registration.md`'s "No login".

All four verified by hand against a local Postgres 16 instance, applied
in order **from a completely empty database** (register a device with no
login, ingest with correct/wrong/deactivated keys, confirm `owner_id` is
actually gone, public read/update access, `device_sessions` aggregation,
Realtime publication, `device_id` FK enforcement, `api_key_hash` still
never selectable even with public access) — not just checked for SQL
syntax. Each migration was caught failing at least once during this
verification before being fixed (a missing base table, a REVOKE
referencing an already-dropped column) — "from a completely empty
database" specifically is what surfaces these, since a database that
already has leftover state from manual testing can mask a migration
depending on something no migration actually creates.
