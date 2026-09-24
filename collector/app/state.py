import threading
from typing import Optional


class SessionManager:
    """Tracks which session (if any) incoming readings should be attributed
    to. This collector serves one relay box at a time, so there is at most
    one active session; the writer drops readings that arrive while none is
    active (see app.writer).
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active_session_id: Optional[str] = None

    @property
    def active_session_id(self) -> Optional[str]:
        with self._lock:
            return self._active_session_id

    def activate(self, session_id: str) -> None:
        with self._lock:
            self._active_session_id = session_id

    def deactivate(self, session_id: str) -> None:
        with self._lock:
            if self._active_session_id == session_id:
                self._active_session_id = None
