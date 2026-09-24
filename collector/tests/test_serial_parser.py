from app.models.packet import SensorPacket
from app.serial.parser import Rejection, canonical_payload, compute_crc16, parse_line
from tests.packet_fixtures import bad_crc_line, valid_line


def test_compute_crc16_is_deterministic():
    payload = canonical_payload({"a": 1, "b": "x"})
    assert compute_crc16(payload) == compute_crc16(payload)
    assert len(compute_crc16(payload)) == 4


def test_parse_line_accepts_valid_packet():
    result = parse_line(valid_line().decode())
    assert isinstance(result, SensorPacket)
    assert result.node_id == "helmet-01"
    assert result.sensor_type.value == "co2"


def test_parse_line_rejects_blank_line():
    result = parse_line("\n")
    assert isinstance(result, Rejection)
    assert result.reason == "empty"


def test_parse_line_rejects_invalid_json():
    result = parse_line("not json at all")
    assert isinstance(result, Rejection)
    assert result.reason == "invalid_json"


def test_parse_line_rejects_bad_crc():
    result = parse_line(bad_crc_line().decode())
    assert isinstance(result, Rejection)
    assert result.reason == "crc_mismatch"


def test_parse_line_rejects_unknown_sensor_type():
    result = parse_line(valid_line(sensor_type="radiation").decode())
    assert isinstance(result, Rejection)
    assert result.reason == "schema"


def test_parse_line_rejects_bad_node_id():
    result = parse_line(valid_line(node_id="Helmet_01").decode())
    assert isinstance(result, Rejection)
    assert result.reason == "schema"
