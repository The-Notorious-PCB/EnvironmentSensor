import { useState } from "react";
import { LiveView } from "./pages/LiveView";
import { PlaybackView } from "./pages/PlaybackView";

type Tab = "live" | "playback";

export function App() {
  const [tab, setTab] = useState<Tab>("live");

  return (
    <div className="app">
      <header className="app-header">
        <h1>EnvironmentSensor Dashboard</h1>
        <nav className="tabs">
          <button
            type="button"
            className={tab === "live" ? "tab tab-active" : "tab"}
            onClick={() => setTab("live")}
          >
            Live
          </button>
          <button
            type="button"
            className={tab === "playback" ? "tab tab-active" : "tab"}
            onClick={() => setTab("playback")}
          >
            Playback
          </button>
        </nav>
      </header>
      <main className="app-main">{tab === "live" ? <LiveView /> : <PlaybackView />}</main>
    </div>
  );
}
