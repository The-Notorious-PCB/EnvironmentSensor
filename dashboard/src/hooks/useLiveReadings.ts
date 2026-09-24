import { useEffect, useRef, useState } from "react";
import type { SeriesByNode } from "shared-ui";
import { liveWebSocketUrl } from "../lib/api";
import type { LiveReading, SensorType } from "../types/reading";

const HISTORY_LIMIT = 60; // points kept per (sensor_type, node_id) for the rolling chart
const RECONNECT_DELAY_MS = 2000;

export interface UseLiveReadings {
  latest: Partial<Record<SensorType, LiveReading>>;
  history: Partial<Record<SensorType, SeriesByNode>>;
  connected: boolean;
}

/** Connects to the collector's /ws/live endpoint, keeping the most recent
 * reading per sensor type and a rolling history per (sensor_type, node_id)
 * for charting. Reconnects with a fixed delay on drop — mirrors the
 * collector's own serial-reader reconnect philosophy: a dropped connection
 * is expected, not fatal.
 */
export function useLiveReadings(): UseLiveReadings {
  const [latest, setLatest] = useState<Partial<Record<SensorType, LiveReading>>>({});
  const [history, setHistory] = useState<Partial<Record<SensorType, SeriesByNode>>>({});
  const [connected, setConnected] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      socket = new WebSocket(liveWebSocketUrl());

      socket.onopen = () => {
        if (!cancelledRef.current) setConnected(true);
      };

      socket.onclose = () => {
        if (cancelledRef.current) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        let reading: LiveReading;
        try {
          reading = JSON.parse(event.data);
        } catch {
          return; // malformed message — drop it, don't crash the feed
        }

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
      };
    }

    connect();

    return () => {
      cancelledRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { latest, history, connected };
}
