import { useMemo, useState } from "react";
import { groupBySensorAndNode, SENSOR_TYPES, THRESHOLDS, ThresholdLineChart } from "shared-ui";
import { useSessionReadings } from "../hooks/useSessionReadings";
import { useSessions } from "../hooks/useSessions";

function formatSessionLabel(session: { subject_id: string; start_time: string; end_time: string | null }): string {
  const started = new Date(session.start_time).toLocaleString();
  const status = session.end_time ? "" : " (in progress)";
  return `${session.subject_id} — ${started}${status}`;
}

export function PlaybackView() {
  const { sessions, loading: sessionsLoading, error: sessionsError } = useSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { readings, loading: readingsLoading, error: readingsError } = useSessionReadings(selectedId);

  const grouped = useMemo(() => groupBySensorAndNode(readings), [readings]);
  const sensorsWithData = SENSOR_TYPES.filter((sensorType) => grouped[sensorType]);

  return (
    <div>
      <div className="playback-controls">
        <label htmlFor="session-select">Session</label>
        <select
          id="session-select"
          value={selectedId ?? ""}
          onChange={(event) => setSelectedId(event.target.value || null)}
        >
          <option value="">Select a session…</option>
          {sessions.map((session) => (
            <option key={session.session_id} value={session.session_id}>
              {formatSessionLabel(session)}
            </option>
          ))}
        </select>
      </div>

      {sessionsLoading && <p>Loading sessions…</p>}
      {sessionsError && <p className="error">Could not load sessions: {sessionsError}</p>}

      {selectedId && readingsLoading && <p>Loading readings…</p>}
      {readingsError && <p className="error">Could not load readings: {readingsError}</p>}
      {selectedId && !readingsLoading && readings.length === 0 && !readingsError && (
        <p>No readings recorded for this session.</p>
      )}

      {selectedId && sensorsWithData.length > 0 && (
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
