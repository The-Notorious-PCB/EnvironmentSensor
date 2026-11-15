-- sessions: the collector's session details (name, subject, suit config,
-- notes, start/end), so the website's History page can show a session's
-- name instead of only its start time. Until now only `readings` were
-- synced, and `device_sessions` derived everything from them.
--
-- Written only through upsert_session below, which checks the device's API
-- key exactly like ingest_readings: a device can only describe its own
-- sessions. Readable by anyone, like the rest of the site (see
-- shared/device-registration.md's "No login").
--
-- One row per (device_id, session_id). device_id cascades, so delete_device
-- removes a device's sessions too; delete_session is updated below to
-- remove the session's row along with its readings.

create table sessions (
  device_id uuid not null references sensor_arrays (id) on delete cascade,
  session_id text not null,
  name text,
  subject_id text,
  suit_config text,
  notes text,
  start_time timestamptz,
  end_time timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, session_id)
);

alter table sessions enable row level security;

create policy "anyone can read sessions"
  on sessions for select
  to anon, authenticated
  using (true);

-- Supabase grants anon/authenticated every privilege on new public tables
-- (see supabase/README.md, migrations 7 and 8): take it all back, then
-- allow reads only.
revoke all on sessions from anon, authenticated;
grant select on sessions to anon, authenticated;

comment on table sessions is
  'Session details synced from the collector (name, subject, suit config, '
  'notes, start/end). Written only via upsert_session (device API key). '
  'Join to readings on (device_id, session_id).';

-- ---------------------------------------------------------------------
-- upsert_session: the collector's sync worker sends each new or changed
-- session (started, stopped) here. p_session is the collector's session
-- row as JSON: session_id, name, subject_id, suit_config, notes,
-- start_time, end_time (missing keys become null).
-- ---------------------------------------------------------------------

create or replace function upsert_session(p_device_id uuid, p_api_key text, p_session jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_device_api_key(p_device_id, p_api_key) then
    raise exception 'invalid device_id or api_key' using errcode = '28000';
  end if;

  if coalesce(p_session->>'session_id', '') = '' then
    raise exception 'session_id is required' using errcode = '22023';
  end if;

  insert into sessions (device_id, session_id, name, subject_id, suit_config, notes, start_time, end_time)
  values (
    p_device_id,
    p_session->>'session_id',
    nullif(p_session->>'name', ''),
    p_session->>'subject_id',
    p_session->>'suit_config',
    p_session->>'notes',
    (p_session->>'start_time')::timestamptz,
    (p_session->>'end_time')::timestamptz
  )
  on conflict (device_id, session_id) do update set
    name = excluded.name,
    subject_id = excluded.subject_id,
    suit_config = excluded.suit_config,
    notes = excluded.notes,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    updated_at = now();
end;
$$;

revoke all on function upsert_session(uuid, text, jsonb) from public;
grant execute on function upsert_session(uuid, text, jsonb) to anon, authenticated;

comment on function upsert_session(uuid, text, jsonb) is
  'Creates or updates one session''s details for a device; checks the '
  'device API key like ingest_readings. Called by the collector''s sync worker.';

-- ---------------------------------------------------------------------
-- device_sessions gains `name` (null for sessions recorded before this, or
-- started without one). Columns can only be appended to a view, so it goes
-- last. Still security_invoker, so it reads `sessions` with the caller's
-- (public read) access.
-- ---------------------------------------------------------------------

create or replace view device_sessions
with (security_invoker = true) as
select
  r.session_id,
  r.device_id,
  min(r."timestamp") as start_time,
  max(r."timestamp") as end_time,
  count(*) as reading_count,
  s.name
from readings r
left join sessions s
  on s.device_id = r.device_id
 and s.session_id = r.session_id
where r.device_id is not null
group by r.session_id, r.device_id, s.name;

-- ---------------------------------------------------------------------
-- delete_session: same as 20261113120000_delete_session.sql, plus the
-- session's row in `sessions`.
-- ---------------------------------------------------------------------

create or replace function delete_session(p_device_id uuid, p_session_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from readings
  where device_id = p_device_id
    and session_id = p_session_id;

  get diagnostics v_count = row_count;

  delete from sessions
  where device_id = p_device_id
    and session_id = p_session_id;

  return v_count;
end;
$$;
