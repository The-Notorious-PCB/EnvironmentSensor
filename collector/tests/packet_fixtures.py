import json

from app.serial.parser import canonical_payload, compute_crc16

_BASE_FIELDS = {
    "node_id": "helmet-01",
    "sensor_type": "co2",
    "value": 800.0,
    "unit": "ppm",
    "timestamp": "2026-09-17T14:00:00Z",
    "seq": 1,
}


def valid_line(**overrides) -> bytes:
    fields = {**_BASE_FIELDS, **overrides}
    fields["crc16"] = compute_crc16(canonical_payload(fields))
    return (json.dumps(fields) + "\n").encode("utf-8")


def bad_crc_line(**overrides) -> bytes:
    fields = {**_BASE_FIELDS, **overrides}
    correct = compute_crc16(canonical_payload(fields))
    fields["crc16"] = "0000" if correct != "0000" else "ffff"
    return (json.dumps(fields) + "\n").encode("utf-8")
