import json
from pathlib import Path

from app.models.enums import SensorType

SHARED_DIR = Path(__file__).resolve().parents[2] / "shared"


def test_sensor_type_enum_matches_canonical_list():
    canonical = json.loads((SHARED_DIR / "sensor-types.json").read_text())
    assert [member.value for member in SensorType] == canonical


def test_packet_schema_json_enum_matches_canonical_list():
    """packet-schema.json can't import Python, so its `enum` array is kept
    in sync by hand — this test is what catches it drifting instead of
    silently going stale. If this fails, update the sensor_type.enum array
    in shared/packet-schema.json to match shared/sensor-types.json.
    """
    canonical = json.loads((SHARED_DIR / "sensor-types.json").read_text())
    packet_schema = json.loads((SHARED_DIR / "packet-schema.json").read_text())
    assert packet_schema["properties"]["sensor_type"]["enum"] == canonical
