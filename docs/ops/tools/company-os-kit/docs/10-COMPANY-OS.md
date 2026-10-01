# Company OS — how the machine runs

## 1. Roles and autonomy levels
| Role | Who | May do alone | Must ask |
|---|---|---|---|
| **CEO** | the human owner | everything | — (receives one report a day, tough obstacles, decisions with a default) |
| **Lead** | the interactive Claude Code session | merge, gate, log, write briefs, read anything live read-only, run scripts at L3 | ship/publish (a human click), money, legal text, outward messages, new accounts, credentials |
| **Head of division** | a background agent per division | code + tests in its own worktree, docs in its own files, read-only live reads with secrets by name | anything live, anything in another stream's files, anything outward |
| **Chief of Staff (CoS)** | a background agent | the daily report, the decisions registers, minutes, the ledger's bookkeeping | — |
| **Debug (G)** | a background agent, on call | cases, pre-mortems, pattern review over the problems log, read-only | fixes (it thinks and proves; owners fix) |

Levels: **L1** docs · **L2** code + tests in a worktree · **L3** scripts that read live data · **L4** scripts that write live data behind a named switch, logged · **L5** the CEO only (money, legal, outward, accounts, credentials, autonomy grants).

## 2. The daily cycle
| When | What | Who |
|---|---|---|
| morning | merges owed, usage lines, the board, the two scans, the watch, the **dashboard report** | Lead + CoS/F |
| the CEO's slot (fixed, ≤ 15 min) | her clicks of the day, each from a walked sheet | CEO with the Lead on call |
| all day | briefs → runs → reports → merges (continuous assignment) | Lead + heads |
| end of day | ledger closed-for-day lines, minutes, the end-of-day note for the CEO | CoS |
| night | only runs that pay without the CEO (dark code with tests, a comparer, a read-only answer, a case); ≤ 4 in flight | Lead |

## 3. Model policy
One table, kept here: docs-only roles → the cheaper model; code that touches money, consent or security, and reviews → the stronger one; Debug's head → the strongest. Agents write their real model in the commit trailer.

## 4. Briefs (docs/shifts/<date>-<role>-<n>.md)
Goal · what you see · what to do (numbered, tests first where code) · what to bring back (the report's shape) · what not to do (never contact the CEO, never ship, no live writes, no secret values). Spawn prompt: `node scripts/spawn-prompt.mjs <brief>`.

## 5. Registers and logs
- `docs/DECISIONS.md` — numbered, dated, with the CEO's own words when she spoke, and what each decision supersedes.
- `docs/DECISIONS-OPEN.md` — one row per open question: default · impact if delayed · source · deadline; a §0 table says what happens on silence (reversible → default after 48 h; money/legal/outward → wait).
- `docs/meetings/changes.log` — append-only; a wrong line gets a later CORRECTION line, never an edit.
- `docs/okr/delivery-ledger.md` — `resumed:` / `paused: <why>` / `closed-for-day:` per role.
- `docs/okr/agent-usage.log` — one line per run (`node scripts/log-usage.mjs`).
- `docs/okr/gate-runs.log` — written by `scripts/gate.mjs`.
- `docs/cases/LOG.md` — every problem, 12 columns (see the file); `INBOX.md` — one line opens a case.

## 6. Guards that run (1.1) and guards still on paper
**Running:** `scripts/lint-docs.mjs` (briefs, decisions, log shapes, idle roles, stale cases, and since 1.2 the **loop alarm**: the same decision asked on 2 days = WARN, on 3 days without a `route change:` = FAIL — inside the gate) · the board's timing and deadline state · `scripts/case.mjs` · the gate's refusal to log a blank record.

**Still designs, not code:**
- **Loop alarm, second half**: two failed tries at one vendor with two different error texts = a **chain** (hidden prerequisites) → read the vendor's status screens before a third try.
- **Chain scan**: every step at a vendor in a plan or a CEO sheet must sit under a chain block (conditions, owner, vendor time, stamps `seen` / `documented` / `unknown`); a sheet goes to the CEO only when both scans pass.
- **Copies list**: every pair of things that must match (a lib and its copy, a doc and the code, the live build and the log) has a comparer or a named owner.
