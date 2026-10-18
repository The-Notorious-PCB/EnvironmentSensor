-- Fixes "function gen_random_bytes(integer) does not exist" on
-- register_device (and the same underlying problem in
-- verify_device_api_key, not yet hit but broken the same way).
--
-- Supabase installs pgcrypto into a dedicated `extensions` schema, not
-- `public` (unlike a vanilla local Postgres install, where `create
-- extension pgcrypto` with no schema clause lands in `public` — which is
-- why this passed local verification against plain Postgres 16 but broke
-- on the real project). Both functions were declared with
-- `set search_path = public`, so pgcrypto's gen_random_bytes()/crypt()/
-- gen_salt() were never resolvable — PL/pgSQL doesn't check function
-- bodies for unresolvable names at CREATE time, only at call time, so the
-- earlier migrations applied without error and the bug only surfaced on
-- the first real register_device call.
--
-- Fix: search both schemas. This is Supabase's own documented pattern for
-- security definer functions that use pgcrypto, and is harmless if
-- pgcrypto happens to be in `public` instead (as in local/non-Supabase
-- Postgres) — `extensions` just won't have anything relevant to find
-- there, search_path silently skips on to `public`.

create or replace function register_device(p_name text, p_suit_config text default null)
returns table (device_id uuid, api_key text)
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function verify_device_api_key(p_device_id uuid, p_api_key text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
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

-- create or replace preserves existing grants, but re-stating them here
-- costs nothing and removes any doubt.
grant execute on function register_device(text, text) to anon, authenticated;
