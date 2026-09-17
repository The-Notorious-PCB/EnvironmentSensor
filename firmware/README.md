# firmware

ESP32/Teensy relay box firmware. Out of scope for this codebase's Python/JS
work — this directory is a placeholder so the contract with `collector/` is
documented up front.

## Responsibilities

- Read suit sensor nodes over I2C/UART.
- Emit one NDJSON packet per line over USB serial, per sensor reading (not
  batched).
- Mirror every emitted packet to the SD card as a local backup log.
- Stamp `timestamp` itself (sensor nodes are not assumed to have wall-clock
  time).
- Maintain a monotonic per-node `seq` counter.
- Compute `crc16` over the packet before emitting it.

## Packet format it must emit

See [`../shared/packet-schema.json`](../shared/packet-schema.json) for the
authoritative schema. One example line:

```json
{"node_id": "helmet-01", "sensor_type": "co2", "value": 812.4, "unit": "ppm", "timestamp": "2026-09-17T14:03:21.482Z", "seq": 10432, "crc16": "3af1"}
```

Rules:

- One JSON object per line (NDJSON), newline-terminated.
- `node_id`: `<location>-<index>`, lowercase-hyphenated.
- `sensor_type`: lowercase snake_case, from the enum in the shared schema.
- `unit`: always present, explicit — the collector does not infer units from
  `sensor_type`.
- `timestamp`: ISO 8601 UTC.
- `seq`: uint32, monotonic per `node_id`, wraps rather than resets, so the
  collector can detect drops.
- `crc16`: hex string, computed over the other fields in a fixed order (TBD
  alongside firmware implementation) so both sides compute it identically.

A corrupt/partial line should cost the collector exactly one reading, not the
session — do not batch multiple readings into one line.
