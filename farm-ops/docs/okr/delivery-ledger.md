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
resumed: head-b 1.10 00:10 LA — brief docs/shifts/2026-10-01-head-b-2.md (kit 1.3 KPI engine) queued after run 1
resumed: head-a 1.10 11:06 LA — network open (monitor.py probe hit counts from a fresh cloud session; P0 item 1 done) — brief docs/shifts/2026-09-30-head-a-1.md ready to run
closed-for-day: head-a 1.10 11:55 LA — run 5 ok from the cloud (382 fetched, 0 at 70+, 3 real at 50+); YCA memo → L-06 (go-conditional, decide by 14.10); 2 scoring proposals in LESSONS/report — commit 113acae
closed-for-day: head-c 1.10 12:20 LA — obligations.csv 11 rows (2 dated, 4 verify, 5 rules) + digest block T-30/14/3/עבר/לאמת, demo asserts; open questions in NSGP.md §פתוח — commit 71e55f0
