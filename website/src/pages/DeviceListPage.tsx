import { useState } from "react";
import { Link } from "react-router-dom";
import { useDevices } from "../hooks/useDevices";
import { formatLastSeen } from "../lib/format";
import type { SensorArrayRow } from "../types";

export function DeviceListPage() {
  const { devices, loading, error, removeDevice } = useDevices();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeNotice, setRemoveNotice] = useState<string | null>(null);

  async function handleRemove(device: SensorArrayRow) {
    const message =
      `Remove the device "${device.name}"?\n\n` +
      "This permanently deletes the device and every session and reading it recorded " +
      "from the cloud database, for everyone, including the digital-twin team. " +
      "It can't be undone. (The laptop collector's own copy is not affected.)\n\n" +
      "Its API key stops working immediately: to record with this relay box again, " +
      "register it as a new device and update its collector settings.";
    if (!window.confirm(message)) return;

    setRemovingId(device.id);
    setRemoveError(null);
    setRemoveNotice(null);
    try {
      const deleted = await removeDevice(device.id);
      setRemoveNotice(`Removed "${device.name}" and its ${deleted} readings.`);
    } catch (removeFailure) {
      setRemoveError(
        `Could not remove "${device.name}": ` +
          (removeFailure instanceof Error ? removeFailure.message : String(removeFailure)),
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Sensor arrays</h2>
        <Link to="/register" className="button">
          Register a device
        </Link>
      </div>

      {loading && <p>Loading devices…</p>}
      {error && <p className="error">Could not load devices: {error}</p>}
      {removeNotice && <p className="notice">{removeNotice}</p>}
      {removeError && <p className="error">{removeError}</p>}
      {!loading && !error && devices.length === 0 && <p>No devices registered yet.</p>}

      {devices.length > 0 && (
        <table className="device-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Last seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td>{device.name}</td>
                <td>
                  <span className={`status-badge status-${device.status}`}>{device.status}</span>
                </td>
                <td>{formatLastSeen(device.last_seen_at)}</td>
                <td className="device-actions">
                  <Link to={`/live/${device.id}`}>Live</Link>
                  {" · "}
                  <Link to={`/history/${device.id}`}>History</Link>
                  {" · "}
                  <button
                    type="button"
                    className="link-button link-button-danger"
                    onClick={() => handleRemove(device)}
                    disabled={removingId !== null}
                  >
                    {removingId === device.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
