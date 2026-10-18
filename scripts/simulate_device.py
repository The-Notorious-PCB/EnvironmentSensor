#!/usr/bin/env python3
"""Simulates a device streaming sensor readings to Supabase, the same way
the collector's real sync worker does — POSTing to the ingest_readings RPC
(see shared/device-registration.md and collector/app/sync/worker.py), not
a reimplementation of different logic. Useful for putting real data in
front of the website's Live and History views without a real relay box or
collector running.

Zero dependencies beyond the standard library, so it doesn't need the
collector's virtualenv.

Usage:
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_ANON_KEY=...          # same values as website/.env.local

    python3 scripts/simulate_device.py                    # 5 real minutes
    python3 scripts/simulate_device.py --fast              # instant, same data
    python3 scripts/simulate_device.py --minutes 10 --interval 5

Registers (or reuses) a device named "test" — credentials are cached in
scripts/.test-device.json (gitignored) so repeated runs reuse the same
device instead of registering a new one every time. To point at a device
you already registered some other way, create that file yourself:
    {"device_id": "...", "api_key": "..."}
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

CACHE_PATH = Path(__file__).parent / ".test-device.json"
NODE_ID = "test-01"
DEVICE_NAME = "test"

# sensor_type, unit, baseline, jitter — baseline sits in the middle of
# shared-ui/src/config/thresholds.ts's "ok" range for each sensor, jitter
# is a rough random walk so the charts don't look like a flat line.
SENSORS = [
    ("o2", "kPa", 21.5, 0.4),
    ("co2", "ppm", 600.0, 80.0),
    ("temperature", "degC", 22.0, 0.8),
    ("humidity", "%RH", 40.0, 5.0),
    ("pressure", "kPa", 100.0, 1.5),
]


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"error: {name} is not set (same values as website/.env.local)")
    return value


def api_post(url, anon_key, body):
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode()
        sys.exit(f"error: HTTP {error.code} from {url}\n{detail}")


def get_or_register_device(base_url, anon_key):
    if CACHE_PATH.exists():
        cached = json.loads(CACHE_PATH.read_text())
        print(f"reusing cached '{DEVICE_NAME}' device {cached['device_id']}")
        return cached

    print(f"registering a new device named {DEVICE_NAME!r}...")
    result = api_post(
        f"{base_url}/rest/v1/rpc/register_device",
        anon_key,
        {"p_name": DEVICE_NAME, "p_suit_config": "scripts/simulate_device.py test rig"},
    )
    row = result[0] if isinstance(result, list) else result
    device = {"device_id": row["device_id"], "api_key": row["api_key"]}
    CACHE_PATH.write_text(json.dumps(device, indent=2) + "\n")
    print(f"registered device {device['device_id']} (cached at {CACHE_PATH})")
    return device


def build_batch(session_id, seq_counter, timestamp):
    batch = []
    for sensor_type, unit, baseline, jitter in SENSORS:
        seq_counter[0] += 1
        batch.append(
            {
                "session_id": session_id,
                "node_id": NODE_ID,
                "sensor_type": sensor_type,
                "value": round(baseline + random.uniform(-jitter, jitter), 2),
                "unit": unit,
                "timestamp": timestamp.isoformat(),
                "seq": seq_counter[0],
            }
        )
    return batch


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--minutes", type=float, default=5.0, help="simulated session length")
    parser.add_argument(
        "--interval",
        type=float,
        default=3.0,
        help="seconds between batches — matches the collector's real sync cadence",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="don't actually wait between batches; timestamps stay --interval "
        "apart regardless, so History view charts still look like a real "
        "session, it just doesn't take 5 real minutes to generate",
    )
    args = parser.parse_args()

    base_url = env("SUPABASE_URL").rstrip("/")
    anon_key = env("SUPABASE_ANON_KEY")

    device = get_or_register_device(base_url, anon_key)
    session_id = uuid.uuid4().hex
    ticks = max(1, int(args.minutes * 60 / args.interval))

    print(
        f"simulating {args.minutes} min ({ticks} batches, {args.interval}s apart) "
        f"on device {device['device_id']}, session {session_id}"
    )

    seq_counter = [0]
    start = datetime.now(timezone.utc)
    for i in range(ticks):
        tick_time = datetime.fromtimestamp(start.timestamp() + i * args.interval, tz=timezone.utc)
        batch = build_batch(session_id, seq_counter, tick_time)

        result = api_post(
            f"{base_url}/rest/v1/rpc/ingest_readings",
            anon_key,
            {
                "p_device_id": device["device_id"],
                "p_api_key": device["api_key"],
                "p_readings": batch,
            },
        )
        print(f"[{i + 1}/{ticks}] sent {len(batch)} readings @ {tick_time.isoformat()} -> {result}")

        if not args.fast and i < ticks - 1:
            time.sleep(args.interval)

    print(f"\ndone. device_id={device['device_id']} session_id={session_id}")
    print("Live view: website -> Live -> 'test' (only shows data sent without --fast, in real time)")
    print("History view: website -> History -> 'test' -> this session")


if __name__ == "__main__":
    main()
