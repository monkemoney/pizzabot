# Changelog — Company OS kit

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
1. **KPI engine (1.3)**: `kpi.config.json` catalogue as data → `scripts/kpi.mjs` computes D/E KPIs from the files every instance has, appends weekly snapshots (`docs/okr/kpi.csv`), renders `docs/KPI.md` with trends, opens a case per new breach (idempotent), board section. Plan and 40-KPI catalogue: `farm-ops/docs/KPI-PLAN.md`.
2. **Chain scan**: a CEO sheet step at a vendor without a chain block, or with an `unknown` condition, fails the lint before the sheet goes out.
3. **Copies list** (`docs/COPIES.md`): every pair that must match, each with a comparer or a named owner; the lint checks the file exists and every row names one.
4. **Owner report generator**: `scripts/report.mjs` drafts the morning report skeleton from the board, in `ownerLanguage`, with the status words enforced.
5. **Security posture page** for organisations that hold sensitive data (secrets by name only, no live writes without a named switch, least privilege per role, append-only logs, no PII in any file the kit owns) — the kit was born inside a system that handles customers' phone numbers; the page states what the design guarantees and what it does not.
