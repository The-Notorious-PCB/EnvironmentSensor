import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ReadingRow } from "../types";

export interface UseSessionReadings {
  readings: ReadingRow[];
  loading: boolean;
  error: string | null;
}

/** Readings for one session, queried directly via Supabase REST (RLS
 * scopes this to the caller's own devices).
 */
export function useSessionReadings(sessionId: string | null): UseSessionReadings {
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setReadings([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("readings")
      .select("id, session_id, node_id, sensor_type, value, unit, timestamp, seq, device_id")
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setReadings((data ?? []) as ReadingRow[]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { readings, loading, error };
}
