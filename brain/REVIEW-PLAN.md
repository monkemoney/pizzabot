# REVIEW PLAN — building the brain together, part by part (v0.1 · 4.10.2026)

> One part per sitting, 30–45 minutes, in this order. Each sitting ends with: the part's file updated in Nave's words where it says "to confirm", one decision logged, and one build step opened as a brief. Nothing is built before its part was reviewed.

| # | Part | Why this order | What Nave decides in the sitting | Build step opened |
|---|---|---|---|---|
| 1 | **08 Conscience** | the constraints come before any freedom; they are the shortest file and the hardest to change later | C9 in his words; anything to add | lint rule for PII patterns; CONSCIENCE line in the brief template |
| 2 | **DOCTRINE** (read-through) | the rules must be his, not the brain's paraphrase | strike or reword any rule; answer the 3 Open items ($ lines, kill criterion, never-delegated) | DOCTRINE v0.2 |
| 3 | **03 Judgment** | with constraints and doctrine set, decision rights can be real | thresholds; what a "reversal" is; override recording | `decisions.log` format; ratchet report spec |
| 4 | **02 Memory** | before more data flows in, decide what is stored, where, and what never | what is never written; which past project data to import; who may read | `portfolio/` repo skeleton; `recall` script |
| 5 | **01 Perception** | the intake habit must fit Nave's day (phone, outdoors) | channels the brain may read alone; voice-note path | portfolio INBOX + intake script; webhook receiver |
| 6 | **04 Planning** | the three active projects, named | active / parked / killed today | portfolio PRIORITIES; WIP lint |
| 7 | **05 Execution** | machines, night runs, weekly cost line | environments table; night-run rules; budget | repo split executed; model adapter spec |
| 8 | **06 Reflection** | wire the loops to the real data | which breaches wake him; reversal definition | KPI adapters; first Debug-head run |
| 9 | **07 Communication** | last, because it depends on everything above | outward templates allowed without him; language order per device | `report.mjs`; `templates/` |
| 10 | **09 Body** | the expensive part, decided with the doctrine already stable | number ownership; tier-1 model; body budget | voice adapter study; `actions.log` receiver; swap drill |

**After sitting 10:** the brain is v1.0. From then on it changes only through Reflection (cases, ratchet, doctrine additions with origin), never by editing a part in chat.

**How a sitting runs.** Nave reads the part (one screen). The Chief of Staff asks the review questions one at a time, each with a proposed default. Answers go into the file as Nave's words with the date. The build step becomes a brief under the relevant repo. 45 minutes maximum; what is not decided gets a default and a deadline in DECISIONS-OPEN.
