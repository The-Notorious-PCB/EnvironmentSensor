-- delete_device: lets the website's device list remove a registered device
-- along with every reading it recorded.
--
-- Open to anyone (anon included), like delete_session and the rest of the
-- site — see shared/device-registration.md's "No login". The website puts
-- a confirmation dialog in front of it; there's no other check. It's
-- permanent: the readings are gone for the digital-twin team too, and the
-- device's API key stops working at once (ingest_readings finds no
-- device), so its collector logs a failed sync every cycle until it's
-- given a newly registered device's ID and key.
--
-- Readings are deleted explicitly first. readings.device_id's foreign key
-- is `on delete set null`, so deleting only the sensor_arrays row would
-- leave its readings behind with no device, invisible on the website.
--
-- Raises (and so deletes nothing) if the device doesn't exist, so the
-- website can tell the user instead of reporting success.

create or replace function delete_device(p_device_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from readings where device_id = p_device_id;
  get diagnostics v_count = row_count;

  delete from sensor_arrays where id = p_device_id;
  if not found then
    raise exception 'device not found' using errcode = 'P0002';
  end if;

  return v_count;
end;
$$;

revoke all on function delete_device(uuid) from public;
grant execute on function delete_device(uuid) to anon, authenticated;

comment on function delete_device(uuid) is
  'Deletes one device and every reading it recorded; returns how many '
  'readings. Open to anyone (anon included), no login, like the rest of '
  'the site. See shared/device-registration.md.';
