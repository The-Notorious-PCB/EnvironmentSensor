import asyncio
import logging
import threading
import time
from collections import Counter
from typing import Callable, Optional

import serial as pyserial
from serial import SerialException

from app.serial.parser import Rejection, parse_line

logger = logging.getLogger(__name__)

DEFAULT_RECONNECT_DELAY_SECONDS = 2.0

# The relay box has no wall clock, so it stamps packet timestamps from the
# time we send it: "T<unix epoch ms>\n", on connect and then every interval.
# Firmware that doesn't read serial input just ignores it. The relay also
# treats a long silence as "nobody's listening" and stops writing (see
# BreadBoardTest/src/receiver), so this doubles as a heartbeat.
DEFAULT_TIME_SYNC_INTERVAL_SECONDS = 10.0


class SerialReader:
    """Reads NDJSON lines from the relay box over serial in a background
    thread, validates each one (app.serial.parser), and hands accepted
    packets to an asyncio.Queue on the caller's event loop via
    call_soon_threadsafe — pyserial's reads are blocking, so this can't run
    directly on the asyncio loop that also serves HTTP/WebSocket traffic.

    `serial_factory` is injectable so tests can pass a fake serial object
    (anything with .readline()/.close()) instead of opening a real port.
    """

    def __init__(
        self,
        *,
        port: str,
        baudrate: int,
        loop: asyncio.AbstractEventLoop,
        queue: "asyncio.Queue",
        serial_factory: Callable[..., object] = pyserial.Serial,
        reconnect_delay: float = DEFAULT_RECONNECT_DELAY_SECONDS,
        time_sync_interval: float = DEFAULT_TIME_SYNC_INTERVAL_SECONDS,
    ) -> None:
        self._port = port
        self._baudrate = baudrate
        self._loop = loop
        self._queue = queue
        self._serial_factory = serial_factory
        self._reconnect_delay = reconnect_delay
        self._time_sync_interval = time_sync_interval
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.stats: Counter = Counter()

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="serial-reader", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                conn = self._serial_factory(self._port, self._baudrate, timeout=1)
            except (SerialException, OSError) as e:
                logger.warning("could not open serial port %s: %s — retrying", self._port, e)
                self.stats["reconnects"] += 1
                self._stop_event.wait(self._reconnect_delay)
                continue

            try:
                self._read_loop(conn)
            except (SerialException, OSError) as e:
                logger.warning("serial read error: %s — reconnecting", e)
                self.stats["reconnects"] += 1
            finally:
                try:
                    conn.close()
                except Exception:
                    pass

            if not self._stop_event.is_set():
                self._stop_event.wait(self._reconnect_delay)

    def _send_time_sync(self, conn) -> None:
        conn.write(f"T{int(time.time() * 1000)}\n".encode("ascii"))
        self.stats["time_syncs"] += 1

    def _read_loop(self, conn) -> None:
        next_time_sync = 0.0
        while not self._stop_event.is_set():
            # readline() times out after 1 s, so this runs at least that often.
            if time.monotonic() >= next_time_sync:
                self._send_time_sync(conn)
                next_time_sync = time.monotonic() + self._time_sync_interval
            raw = conn.readline()
            if not raw:
                time.sleep(0.01)
                continue
            line = raw.decode("utf-8", errors="replace")
            result = parse_line(line)
            if isinstance(result, Rejection):
                self.stats[f"rejected_{result.reason}"] += 1
                logger.debug("rejected serial line (%s): %s", result.reason, result.detail)
                continue
            self.stats["accepted"] += 1
            self._loop.call_soon_threadsafe(self._queue.put_nowait, result)
