#!/usr/bin/env python3
"""Record a session in one command: registers the device if it's new, starts
the collector, starts a session, and on Ctrl-C stops the session and the
collector cleanly.

    python3 scripts/record.py --device breadboard --subject bench --suit-config "breadboard rig"

First run for a device: there's no collector/.env.<device>.local yet, so this
registers a new device on the website (same register_device call the Register
page makes, see shared/device-registration.md), asks before doing it, and
saves the device ID + API key to that file. Every later run reuses the file;
the device is never registered twice.

Each run is one session. Ctrl-C stops the session first (so it gets an end
time), waits a moment for the last readings to upload, then stops the
collector. Readings that haven't uploaded yet stay in SQLite and upload the
next time the collector runs.

Runs itself with collector/.venv's Python (create it per README.md), which
also has the certificates HTTPS needs.
"""

import argparse
import glob
import json
import os
import re
import signal
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent.parent
COLLECTOR = ROOT / "collector"
VENV_PYTHON = COLLECTOR / ".venv" / "bin" / "python"
WEBSITE_ENV = ROOT / "website" / ".env.local"
WEBSITE_URL = "https://the-notorious-pcb.github.io/EnvironmentSensor/"

DEVICE_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
STATUS_EVERY_S = 30
# Gives the sync worker (1 s interval) a couple of cycles to upload the tail.
FINAL_SYNC_WAIT_S = 3


def log(msg: str) -> None:
    print(f"[record] {msg}", flush=True)


def fail(msg: str) -> NoReturn:
    sys.exit(f"[record] error: {msg}")


# ---------------------------------------------------------------- env files

def read_env_file(path: Path) -> dict:
    """KEY=VALUE lines, the same subset `source` understands for these files:
    blank lines and # comments skipped, a trailing ` # comment` dropped,
    surrounding quotes stripped."""
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = re.sub(r"\s+#.*$", "", value).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def write_env_file(path: Path, values: dict) -> None:
    body = "".join(f"{k}={v}\n" for k, v in values.items())
    # Created owner-only: it holds the device's API key.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(body)


# ---------------------------------------------------------------- HTTP

def _ssl_context():
    try:
        import certifi  # in collector/.venv via httpx
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def http_json(method: str, url: str, body=None, headers=None, timeout=10):
    req = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    ctx = _ssl_context() if url.startswith("https") else None
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else None


# ---------------------------------------------------------------- registration

def register(device: str, name: str, suit_config: str, port: str, assume_yes: bool) -> dict:
    if not WEBSITE_ENV.exists():
        fail(f"can't register: {WEBSITE_ENV} (Supabase URL + anon key) not found")
    web = read_env_file(WEBSITE_ENV)
    url, key = web.get("VITE_SUPABASE_URL", "").rstrip("/"), web.get("VITE_SUPABASE_ANON_KEY", "")
    if not url or not key:
        fail(f"{WEBSITE_ENV} is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY")

    if not assume_yes:
        answer = input(f"[record] no settings for device '{device}'. Register a new device "
                       f"named '{name}' on the website? [y/N] ").strip().lower()
        if answer not in ("y", "yes"):
            fail("not registered. Check --device for a typo, or pass --env-file.")

    try:
        result = http_json("POST", f"{url}/rest/v1/rpc/register_device",
                           {"p_name": name, "p_suit_config": suit_config or None},
                           {"apikey": key, "Authorization": f"Bearer {key}"})
    except urllib.error.HTTPError as e:
        fail(f"register_device failed: HTTP {e.code} {e.read().decode()[:300]}")
    except urllib.error.URLError as e:
        fail(f"register_device failed: {e.reason}")
    row = result[0] if isinstance(result, list) else result

    return {
        "COLLECTOR_SERIAL_PORT": port,
        "SUPABASE_URL": url,
        "SUPABASE_KEY": key,
        "COLLECTOR_DEVICE_ID": row["device_id"],
        "COLLECTOR_API_KEY": row["api_key"],
        "COLLECTOR_SYNC_INTERVAL_SECONDS": "1",
    }


def detect_port() -> str:
    ports = glob.glob("/dev/cu.usbmodem*")
    return ports[0] if len(ports) == 1 else ""


# ---------------------------------------------------------------- collector

def api(base: str, method: str, path: str, body=None):
    return http_json(method, f"{base}{path}", body, timeout=5)


def wait_for_health(base: str, proc: subprocess.Popen, timeout_s: float = 30) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            fail(f"collector exited during startup (code {proc.returncode}); see its output above")
        try:
            api(base, "GET", "/health")
            return
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.3)
    fail("collector didn't come up within 30 s")


def stop_collector(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    proc.send_signal(signal.SIGINT)  # uvicorn's graceful shutdown
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--device", required=True,
                    help="short id for this device's settings file, e.g. breadboard -> "
                         "collector/.env.breadboard.local")
    ap.add_argument("--subject", required=True, help="session subject_id, e.g. bench or a test subject")
    ap.add_argument("--suit-config", default="", help="session suit_config, e.g. 'helmet v1'")
    ap.add_argument("--notes", default=None, help="session notes")
    ap.add_argument("--name", help="display name when registering (default: --device)")
    ap.add_argument("--env-file", help="use this settings file instead of collector/.env.<device>.local")
    ap.add_argument("--port", help="relay box serial port, overriding the settings file")
    ap.add_argument("--api-port", type=int, default=8000, help="collector HTTP port (default 8000)")
    ap.add_argument("--yes", action="store_true", help="register a new device without asking")
    args = ap.parse_args()

    if not DEVICE_RE.match(args.device):
        fail("--device must be lowercase letters/digits/hyphens, e.g. breadboard or helmet-01")

    env_path = Path(args.env_file) if args.env_file else COLLECTOR / f".env.{args.device}.local"

    if env_path.exists():
        settings = read_env_file(env_path)
        log(f"using {env_path.relative_to(ROOT) if env_path.is_relative_to(ROOT) else env_path}")
    else:
        settings = register(args.device, args.name or args.device, args.suit_config,
                            args.port or detect_port(), args.yes)
        write_env_file(env_path, settings)
        log(f"registered device {settings['COLLECTOR_DEVICE_ID']}; settings saved to "
            f"{env_path} (keep it, the API key can't be shown again)")

    port = args.port or settings.get("COLLECTOR_SERIAL_PORT", "")
    if not port or not os.path.exists(port):
        found = detect_port()
        if found:
            log(f"serial port {port or '(none set)'} not found, using {found}")
            port = found
        else:
            fail(f"relay box not found at {port or '(no port set)'}; plug it in, or pass --port "
                 "(ls /dev/cu.usbmodem*)")
    settings["COLLECTOR_SERIAL_PORT"] = port

    missing = [k for k in ("SUPABASE_URL", "SUPABASE_KEY", "COLLECTOR_DEVICE_ID", "COLLECTOR_API_KEY")
               if not settings.get(k)]
    if missing:
        log(f"WARNING: {', '.join(missing)} not set, so nothing will upload (recording locally only)")

    base = f"http://127.0.0.1:{args.api_port}"
    try:
        api(base, "GET", "/health")
        fail(f"something is already answering on {base}; stop that collector first")
    except (urllib.error.URLError, ConnectionError, OSError):
        pass

    # Own process group: Ctrl-C reaches only this script, which then stops the
    # session BEFORE shutting the collector down.
    proc = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
         "--port", str(args.api_port)],
        cwd=COLLECTOR,
        env={**os.environ, **settings},
        start_new_session=True,
    )

    session_id = None
    stopping = False

    def request_stop(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    try:
        wait_for_health(base, proc)
        session = api(base, "POST", "/sessions",
                      {"subject_id": args.subject, "suit_config": args.suit_config, "notes": args.notes})
        session_id = session["session_id"]
        log(f"session {session_id} started on {port}")
        if settings.get("COLLECTOR_DEVICE_ID"):
            log(f"live: {WEBSITE_URL}#/live/{settings['COLLECTOR_DEVICE_ID']}")
        log("recording. Ctrl-C to stop.")

        last_status, last_accepted = time.monotonic(), 0
        while not stopping:
            if proc.poll() is not None:
                log(f"collector exited unexpectedly (code {proc.returncode})")
                break
            time.sleep(0.2)
            if time.monotonic() - last_status >= STATUS_EVERY_S:
                try:
                    stats = api(base, "GET", "/health").get("serial") or {}
                    accepted = stats.get("accepted", 0)
                    rate = (accepted - last_accepted) / (time.monotonic() - last_status)
                    log(f"{accepted} readings received ({rate:.1f}/s)"
                        + ("" if rate else ": nothing arriving, is the relay box sending?"))
                    last_accepted = accepted
                except (urllib.error.URLError, OSError):
                    pass
                last_status = time.monotonic()
    finally:
        if session_id and proc.poll() is None:
            try:
                api(base, "POST", f"/sessions/{session_id}/stop")
                log(f"session {session_id} stopped")
                if not missing:
                    time.sleep(FINAL_SYNC_WAIT_S)
            except (urllib.error.URLError, OSError) as e:
                log(f"could not stop session cleanly: {e}")
        stop_collector(proc)
        log("collector stopped")


if __name__ == "__main__":
    # Re-run under collector/.venv: it has certifi for HTTPS, and it's the
    # Python the collector itself is installed into.
    # The env marker stops a relaunch loop if the prefix check ever misfires.
    in_venv = Path(sys.prefix).resolve() == VENV_PYTHON.parent.parent.resolve()
    if VENV_PYTHON.exists() and not in_venv and not os.environ.get("RECORD_IN_VENV"):
        os.environ["RECORD_IN_VENV"] = "1"
        os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), __file__, *sys.argv[1:]])
    if not VENV_PYTHON.exists():
        fail("collector/.venv not found. Set it up first: cd collector && python3 -m venv .venv "
             "&& .venv/bin/pip install -e .")
    main()
