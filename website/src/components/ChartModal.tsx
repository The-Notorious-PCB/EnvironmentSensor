import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

export interface ChartModalProps {
  title: ReactNode;
  onClose: () => void;
  /** Toolbar content next to the close button, e.g. the estimate checkbox. */
  controls?: ReactNode;
  /** The chart; it gets a box with a fixed height, so a chart sized
   * height="100%" fills it. */
  children: ReactNode;
}

/** Large view of one chart, as a native modal <dialog>: Escape closes it,
 * focus stays inside, the page behind is inert. Clicking the backdrop or
 * the close button closes it too. */
export function ChartModal({ title, onClose, controls, children }: ChartModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    // The dialog element itself only receives clicks on its backdrop; the
    // content inside is a separate element covering the whole box.
    if (event.target === dialogRef.current) onClose();
  }

  return (
    <dialog ref={dialogRef} className="chart-modal" onClose={onClose} onClick={handleClick}>
      <div className="chart-modal-content">
        <div className="chart-modal-header">
          <h3>{title}</h3>
          <div className="chart-modal-controls">
            {controls}
            <button type="button" className="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="chart-modal-body">{children}</div>
      </div>
    </dialog>
  );
}
