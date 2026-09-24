import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { DeviceSessionRow } from "../types";

export interface UseDeviceSessions {
  sessions: DeviceSessionRow[];
  loading: boolean;
  error: string | null;
}

/** Past sessions for one device, derived from the `device_sessions` view
 * (grouped from `readings` — see supabase/migrations, and
 * collector/README.md's "Not synced yet" note on why session metadata
 * itself isn't available here).
 */
export function useDeviceSessions(deviceId: string | undefined): UseDeviceSessions {
  const [sessions, setSessions] = useState<DeviceSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) {
      setSessions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("device_sessions")
      .select("session_id, device_id, start_time, end_time, reading_count")
      .eq("device_id", deviceId)
      .order("start_time", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setSessions(data ?? []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  return { sessions, loading, error };
}
