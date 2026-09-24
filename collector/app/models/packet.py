import re
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import SensorType

NODE_ID_PATTERN = re.compile(r"^[a-z]+(-[a-z]+)*-[0-9]+$")
CRC16_PATTERN = re.compile(r"^[0-9a-f]{4}$")
SEQ_MAX = 2**32 - 1


class SensorPacket(BaseModel):
    """One NDJSON line as emitted by the relay box over serial.

    Spec: shared/packet-schema.md / shared/packet-schema.json. This is a
    wire-format model, not a DB row — see app.models.db.Reading for storage.

    Validation here checks shape only (crc16 is well-formed hex). Verifying
    the CRC actually matches the packet contents is the serial reader's job
    (app.serial), since that's where the fixed field order for the CRC
    computation is defined alongside the firmware side of that contract.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    node_id: str
    sensor_type: SensorType
    value: float
    unit: str = Field(min_length=1)
    timestamp: datetime
    seq: int = Field(ge=0, le=SEQ_MAX)
    crc16: str

    @field_validator("node_id")
    @classmethod
    def _node_id_format(cls, v: str) -> str:
        if not NODE_ID_PATTERN.match(v):
            raise ValueError(
                "node_id must be lowercase-hyphenated '<location>-<index>', e.g. 'helmet-01'"
            )
        return v

    @field_validator("crc16")
    @classmethod
    def _crc16_format(cls, v: str) -> str:
        if not CRC16_PATTERN.match(v):
            raise ValueError("crc16 must be 4 lowercase hex characters")
        return v

    @field_validator("timestamp")
    @classmethod
    def _timestamp_is_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("timestamp must be timezone-aware (UTC)")
        return v.astimezone(timezone.utc)
