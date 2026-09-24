-- Adds what the website's History and Live pages need on top of
-- 20260917120000_sensor_arrays_and_device_auth.sql:
--   1. device_sessions — a derived view of "sessions" for a device, since
--      session metadata (subject_id, suit_config, etc.) isn't synced to
--      Supabase, only readings (see collector/README.md's "Not synced yet").
--      A history/playback UI still needs *something* to list and pick
--      from, so this groups readings into session summaries instead.
--   2. Realtime replication on `readings`, so the website's Live page can
--      subscribe to new rows via supabase-js's postgres_changes.
--
-- See shared/device-registration.md and website/README.md for how these
-- are used.

-- ---------------------------------------------------------------------
-- device_sessions: one row per (session_id, device_id), summarizing the
-- readings in that session.
--
-- `security_invoker = true` (Postgres 15+) is the reason this doesn't need
-- its own RLS policy or grants: it makes the view execute with the
-- *querying user's* privileges against the underlying `readings` table,
-- not the view owner's — so it automatically inherits the
-- "owners can read readings from their own devices" policy from the prior
-- migration. Without it, a view runs as its owner by default, which would
-- bypass RLS entirely and leak every user's sessions to every other user.
-- ---------------------------------------------------------------------

create view device_sessions
with (security_invoker = true) as
select
  session_id,
  device_id,
  min("timestamp") as start_time,
  max("timestamp") as end_time,
  count(*) as reading_count
from readings
where device_id is not null
group by session_id, device_id;

grant select on device_sessions to authenticated;

comment on view device_sessions is
  'Derived session summaries for the website''s history view — readings '
  'grouped by (session_id, device_id). security_invoker=true so it '
  'inherits readings'' RLS policy from the querying user rather than '
  'running as the view owner.';

-- ---------------------------------------------------------------------
-- Realtime: add `readings` to the publication Supabase's Realtime server
-- watches for postgres_changes. Every Supabase project has this
-- publication pre-created by the platform; this just adds our table to it
-- (idempotent — a second run against a project that already has it added
-- would error, hence the existence check).
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'readings'
  ) then
    alter publication supabase_realtime add table readings;
  end if;
end
$$;
