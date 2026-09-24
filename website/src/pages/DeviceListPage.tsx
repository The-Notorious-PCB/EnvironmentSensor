import { Link } from "react-router-dom";
import { useDevices } from "../hooks/useDevices";
import { formatLastSeen } from "../lib/format";

export function DeviceListPage() {
  const { devices, loading, error } = useDevices();

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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
