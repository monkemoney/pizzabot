# START HERE — farm-ops · Kfar Saba Urban Farm (reset 30.9.2026)

**One sentence:** this folder is the control plane for everything we do for the farm — what we are doing, in what order, what was decided, what is open, what broke, and the scripts that check the paper trail. The data-plane (the tools and the farm facts) lives where it already was; this folder points to it.

## The map
| What | Where | Read when |
|---|---|---|
| **The Chief of Staff's brain (charter, doctrine, nine parts)** | `brain/` (`README.md` → `CHARTER.md` → `DOCTRINE.md` → `parts/`) | when acting as Nave's Chief of Staff rather than the farm Lead; moves to the portfolio repo with the split |
| **Instructions for the Lead session** | `farm-ops/CLAUDE.md` | first |
| **How we work: time sinks, dead ends, what to stop/keep** | `farm-ops/docs/CONTEXT.md` | second — before the first brief |
| **Priorities P0–P3** | `farm-ops/docs/PRIORITIES.md` | before every brief |
| **90-day work plan with dates** | `farm-ops/docs/PLAN-90D.md` | weekly |
| **KPI plan + catalogue** | `farm-ops/docs/KPI-PLAN.md` · `farm-ops/kpi.config.json` | before touching a threshold or a report number |
| **Decisions made** / **open** | `farm-ops/docs/DECISIONS.md` · `DECISIONS-OPEN.md` | before asking anything |
| **Briefs (one per run)** | `farm-ops/docs/shifts/` | when spawning |
| **Limor's / Tiran's step sheets** | `farm-ops/docs/ceo/` | before their slot |
| **Problems log** | `farm-ops/docs/cases/LOG.md` | before debugging (`grep -i`) |
| **Ledger, usage, gate runs, changes** | `farm-ops/docs/okr/` · `docs/meetings/changes.log` | morning (`npm run board`) |
| **Owner report format + reports** | `farm-ops/docs/reports/` | daily |
| Facts already answered (#1–#21) | `docs/ops/farm/FACTS.md` | before asking Nave |
| Tool-level lessons | `docs/ops/farm/LESSONS.md` | after every live run |
| Extraction protocol, schema, checklists | `docs/ops/farm/PROTOCOL.md` · `SCHEMA.md` · `CHECKLIST-TONIGHT.md` · `DAY1-PHOTOS.md` · `DAY2-MONEY.md` · `EXTRACTION.md` | Day-1 / Day-3 work |
| NSGP, 990, grants spec | `docs/ops/farm/NSGP.md` · `990.md` · `GRANTS-SYSTEM-SPEC.md` | grants work |
| Compensation model · legal questions 9–11 · deck corrections | `docs/ops/farm/COMPENSATION.md` · `LEGAL-QUESTIONS.md` · `DECK-CORRECTIONS.md` | before any outward text or any paid-work question |
| Environment migration (why the old session retired) | `docs/ops/farm/ENV-MIGRATION.md` | if a network probe fails |
| **Grants monitor** (code) | `docs/ops/tools/grants/` (`README.md`, `monitor.py`, `runs.csv`) | head-a |
| **Extraction tools** (code) | `docs/ops/tools/farm/` (+ `make-handoff.sh` → bundle for Limor's Mac) | head-d |
| **Company OS kit** (the product this folder is an instance of) | `docs/ops/tools/company-os-kit/` (`CHANGELOG.md` §Next) | head-b |
| Weekly grants Action (fallback fetcher) | `.github/workflows/grants-monitor.yml` | — |

## The first 10 minutes of a new session
1. `cd farm-ops && npm test && npm run lint && npm run board` — three green lines and the board. A FAIL here is the first case of the day.
2. Read `docs/PRIORITIES.md` P0. Each P0 has an owner and a "done when".
3. Check the environment: `curl -sS -m 15 -o /dev/null -w "%{http_code}\n" https://api.grants.gov/` → `200`/`4xx` = network open; `000` = this session cannot run live pulls (see ENV-MIGRATION.md; do the review work, spawn the pull elsewhere).
4. Write the day's first brief from `docs/shifts/BRIEF-TEMPLATE.md`, `npm run lint`, spawn, log a `resumed:` line in `docs/okr/delivery-ledger.md`.
5. End of day: `closed-for-day:` lines, `changes.log` lines, the owner report in Hebrew in `docs/reports/`.

## Opening prompt for the new session (paste as the first message)
```
Read farm-ops/START-HERE.md, then farm-ops/CLAUDE.md, then farm-ops/docs/PRIORITIES.md. Run the first-10-minutes checklist and report the board. Then take P0 item 1 as written in its brief under farm-ops/docs/shifts/. Branch claude/landing-page-deploy-ai67y4 only; no PRs; replies English then Hebrew; terminal steps one block each.
```

## Infrastructure as of 30.9.2026 (FACTS #19–#21)
- Cloud environments: **Default** (`env_011Psi9w6ywEkft6y7yU8Ncq`) — every probe from it has answered 403 on the grant hosts, even after the access level was raised; treat it as **no network**. **full access** (`env_017QrgAG6RqHSbDAQYFBJhyf`, created 1.10) — the environment the Lead session runs in; probe 4.10: push credential present, all five grant hosts 200, demo green. Open new cloud work in **full access**.
- Weekly Routine **v2** `trig_0118y2H4rvne2K9ReUbHKZfe` "Grants weekly run + review (farm) — v2", Sunday 05:47 LA. It fires into the **persistent** session `session_01Qp4iuo9uB4WaKxvhiFm4Ek` ("Grants routine runner (farm) — persistent", full access, repo attached, Opus 5.5), which syncs the branch with `git reset --hard origin/...` at every firing. Why persistent: a Routine that opens a *fresh* session stores no repository and no environment choice — v1 (`trig_01KzWBhVXwkqFt1irYEiP6to`, now DISABLED) fired twice (1.10 forced, 4.10 scheduled), each run lasted about a minute, reported "succeeded", and pushed nothing. If the runner session is ever archived or deleted, create a new session in full access with the repo as a source and recreate the Routine pointing at it (persistent_session_id is set only at creation).
- Nave's Mac = bridge environment `Naves-MacBook-Pro:pizza-bot` (`claude remote-control`, spawn mode; window must stay open). Live debugging only.
- Mac session "Grants live pull 5" (session_01TazV8nUhgDgVP5PX2qxnxT) was left waiting on Nave's first approval; nothing pushed from it. Safe to ignore or approve.
