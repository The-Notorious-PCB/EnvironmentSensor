import asyncio
import time

from app.serial.reader import SerialReader
from tests.fakes import DroppingFakeSerial, FakeSerial
from tests.packet_fixtures import bad_crc_line, valid_line


def _drain(queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> list:
    """call_soon_threadsafe only schedules a callback; it needs the loop to
    actually run before queue.put_nowait fires. The loop isn't running in
    these tests, so pump it briefly to flush anything the reader thread
    scheduled.
    """
    for _ in range(3):
        loop.run_until_complete(asyncio.sleep(0))
    items = []
    while not queue.empty():
        items.append(queue.get_nowait())
    return items


def test_reader_accepts_valid_and_rejects_invalid():
    lines = [
        valid_line(seq=1),
        b"not json\n",
        valid_line(seq=2, sensor_type="not_a_real_type"),
        bad_crc_line(seq=3),
        valid_line(seq=4, sensor_type="temperature", unit="degC", value=21.5),
    ]
    fake = FakeSerial(lines)
    loop = asyncio.new_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    reader = SerialReader(
        port="ignored",
        baudrate=115200,
        loop=loop,
        queue=queue,
        serial_factory=lambda *a, **kw: fake,
        reconnect_delay=0.05,
    )

    reader.start()
    time.sleep(0.3)
    reader.stop()

    accepted = _drain(queue, loop)
    loop.close()

    assert {p.seq for p in accepted} == {1, 4}
    assert reader.stats["accepted"] == 2
    assert reader.stats["rejected_invalid_json"] == 1
    assert reader.stats["rejected_schema"] == 1
    assert reader.stats["rejected_crc_mismatch"] == 1
    assert fake.closed


def test_reader_reconnects_after_disconnect():
    first_batch = [valid_line(seq=1), valid_line(seq=2)]
    second_batch = [valid_line(seq=3)]

    first_fake = DroppingFakeSerial(first_batch, drop_after=len(first_batch))
    second_fake = FakeSerial(second_batch)
    opened = [first_fake, second_fake]

    def factory(*args, **kwargs):
        return opened.pop(0)

    loop = asyncio.new_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    reader = SerialReader(
        port="ignored",
        baudrate=115200,
        loop=loop,
        queue=queue,
        serial_factory=factory,
        reconnect_delay=0.05,
    )

    reader.start()
    time.sleep(0.4)
    reader.stop()

    accepted = _drain(queue, loop)
    loop.close()

    assert {p.seq for p in accepted} == {1, 2, 3}
    assert reader.stats["reconnects"] >= 1
    assert first_fake.closed
    assert second_fake.closed
