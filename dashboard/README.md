# dashboard

React + Recharts frontend. See [CLAUDE.md](../CLAUDE.md) for the full
architecture and rationale.

```
src/
  components/   gauges, charts, alert indicators
  pages/        live dashboard, session playback
  hooks/        WebSocket client, data-fetching hooks
tests/
```

Not yet implemented — this is the scaffold described in
[../PLAN.md](../PLAN.md). Reads live data from the collector's WebSocket
endpoint and historical data from its REST API; sensor field names/units
should match [../shared/packet-schema.json](../shared/packet-schema.json).
