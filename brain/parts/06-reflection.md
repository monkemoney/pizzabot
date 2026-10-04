# 06 · Reflection — cases, lessons, KPIs, the weekly review, and the ratchet

**Purpose.** The brain gets better from its own record, not from being told. Every problem becomes a row; every row gets a guard; recurrence is the signal a guard failed; KPIs feed the two departments (timing, problem-solving); the ratchet turns the decision record into autonomy.

**The loops, by cadence.**
| Cadence | What | Writes to |
|---|---|---|
| per event | `case.mjs` row before the fix; LESSONS row for tool-level learning | `cases/LOG.md`, `LESSONS.md` |
| per run | run record (`runs.csv`), reviewer notes (digest), gate line | run files |
| weekly (Sunday) | KPI snapshot → breaches → cases; board; the two biggest time sinks + eliminations; owner report | `kpi.csv`, `KPI.md`, `cases`, report |
| monthly | ratchet: decisions taken / reversed / cost → thresholds; doctrine additions; kill unread KPIs | `DOCTRINE.md`, `kpi.config.json` |
| quarterly | model swap drill (portability KPI); eject test of any platform | cases |

**Rules it enforces.** D5/D6 (planted tests) · D25/D26 (cases, loops) · D30 (fix the class) · D38 (time sinks) · D24 (eject) · the ratchet (CHARTER).
**Owns.** Cases, lessons, KPI catalogue and snapshots, CONTEXT.md ("how we work"), the Debug head's pattern review.

**Exists today.** farm-ops 13 cases with classes and guards; LESSONS 12+ rows; KPI catalogue (40) and kit 1.3 engine for D/E domains; CONTEXT.md; Jasell failure classes (13) and `audit-classes.js`.
**Gaps.** KPI adapters for grants/NSGP/extraction not built (plan step 3) · ratchet not computed · no quarterly drill scheduled · Debug head never run.
**Next build.** KPI step in the Sunday Routine; first Debug-head run over the 13 cases (pattern review: unwalked ×5 is the dominant class — what guard would have caught them all?).

**Review questions for Nave.** Which KPI breaches may wake you (push) and which wait for Sunday? · What is a "reversal" exactly, for the ratchet: you undo it, or you say you would have decided otherwise?
