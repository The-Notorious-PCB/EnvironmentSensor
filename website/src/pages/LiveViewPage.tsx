import { Link, useParams } from "react-router-dom";
import { SENSOR_TYPES, SensorPanel } from "shared-ui";
import { useDeviceRealtime } from "../hooks/useDeviceRealtime";
import { useDevices } from "../hooks/useDevices";

export function LiveViewPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, loading: devicesLoading } = useDevices();
  const { latest, history, connected } = useDeviceRealtime(deviceId);

  if (!deviceId) {
    return (
      <div>
        <h2>Live view</h2>
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
                <Link to={`/live/${device.id}`}>{device.name}</Link>
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
      <h2>Live view{device ? `: ${device.name}` : ""}</h2>
      <p className="near-real-time-notice">
        Near-real-time — readings typically arrive a few seconds after being
        recorded on the device, not instantly. Delay comes from the
        collector's own sync interval plus Supabase Realtime's replication
        lag.
      </p>
      <div className="connection-status">
        <span className={`status-dot ${connected ? "status-dot-ok" : "status-dot-down"}`} />
        {connected ? "Subscribed" : "Connecting…"}
      </div>
      <div className="sensor-grid">
        {SENSOR_TYPES.map((sensorType) => (
          <SensorPanel
            key={sensorType}
            sensorType={sensorType}
            latest={latest[sensorType]}
            seriesByNode={history[sensorType] ?? {}}
          />
        ))}
      </div>
    </div>
  );
}
