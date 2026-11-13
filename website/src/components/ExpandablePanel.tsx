import type { KeyboardEvent, ReactNode } from "react";

export interface ExpandablePanelProps {
  /** Names the chart for screen readers: "Expand <label> chart". */
  label: string;
  onExpand: () => void;
  children: ReactNode;
}

/** Makes a chart panel clickable (and keyboard-activatable) to open its
 * larger view. */
export function ExpandablePanel({ label, onExpand, children }: ExpandablePanelProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onExpand();
    }
  }

  return (
    <div
      className="expandable-panel"
      role="button"
      tabIndex={0}
      aria-label={`Expand ${label} chart`}
      title="Click for a larger view"
      onClick={onExpand}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}
