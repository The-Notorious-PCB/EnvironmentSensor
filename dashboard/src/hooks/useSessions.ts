import { useEffect, useState } from "react";
import { fetchSessions } from "../lib/api";
import type { SessionSummary } from "../types/reading";

export interface UseSessions {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
}

export function useSessions(): UseSessions {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSessions()
      .then((data) => {
        if (!cancelled) setSessions(data);
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
  }, []);

  return { sessions, loading, error };
}
