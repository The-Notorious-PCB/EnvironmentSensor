# dashboard

React + Recharts frontend, laptop-local — used during a live session,
talks to the collector's own API on the same machine/network. See
[CLAUDE.md](../CLAUDE.md) for the full architecture and rationale, and
[`../website`](../website) for the separate public/cloud-facing app (GitHub
Pages, talks to Supabase directly).

```
src/
  types/reading.ts        types mirroring the collector's packet/session/
                          reading shapes (SensorType itself re-exported
                          from shared-ui — see that file's note)
  lib/api.ts               REST fetch + WebSocket URL helpers
  hooks/
    useLiveReadings.ts       /ws/live client — latest value + rolling
                             history per sensor_type, auto-reconnects
    useSessions.ts            GET /sessions
    useSessionReadings.ts      GET /sessions/{id}/readings
  pages/
    LiveView.tsx              grid of SensorPanel, one per sensor_type
    PlaybackView.tsx          session picker + ThresholdLineChart per
                              sensor_type over the full session
tests/
```

Chart components (`ThresholdLineChart`, `SensorGauge`, `SensorPanel`) and
the threshold config/grouping logic live in
[`../shared-ui`](../shared-ui), shared with `website` — see that
package's README for what's there and the CSS contract this app's
`index.css` implements.

Run it: `npm install && npm run dev` (Vite, default port 5173). `npm install`
here also installs `../shared-ui`'s own dependencies via a `postinstall`
script — see `shared-ui/README.md` for why that's required, not just a dev
convenience. Needs the collector running (see
[`../collector/README.md`](../collector/README.md)) — by default it talks
to `http://localhost:8000`; override with `VITE_COLLECTOR_API_URL`. The
collector must have that origin in its `COLLECTOR_DASHBOARD_ORIGINS` CORS
allowlist (defaults already cover Vite's port).

Type-check: `npm run typecheck`. Tests: `npm test`. Build: `npm run build`.

Implements the dashboard side of PLAN.md's M6 (live view) and M7 (playback
view).
