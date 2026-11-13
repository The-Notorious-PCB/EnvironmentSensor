-- delete_session: lets the website's History page delete one recorded
-- session (every `readings` row with that session_id for that device).
--
-- Open to anyone (anon included), like everything else on the site — see
-- shared/device-registration.md's "No login". The website puts a
-- confirmation dialog in front of it; there's no other check. Deleting is
-- permanent: there's no soft-delete or trash, and the digital-twin team
-- reading `readings` over REST loses the rows too.
--
-- Why an RPC rather than a DELETE policy + grant on `readings`: a table
-- grant would let any anon REST call delete any rows matching any filter
-- (every reading in one request). The function only ever deletes one
-- session of one device per call, which is all the website needs.
--
-- The collector's SQLite copy is untouched (it's the source of truth for
-- the session, see CLAUDE.md). Rows it already synced stay marked synced,
-- so they don't come back. Deleting a session that's still recording
-- removes what's arrived so far, and later readings arrive as normal.

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
  return v_count;
end;
$$;

revoke all on function delete_session(uuid, text) from public;
grant execute on function delete_session(uuid, text) to anon, authenticated;

comment on function delete_session(uuid, text) is
  'Deletes every reading of one session of one device; returns how many. '
  'Open to anyone (anon included), no login, like the rest of the site. '
  'See shared/device-registration.md.';
