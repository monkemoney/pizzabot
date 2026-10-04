# 05 · Execution — sessions, heads, gates, and verification at the effect

**Purpose.** Turn a brief into shipped, verified work with no silent failure. One Lead per project, heads per stream, one merge at a time, a gate before anything ships, and a record for every run whether it succeeded or died.

**The loop.** brief → spawn (cloud session, Routine, or Mac bridge for live debugging) → the head works in its stream only → small commits, push → report in the shape the brief asked → Lead merges one branch (`merge-one.sh`, ancestor check) → `npm run gate` (tests · docs lint · merge check) → ledger `closed-for-day:` or `paused: <why>` → next brief.

**Rules it enforces.** D4 (effect, not write) · D6 (seeded verification) · D16/D17 (guarantees in code) · D19 · D21 (own repo, own `main`) · D27/D28 (structural fixes, remove dependencies) · D37 (empty ≠ ok).
**Owns.** The ledger, `gate-runs.log`, `runs.csv`-style run records, the Routine definitions, the environments table (which machine runs what and why).

**Environment doctrine (learned 29.9–1.10).** Cloud sessions for anything needing network, opened from the browser or by a Routine, never spawned from an old session (policy binds at start) · Nave's Mac bridge = live debugging only · git is the bridge between sessions · a product gets its own repo so `main` is ours and schedulers can run from it.

**Exists today.** Jasell deploy/rollback runbooks; farm-ops ledger/gate; grants `run` with `runs.csv`; Routine Sunday 05:47 LA (verified live 1.10: 382 fetched); kit merge/gate scripts; the Base44 agent as a hands worker (not yet wired).
**Gaps.** No action log from the hands provider into our files · repo split not executed (brief head-e-1) · the model adapter (D47) does not exist: sessions run on whatever the platform gives.
**Next build.** Execute head-e-1 (split) · `actions.log` receiver for carrier webhooks · a one-file model adapter spec (`parts/09-body.md`).

**Review questions for Nave.** Which machines are allowed to run what (your Mac, Limor's Mac, cloud, GitHub runners)? · What may run at night with nobody watching (the kit says: dark code with tests, comparers, read-only answers, cases)? · The cost line per week for execution?
