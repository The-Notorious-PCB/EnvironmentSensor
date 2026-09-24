import { useEffect, useState } from "react";
import { fetchSessionReadings } from "../lib/api";
import type { StoredReading } from "../types/reading";

export interface UseSessionReadings {
  readings: StoredReading[];
  loading: boolean;
  error: string | null;
}

export function useSessionReadings(sessionId: string | null): UseSessionReadings {
  const [readings, setReadings] = useState<StoredReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setReadings([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSessionReadings(sessionId)
      .then((data) => {
        if (!cancelled) setReadings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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
