-- Makes `readings` read-only for anon/authenticated at the grant level,
-- not just through RLS.
--
-- Supabase's default privileges grant anon and authenticated every
-- privilege on new tables in `public`, so a direct DELETE (or INSERT/
-- UPDATE) on `readings` over REST was accepted and then matched zero rows,
-- because RLS has no policy allowing it. That's safe, but only as long as
-- nobody adds such a policy. With these grants revoked the request is
-- refused outright ("permission denied"), whatever the policies say.
--
-- Writes still work where they should: ingest_readings and delete_session
-- are security definer functions, so they run with their owner's
-- privileges, not the caller's. Reads (REST, the device_sessions view,
-- Realtime) only need SELECT, which stays granted.

revoke insert, update, delete, truncate on readings from anon, authenticated;
