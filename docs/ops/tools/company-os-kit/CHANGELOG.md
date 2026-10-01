# Changelog — Company OS kit

## 1.3.0 — 2026-10-01
**KPI engine, generic half.** `scripts/lib/kpi.mjs` (pure, `now` injected) computes D1–D5 and E1–E10 from `DECISIONS-OPEN.md`, `DECISIONS.md`, `docs/reports/`, the ledger, `gate-runs.log`, `agent-usage.log`, `cases/LOG.md`, `changes.log` and `INBOX.md`. `scripts/kpi.mjs` appends a snapshot to `docs/okr/kpi.csv`, writes `docs/KPI.md`, and with `--open-cases` opens one case per new breach (idempotent on KPI id + ISO week). The board gains a `## KPIs` section; the lint checks every snapshot carries exactly one row per catalogue KPI. Default catalogue `kpi.config.json`: D1–D5, E1–E8 with the plan's thresholds. `scripts/lib/cases.mjs` is now the one builder of a case row, shared by `case.mjs` and `kpi.mjs` (`case.mjs` writes the same row as before). 10 new tests, 23 in total.
**Two defects found only by the seeded run, both now pinned by tests:**
- Two runs in the same minute shared one snapshot key, so the second doubled it: the lint failed and the board listed every breach twice. A same-key re-run now replaces its snapshot; earlier snapshots are never touched.
- The engine bred its own cases. The three cases its first run opened (same class and area, no guard yet) breached E6 recurrence and E7 no-guard on the second run, which opened two more. E6–E8 now skip rows whose refs start with `KPI `.

Verified in a seeded throwaway repo (`git init`, kit copied; seeded: a decision asked on two days, a role left closed-for-day past the 24 h window, 2 of 5 working-day reports):
```
D1 Open decisions and median age: 0 (target 8, threshold 15) — no ask dates in §0
D2 Overdue decisions: 0 (target 0, threshold 3)
D3 Silence-rule fires: 0 (target —, threshold 3) — defaults taken this week
⚠ D4 Loop rounds: 1 (target 0, threshold 1) — L-05 round 2
⚠ D5 Reports sent: 40 (target 100, threshold 60) — 2 of 5 working days
⚠ E1 Roles idle without reason: 1 (target 0, threshold 1) — head-a
E2 Brief cycle time: 32 (target 8, threshold 48) — 1 brief(s) closed
E3 Gate pass rate and duration: — (target 90, threshold 70) — no gate runs this week
E4 Lint fails per week: 0 (target 0, threshold 3) — gate runs failed on the docs lint
E5 Cases: open, MTTR: 0 (target 7, threshold 14) — no closed case yet
E6 Recurrence: 0 (target 0, threshold 1)
E7 Cases without a guard: 0 (target 0, threshold 3) — guard empty or "to come"
E8 Unchecked by Debug: 0 (target 0, threshold 5) — not checked by Debug, older than 7 days

snapshot 2026-10-01 16:39: 13 rows → docs/okr/kpi.csv · docs/KPI.md written
case #1 opened for D4
case #2 opened for D5
case #3 opened for E1
cases: 3 opened · 0 breach(es) already open this week
```
Re-run in the same week: `cases: 0 opened · 3 breach(es) already open this week`. Lint: `0 fail · 3 warn`. Board:
```
## KPIs
snapshot 2026-10-01 16:39
| id | value | target |
|---|---|---|
| ⚠ D4 | 1 | 0 |
| ⚠ D5 | 40 | 100 |
| ⚠ E1 | 1 | 0 |
9 green · 1 without data · 3 breached
```
`docs/KPI.md` (head):
```
# KPIs — snapshot 2026-10-01 16:39 (America/Los_Angeles) · week 2026-W40

Catalogue: `kpi.config.json` · 13 KPIs · 3 breached · 1 without data. Trend ▲▼ is the value's direction vs the previous snapshot, not good or bad.

## Breaches
| id | KPI | value | trend | target | threshold | note |
|---|---|---|---|---|---|---|
| D4 | Loop rounds | 1 |  | 0 | 1 | L-05 round 2 |
| D5 | Reports sent | 40 |  | 100 | 60 | 2 of 5 working days |
| E1 | Roles idle without reason | 1 |  | 0 | 1 | head-a |
```

## 1.2.0 — 2026-10-01
**Loop alarm as code.** `askCounts(changesLog, inbox)` in `scripts/lib/registers.mjs` counts, per decision id, the distinct days it was asked toward the owner ("asked", "re-asked", "שאלנו", "נשאל") across `docs/meetings/changes.log` and `docs/cases/INBOX.md`, since the last `route change:` line naming it. `lint-docs` warns at round 2 and fails at round 3; the board prints a `Loops:` line under Open decisions. `route change: none yet` (the INBOX template's own wording) does not count as a route change. Pure, time-free, 4 new tests (13 total).
Verified in a seeded throwaway repo (`git init`, kit copied, eight `changes.log` lines):
```
WARN  loop round 2: L-05 asked on 2 days — change the route (default? different person? smaller question?)
FAIL  loop round 3: L-09 asked on 3 days without a route change — do not ask a third time; change the route first
lint-docs: 1 fail · 1 warn
Loops: L-05 round 2 · L-09 round 3 ⚠
```
L-11 (asked twice, then `route change:`) is silent, as intended.

## 1.1.0 — 2026-09-30
**Timing.** Board: *since when* per role, ⚠ past `pausedAlertHours`; open decisions with deadline state and the silence rule (reversible → default applies; money/legal/outward → waits). Gate: ms per step and total; refuses to run outside a git repo instead of logging `HEAD= · branch=`.
**Problem-solving.** `scripts/case.mjs` opens a numbered case; board reads the problems log in numbers (open · oldest · unchecked · without a guard · stale · by class).
**Quality.** `scripts/lint-docs.mjs` in the gate: brief parts and names, decision defaults and deadlines, `changes.log` shape, `CLAUDE.md` ≤ 150 lines, idle roles, stale cases. `scripts/lib/registers.mjs` — pure parsers, time injected, 6 tests.
**Config.** `os.config.json` replaces the literals `main`, the timezone and the 48 h in four scripts. Stamps in logs use the configured timezone.
**Fixes.** `merge-one.sh --verify` (the post-conflict path used to call a script that did not exist) · `log-usage` ISO stamps carry the UTC offset · `team-worktree.sh` reads the main branch from config · spawn prompt names the project.

## 1.0.0
The skeleton as extracted from the farm work: briefs, worktrees, ledger, gate, usage log, merge discipline, cases, CEO sheets, dashboard format.

## Next (in order)
1. **KPI project adapters** (farm-ops, not the kit): `kpi.sources.json` maps the project's own domains (grants, NSGP, extraction) to their CSVs, so A/B/C stop reading "no source adapter yet".
2. **Chain scan**: a CEO sheet step at a vendor without a chain block, or with an `unknown` condition, fails the lint before the sheet goes out.
3. **Copies list** (`docs/COPIES.md`): every pair that must match, each with a comparer or a named owner; the lint checks the file exists and every row names one.
4. **Owner report generator**: `scripts/report.mjs` drafts the morning report skeleton from the board, in `ownerLanguage`, with the status words enforced.
5. **Security posture page** for organisations that hold sensitive data (secrets by name only, no live writes without a named switch, least privilege per role, append-only logs, no PII in any file the kit owns) — the kit was born inside a system that handles customers' phone numbers; the page states what the design guarantees and what it does not.
