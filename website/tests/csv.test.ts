import { describe, expect, it } from "vitest";
import { readingsToCsv, sessionCsvFilename } from "../src/lib/csv";
import type { ReadingRow } from "../src/types";

const reading = (overrides: Partial<ReadingRow> = {}): ReadingRow => ({
  id: 1,
  session_id: "s1",
  node_id: "helmet-01",
  sensor_type: "co2",
  value: 812.4,
  unit: "ppm",
  timestamp: "2026-09-17T14:03:21.482Z",
  seq: 10432,
  device_id: "d1",
  ...overrides,
});

describe("readingsToCsv", () => {
  it("writes a header and one line per reading, in order", () => {
    const csv = readingsToCsv([reading(), reading({ id: 2, sensor_type: "humidity", value: 41, unit: "%RH", seq: 10433 })]);
    expect(csv.split("\r\n")).toEqual([
      "timestamp,session_id,device_id,node_id,sensor_type,value,unit,seq",
      "2026-09-17T14:03:21.482Z,s1,d1,helmet-01,co2,812.4,ppm,10432",
      "2026-09-17T14:03:21.482Z,s1,d1,helmet-01,humidity,41,%RH,10433",
      "",
    ]);
  });

  it("writes only the header for no readings", () => {
    expect(readingsToCsv([])).toBe("timestamp,session_id,device_id,node_id,sensor_type,value,unit,seq\r\n");
  });

  it("quotes fields containing commas, quotes or newlines", () => {
    const csv = readingsToCsv([reading({ unit: 'a,"b"\nc' })]);
    expect(csv).toContain(',"a,""b""\nc",');
  });

  it("leaves out the internal row id", () => {
    expect(readingsToCsv([reading({ id: 987654 })])).not.toContain("987654");
  });
});

describe("sessionCsvFilename", () => {
  it("combines a cleaned device name with the UTC start time", () => {
    expect(sessionCsvFilename("Helmet Array 1", "2026-09-24T12:00:05.123Z")).toBe(
      "Helmet-Array-1_2026-09-24T12-00-05Z.csv",
    );
  });

  it("falls back when the device name is unknown or has no usable characters", () => {
    expect(sessionCsvFilename(undefined, "2026-09-24T12:00:00Z")).toBe("device_2026-09-24T12-00-00Z.csv");
    expect(sessionCsvFilename("///", "2026-09-24T12:00:00Z")).toBe("device_2026-09-24T12-00-00Z.csv");
  });
});
