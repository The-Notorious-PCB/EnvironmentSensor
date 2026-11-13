import type { ReadingRow } from "../types";

/** Columns in the order they appear in the CSV: one row per reading, the
 * same long format as the `readings` table (see shared/packet-schema.md),
 * so a CSV and a REST export of the same session line up column for column.
 * Raw readings only: the chart's dashed "(estimated)" line is computed in
 * the display and isn't part of the stored record.
 */
export const CSV_COLUMNS = [
  "timestamp",
  "session_id",
  "device_id",
  "node_id",
  "sensor_type",
  "value",
  "unit",
  "seq",
] as const satisfies readonly (keyof ReadingRow)[];

function escapeField(value: unknown): string {
  const text = value == null ? "" : String(value);
  // RFC 4180: quote a field containing a comma, quote or line break, and
  // double any quotes inside it.
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function readingsToCsv(readings: readonly ReadingRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const reading of readings) {
    lines.push(CSV_COLUMNS.map((column) => escapeField(reading[column])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** `<device name>_<session start, UTC>.csv`, safe as a file name on any OS. */
export function sessionCsvFilename(deviceName: string | undefined, startTime: string): string {
  const device = (deviceName ?? "device").trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "device";
  const start = new Date(startTime).toISOString().slice(0, 19).replace(/:/g, "-");
  return `${device}_${start}Z.csv`;
}

/** Hands the browser a CSV file to save. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
