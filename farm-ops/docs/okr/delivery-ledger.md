# Delivery ledger — one line per role per event (append-only)

Lines (exact prefixes; `scripts/board.mjs` reads them):
- `resumed: <role> <d.m> <HH:MM> — <why / the brief>`
- `paused: <role> <d.m> <HH:MM> — <the reason nothing can be done now>`
- `closed-for-day: <role> <d.m> — run <n> (<brief file>): <what was delivered>`

## Lines
paused: head-a 29.9 22:20 LA — waits for network access (L-01); brief docs/shifts/2026-09-30-head-a-1.md ready
resumed: head-b 29.9 22:20 LA — brief docs/shifts/2026-09-30-head-b-1.md (kit 1.2 loop alarm) — can run in any session
resumed: head-c 29.9 22:20 LA — brief docs/shifts/2026-09-30-head-c-1.md (NSGP obligations) — can run in any session
paused: head-d 29.9 22:20 LA — waits for a Day-1 date with Limor (L-05); bundle and checklist ready
resumed: cos 29.9 22:20 LA — brief docs/shifts/2026-09-30-cos-1.md (first morning report)
