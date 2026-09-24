# shared-ui

Chart components and reading/threshold logic shared between
[`dashboard`](../dashboard) (runs on the laptop, fed by the collector's
local WebSocket/REST API) and [`website`](../website) (runs on GitHub
Pages, fed by Supabase Realtime/REST). Not published to npm — both apps
consume it directly as source via a `file:../shared-ui` dependency (npm
creates a symlink; no build step, no separate publish/version workflow).

```
src/
  types.ts              SensorType, MinimalReading (the structural shape
                         groupBySensorAndNode/charts need — deliberately not
                         tied to either app's full reading row type)
  config/thresholds.ts   single source of truth for alert-coloring ranges
  lib/
    thresholdStatus.ts    value -> ok/warn/danger
    groupReadings.ts       flat readings -> sensor_type -> node_id series
  components/
    ThresholdLineChart.tsx  line chart with threshold bands
    SensorGauge.tsx          current-value gauge, colored by threshold
    SensorPanel.tsx           gauge + rolling chart, for a live view
```

Everything here is presentation/pure-logic only — no networking, no
WebSocket/Supabase-client code. Each app owns how it fetches data
(dashboard: `fetch`/`WebSocket` against the collector; website:
`@supabase/supabase-js`) and just hands the result to these components in
the shapes above.

## CSS contract

These components don't ship their own stylesheet — each consuming app must
define, in its own global CSS:

- Custom properties `--chart-grid` and `--chart-axis` (used by
  `ThresholdLineChart`'s grid lines and axes, so they respect the app's own
  light/dark theme).
- Classes `.sensor-panel`, `.sensor-panel-empty`, `.sensor-gauge`,
  `.sensor-gauge-value`, `.sensor-gauge-unit`, `.sensor-gauge-status`.

See `dashboard/src/index.css` or `website/src/index.css` for a working
example of all of these.

## Dev

To work on this package directly (not through a consuming app):
`npm install && npm test && npm run typecheck` from this directory. Tests
cover the pure logic (`thresholdStatus`, `groupReadings`) only —
deliberately not component rendering tests, since Recharts + jsdom needs a
`ResizeObserver` polyfill to render meaningfully and it wasn't worth the
setup for a scaffold; dashboard's and website's own Playwright-driven
manual checks are what actually verify these components render correctly
in a browser.

## Consumed via `file:../shared-ui`, not published

Both `dashboard` and `website` depend on this via
`"shared-ui": "file:../shared-ui"` in their `package.json` — npm creates a
symlink, and each app's Vite config excludes it from dependency
pre-bundling (`optimizeDeps.exclude`), so edits here are picked up live in
both apps' dev servers without a rebuild step.

**This package needs its own `npm install` run too** — its `.tsx` files
import `react`/`recharts` as bare specifiers, and Node's module resolution
looks for `node_modules` starting from a symlinked file's *real* path
(`shared-ui/`), not the consuming app's directory. Without
`shared-ui/node_modules` present, a consuming app's build fails with
"Rollup failed to resolve import 'recharts'" — confirmed by hand, not just
inferred. Both `dashboard`'s and `website`'s `package.json` have a
`postinstall` script (`npm --prefix ../shared-ui install`) so a plain
`npm install` in either app handles this automatically — you shouldn't
need to think about it unless you're editing this package standalone.
