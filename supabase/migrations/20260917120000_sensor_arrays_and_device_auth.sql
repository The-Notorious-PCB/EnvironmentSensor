-- Device registration + API-key-authenticated sync.
-- See shared/device-registration.md for the end-to-end flow this implements.
--
-- Assumes the `readings` table already exists per collector/README.md's
-- "Expected Supabase table schema":
--
--   create table readings (
--     id bigint generated always as identity primary key,
--     session_id text not null,
--     node_id text not null,
--     sensor_type text not null,
--     value double precision not null,
--     unit text not null,
--     timestamp timestamptz not null,
--     seq bigint not null,
--     synced_at timestamptz not null default now(),
--     unique (session_id, node_id, seq)
--   );
--
-- Also assumes Supabase Auth is enabled with email/password sign-up
-- (Authentication -> Providers -> Email in the dashboard, or
-- supabase/config.toml's [auth.email] locally) — that's what provisions
-- `auth.users` and `auth.uid()`, which this migration depends on.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- sensor_arrays: one row per registered relay-box device.
-- ---------------------------------------------------------------------

create table sensor_arrays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  suit_config text,
  owner_id uuid not null references auth.users (id) on delete cascade,
  api_key_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_sensor_arrays_owner_id on sensor_arrays (owner_id);

comment on table sensor_arrays is
  'Registered relay-box devices. api_key_hash is a bcrypt hash (pgcrypto '
  'crypt()/gen_salt(''bf'')) of the one-time-shown API key issued at '
  'registration — see register_device(). Never store or expose the '
  'plaintext key.';

-- ---------------------------------------------------------------------
-- readings: tag rows with which device wrote them.
-- ---------------------------------------------------------------------

alter table readings
  add column device_id uuid references sensor_arrays (id) on delete set null;

create index idx_readings_device_id on readings (device_id);

comment on column readings.device_id is
  'Nullable for backward compatibility with pre-device-auth rows and the '
  'current collector, which does not send it yet — see '
  'shared/device-registration.md''s "Impact on the existing collector".';

-- ---------------------------------------------------------------------
-- Row Level Security.
--
-- Neither table gets a direct INSERT policy for anon/authenticated: device
-- registration and reading ingestion both go through the security definer
-- functions below, which enforce ownership/API-key checks themselves and
-- then write with the privileges of their owner, bypassing RLS. This is
-- deliberate — it's the only way api_key_hash gets set (server-generated,
-- never client-supplied) and the only way a device's identity is verified
-- before its readings are accepted.
-- ---------------------------------------------------------------------

alter table sensor_arrays enable row level security;
alter table readings enable row level security;

create policy "owners can view their own devices"
  on sensor_arrays for select
  to authenticated
  using (owner_id = auth.uid());

create policy "owners can update their own devices"
  on sensor_arrays for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners can read readings from their own devices"
  on readings for select
  to authenticated
  using (
    device_id is not null
    and exists (
      select 1 from sensor_arrays
      where sensor_arrays.id = readings.device_id
        and sensor_arrays.owner_id = auth.uid()
    )
  );

-- api_key_hash is never selectable, even by the device's owner, even
-- through their own RLS-permitted row — column grants are an allowlist
-- (everything else on the table), not a revoke-after-the-fact, so a new
-- column added later is excluded by default until someone deliberately
-- grants it.
grant select (id, name, suit_config, owner_id, status, last_seen_at, created_at)
  on sensor_arrays to authenticated;
grant update (name, suit_config, status)
  on sensor_arrays to authenticated;

-- readings has no secret column like api_key_hash, so a plain table-level
-- grant is fine here — RLS (above) is what actually restricts which rows
-- come back. Without this GRANT, the RLS policy never even gets evaluated:
-- Postgres checks table-level privileges first and denies before RLS runs.
grant select on readings to authenticated;

-- ---------------------------------------------------------------------
-- register_device: called by the website (logged-in user) to provision a
-- new device. Returns the plaintext API key exactly once — the website
-- must show it to the user immediately and never persist it client-side;
-- it cannot be retrieved again afterwards, only rotated (see below).
-- ---------------------------------------------------------------------

create or replace function register_device(p_name text, p_suit_config text default null)
returns table (device_id uuid, api_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api_key text;
  v_device_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated to register a device'
      using errcode = '28000';
  end if;

  v_api_key := encode(gen_random_bytes(32), 'hex');
  v_device_id := gen_random_uuid();

  insert into sensor_arrays (id, name, suit_config, owner_id, api_key_hash, status)
  values (v_device_id, p_name, p_suit_config, auth.uid(), crypt(v_api_key, gen_salt('bf')), 'active');

  return query select v_device_id, v_api_key;
end;
$$;

revoke all on function register_device(text, text) from public;
grant execute on function register_device(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- verify_device_api_key: internal helper, not granted to anyone directly —
-- only reachable via ingest_readings below (a security definer function
-- calling another runs as the *owner's* privileges, so no external grant
-- is needed here; keeping it ungranted means it can't be probed directly
-- as an oracle for guessing valid device_ids).
-- ---------------------------------------------------------------------

create or replace function verify_device_api_key(p_device_id uuid, p_api_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_status text;
begin
  select api_key_hash, status into v_hash, v_status
  from sensor_arrays
  where id = p_device_id;

  if v_hash is null then
    return false;
  end if;

  if v_status <> 'active' then
    return false;
  end if;

  return v_hash = crypt(p_api_key, v_hash);
end;
$$;

revoke all on function verify_device_api_key(uuid, text) from public;

-- ---------------------------------------------------------------------
-- ingest_readings: what the collector's cloud sync worker calls instead of
-- POSTing to /rest/v1/readings directly. Verifies (device_id, api_key)
-- against api_key_hash, upserts the batch (same on_conflict semantics as
-- the collector's current direct-POST path), and stamps last_seen_at.
--
-- p_readings shape matches the collector's existing sync payload exactly
-- (see collector/app/sync/worker.py's _reading_payload) — a future
-- collector update wraps that same array in {device_id, api_key, readings}
-- rather than reshaping it.
-- ---------------------------------------------------------------------

create or replace function ingest_readings(p_device_id uuid, p_api_key text, p_readings jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not verify_device_api_key(p_device_id, p_api_key) then
    raise exception 'invalid device_id or api_key' using errcode = '28000';
  end if;

  insert into readings (session_id, node_id, sensor_type, value, unit, "timestamp", seq, device_id)
  select
    r->>'session_id',
    r->>'node_id',
    r->>'sensor_type',
    (r->>'value')::double precision,
    r->>'unit',
    (r->>'timestamp')::timestamptz,
    (r->>'seq')::bigint,
    p_device_id
  from jsonb_array_elements(p_readings) as r
  on conflict (session_id, node_id, seq) do update set
    value = excluded.value,
    unit = excluded.unit,
    "timestamp" = excluded."timestamp",
    device_id = excluded.device_id;

  get diagnostics v_count = row_count;

  update sensor_arrays set last_seen_at = now() where id = p_device_id;

  return v_count;
end;
$$;

revoke all on function ingest_readings(uuid, text, jsonb) from public;
grant execute on function ingest_readings(uuid, text, jsonb) to anon, authenticated;
