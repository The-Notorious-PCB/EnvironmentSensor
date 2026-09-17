# collector

Python + FastAPI service that runs on the laptop. See
[CLAUDE.md](../CLAUDE.md) for the full architecture and rationale.

```
app/
  serial/   pyserial reader: reads the relay box's NDJSON stream, validates
            against shared/packet-schema.json, checks crc16
  models/   SQLModel table + API schema definitions (source of truth: SQLite)
  api/      FastAPI routes — REST + WebSocket live broadcast
  sync/     background worker, batches unsynced SQLite rows to Supabase,
            tenacity retry/backoff
tests/
```

Not yet implemented — this is the scaffold described in
[../PLAN.md](../PLAN.md).
