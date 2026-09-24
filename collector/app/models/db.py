from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint

from .packet import SensorPacket


class Session(SQLModel, table=True):
    """One data-collection run: subject puts the suit on, does an exercise,
    takes it off. Spec: shared/packet-schema.md.
    """

    __tablename__ = "sessions"

    session_id: str = Field(default_factory=lambda: uuid4().hex, primary_key=True)
    subject_id: str = Field(index=True)
    suit_config: str
    start_time: datetime
    end_time: Optional[datetime] = None
    notes: Optional[str] = None

    readings: list["Reading"] = Relationship(back_populates="session")


class Reading(SQLModel, table=True):
    """One stored sensor reading. Spec: shared/packet-schema.md.

    `sensor_type` is a plain string column, not a SQL-level enum — see
    shared/packet-schema.md for why. Validate against
    app.models.enums.SensorType in code before writing, not via a DB
    constraint.

    `(session_id, node_id, seq)` is unique so replaying an NDJSON log (a
    fixture, or a re-import from the relay's SD backup) is a safe
    insert-or-ignore and never double-counts a reading. See
    shared/packet-schema.md's "seq gap detection" section for how this and
    `seq` are used together to reconcile the collector's data against the
    relay's SD log.

    `synced` tracks whether this row has been pushed to Supabase yet — see
    app.sync.worker. Not part of the wire packet or the shared schema; it's
    local bookkeeping only.
    """

    __tablename__ = "readings"
    __table_args__ = (
        UniqueConstraint("session_id", "node_id", "seq", name="uq_reading_session_node_seq"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="sessions.session_id", index=True)
    node_id: str = Field(index=True)
    sensor_type: str = Field(index=True)
    value: float
    unit: str
    timestamp: datetime = Field(index=True)
    seq: int
    synced: bool = Field(default=False, index=True)

    session: Optional[Session] = Relationship(back_populates="readings")

    @classmethod
    def from_packet(cls, session_id: str, packet: SensorPacket) -> "Reading":
        return cls(
            session_id=session_id,
            node_id=packet.node_id,
            sensor_type=packet.sensor_type.value,
            value=packet.value,
            unit=packet.unit,
            timestamp=packet.timestamp,
            seq=packet.seq,
        )
