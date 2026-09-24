import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Callable, Optional

import httpx
import serial as pyserial
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, sessions, ws
from app.broadcast import BroadcastManager
from app.config import settings as default_settings
from app.database import init_db, make_engine
from app.models.packet import SensorPacket
from app.serial.reader import SerialReader
from app.state import SessionManager
from app.sync.worker import run_sync_worker
from app.writer import run_writer

logger = logging.getLogger(__name__)


def create_app(
    *,
    database_url: Optional[str] = None,
    serial_port: Optional[str] = None,
    serial_baudrate: Optional[int] = None,
    start_serial: bool = True,
    serial_factory: Callable[..., object] = pyserial.Serial,
    supabase_url: Optional[str] = None,
    supabase_key: Optional[str] = None,
    supabase_ingest_function: Optional[str] = None,
    device_id: Optional[str] = None,
    api_key: Optional[str] = None,
    sync_interval_seconds: Optional[float] = None,
    sync_batch_size: Optional[int] = None,
    start_sync: bool = True,
    sync_http_client: Optional[httpx.AsyncClient] = None,
    dashboard_origins: Optional[list] = None,
) -> FastAPI:
    database_url = database_url or default_settings.database_url
    serial_port = serial_port or default_settings.serial_port
    serial_baudrate = serial_baudrate or default_settings.serial_baudrate
    supabase_url = supabase_url if supabase_url is not None else default_settings.supabase_url
    supabase_key = supabase_key if supabase_key is not None else default_settings.supabase_key
    supabase_ingest_function = supabase_ingest_function or default_settings.supabase_ingest_function
    device_id = device_id if device_id is not None else default_settings.device_id
    api_key = api_key if api_key is not None else default_settings.api_key
    sync_interval_seconds = sync_interval_seconds or default_settings.sync_interval_seconds
    sync_batch_size = sync_batch_size or default_settings.sync_batch_size
    dashboard_origins = (
        dashboard_origins if dashboard_origins is not None else default_settings.dashboard_origins
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = make_engine(database_url)
        init_db(engine)

        queue: "asyncio.Queue[SensorPacket]" = asyncio.Queue()
        session_manager = SessionManager()
        broadcast_manager = BroadcastManager()

        app.state.engine = engine
        app.state.session_manager = session_manager
        app.state.broadcast_manager = broadcast_manager
        app.state.queue = queue

        reader = None
        if start_serial:
            reader = SerialReader(
                port=serial_port,
                baudrate=serial_baudrate,
                loop=asyncio.get_running_loop(),
                queue=queue,
                serial_factory=serial_factory,
            )
            reader.start()
        app.state.serial_reader = reader

        writer_task = asyncio.create_task(
            run_writer(queue, engine, session_manager, broadcast_manager)
        )

        sync_task = None
        if start_sync and supabase_url and supabase_key and device_id and api_key:
            sync_task = asyncio.create_task(
                run_sync_worker(
                    engine=engine,
                    supabase_url=supabase_url,
                    supabase_key=supabase_key,
                    device_id=device_id,
                    api_key=api_key,
                    ingest_function=supabase_ingest_function,
                    interval_seconds=sync_interval_seconds,
                    batch_size=sync_batch_size,
                    client=sync_http_client,
                )
            )
        elif start_sync:
            logger.warning(
                "cloud sync disabled: SUPABASE_URL/SUPABASE_KEY/COLLECTOR_DEVICE_ID/"
                "COLLECTOR_API_KEY not fully configured"
            )

        try:
            yield
        finally:
            writer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await writer_task
            if sync_task is not None:
                sync_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await sync_task
            if reader is not None:
                reader.stop()

    app = FastAPI(title="EnvironmentSensor Collector", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=dashboard_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(ws.router)
    return app


app = create_app()
