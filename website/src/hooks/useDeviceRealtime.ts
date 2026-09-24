import { useEffect, useState } from "react";
import type { SeriesByNode, SensorType } from "shared-ui";
import { supabase } from "../lib/supabaseClient";
import type { ReadingRow } from "../types";

const HISTORY_LIMIT = 60; // points kept per (sensor_type, node_id) for the rolling chart

export interface UseDeviceRealtime {
  latest: Partial<Record<SensorType, ReadingRow>>;
  history: Partial<Record<SensorType, SeriesByNode>>;
  /** True once the Realtime channel is actually subscribed — not the same
   * as "receiving data": a quiet device can be subscribed with no readings
   * yet. False also covers "still connecting" and "dropped, retrying".
   */
  connected: boolean;
}

/** Subscribes to new `readings` rows for one device via Supabase Realtime
 * (`postgres_changes` on INSERT). This is near-real-time, not instant —
 * Realtime's own replication lag plus the collector's own sync interval
 * (3s by default, see collector/README.md) mean a reading is typically a
 * few seconds old by the time it arrives here. Label any UI built on this
 * accordingly (see LiveViewPage).
 *
 * Relies on `readings`' RLS SELECT policy also gating Realtime's
 * postgres_changes stream for the signed-in user's JWT — see
 * shared/device-registration.md.
 */
export function useDeviceRealtime(deviceId: string | undefined): UseDeviceRealtime {
  const [latest, setLatest] = useState<Partial<Record<SensorType, ReadingRow>>>({});
  const [history, setHistory] = useState<Partial<Record<SensorType, SeriesByNode>>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setLatest({});
    setHistory({});
    setConnected(false);

    if (!deviceId) return;

    const channel = supabase
      .channel(`readings-device-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "readings",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const reading = payload.new as ReadingRow;
          setLatest((prev) => ({ ...prev, [reading.sensor_type]: reading }));
          setHistory((prev) => {
            const bySensor = prev[reading.sensor_type] ?? {};
            const nodeSeries = bySensor[reading.node_id] ?? [];
            const updated = [
              ...nodeSeries,
              { timestamp: reading.timestamp, value: reading.value },
            ].slice(-HISTORY_LIMIT);
            return {
              ...prev,
              [reading.sensor_type]: { ...bySensor, [reading.node_id]: updated },
            };
          });
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  return { latest, history, connected };
}
