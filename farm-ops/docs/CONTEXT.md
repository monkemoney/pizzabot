# CONTEXT — what three weeks of work taught about how to work (for elimination and streamlining) · 1.10.2026

> For a Lead session that has the files but not the conversation. Everything here is a pattern that cost time or saved it, written so the next session does not pay for it again. Facts live in FACTS.md; decisions in DECISIONS.md; this is the **how**.

## 1. Who you are working with
- **Nave** (operator, Hebrew speaker, LA, B-2): wants the answer first, in one screen, English then Hebrew. Terse questions ("מה השאלות", "דחף", "עלה") are complete instructions — answer them, do not ask what they mean. Reads on a phone often. Rule from 28.9: every terminal step = where · exact paste · expected · if not. Challenges premises ("אנחנו באמת צריכים את זה?") — answer with a ranking, not a defence. Approves money explicitly ("מאושר") — ask once, with the cost, then proceed.
- **Limor** (CEO): her time is the scarcest resource; ≤ 15 min/day, from a walked sheet, in Hebrew. Never contacted by agents.
- **Tiran** (CFO): money and documents; one evening for Day 3, then monthly.

## 2. Where the time went (so it does not go there again)
| Time sink | Cost | Root cause | Eliminate / streamline |
|---|---|---|---|
| Cloud network policy (3 probes, 2 days, ~$6) | high | the policy binds at session start; a session spawned from an old session inherits the old policy — invisible until a browser-opened session proved it | **Eliminated:** live-pull sessions are opened in the **full access** environment (browser, or the persistent Routine runner). Default stays 403 whatever the setting says. Check `curl` in the first minute of every session |
| Nave's Mac as a relay for live runs (paste → run → paste back) | high, and his hands | the cloud had no network | **Eliminated** by Routine v2 (persistent runner in full access; v1's fresh sessions never had network or a push credential). The Mac bridge is for live debugging only |
| GitHub Actions fallback | 1 h, dead | GitHub registers workflows from `main` only; our rule is branch-only | **Eliminated.** Do not propose Actions again while the work lives on a branch |
| Grants.gov request shape | 1 h | documented separator was wrong; no probe before the pull | **Streamlined:** `monitor.py probe` first, always; a pull with 0 hits is a case, not a retry |
| Scoring false positives (hospital at 73, NIH ghosts) | 2 h over 3 runs | scoring tuned on fixtures, not on live data; pull never removed rows | **Streamlined:** every live run gets a reviewer pass; `stale` marking; `HARD_OFF`. Tune from the real `opportunities.csv`, never from imagination |
| Runbook commands written from memory (`--not-in-trash`) | would have cost Limor's evening | no verification against `--help` | **Streamlined:** skeptic/verification agents before any runbook touches a client's machine; demo self-tests for every tool |
| Secrets and PII hygiene reviews | medium, but necessary | privacy is the product | **Keep.** Every shareable output has an assert; every paste is read once for names/paths |
| Long bilingual replies | medium | rule says English then Hebrew | **Keep the rule, cut the length:** answer first, one screen, lists over prose. Nave asked for specificity, not volume |
| Re-asking answered facts | small each, large in sum | no single register at first | **Eliminated** by FACTS.md + DECISIONS.md; the lint refuses a question that has no default |

## 3. Dead ends — do not walk again
- Direct Postgres to Supabase (CLAUDE.md root); `pg` package.
- `claude` zsh alias with a space in the path; stale 2.1.138 — use the launcher script.
- Screen Sharing while Remote Management is on; `.local` names — use the IP.
- Numbers/Keep for CSVs on Limor's Mac (iCloud trap) — TextEdit.
- Candid/GuideStar lookups from the sandbox (blocked) — browser, 3 minutes, non-blocking.
- "Green card in a week" — no such category; R-1 is a work status with a religious role requirement (LEGAL-QUESTIONS.md).
- Percentage compensation (GPA/AFP/2 CFR 200.442) and loans against NSGP (2 CFR 200.313) — closed questions.

## 4. What to stop doing
- Spawning child sessions for anything that needs the network.
- Writing a plan in chat without a file: if it is not on the branch, the next session does not have it.
- Fixing the symptom where the pain is felt (one EventSource, one probe) instead of the class (Jasell failure class 10) — write the rule, then the fix.
- Asking Nave for facts that public sources or FACTS.md already hold.
- Reporting success at the write ("created", "pushed") instead of the effect (row in `runs.csv`, 200 from a probe, first run landed in git).

## 5. What to keep doing
- One block per terminal step. Expected output and the failure branch every time.
- Default + deadline on every question; the silence rule.
- Verify in a seeded throwaway repo before saying "works". Plant a violation to prove a guard can fail.
- Record every problem as a case **before** the fix; close it only with a guard.
- Read the Jasell failure classes before changing a process; most of what broke here was class 4, 9, 10, 11.
- Cost awareness: a probe session ≈ $2, a review session ≈ $2–5, a weekly run ≈ $5–10. Say the cost before spending it.

## 6. Heuristics for the Lead
- If a human must act, write the sheet first (`docs/ceo/`), with the chain of vendor conditions, then ask for the slot.
- If two things must match (a doc and the code, a brief and the spawn prompt), name the comparer or the owner.
- If a tool prints a number that will reach Limor, it needs a source row.
- If a run can die silently, it must leave a row that says so (`runs.csv`, `bot_runs`).
- When unsure whether something is blocking, rank it: blocking / this week / non-blocking — and say so.
