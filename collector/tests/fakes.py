import time

from serial import SerialException


class FakeSerial:
    """Duck-types pyserial's Serial for tests: readline() returns queued
    byte lines one at a time, then b"" forever after (like a real port with
    a read timeout and nothing more incoming). close() just flips a flag so
    tests can assert the reader cleaned up after itself.
    """

    def __init__(self, lines):
        self._lines = list(lines)
        self.closed = False

    def readline(self) -> bytes:
        if self._lines:
            return self._lines.pop(0)
        time.sleep(0.01)
        return b""

    def close(self) -> None:
        self.closed = True


class DroppingFakeSerial(FakeSerial):
    """Raises SerialException after `drop_after` reads, to exercise the
    reader's reconnect path.
    """

    def __init__(self, lines, drop_after: int):
        super().__init__(lines)
        self._drop_after = drop_after
        self._reads = 0

    def readline(self) -> bytes:
        self._reads += 1
        if self._reads > self._drop_after:
            raise SerialException("simulated disconnect")
        return super().readline()
