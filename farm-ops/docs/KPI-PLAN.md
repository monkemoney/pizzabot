# KPI plan — every number we steer by, wired into the timing and problem-solving departments (1.10.2026)

> **Rule 1:** a KPI is a file-derived number with a formula, a source column, a target and a department that acts on it. A number nobody acts on is deleted after four snapshots.
> **Rule 2:** the departments are not people, they are two loops that already exist: **Timing** = the board's "since when" + deadline states + run durations; **Problem-solving** = `docs/cases/LOG.md` + the lint. A KPI "connects" to a department when a threshold breach lands in that loop automatically — a flagged row on the board, or a case opened by the script.
> Catalogue as data: [`kpi.config.json`](../kpi.config.json) — 40 KPIs · 18 feed Timing · 20 feed Problem-solving · 7 are the owner's.

## 1. The catalogue, by domain
| Domain | KPIs | Source files that exist today | Source files still to come |
|---|---|---|---|
| **A grants engine** | A1 run health · A2 fetched · A3 stale ratio · A4 real candidates · A5 false positives · A6 reviewer minutes · A7 decisions/week · A8 decision latency · A9 submissions · A10 submissions→invitations · A11 $ awarded/requested · A12 missed deadlines | `runs.csv`, `opportunities.csv` (score, deadline, decision), `digest.md` | `applications.csv` (spec §4) once the first LOI goes out |
| **B NSGP award** | B1 real dates · B2 days to next · B3 overdue · B4 EHP before purchase · B5 reimbursement cycle · B6 spent/approved | — | `obligations.csv` (head-c run 1), `money_summary.csv` category `nsgp` (Day 3) |
| **C extraction** | C1 step outcomes · C2 owner hands · C3 steps > 30 min · C4 schema drift · C5 evidence coverage · C6 PII caught | `RUNREPORT.md` format (runlog.py), `SCHEMA.md` | the first real RUNREPORT (Day 1) |
| **D owner & decisions** | D1 open + age · D2 overdue · D3 silence fires · D4 loop rounds · D5 reports sent · D6 Limor minutes | `DECISIONS-OPEN.md`, `DECISIONS.md`, `docs/reports/`, `docs/ceo/` stamps | loop detector (kit 1.2) |
| **E process & cost** | E1 idle roles · E2 brief cycle time · E3 gate pass/ms · E4 lint fails · E5 cases open/MTTR · E6 recurrence · E7 no guard · E8 unchecked · E9 $/week · E10 $/brief | `delivery-ledger.md`, `gate-runs.log`, `cases/LOG.md`, `agent-usage.log` | model $ rates in `os.config.json` |

**The three numbers Limor sees** (report §5 "מעקב"): A4 real candidates this week · B2 days to the next NSGP obligation · E5 open problems. Everything else is ours.

## 2. How a KPI reaches a department
```
sources (CSV/MD on the branch)
   │  kpi.config.json = definitions (id · formula · source · target · direction · threshold · dept)
   ▼
scripts/kpi.mjs  ── compute ──▶ docs/okr/kpi.csv   (append-only weekly snapshot: date · id · value · target · breach)
                 ── render  ──▶ docs/KPI.md        (latest values, ▲▼ vs previous snapshot, breaches first)
                 ── board   ──▶ "## KPIs" section  (breaches only; green KPIs are one line)
                 ── --open-cases ──▶ docs/cases/LOG.md  (one row per NEW breach, class monitor, refs the KPI id;
                                                         a breach already open is not re-opened — idempotent on id+week)
                 ── report  ──▶ the three owner numbers into the morning report
```
- **Timing department** (18 KPIs): every duration/latency/age KPI shows on the board next to the ledger ages; a breach is a ⚠ row *and* a case. Weekly, the CoS reads `KPI.md` "Timing" block and writes one sentence: where the hours went (brief cycle time E2, reviewer minutes A6, decision latency A8, Limor minutes D6, cost E9/E10).
- **Problem-solving department** (20 KPIs): breaches become cases automatically, so the problems log is the single queue; the Debug head's pattern review adds **E6 recurrence** (same class twice in 30 d) — the signal that a guard did not hold. A case opened by a KPI closes only with a guard, like any case.
- **Both** (A12, B3, E1, E3, E5): a missed deadline is a time fact *and* a process failure — it shows in both loops by design, not by accident.

## 3. Breakdown — what gets built, in order
| Step | Deliverable | Where | Done when | Owner | When |
|---|---|---|---|---|---|
| 0 | This plan + `kpi.config.json` (40 definitions, validated: ids unique) | farm-ops | committed (today) | Lead | 1.10 |
| 1 | **Kit 1.2** loop alarm (D4's source) | company-os-kit | lint names a repeated ask; tests | head-b run 1 | week 1 |
| 2 | **Kit 1.3 KPI engine, generic half**: `scripts/lib/kpi.mjs` (pure: D1–D5, E1–E8 from files every instance has; `now` injected) + `scripts/kpi.mjs` CLI (snapshot `kpi.csv`, `KPI.md`, `--open-cases`) + board "## KPIs" + 8+ tests + seeded-repo verification | company-os-kit | `npm run kpi` in a seeded repo prints values, appends one snapshot row per KPI, opens exactly one case for a planted breach and none on re-run | head-b run 2 | week 2 |
| 3 | **Project adapters**: `kpi.sources.json` in farm-ops maps A/B/C to `docs/ops/tools/grants/*.csv` and the pasted RUNREPORT; A1–A5, A12, B1–B3 computed; C1–C4 parsed from RUNREPORT.md | farm-ops + grants | A/B values appear in `KPI.md` from real `runs.csv` / `obligations.csv` | head-a + head-c | week 2–3 |
| 4 | **Wiring**: weekly Routine runs `npm run kpi -- --open-cases` after the grants run; morning report pulls the three owner numbers; CoS brief gains the Timing sentence | farm-ops, Routine prompt | first Sunday snapshot in git; report shows the three numbers | Lead + cos | week 3 |
| 5 | **Cost**: `agent-usage.log` lines for every spawned session (tokens/min from the session usage), model rates in `os.config.json`; E9/E10 live | farm-ops | $/week and $/brief on the board | cos | week 3 |
| 6 | **Review after 4 snapshots** (end of October): delete KPIs that never changed a decision; tighten thresholds that never fired or fired every week | farm-ops | `kpi.config.json` ≤ 30 live KPIs, each with a "last acted on" date | Lead + Nave | week 5 |

## 4. Thresholds — how they were set
Targets come from the 90-day plan (3 decisions/week, 8 submissions, 0 missed deadlines), from the privacy rule (any PII = breach), from the kit's own windows (24 h idle, 48 h silence, 14 d stale case), and for money from the first weeks' observed cost (two probe sessions ≈ $4; one review session ≈ $2–5; a weekly run ≈ $5–10 → $60/week budget). A threshold with no fire in four weeks is tightened; one that fires every week is either real (a case that stays open) or wrong (tighten the definition, not the number).

## 5. What is deliberately not measured
Participants by name (ever) · donors by name · Nave's hours as billable (B-2) · vanity counts (rows fetched is a health signal, not a success metric) · anything that needs a login to a third-party dashboard to read.
