import json
from dataclasses import dataclass
from typing import Union

from pydantic import ValidationError

from app.models.packet import SensorPacket

_CRC16_POLY = 0x1021
_CRC16_INIT = 0xFFFF


def compute_crc16(payload: bytes) -> str:
    """CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over `payload`.
    Returns 4-char lowercase hex, matching the crc16 wire field.
    """
    crc = _CRC16_INIT
    for byte in payload:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ _CRC16_POLY) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"{crc:04x}"


def canonical_payload(raw: dict) -> bytes:
    """The exact bytes crc16 is computed over: compact JSON, sorted keys,
    every field except crc16 itself. Firmware and collector both need to
    build this identically — see shared/packet-schema.md.
    """
    fields = {k: v for k, v in raw.items() if k != "crc16"}
    return json.dumps(fields, sort_keys=True, separators=(",", ":")).encode("utf-8")


@dataclass(frozen=True)
class Rejection:
    reason: str  # "empty" | "invalid_json" | "crc_mismatch" | "schema"
    detail: str
    raw_line: str


ParseResult = Union[SensorPacket, Rejection]


def parse_line(line: str) -> ParseResult:
    """Validate one NDJSON line. A rejected line costs this one reading,
    never the caller's loop — this never raises for malformed input.
    """
    stripped = line.strip()
    if not stripped:
        return Rejection("empty", "blank line", line)

    try:
        raw = json.loads(stripped)
    except json.JSONDecodeError as e:
        return Rejection("invalid_json", str(e), line)

    if not isinstance(raw, dict):
        return Rejection("invalid_json", "line is not a JSON object", line)

    expected_crc = raw.get("crc16")
    if isinstance(expected_crc, str):
        actual_crc = compute_crc16(canonical_payload(raw))
        if actual_crc != expected_crc.lower():
            return Rejection(
                "crc_mismatch", f"expected {expected_crc}, computed {actual_crc}", line
            )

    try:
        return SensorPacket.model_validate(raw)
    except ValidationError as e:
        return Rejection("schema", str(e), line)
