# website

Public website, deployed to GitHub Pages, separate from
[`dashboard`](../dashboard) (the laptop-local live/playback viewer used
during a live session). Talks directly to Supabase — no dependency on the
collector or a laptop being on the network. See [CLAUDE.md](../CLAUDE.md)
for how this fits the overall architecture and
[`shared/device-registration.md`](../shared/device-registration.md) for
the registration/auth flow this implements the UI for.

```
src/
  lib/
    supabaseClient.ts   createClient() from build-time env vars
    format.ts             pure display-formatting helpers (tested)
  types.ts               Supabase row shapes (sensor_arrays, readings,
                          the device_sessions view)
  hooks/
    useAuth.ts             current Supabase Auth session
    useDevices.ts            the logged-in user's registered devices
    useDeviceRealtime.ts      Realtime subscription for one device's
                              readings (the Live page)
    useDeviceSessions.ts       past sessions for a device (the History page)
    useSessionReadings.ts       readings for one selected session
  components/
    NavBar.tsx, RequireAuth.tsx
  pages/
    LogInPage.tsx, SignUpPage.tsx
    RegisterDevicePage.tsx    register a device, show its API key once
    DeviceListPage.tsx         your devices, status, last_seen_at
    LiveViewPage.tsx            Realtime charts for one device
    HistoryPage.tsx              session picker + charts for one device
tests/
```

Chart components (`ThresholdLineChart`, `SensorGauge`, `SensorPanel`) and
the threshold config/grouping logic come from
[`shared-ui`](../shared-ui), not duplicated here — the same components
`dashboard` uses, so the laptop and website views stay visually consistent.

## Dev

```
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

`npm run typecheck`, `npm test`, `npm run build` also work from here.

## Env vars (build-time, Vite)

| Var | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | e.g. `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | yes | see "Why it's safe to expose the anon key" below |
| `VITE_BASE_PATH` | no | overrides the GitHub Pages base path baked into `vite.config.ts`, only needed if this repo is forked/renamed |

**`npm run build` fails loudly if `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
aren't set** (see `vite.config.ts`) — without that check, a CI run missing
these secrets would silently produce and deploy a site that can never
reach Supabase, with nothing in the build log to say why.

### Why it's safe to expose the anon key

`VITE_SUPABASE_ANON_KEY` ends up baked into the built JS bundle — anyone
who opens the deployed site can read it in devtools. **This is expected
and fine.** The anon key identifies which Supabase *project* a request is
for; it is not a credential that grants access on its own. Every table
this app touches (`sensor_arrays`, `readings`) has Row Level Security
enabled (see [`supabase/migrations`](../supabase/migrations)) — what a
signed-in user can read or write is enforced by RLS policies checking
`auth.uid()`, not by whoever holds this key. An attacker with only the
anon key can sign up their own account and see only what RLS lets *that*
account see, same as anyone else. This is exactly how Supabase's own docs
describe the anon key, and the same model most BaaS platforms (Firebase's
client config, for example) use.

What actually must stay secret: a user's password, and a device's API key
(never exposed by this app — see
[`shared/device-registration.md`](../shared/device-registration.md)'s
security notes on `api_key_hash`).

## Routing: HashRouter, not BrowserRouter

GitHub Pages serves a project site as static files with no server-side
rewrite rule. With path-based routing (`BrowserRouter`), a deep link or a
page refresh on e.g. `/history/abc` would 404 — GitHub Pages has no route
to serve except the literal file at that path. `HashRouter` keeps all
routing client-side after `index.html` loads (`/#/history/abc`), so every
URL GitHub Pages ever sees is just `index.html`. The tradeoff is uglier
URLs (`#` in the address bar) — acceptable for what this is.

## Deploying to GitHub Pages

`vite.config.ts` sets `base: '/EnvironmentSensor/'` to match this repo's
actual name (`the-notorious-pcb/EnvironmentSensor`) — the built site is a
*project* page (`https://the-notorious-pcb.github.io/EnvironmentSensor/`),
not a *user/org* page (which would use `base: '/'`). If this repo is ever
renamed or forked under a different name, override at build time:
`VITE_BASE_PATH=/new-name/ npm run build`, rather than editing the config.

[`.github/workflows/deploy-website.yml`](../.github/workflows/deploy-website.yml)
builds this app and publishes `dist/` to Pages on every push to `main`
that touches `website/` or `shared-ui/` (or manually via
Actions → Deploy website to GitHub Pages → Run workflow). **Before it can
succeed**, two things need to be done once in the repo's GitHub settings,
neither of which this workflow file can do for you:

1. **Settings → Pages → Source: GitHub Actions** (not "Deploy from a
   branch" — this workflow uses `actions/deploy-pages`, which needs that
   source mode).
2. **Settings → Secrets and variables → Actions**, add repo secrets
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The build step fails
   fast with a clear error (see `vite.config.ts`) if these are missing,
   rather than silently deploying a broken site.

I haven't run this workflow — I don't have a way to trigger a real GitHub
Actions run or GitHub Pages deploy from here. What I did verify locally:
the exact commands it runs (`npm ci`, then `npm run build` with the two
env vars set) succeed and produce a `dist/` with the correct base path and
substituted env values (see the "Env vars" section above). Treat the
workflow file itself as reviewed-but-unexecuted until it's actually run
once in CI.
