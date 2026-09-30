# Delivery ledger — one line per role per event (append-only)

Lines (exact prefixes; `scripts/board.mjs` reads them):
- `resumed: <role> <d.m> <HH:MM> — <why / the brief>`
- `paused: <role> <d.m> <HH:MM> — <the reason nothing can be done now>`
- `closed-for-day: <role> <d.m> — run <n> (<brief file>): <what was delivered>`

## Lines
