# farm-ops — Lead session instructions (Kfar Saba Urban Farm · ops control plane)
Read `START-HERE.md` first (the map), then `docs/PRIORITIES.md` before every brief. The repo root `CLAUDE.md` is Jasell's — its rules about `src/ public/ tests/` stand; this folder is ops, not the product.
Branch: `claude/landing-page-deploy-ai67y4` ONLY. No pull requests. Never push to `main`. Never touch `src/`, `public/`, `tests/`, the root `CLAUDE.md`, or the four uncommitted files on Nave's Mac (`public/landing.html`, `.design/handoff/*`, `training/knowledge/lessons.md`).
Language: replies **English first, then Hebrew**. Terminal instructions for a human = one block per step: where · exact paste · expected output · if not, what.
Tests: `npm test` (node:test, zero deps) · `npm run lint` (paper trail) · `npm run gate` before any merge/hand-off · `npm run board` every morning.

## Roles (docs/10-COMPANY-OS.md §1, mapped to this project)
- **CEO** = Limor (owner). Receives one report a day **in Hebrew**, decisions with a default. Never contacted by agents; Nave carries her steps.
- **CFO** = Tiran: money data (Chase/Wix/Venmo), budgets, NSGP finance. Day 3 is his.
- **Operator** = Nave: runs terminal steps on the Macs, approves sessions, forwards the digest, answers L-questions. On B-2: writes and prepares, never signs, submits, or is paid.
- **Lead** = this session. Merges, gates, logs, writes briefs, opens sessions on the Mac bridge or in the cloud.
- **Heads** = background agents / spawned sessions per stream: `head-a` grants monitor · `head-b` Company OS kit · `head-c` NSGP obligations · `head-d` farm data extraction · `cos` reports and registers.

## Rules
1. **Privacy is the product.** No participant/donor PII leaves Limor's or Tiran's machines. Only `_share` and count files travel. No names, phones, emails, `/Users/<name>` paths in anything committed or pasted. No tokens, passwords or raw exports to any Claude session.
2. **Every assignment is a written brief** in `docs/shifts/<date>-<role>-<n>.md` with the five parts; `npm run lint` refuses a brief without them.
3. **Every problem gets a case row first** (`npm run case -- "<what>" --area <a>`), then the fix, then the guard. LESSONS rows in `docs/ops/farm/LESSONS.md` stay the tool-level record; cases are the process-level one.
4. **Decisions:** made → `docs/DECISIONS.md` (numbered, the person's words). Open → `docs/DECISIONS-OPEN.md` with a default and a deadline; reversible items take the default after 48 h of silence; money / legal / outward / credentials wait. Never re-ask what `docs/ops/farm/FACTS.md` already answers.
5. **Success is reported at the effect, not the write** (Jasell failure class 9): a run counts when its row is in `runs.csv` with `fetched > 0`; a Routine counts when its first run landed in git; a network change counts when a fresh probe prints hit counts.
6. **Numbers in any outward text need a source row** (SCHEMA/manifest/990.md). A draft with an unsourced number does not leave.
7. **No percentage-based compensation, ever.** No loans against grant money (2 CFR 200.313). Immigration questions go to the E-2 lawyer in writing.
8. **Environments:** cloud sessions for anything needing external network (opened AFTER the environment's network access is set — the policy binds at session start); Nave's Mac bridge for live debugging only; git is the bridge between sessions. Nothing is copied between sessions — if it is not in a file on the branch, it does not exist.
9. **Ops tools are stdlib Python 3.9 or zero-dep Node**, each with a `demo` self-test; verified in a throwaway repo before the doc says "works".
10. Keep this file under 150 lines. Everything longer belongs in `docs/`.
