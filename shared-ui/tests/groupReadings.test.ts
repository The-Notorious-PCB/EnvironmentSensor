import { describe, expect, it } from "vitest";
import { groupBySensorAndNode } from "../src/lib/groupReadings";
import type { MinimalReading } from "../src/types";

function reading(overrides: Partial<MinimalReading>): MinimalReading {
  return {
    node_id: "helmet-01",
    sensor_type: "co2",
    value: 800,
    timestamp: "2026-09-17T14:00:00Z",
    ...overrides,
  };
}

describe("groupBySensorAndNode", () => {
  it("groups readings by sensor_type then node_id, preserving order", () => {
    const readings = [
      reading({ sensor_type: "co2", node_id: "helmet-01", value: 800, timestamp: "t1" }),
      reading({ sensor_type: "co2", node_id: "helmet-01", value: 810, timestamp: "t2" }),
      reading({ sensor_type: "co2", node_id: "chest-01", value: 790, timestamp: "t1" }),
      reading({ sensor_type: "temperature", node_id: "helmet-01", value: 22, timestamp: "t1" }),
    ];

    const grouped = groupBySensorAndNode(readings);

    expect(Object.keys(grouped).sort()).toEqual(["co2", "temperature"]);
    expect(grouped.co2?.["helmet-01"]).toEqual([
      { timestamp: "t1", value: 800 },
      { timestamp: "t2", value: 810 },
    ]);
    expect(grouped.co2?.["chest-01"]).toEqual([{ timestamp: "t1", value: 790 }]);
    expect(grouped.temperature?.["helmet-01"]).toEqual([{ timestamp: "t1", value: 22 }]);
  });

  it("returns an empty object for an empty input", () => {
    expect(groupBySensorAndNode([])).toEqual({});
  });

  it("works with extra fields present (structural typing — a full app reading row still satisfies MinimalReading)", () => {
    const fullRow = {
      id: 1,
      session_id: "s1",
      node_id: "helmet-01",
      sensor_type: "co2" as const,
      value: 800,
      unit: "ppm",
      timestamp: "t1",
      seq: 1,
      synced: false,
    };

    const grouped = groupBySensorAndNode([fullRow]);
    expect(grouped.co2?.["helmet-01"]).toEqual([{ timestamp: "t1", value: 800 }]);
  });
});
