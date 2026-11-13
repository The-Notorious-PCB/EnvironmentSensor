-- Makes sensor_arrays' column grants actually be an allowlist on Supabase,
-- so api_key_hash is no longer readable with the anon key.
--
-- 20260917120000_... and 20260925000000_... grant SELECT/UPDATE on named
-- columns only, so that api_key_hash is never selectable (see
-- shared/device-registration.md's "Security notes"). But Supabase's
-- default privileges also grant anon and authenticated *every* privilege
-- on each new table in `public`, at table level. A table-level SELECT
-- covers every column, so on the live project
-- `GET /rest/v1/sensor_arrays?select=api_key_hash` returned the hashes
-- (found 2026-11-13). Plain Postgres, where the earlier migrations were
-- verified, has no such default, which is why it went unnoticed. The same
-- default let anon DELETE/INSERT on the table directly (RLS stopped any
-- row from matching, since no policy allows either).
--
-- Fix: drop everything, then grant back exactly what the site needs.
-- Revoking a table-level privilege also revokes the matching column
-- privileges, hence re-granting the column lists after.
--
-- Any new table in `public` gets the same default, so a new migration
-- that wants column-level or read-only access must revoke first, as here
-- and in 20261113130000_readings_read_only_grants.sql.

revoke all on sensor_arrays from anon, authenticated;

grant select (id, name, suit_config, status, last_seen_at, created_at)
  on sensor_arrays to anon, authenticated;
grant update (name, suit_config, status)
  on sensor_arrays to anon, authenticated;
