import json
import re
from enum import Enum
from pathlib import Path

# Canonical list — to add a sensor type, add it here and nowhere else in
# Python. See shared/packet-schema.md for the full "adding a sensor type"
# process (packet-schema.json's enum array still needs updating by hand;
# collector/tests/test_sensor_types.py fails the build if it drifts from
# this file).
_SENSOR_TYPES_PATH = Path(__file__).resolve().parents[3] / "shared" / "sensor-types.json"


def _load_sensor_type_ids() -> list[str]:
    with open(_SENSOR_TYPES_PATH) as f:
        return json.load(f)


def _member_name(type_id: str) -> str:
    return re.sub(r"\W", "_", type_id.upper())


SensorType = Enum(
    "SensorType",
    {_member_name(type_id): type_id for type_id in _load_sensor_type_ids()},
    type=str,
)
SensorType.__doc__ = (
    "Built at import time from shared/sensor-types.json — that file is the "
    "single source of truth, this is a derived view. Not enforced at the "
    "SQLite schema level (see shared/packet-schema.md): readings.sensor_type "
    "is a plain string column, validated against this enum when a packet is "
    "parsed, so adding a member needs no migration."
)
