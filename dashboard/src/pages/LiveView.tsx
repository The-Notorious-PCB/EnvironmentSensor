import { SENSOR_TYPES, SensorPanel } from "shared-ui";
import { useLiveReadings } from "../hooks/useLiveReadings";

export function LiveView() {
  const { latest, history, connected } = useLiveReadings();

  return (
    <div>
      <div className="connection-status">
        <span className={`status-dot ${connected ? "status-dot-ok" : "status-dot-down"}`} />
        {connected ? "Live" : "Disconnected — retrying…"}
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
