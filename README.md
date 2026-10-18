# EnvironmentSensor

## Registering a device and recording a session

Same steps for any relay box (the real suit device or a bench rig). The
collector runs on the laptop the relay box is plugged into; see
[`collector/README.md`](collector/README.md) for every setting.

### Quick way: one command

Set up the collector's environment once (step 3 below), plug in the relay
box, then:

```
python3 scripts/record.py --device breadboard --subject bench --suit-config "breadboard rig"
```

- **New device** (no `collector/.env.<device>.local` yet): asks, then
  registers it on the website and saves its settings file for you.
- **Every run:** starts the collector, starts a session, prints the live
  link. **Ctrl-C** stops the session, waits a few seconds for the last
  readings to upload, then stops the collector.
- If the relay box is on a different port than the settings file says, it
  uses the one that's plugged in.

`--name "Breadboard rig"` sets the display name when registering, `--notes`
adds session notes, `--help` lists the rest. The manual steps below do the
same thing by hand.

### First time only

1. **Register the device.** Open the website's register page
   (`https://the-notorious-pcb.github.io/EnvironmentSensor/#/register`),
   enter a name, and copy the **device ID** and **API key**. The key is shown
   once; losing it means registering again. Background:
   [`shared/device-registration.md`](shared/device-registration.md).

2. **Save the device's settings** in `collector/.env.<device>.local`, e.g.
   `collector/.env.helmet.local`:

   ```
   COLLECTOR_SERIAL_PORT=/dev/cu.usbmodem101   # the relay box: ls /dev/cu.usbmodem*
   SUPABASE_URL=...           # VITE_SUPABASE_URL in website/.env.local
   SUPABASE_KEY=...           # VITE_SUPABASE_ANON_KEY in website/.env.local
   COLLECTOR_DEVICE_ID=...    # from step 1
   COLLECTOR_API_KEY=...      # from step 1
   COLLECTOR_SYNC_INTERVAL_SECONDS=1
   ```

   Keep the `.local` ending: `.gitignore` covers `.env.*.local`, so the API
   key never gets committed. One file per device; only the device ID and API
   key differ between them.

3. **Install the collector:**

   ```
   cd collector
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -e .
   ```

### Every run (including re-running a registered device)

1. Plug the relay box into the laptop.

2. **Start the collector** (terminal 1):

   ```
   cd collector
   source .venv/bin/activate
   set -a; source .env.helmet.local; set +a     # that device's file
   uvicorn app.main:app
   ```

   `cloud sync disabled` in the output means a value in the file is missing
   or misspelled.

3. **Start a session** (terminal 2). Readings are dropped until one is
   running, and the dashboard can't start one:

   ```
   curl -X POST localhost:8000/sessions -H 'Content-Type: application/json' \
        -d '{"subject_id":"bench","suit_config":"helmet v1"}'
   ```

   Note the `session_id` it returns.

4. **Watch it live:** website → **Live** → pick the device (about 1 s
   behind), or the laptop dashboard.

5. **Stop:**

   ```
   curl -X POST localhost:8000/sessions/<session_id>/stop
   ```

   then Ctrl-C the collector. The session appears under **History** on the
   website.

Re-running a device reuses its `.env.<device>.local`; you never register it
again. Each run becomes a new session under that device. If the relay box
shows up on a different port (`ls /dev/cu.usbmodem*`), update
`COLLECTOR_SERIAL_PORT` in its file.

## Lag-compensated estimates on the charts

Sensors lag the air they measure: on the breadboard rig, CO2 takes minutes
to settle after a change, temperature several minutes (it mostly reports
its circuit board's temperature), humidity about 10 s. Every chart
(dashboard live/playback, website live/history) draws a dashed
**"(estimated)"** line next to the raw reading: an estimate of the true
level now, made by undoing a calibrated lag. Raw readings stay the stored
record; the estimate is computed in the display only.

The estimate only appears for nodes that have calibration in
[`shared-ui/src/config/lag-params.json`](shared-ui/src/config/lag-params.json),
keyed by `node_id`. The numbers describe the whole setup (mounting,
enclosure, airflow), not just the sensor chip, so **calibrate each setup**:
the breadboard (`bench-01`) and the final PCB will differ, and so may fan on
vs. off.

To calibrate:

1. Record a session on the final hardware, mounted as it will be used:
   a clear change (a breath test works for CO2 and humidity; for
   temperature, moving between two steady rooms is cleaner), then 10+ min
   of steady air.
2. Fit and save, per sensor, from `BreadBoardTest/`:
   ```
   python3 tools/lag_response.py --sensor co2 --session <id> --save-params
   python3 tools/lag_response.py --sensor humidity --session <id> --save-params
   python3 tools/lag_response.py --sensor temperature --session <id> --save-params
   ```
   Check the charts it writes to `BreadBoardTest/analysis/` before trusting
   the numbers.
3. Validate on a second test: e.g. `--tau <saved tau>` should still settle
   quickly without a big overshoot.
4. Commit `lag-params.json`; pushing it redeploys the website.

Expect a few minutes' warm-up after a live view opens (the temperature
model has to learn the board's state), and treat the estimate as a guide,
not an alarm source, until it's validated on the final hardware.

## Deploying the website

[`website/`](website) is deployed to GitHub Pages by
[`.github/workflows/deploy-website.yml`](.github/workflows/deploy-website.yml)
on every push to `main` that touches `website/` or `shared-ui/` (or
manually via Actions → Deploy website to GitHub Pages → Run workflow). Two
one-time steps in this repo's GitHub settings are required before it can
succeed — see [`website/README.md`](website/README.md#deploying-to-github-pages)
for more on why.

1. **Add the two required repo secrets** — Settings → Secrets and
   variables → Actions → New repository secret:
   - `VITE_SUPABASE_URL` — e.g. `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — the project's anon/public key (safe to
     expose in the built client bundle — access is enforced by Supabase
     Row Level Security, not by keeping this key secret; see
     `website/README.md`)

2. **Enable Pages** — Settings → Pages → Source: **GitHub Actions** (not
   "Deploy from a branch" — the workflow uses `actions/deploy-pages`,
   which requires this source mode).

Once both are set, the site is live at:

```
https://the-notorious-pcb.github.io/EnvironmentSensor/
```