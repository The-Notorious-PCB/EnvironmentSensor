import type { DeviceSessionRow } from "../types";

export function formatLastSeen(value: string | null, now: Date = new Date()): string {
  if (!value) return "never";
  const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(value).toLocaleString();
}

export function formatSessionLabel(session: DeviceSessionRow): string {
  const started = new Date(session.start_time).toLocaleString();
  return `${started} — ${session.reading_count} readings`;
}
