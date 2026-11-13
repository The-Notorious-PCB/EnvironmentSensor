export interface EstimateToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Checkbox for the charts' dashed "(estimated)" line. Only nodes with a lag
 * calibration have one (see the root README, "Lag-compensated estimates"). */
export function EstimateToggle({ checked, onChange }: EstimateToggleProps) {
  return (
    <label
      className="estimate-toggle"
      title="Lag-compensated estimate of the true level, for nodes with a lag calibration"
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Show estimated line
    </label>
  );
}
