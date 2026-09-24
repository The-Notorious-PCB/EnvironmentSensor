import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { SensorArrayRow } from "../types";

export interface UseDevices {
  devices: SensorArrayRow[];
  loading: boolean;
  error: string | null;
}

/** The logged-in user's registered devices. RLS on `sensor_arrays` (see
 * supabase/migrations) scopes this to `owner_id = auth.uid()` automatically
 * — no explicit filter needed here.
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

  return { devices, loading, error };
}
