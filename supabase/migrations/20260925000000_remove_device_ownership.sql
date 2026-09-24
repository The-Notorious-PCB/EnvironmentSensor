-- Removes the website's login system. Per-user accounts and per-user
-- ownership of devices are gone — the site is now fully public: anyone
-- with the URL can see every registered device and its readings, and
-- anyone can register a new device. No login step anywhere.
--
-- This is a deliberate simplification for a small-team/capstone project
-- with no real need to keep different users' data apart — see
-- shared/device-registration.md for the reasoning.
--
-- Forward migration on top of 20260917120000_sensor_arrays_and_device_auth.sql
-- (which introduced owner_id/RLS-by-owner) and
-- 20260924120000_device_sessions_and_realtime.sql. Doesn't touch
-- ingest_readings/verify_device_api_key — device-to-cloud auth (API key
-- per device) was always separate from user login and is unaffected by
-- removing the latter.

-- ---------------------------------------------------------------------
-- Drop the owner-scoped policies and the ownership column itself.
-- ---------------------------------------------------------------------

drop policy "owners can view their own devices" on sensor_arrays;
drop policy "owners can update their own devices" on sensor_arrays;
drop policy "owners can read readings from their own devices" on readings;

alter table sensor_arrays drop column owner_id;

-- ---------------------------------------------------------------------
-- Fully public policies in their place. RLS stays enabled (rather than
-- disabling it outright) so the "anyone can do this" behavior is explicit
-- and easy to tighten again later if per-user scoping ever comes back,
-- rather than being an absence of any rule at all.
-- ---------------------------------------------------------------------

create policy "anyone can view devices"
  on sensor_arrays for select
  to anon, authenticated
  using (true);

create policy "anyone can update devices"
  on sensor_arrays for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "anyone can read readings"
  on readings for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Grants: owner_id is gone from the column list, and `anon` now needs
-- everything `authenticated` had, since there's no more distinction
-- between a logged-in and anonymous visitor. (owner_id is already dropped
-- by this point, so it can't appear in either column list below — trying
-- to revoke a privilege on a column that no longer exists is an error,
-- not a no-op.)
-- ---------------------------------------------------------------------

revoke select (id, name, suit_config, status, last_seen_at, created_at)
  on sensor_arrays from authenticated;
revoke update (name, suit_config, status)
  on sensor_arrays from authenticated;

grant select (id, name, suit_config, status, last_seen_at, created_at)
  on sensor_arrays to anon, authenticated;
grant update (name, suit_config, status)
  on sensor_arrays to anon, authenticated;

grant select on readings to anon;
grant select on device_sessions to anon;

-- ---------------------------------------------------------------------
-- register_device: no longer requires auth.uid() or sets owner_id.
-- Still security definer (still needs to generate + hash the API key
-- server-side, and a plain client can't run pgcrypto's crypt()/gen_salt()
-- against a column it has no write access to), just no login check.
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
  v_api_key := encode(gen_random_bytes(32), 'hex');
  v_device_id := gen_random_uuid();

  insert into sensor_arrays (id, name, suit_config, api_key_hash, status)
  values (v_device_id, p_name, p_suit_config, crypt(v_api_key, gen_salt('bf')), 'active');

  return query select v_device_id, v_api_key;
end;
$$;

revoke all on function register_device(text, text) from public;
grant execute on function register_device(text, text) to anon, authenticated;

comment on function register_device(text, text) is
  'Open to anyone (anon included) — no login required. Generates and '
  'hashes the API key server-side and returns the plaintext once. See '
  'shared/device-registration.md.';
