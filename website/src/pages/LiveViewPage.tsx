import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SENSOR_TYPES, SensorPanel, THRESHOLDS, ThresholdLineChart, type SensorType } from "shared-ui";
import { ChartModal } from "../components/ChartModal";
import { EstimateToggle } from "../components/EstimateToggle";
import { ExpandablePanel } from "../components/ExpandablePanel";
import { useDeviceRealtime } from "../hooks/useDeviceRealtime";
import { useDevices } from "../hooks/useDevices";
import { useShowEstimates } from "../hooks/useShowEstimates";

export function LiveViewPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devices, loading: devicesLoading } = useDevices();
  const { latest, history, connected } = useDeviceRealtime(deviceId);
  const [showEstimates, setShowEstimates] = useShowEstimates();
  // Only the sensor type is kept, so the larger view keeps updating live.
  const [expanded, setExpanded] = useState<SensorType | null>(null);

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
      <div className="chart-options">
        <div className="connection-status">
          <span className={`status-dot ${connected ? "status-dot-ok" : "status-dot-down"}`} />
          {connected ? "Subscribed" : "Connecting…"}
        </div>
        <EstimateToggle checked={showEstimates} onChange={setShowEstimates} />
      </div>
      <div className="sensor-grid">
        {SENSOR_TYPES.map((sensorType) => (
          <ExpandablePanel
            key={sensorType}
            label={THRESHOLDS[sensorType].label}
            onExpand={() => setExpanded(sensorType)}
          >
            <SensorPanel
              sensorType={sensorType}
              latest={latest[sensorType]}
              seriesByNode={history[sensorType] ?? {}}
              showEstimate={showEstimates}
            />
          </ExpandablePanel>
        ))}
      </div>

      {expanded && (
        <ChartModal
          title={
            <>
              {THRESHOLDS[expanded].label}
              {latest[expanded] && (
                <span className="chart-modal-latest">
                  {" "}
                  {Number(latest[expanded]!.value.toFixed(2))} {latest[expanded]!.unit}
                </span>
              )}
            </>
          }
          controls={<EstimateToggle checked={showEstimates} onChange={setShowEstimates} />}
          onClose={() => setExpanded(null)}
        >
          <ThresholdLineChart
            sensorType={expanded}
            seriesByNode={history[expanded] ?? {}}
            height="100%"
            showEstimate={showEstimates}
          />
        </ChartModal>
      )}
    </div>
  );
}
