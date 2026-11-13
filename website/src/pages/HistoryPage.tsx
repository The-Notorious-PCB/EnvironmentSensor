import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { groupBySensorAndNode, SENSOR_TYPES, THRESHOLDS, ThresholdLineChart, withEstimates } from "shared-ui";
import { useDevices } from "../hooks/useDevices";
import { useDeviceSessions } from "../hooks/useDeviceSessions";
import { useSessionReadings } from "../hooks/useSessionReadings";
import { downloadCsv, readingsToCsv, sessionCsvFilename } from "../lib/csv";
import { formatSessionLabel } from "../lib/format";

// A session whose last reading is this recent may still be recording.
const STILL_RECORDING_MS = 2 * 60 * 1000;

export function HistoryPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, loading: devicesLoading } = useDevices();
  const {
    sessions,
    loading: sessionsLoading,
    error: sessionsError,
    deleteSession,
  } = useDeviceSessions(deviceId);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const { readings, loading: readingsLoading, error: readingsError } = useSessionReadings(
    selectedSessionId,
  );

  const grouped = useMemo(() => withEstimates(groupBySensorAndNode(readings)), [readings]);
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
  const selectedSession = sessions.find((s) => s.session_id === selectedSessionId);
  // Readings can briefly belong to the previously selected session while
  // the new one loads; only offer the CSV once they match.
  const readingsReady =
    !readingsLoading && readings.length > 0 && readings[0].session_id === selectedSessionId;

  function selectSession(sessionId: string | null) {
    setSelectedSessionId(sessionId);
    setDeleteError(null);
    setDeleteNotice(null);
  }

  function handleDownloadCsv() {
    if (!selectedSession || !readingsReady) return;
    downloadCsv(sessionCsvFilename(device?.name, selectedSession.start_time), readingsToCsv(readings));
  }

  async function handleDelete() {
    if (!selectedSession) return;
    const label = formatSessionLabel(selectedSession);
    const mayBeRecording = Date.now() - new Date(selectedSession.end_time).getTime() < STILL_RECORDING_MS;
    const message =
      `Delete this session${device ? ` of ${device.name}` : ""}?\n\n${label}\n\n` +
      "This permanently removes its readings from the cloud database for everyone, " +
      "including the digital-twin team. It can't be undone. " +
      "(The laptop collector's own copy is not affected.)" +
      (mayBeRecording
        ? "\n\nIts last reading is under 2 minutes old, so it may still be recording: " +
          "readings that arrive after the delete will show up again as this session."
        : "");
    if (!window.confirm(message)) return;

    setDeleting(true);
    setDeleteError(null);
    setDeleteNotice(null);
    try {
      const deleted = await deleteSession(selectedSession.session_id);
      setSelectedSessionId(null);
      setDeleteNotice(`Deleted the session from ${new Date(selectedSession.start_time).toLocaleString()} (${deleted} readings).`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  }

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
            onChange={(event) => selectSession(event.target.value || null)}
          >
            <option value="">Select a session…</option>
            {sessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
          {selectedSession && (
            <>
              <button
                type="button"
                className="button"
                onClick={handleDownloadCsv}
                disabled={!readingsReady || deleting}
                title="Every raw reading of this session, one row per reading"
              >
                Download CSV
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete session"}
              </button>
            </>
          )}
        </div>
      )}

      {deleteNotice && <p className="notice">{deleteNotice}</p>}
      {deleteError && <p className="error">Could not delete the session: {deleteError}</p>}
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
