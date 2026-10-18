# firmware

What relay box firmware must do to feed the collector. The firmware itself
doesn't live here: the working breadboard implementation (two Seeed XIAO
ESP32C6 boards: sensors -> BLE -> relay) is the separate
[BreadBoardTest](https://github.com/The-Notorious-PCB/BreadBoardTest) repo,
and is the reference for the real suit firmware.

## Responsibilities

- Read the suit's sensor nodes.
- Emit one NDJSON packet per line over USB serial, one per sensor reading
  (not batched), so a corrupt line costs one reading, not a session.
- Mirror every emitted packet to an SD card as a local backup log (not yet
  done on the breadboard rig).
- Stamp `timestamp` itself. The relay box has no clock: the collector writes
  `T<unix epoch ms>\n` to the serial port on connect and every 10 s
  (`collector/app/serial/reader.py`). The breadboard relay also treats 30 s
  without one as "nobody is listening" and stops writing.
- Keep `seq` monotonic per `node_id`, including across reboots (below).
- Compute `crc16` over each packet.

## Packet format

Authoritative schema: [`../shared/packet-schema.md`](../shared/packet-schema.md)
(and [`packet-schema.json`](../shared/packet-schema.json)). Example:

```json
{"node_id": "helmet-01", "sensor_type": "co2", "value": 812.4, "unit": "ppm", "timestamp": "2026-09-17T14:03:21.482Z", "seq": 10432, "crc16": "9ca5"}
```

- One JSON object per line, newline-terminated.
- `node_id`: `<location>-<index>`, lowercase-hyphenated.
- `sensor_type`: from [`../shared/sensor-types.json`](../shared/sensor-types.json).
- `unit`: always present; the collector never infers it.
- `timestamp`: ISO 8601 UTC.
- `seq`: uint32 per `node_id`, wrapping rather than resetting. It must not
  repeat within a collector session: rows are unique on
  `(session_id, node_id, seq)`, so a repeat is silently dropped as a
  duplicate. A relay that reboots mid-session has to carry on from where it
  was (the breadboard relay reserves `seq` blocks in flash).
- `crc16`: CRC-16/CCITT-FALSE (poly `0x1021`, init `0xFFFF`) over the
  compact, sorted-key JSON of every other field, i.e. Python's
  `json.dumps(fields, sort_keys=True, separators=(",", ":"))`. Reference:
  `compute_crc16`/`canonical_payload` in `collector/app/serial/parser.py`.

**The CRC pitfall:** the collector parses the line and re-serializes it with
Python before checking the CRC, so numbers must be written exactly as Python
would write them back. `22.50` comes back as `22.5`, and `-0.00` as `0`:
either would fail the check. Format with fixed decimals, then strip trailing
zeros and a trailing `.`. BreadBoardTest's `include/ndjson.h` does this and
its native tests check the output byte-for-byte against the collector's
reference values.
