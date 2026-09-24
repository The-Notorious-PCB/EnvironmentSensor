# supabase

Cloud schema and auth config for the project's Supabase backend — what
[`collector`](../collector)'s sync worker pushes into, and what a future
registration website would authenticate users against. See
[CLAUDE.md](../CLAUDE.md) for how this fits into the overall architecture
and [`shared/device-registration.md`](../shared/device-registration.md) for
the device-registration/auth flow this schema implements.

```
supabase/
  config.toml      Supabase CLI project config — local dev stack settings,
                    including email/password auth (see below)
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

Email/password sign-up is configured in `config.toml`'s `[auth.email]`
block (`enable_signup = true`) — that's what `local dev stack` setting
governs. **For the hosted project**, the equivalent must be turned on
separately in the Supabase dashboard (Authentication → Providers → Email),
since `config.toml` only drives the local CLI stack unless explicitly
pushed with `supabase config push`. Decide there whether to require email
confirmation before a user can register a device (`config.toml` disables
it for local dev convenience only — see the comment in that file).

No other auth providers (OAuth, magic link, etc.) are configured — just
email/password, per the current ask.

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

All three verified by hand against a local Postgres 16 instance, applied
in order **from a completely empty database** (register a device, ingest
with correct/wrong/deactivated keys, cross-user RLS isolation, `device_id`
FK enforcement, `device_sessions` aggregation and RLS inheritance, Realtime
publication) — not just checked for SQL syntax. The "from empty" part
matters: migration 1 was added after the other two were first tested
against a database that already happened to have a hand-created `readings`
table sitting in it, which masked that they depended on it and had no
migration actually creating it.
