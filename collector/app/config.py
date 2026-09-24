import os
from dataclasses import dataclass, field
from typing import List


def _default_dashboard_origins() -> List[str]:
    raw = os.getenv(
        "COLLECTOR_DASHBOARD_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return [origin for origin in raw.split(",") if origin]


@dataclass
class Settings:
    serial_port: str = os.getenv("COLLECTOR_SERIAL_PORT", "/dev/ttyUSB0")
    serial_baudrate: int = int(os.getenv("COLLECTOR_SERIAL_BAUDRATE", "115200"))
    database_url: str = os.getenv("COLLECTOR_DATABASE_URL", "sqlite:///./collector.db")

    # The dashboard (Vite dev server) runs on a different origin/port than
    # this API, so without CORS the browser silently blocks every fetch —
    # discovered by actually running the dashboard against this API, not by
    # curl (curl doesn't enforce CORS). Comma-separated list of allowed
    # origins; defaults cover Vite's dev-server ports on localhost/127.0.0.1.
    dashboard_origins: List[str] = field(default_factory=_default_dashboard_origins)

    # Cloud sync — see collector/README.md#cloud-sync-supabase and
    # shared/device-registration.md for what these authenticate against.
    # Sync is skipped entirely if any of url/key/device_id/api_key aren't
    # set (e.g. local dev with no registered device), see app/main.py.
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_key: str = os.getenv("SUPABASE_KEY", "")
    supabase_ingest_function: str = os.getenv("SUPABASE_INGEST_FUNCTION", "ingest_readings")
    # Issued once by register_device() on the website at registration time —
    # see shared/device-registration.md. api_key is the plaintext key shown
    # only at that moment; the collector sends it on every sync call, it's
    # never persisted server-side (only api_key_hash is).
    device_id: str = os.getenv("COLLECTOR_DEVICE_ID", "")
    api_key: str = os.getenv("COLLECTOR_API_KEY", "")
    # Kept short (2-5s) so the cloud-hosted website can show a near-real-time
    # view rather than one that lags a full sync cycle behind.
    sync_interval_seconds: float = float(os.getenv("COLLECTOR_SYNC_INTERVAL_SECONDS", "3"))
    sync_batch_size: int = int(os.getenv("COLLECTOR_SYNC_BATCH_SIZE", "500"))


settings = Settings()
