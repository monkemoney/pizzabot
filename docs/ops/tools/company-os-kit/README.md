# Company OS kit — an AI-agent company run from one Claude Code session

A reusable skeleton of the architecture used at Kfar Saba Urban Farm: **one Lead session** (the operator, "COO") that assigns work to **division heads** (background subagents), each working in its own **git worktree** on a **written brief**, reporting back with a short summary; the Lead merges, gates, logs, and gives the human owner (the "CEO") one report a day plus decisions with defaults. Everything is files in the repo — no database, no external service, zero npm dependencies.

## The loop, in one picture

```
CEO (human) ──── decisions with defaults, one report/day ────► Lead session (Claude Code)
                                                                   │  writes docs/shifts/<date>-<role>-<n>.md (the brief)
                                                                   │  spawns a background agent per brief (its own worktree)
                                                                   ▼
                     head-a  head-b  head-c  …  cos  (subagents on branches head/a, head/b … team/cos)
                                                                   │  each: tests first, small commits, push, short report
                                                                   ▼
                              Lead: merge ONE branch at a time → ancestor check → gate → log → next brief or "paused: <why>"
```

Rules that made it work (all enforced by files or scripts here):
1. **Every assignment is a written brief** (`docs/shifts/`) with: goal · what you see · what to do · what to bring back · what not to do. Agents never contact the CEO, never publish, never write live without a named switch.
2. **One decision register** (`docs/DECISIONS.md`) and **one list of open questions for the CEO** (`docs/DECISIONS-OPEN.md`) — each open question carries a default and a deadline; silence on a reversible item = the default; money/legal/outward items wait.
3. **Append-only logs**: `docs/meetings/changes.log` (what changed, when, by whom, in the CEO's own words when she spoke), `docs/okr/agent-usage.log` (tokens/tools/minutes per run), `docs/okr/gate-runs.log` (every gate run).
4. **The ledger** (`docs/okr/delivery-ledger.md`): one line per role per event — `resumed:` / `paused: <why>` / `closed-for-day:` — so no head is ever idle without a stated reason ("continuous assignment").
5. **A gate before anything ships** (`scripts/gate.mjs`): tests, lint, your own steps; it writes its own record. Publishing/deploying stays a human click when the platform's safety rules say so.
6. **Merge discipline** (`scripts/merge-one.sh`): one merge per command, `git merge-base --is-ancestor <tip> main` before the log line says "merged"; `scripts/merge-lines-check.mjs` proves every "merged" claim in the log against git.
7. **Problems are data** (`docs/cases/LOG.md`, `INBOX.md`): every problem gets a row (cost, cause class, guard). A "Debug" division reads the log for patterns.
8. **CEO steps are walked first**: a step sheet (`docs/ceo/`) carries a stamp per step (`[walked <date> by <who>]` / `[not walked]`) and, for any step at a vendor, the whole chain of conditions read from the vendor's own status screens **before** the first click ("status first, whole chain first").
9. **One report a day in dashboard language** (`docs/reports/DASHBOARD-FORMAT.md`): products, status words, progress %, next step, waiting on whom.

## What 1.1 adds (2026-09-30) — timing, problem-solving, quality
The 1.0 kit recorded events; it did not tell you **how long** anything had been waiting, whether a decision's deadline had passed, or whether the paper trail was still well-formed. Three additions, all files that run:
- **Timing** — the board shows *since when* per role and flags a `paused:`/`closed-for-day:` older than `pausedAlertHours`; open decisions carry their deadline state (`n d left` · `overdue` · `silence → default applies` for reversible items · `overdue · waits` for money/legal/outward). The gate logs its duration per step and refuses to write a blank record outside a git repo.
- **Problem-solving** — `scripts/case.mjs` opens a numbered case row (never by hand, so nothing is lost between "case:" in the inbox and the log); the board reads the log in numbers (open · oldest · unchecked by Debug · without a guard · stale · by cause class).
- **Quality** — `scripts/lint-docs.mjs` runs inside the gate: every brief carries the parts the spawn prompt relies on and is named `<date>-<role>-<n>.md`; every open decision has a real default and a real deadline; `changes.log` lines keep their shape; `CLAUDE.md` stays under 150 lines; idle roles and stale cases are named. FAIL blocks the gate, WARN does not.
- **One config** — `os.config.json` (project name, main branch, timezone, owner language, the silence window, alert windows, the brief parts). `main`, the timezone and the silence rule were literals in four scripts.
- Fixed: `merge-one.sh` pointed to a script that did not exist after a conflict (`--verify` mode now); `log-usage` stamps carried no UTC offset; `team-worktree.sh` branched from a hardcoded `main`.

## KPIs (1.3)
`npm run kpi` computes the catalogue in `kpi.config.json` from the registers every instance already has, appends one snapshot row per KPI to `docs/okr/kpi.csv` (`date,id,value,target,breach`), and writes `docs/KPI.md`: breaches first, then by domain, ▲▼ against the previous snapshot. `npm run kpi -- --open-cases` also opens one problems-log case for each **new** breach, with class `monitor` and refs `KPI <id> · <ISO week>`, so a re-run in the same week opens nothing. `--dry` prints without writing. The board shows the latest snapshot as a `## KPIs` section (breaches as rows, the rest as one line), and the lint fails a snapshot that does not carry exactly one row per catalogue KPI.
- **The default catalogue** (`kpi.config.json`, 13 KPIs) covers the owner's decisions (D1 open + median age · D2 overdue · D3 silence-rule fires · D4 loop rounds · D5 reports sent) and the process (E1 idle roles · E2 brief cycle time · E3 gate pass rate · E4 lint fails · E5 open cases + MTTR · E6 recurrence · E7 cases without a guard · E8 unchecked by Debug). A project adds its own domains to the same file; an id with no computer is recorded empty and never breaches until an adapter exists. E9/E10 (cost) print dollars only when `os.config.json` carries `modelRates` ($ per million tokens, by model).
- **Breach rule:** `up` breaches below the threshold; `down` and `zero` breach at or above it. A KPI with two quantities (D1, E3, E5) reports the first as its value and the second in the note.
- **The week** is the 7 local calendar days ending today, in `os.config.json.timezone`.
- **The engine never breeds its own cases:** E6–E8 judge the problems log's hygiene and skip the rows the engine opened. E5 still counts them, because an open breach is real open work.

## Files

| Path | What it is |
|---|---|
| `CLAUDE.md.template` | Project instructions for the Lead session (copy to your repo root as `CLAUDE.md`, fill the blanks) |
| `os.config.json` | Project name · main branch · timezone · owner language · silence window · alert windows · brief parts — read by every script |
| `CHANGELOG.md` | What changed per version, and what is next |
| `docs/10-COMPANY-OS.md` | Roles, autonomy levels, the daily cycle, the rules above |
| `docs/PRIORITIES.md` | P0–P3 lists the Lead reads before every brief |
| `docs/DECISIONS.md`, `docs/DECISIONS-OPEN.md` | The registers |
| `docs/PARALLEL.md` | Streams, worktrees, merge order |
| `docs/shifts/BRIEF-TEMPLATE.md` | Copy per run |
| `docs/ceo/SHEET-TEMPLATE.md` | A CEO step sheet with stamps and a chain block |
| `docs/reports/DASHBOARD-FORMAT.md` | The morning report |
| `docs/cases/LOG.md`, `INBOX.md` | The problems log and the case inbox |
| `docs/okr/delivery-ledger.md`, `agent-usage.log` | The ledger and the usage log |
| `docs/meetings/changes.log` | Append-only change log |
| `scripts/team-worktree.sh` | Creates a worktree + branch per role |
| `scripts/spawn-prompt.mjs` | Prints the exact spawn prompt for a brief |
| `scripts/log-usage.mjs` | Appends one usage line (resolves the branch tip) |
| `scripts/merge-one.sh` | One merge, ancestor check, log line |
| `scripts/merge-lines-check.mjs` | "merged" claims in changes.log ↔ git |
| `scripts/gate.mjs` | Tests + docs lint + merge check + your steps, timed per step, writes `gate-runs.log`; refuses to run outside a repo |
| `scripts/lint-docs.mjs` | The paper-trail lint (briefs, open decisions, changes.log shape, CLAUDE.md size, idle roles, stale cases) |
| `scripts/case.mjs` | Opens a numbered case row in `docs/cases/LOG.md` |
| `scripts/board.mjs` | The board: roles with *since when*, open decisions with deadline state, the problems log in numbers, usage, merge verdict |
| `scripts/lib/ledger.mjs`, `scripts/lib/registers.mjs`, `scripts/lib/config.mjs` (+ tests) | Pure parsers and the config loader shared by the scripts — no I/O, time injected, so they are testable |

## Start in a new project

```bash
cp -R company-os-kit/* your-repo/            # keep your own README and package.json (merge the "scripts" block); merge CLAUDE.md.template into CLAUDE.md
$EDITOR your-repo/os.config.json               # project name, main branch, timezone, owner language
cd your-repo && npm test && npm run lint       # the kit's own tests (node:test, no deps) and the paper-trail lint
scripts/team-worktree.sh head-a               # a worktree + branch for the first head
node scripts/spawn-prompt.mjs docs/shifts/2026-01-02-head-a-1.md   # paste the printed prompt into the Agent tool
```

Then, in the Lead session: write the brief → spawn the agent (background) → when it reports: `scripts/merge-one.sh head/a "run 1: …"` → `npm run gate` → `node scripts/log-usage.mjs "head-a run 1" head/a <model> <tokens> <tools> <minutes>` → next brief, or a `paused:` line with the reason. A problem on the way: `node scripts/case.mjs "<what happened>" --area <area>` first, then fix. Every morning: `npm run board`.

## What is deliberately NOT here
Secrets handling (use your OS keychain and a `with-secrets` wrapper; never values in chat or files), deployment (a human click on your platform), the chain-scan detector (the design is in `docs/10-COMPANY-OS.md` §6; the loop alarm runs since 1.2), and any model-specific prompt tricks. Model policy (which model per role) is one table in `docs/10-COMPANY-OS.md` §3.
