import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { SensorArrayRow } from "../types";

export interface UseDevices {
  devices: SensorArrayRow[];
  loading: boolean;
  error: string | null;
  /** Permanently deletes the device and every reading it recorded (the
   * `delete_device` RPC) and drops it from `devices`. Resolves to the
   * number of readings deleted; rejects with the RPC's error message. */
  removeDevice: (deviceId: string) => Promise<number>;
}

/** Every registered device — the site is fully public, no per-user
 * scoping (see shared/device-registration.md). RLS on `sensor_arrays`
 * still applies (see supabase/migrations), it just allows everyone.
 */
export function useDevices(): UseDevices {
  const [devices, setDevices] = useState<SensorArrayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("sensor_arrays")
      .select("id, name, suit_config, status, last_seen_at, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setDevices(data ?? []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const removeDevice = useCallback(async (deviceId: string): Promise<number> => {
    // Open to anyone, no login (supabase/migrations/20261113150000_delete_device.sql);
    // the device list confirms first.
    const { data, error: rpcError } = await supabase.rpc("delete_device", { p_device_id: deviceId });
    if (rpcError) throw new Error(rpcError.message);
    setDevices((current) => current.filter((device) => device.id !== deviceId));
    return (data as number | null) ?? 0;
  }, []);

  return { devices, loading, error, removeDevice };
}
