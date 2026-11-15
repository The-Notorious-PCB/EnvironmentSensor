import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { DeviceSessionRow } from "../types";

export interface UseDeviceSessions {
  sessions: DeviceSessionRow[];
  loading: boolean;
  error: string | null;
  /** Permanently deletes the session's readings from Supabase (the
   * `delete_session` RPC) and drops it from `sessions`. Resolves to the
   * number of readings deleted; rejects with the RPC's error message. */
  deleteSession: (sessionId: string) => Promise<number>;
}

/** Past sessions for one device, from the `device_sessions` view (readings
 * grouped by session, plus the session's name; see supabase/migrations).
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
      // "*" rather than a column list, so the page still loads on a database
      // without the sessions migration (no `name` column yet).
      .select("*")
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

  const deleteSession = useCallback(
    async (sessionId: string): Promise<number> => {
      if (!deviceId) throw new Error("no device selected");
      // Open to anyone, no login (supabase/migrations/20261113120000_delete_session.sql);
      // the History page confirms first.
      const { data, error: rpcError } = await supabase.rpc("delete_session", {
        p_device_id: deviceId,
        p_session_id: sessionId,
      });
      if (rpcError) throw new Error(rpcError.message);
      setSessions((current) => current.filter((session) => session.session_id !== sessionId));
      return (data as number | null) ?? 0;
    },
    [deviceId],
  );

  return { sessions, loading, error, deleteSession };
}
