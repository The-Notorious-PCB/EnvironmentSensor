import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { RequireAuth } from "./components/RequireAuth";
import { DeviceListPage } from "./pages/DeviceListPage";
import { HistoryPage } from "./pages/HistoryPage";
import { LiveViewPage } from "./pages/LiveViewPage";
import { LogInPage } from "./pages/LogInPage";
import { RegisterDevicePage } from "./pages/RegisterDevicePage";
import { SignUpPage } from "./pages/SignUpPage";

// HashRouter, not BrowserRouter: GitHub Pages serves this as a static
// project site with no server-side rewrite rule, so a deep link or
// refresh on e.g. /history/abc would 404 with path-based routing.
// Hash-based routes (/#/history/abc) always resolve to index.html.
export function App() {
  return (
    <HashRouter>
      <div className="app">
        <NavBar />
        <main className="app-main">
          <Routes>
            <Route path="/login" element={<LogInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route
              path="/register"
              element={
                <RequireAuth>
                  <RegisterDevicePage />
                </RequireAuth>
              }
            />
            <Route
              path="/devices"
              element={
                <RequireAuth>
                  <DeviceListPage />
                </RequireAuth>
              }
            />
            <Route
              path="/live"
              element={
                <RequireAuth>
                  <LiveViewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/live/:deviceId"
              element={
                <RequireAuth>
                  <LiveViewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/history"
              element={
                <RequireAuth>
                  <HistoryPage />
                </RequireAuth>
              }
            />
            <Route
              path="/history/:deviceId"
              element={
                <RequireAuth>
                  <HistoryPage />
                </RequireAuth>
              }
            />
            <Route path="/" element={<Navigate to="/devices" replace />} />
            <Route path="*" element={<Navigate to="/devices" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
