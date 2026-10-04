# REVIEW PLAN — building שבתאי together (v0.2 · 4.10.2026)

## A. Nave's staged plan (spec §9) — the brain enters real work in week one
| Stage | When | What | Success metric |
|---|---|---|---|
| **0 — MVP** | one day | constitution file (`CHARTER.md`) + four empty memory files (`STATE.md`, `DECISIONS.md`, `PATTERNS.md`, `playbooks/`) + one Claude Code conversation that runs with them · run the acceptance tests | 3 of 3 original tests pass (EVALS 1–3) |
| **1 — live work** | one week | first task: the farm's grant submission — break into deadlines, `state.md`, working drafts (`farm-ops/` and `tools/grants/obligations.csv` already carry it) · manual morning ritual (Nave opens) | the submission progresses; שבתאי caught at least one miss |
| **2 — initiative** | weeks 2–3 | two-way Telegram/WhatsApp channel + cron for rituals — שבתאי shows up on his own · authority matrix in full force (green runs alone, yellow waits) | a whole week in which the morning ritual opens without Nave |
| **3 — full partner (v2)** | one month | weekly partners' meeting + first forecast review · `PATTERNS.md` fills from reality · green widened by accumulated trust | at the first monthly meeting שבתאי presents at least one forecast of his that failed, and the calibration that fixed it |
| **Quarter** | 3 months | — | Nave gets back ≥ 1 working day/week · zero red decisions crossed the line · שבתאי actually stopped at least one front that was opening — proof of a partner, not an assistant |

## B. The review sittings — one part per sitting, run alongside the stages

> One part per sitting, 30–45 minutes, in this order. Each sitting ends with: the part's file updated in Nave's words where it says "to confirm", one decision logged, and one build step opened as a brief. Nothing is built before its part was reviewed.

| # | Part | Why this order | What Nave decides in the sitting | Build step opened |
|---|---|---|---|---|
| 1 | **08 Conscience** | the constraints come before any freedom; they are the shortest file and the hardest to change later | C9 in his words; anything to add | lint rule for PII patterns; CONSCIENCE line in the brief template |
| 2 | **DOCTRINE** (read-through) | the rules must be his, not the brain's paraphrase | strike or reword any rule; answer the 3 Open items ($ lines, kill criterion, never-delegated) | DOCTRINE v0.2 |
| 3 | **03 Judgment** | with constraints and doctrine set, decision rights can be real | thresholds; what a "reversal" is; override recording | `decisions.log` format; ratchet report spec |
| 4 | **02 Memory** | before more data flows in, decide what is stored, where, and what never | what is never written; which past project data to import; who may read | `portfolio/` repo skeleton; `recall` script |
| 5 | **01 Perception** | the intake habit must fit Nave's day (phone, outdoors) | channels the brain may read alone; voice-note path | portfolio INBOX + intake script; webhook receiver |
| 6 | **04 Planning** | the three active projects, named | active / parked / killed today | portfolio PRIORITIES; WIP lint |
| 7 | **10 Inner world** | the task workspace must exist before the big tasks of the month (repo split, Day 1, NSGP) start | the threshold; which current tasks get a workspace today; does he read STATE.md or the report | `tasks/_TEMPLATE/` + `task.mjs new`; head-e-1 gets a workspace |
| 8 | **05 Execution** | machines, night runs, weekly cost line | environments table; night-run rules; budget | repo split executed; model adapter spec |
| 9 | **06 Reflection** | wire the loops to the real data | which breaches wake him; reversal definition | KPI adapters; first Debug-head run |
| 10 | **07 Communication** | last, because it depends on everything above | outward templates allowed without him; language order per device | `report.mjs`; `templates/` |
| 11 | **09 Body** | the expensive part, decided with the doctrine already stable | number ownership; tier-1 model; body budget | voice adapter study; `actions.log` receiver; swap drill |

**After sitting 11:** the brain is v1.0. From then on it changes only through Reflection (cases, ratchet, doctrine additions with origin), never by editing a part in chat.

**How a sitting runs.** Nave reads the part (one screen). The Chief of Staff asks the review questions one at a time, each with a proposed default. Answers go into the file as Nave's words with the date. The build step becomes a brief under the relevant repo. 45 minutes maximum; what is not decided gets a default and a deadline in DECISIONS-OPEN.
