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

export function fetchSessionReadings(sessionId: string): Promise<StoredReading[]> {
  return getJson<StoredReading[]>(`/sessions/${encodeURIComponent(sessionId)}/readings`);
}
