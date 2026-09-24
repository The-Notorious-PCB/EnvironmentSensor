import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupBySensorAndNode, SENSOR_TYPES, THRESHOLDS, ThresholdLineChart } from "shared-ui";
import { useDevices } from "../hooks/useDevices";
import { useDeviceSessions } from "../hooks/useDeviceSessions";
import { useSessionReadings } from "../hooks/useSessionReadings";
import { formatSessionLabel } from "../lib/format";

export function HistoryPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, loading: devicesLoading } = useDevices();
  const { sessions, loading: sessionsLoading, error: sessionsError } = useDeviceSessions(deviceId);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { readings, loading: readingsLoading, error: readingsError } = useSessionReadings(
    selectedSessionId,
  );

  const grouped = useMemo(() => groupBySensorAndNode(readings), [readings]);
  const sensorsWithData = SENSOR_TYPES.filter((sensorType) => grouped[sensorType]);

  if (!deviceId) {
    return (
      <div>
        <h2>History</h2>
        {devicesLoading && <p>Loading devices…</p>}
        {!devicesLoading && devices.length === 0 && (
          <p>
            No devices yet — <Link to="/register">register one</Link> first.
          </p>
        )}
        {devices.length > 0 && (
          <ul className="device-picker">
            {devices.map((device) => (
              <li key={device.id}>
                <Link to={`/history/${device.id}`}>{device.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const device = devices.find((d) => d.id === deviceId);

  return (
    <div>
      <h2>History{device ? `: ${device.name}` : ""}</h2>

      {sessionsLoading && <p>Loading sessions…</p>}
      {sessionsError && <p className="error">Could not load sessions: {sessionsError}</p>}
      {!sessionsLoading && sessions.length === 0 && !sessionsError && (
        <p>No sessions recorded for this device yet.</p>
      )}

      {sessions.length > 0 && (
        <div className="playback-controls">
          <label htmlFor="session-select">Session</label>
          <select
            id="session-select"
            value={selectedSessionId ?? ""}
            onChange={(event) => setSelectedSessionId(event.target.value || null)}
          >
            <option value="">Select a session…</option>
            {sessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedSessionId && readingsLoading && <p>Loading readings…</p>}
      {readingsError && <p className="error">Could not load readings: {readingsError}</p>}

      {sensorsWithData.length > 0 && (
        <div className="sensor-grid">
          {sensorsWithData.map((sensorType) => (
            <div key={sensorType} className="sensor-panel">
              <h3>{THRESHOLDS[sensorType].label}</h3>
              <ThresholdLineChart sensorType={sensorType} seriesByNode={grouped[sensorType]!} height={220} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
