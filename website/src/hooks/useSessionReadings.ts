import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ReadingRow } from "../types";

export interface UseSessionReadings {
  readings: ReadingRow[];
  loading: boolean;
  error: string | null;
}

// Supabase returns at most this many rows per request (the project's API
// "max rows" setting, 1000 by default), so a session longer than that has to
// be fetched in pages or the chart silently stops partway through.
const PAGE_SIZE = 1000;

const COLUMNS = "id, session_id, node_id, sensor_type, value, unit, timestamp, seq, device_id";

async function fetchAllReadings(sessionId: string): Promise<ReadingRow[]> {
  const rows: ReadingRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("readings")
      .select(COLUMNS)
      .eq("session_id", sessionId)
      // id breaks timestamp ties (several sensors share a timestamp), so page
      // boundaries are stable and no row is skipped or repeated.
      .order("timestamp", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ReadingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Every reading for one session, queried directly via Supabase REST. Rows
 * are publicly readable (see shared/device-registration.md, "No login").
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

    fetchAllReadings(sessionId)
      .then((rows) => {
        if (!cancelled) setReadings(rows);
      })
      .catch((fetchError: Error) => {
        if (!cancelled) setError(fetchError.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { readings, loading, error };
}
