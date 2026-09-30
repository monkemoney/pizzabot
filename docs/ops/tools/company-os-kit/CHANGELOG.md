# Changelog — Company OS kit

## 1.1.0 — 2026-09-30
**Timing.** Board: *since when* per role, ⚠ past `pausedAlertHours`; open decisions with deadline state and the silence rule (reversible → default applies; money/legal/outward → waits). Gate: ms per step and total; refuses to run outside a git repo instead of logging `HEAD= · branch=`.
**Problem-solving.** `scripts/case.mjs` opens a numbered case; board reads the problems log in numbers (open · oldest · unchecked · without a guard · stale · by class).
**Quality.** `scripts/lint-docs.mjs` in the gate: brief parts and names, decision defaults and deadlines, `changes.log` shape, `CLAUDE.md` ≤ 150 lines, idle roles, stale cases. `scripts/lib/registers.mjs` — pure parsers, time injected, 6 tests.
**Config.** `os.config.json` replaces the literals `main`, the timezone and the 48 h in four scripts. Stamps in logs use the configured timezone.
**Fixes.** `merge-one.sh --verify` (the post-conflict path used to call a script that did not exist) · `log-usage` ISO stamps carry the UTC offset · `team-worktree.sh` reads the main branch from config · spawn prompt names the project.

## 1.0.0
The skeleton as extracted from the farm work: briefs, worktrees, ledger, gate, usage log, merge discipline, cases, CEO sheets, dashboard format.

## Next (in order)
1. **Loop alarm** as code: the same ask to the owner twice in `DECISIONS-OPEN`/`INBOX` = round 2 (red), three = black — the lint names it; a route change is required before a third ask.
2. **Chain scan**: a CEO sheet step at a vendor without a chain block, or with an `unknown` condition, fails the lint before the sheet goes out.
3. **Copies list** (`docs/COPIES.md`): every pair that must match, each with a comparer or a named owner; the lint checks the file exists and every row names one.
4. **Owner report generator**: `scripts/report.mjs` drafts the morning report skeleton from the board, in `ownerLanguage`, with the status words enforced.
5. **Security posture page** for organisations that hold sensitive data (secrets by name only, no live writes without a named switch, least privilege per role, append-only logs, no PII in any file the kit owns) — the kit was born inside a system that handles customers' phone numbers; the page states what the design guarantees and what it does not.
