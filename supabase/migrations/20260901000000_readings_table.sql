-- Base `readings` table — the cloud counterpart of the collector's local
-- SQLite table (see shared/packet-schema.md and
-- collector/README.md#cloud-sync-supabase). Every later migration
-- (device auth, RLS, device_sessions, Realtime) builds on top of this one,
-- so it must run first — hence the earlier timestamp in this filename.
--
-- This was previously only documented as an example SQL block in
-- collector/README.md, meant to be copy-pasted by hand before the device
-- migrations would run — that's fragile (exactly what broke: running
-- 20260917120000_... on a fresh project fails with "relation readings
-- does not exist" if this step was skipped). Now it's a real migration,
-- so `supabase/migrations` is the complete, ordered source of truth for
-- the schema — nothing to do out-of-band first.

create table readings (
  id bigint generated always as identity primary key,
  session_id text not null,
  node_id text not null,
  sensor_type text not null,
  value double precision not null,
  unit text not null,
  timestamp timestamptz not null,
  seq bigint not null,
  synced_at timestamptz not null default now(),
  unique (session_id, node_id, seq)
);

comment on table readings is
  'One sensor reading, synced from a collector''s local SQLite via the
  ingest_readings RPC (see 20260917120000_sensor_arrays_and_device_auth.sql).
  Field meanings match shared/packet-schema.md.';
