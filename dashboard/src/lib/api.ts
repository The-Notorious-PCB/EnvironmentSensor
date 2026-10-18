import type { SessionSummary, StoredReading } from "../types/reading";

const API_BASE = (import.meta.env.VITE_COLLECTOR_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export function liveWebSocketUrl(): string {
  return `${API_BASE.replace(/^http/, "ws")}/ws/live`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return getJson<SessionSummary[]>("/sessions");
}

// The collector returns at most this many readings per request (its default
// `limit`), so a long session is fetched in pages; one request would cut the
// playback chart off partway through.
export const READINGS_PAGE_SIZE = 5000;

export async function fetchSessionReadings(sessionId: string): Promise<StoredReading[]> {
  const path = `/sessions/${encodeURIComponent(sessionId)}/readings`;
  const readings: StoredReading[] = [];
  for (let offset = 0; ; offset += READINGS_PAGE_SIZE) {
    const page = await getJson<StoredReading[]>(`${path}?limit=${READINGS_PAGE_SIZE}&offset=${offset}`);
    readings.push(...page);
    if (page.length < READINGS_PAGE_SIZE) return readings;
  }
}
