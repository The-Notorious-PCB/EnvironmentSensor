import { useState } from "react";

const STORAGE_KEY = "showEstimates";

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true; // storage blocked (private window, etc.): default on
  }
}

/** Whether charts draw the dashed lag-compensated estimate line. On by
 * default, remembered in this browser across pages and visits. */
export function useShowEstimates(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(load);
  const update = (next: boolean) => {
    setShow(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // not remembered; the setting still applies to this page
    }
  };
  return [show, update];
}
