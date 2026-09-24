import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { DeviceListPage } from "./pages/DeviceListPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LiveViewPage } from "./pages/LiveViewPage";
import { RegisterDevicePage } from "./pages/RegisterDevicePage";

// HashRouter, not BrowserRouter: GitHub Pages serves this as a static
// project site with no server-side rewrite rule, so a deep link or
// refresh on e.g. /history/abc would 404 with path-based routing.
// Hash-based routes (/#/history/abc) always resolve to index.html.
//
// No login anywhere — the site is fully public (see
// shared/device-registration.md). Every route below is open.
export function App() {
  return (
    <HashRouter>
      <div className="app">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/register" element={<RegisterDevicePage />} />
            <Route path="/devices" element={<DeviceListPage />} />
            <Route path="/live" element={<LiveViewPage />} />
            <Route path="/live/:deviceId" element={<LiveViewPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:deviceId" element={<HistoryPage />} />
            <Route path="/" element={<Navigate to="/devices" replace />} />
            <Route path="*" element={<Navigate to="/devices" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
