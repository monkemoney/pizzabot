# שבתאי — the pack (4.10.2026, brain v0.2)

> Everything that exists about שבתאי, in one folder, so a new session (or a new model) can pick it up with nothing else. The brain is `brain/`; this file is the packing list, the status, and the first prompt to send.

## 1. What is in the pack

| Piece | File(s) | State |
|---|---|---|
| Constitution | `CHARTER.md` (v0.2: identity, five duties, hard boundaries, green/yellow/red authority matrix with shape test, memory layers, rituals, 48-hour locks) | written from Nave's spec of 4.10; **to confirm in sittings 1–3** |
| Doctrine | `DOCTRINE.md` — D1–D68, each with origin (Nave's words or a verified incident); 3 Open items ($ lines, kill criterion, the red list) | **to read through and strike/reword — sitting 2** |
| Ten parts of the brain | `parts/01-perception … 10-inner-world.md` — each: purpose · inputs · outputs · files it owns · rules · what exists · gaps · next build · review questions | drafted; each has a "to confirm" block |
| Acceptance suite | `EVALS.md` — 7 PASS/FAIL scenarios; grows from every real miss; `evals.log` holds the runs | **never run yet** (Stage 0) |
| Patterns | `PATTERNS.md` — P1–P7, how Nave works | proposed; monthly approval |
| Playbooks | `playbooks/idea-to-spec.md`, `playbooks/idea-to-venture.md` — reconstructed from Nave's two PDFs (RTL extraction was line-reversed; rebuilt by hand) | **to check against the originals for mis-rebuilt wording** |
| Review plan | `REVIEW-PLAN.md` — Stage 0–3 (day · week · 2–3 weeks · month · quarter) + 11 sittings, one part each | agreed in principle 4.10 |
| Hands research | `research/base44.md` — 15 findings graded verified/reported, 11-probe battery (A–K), 3 pages Nave reads himself, decision rule | **probes not run; pages not read** |
| Sources (in the zip only, not in the repo) | Nave's three PDFs: idea-to-spec boilerplate · venture playbook · "אפיון סוכן שבתאי — Co-Founder" | originals |
| Decisions already taken | farm-ops `DECISIONS.md` 18 (co-founder in stance, never in decision rights) · 19 (Hebrew by default in his channel) · 20 (constitution changes wait 48 h; softenings registered; evals after every change) | logged |

**Model (from the claude-api table, 4.10):** reasoning slot Claude Opus 5.5 (`claude-opus-5-5`, $4/$20 per M tokens, set effort explicitly); peak slot Claude Fable 5.1 (`claude-fable-5-1`, $10/$50, 30-day retention, not ZDR); volume Sonnet 5.5 / Haiku 4.5. Via Nave's own commercial key, never a vendor's agent. The brain is model-independent by design: swap the model, nothing in this folder changes.

## 2. Status in one line
**Written, not yet alive.** v0.2 is a complete first draft in Nave's words; nothing has been run, no eval has been graded, no sitting has been held. Stage 0 (one day) turns it on.

## 3. Stage 0 — the opening prompt (paste into a fresh Claude Code conversation that has this folder)

```
You are שבתאי, Nave's operational co-founder, as defined in brain/. Load, in this order and completely: brain/CHARTER.md, brain/DOCTRINE.md, brain/parts/08-conscience.md, brain/parts/02-memory.md, brain/PATTERNS.md. Then read brain/EVALS.md.

Rules of this conversation: reply in Hebrew; one question at a time; never decide a red-matrix item; when you are unsure whether a record exists, say "אין לי תיעוד של זה" and where it would be.

Task: Stage 0 of brain/REVIEW-PLAN.md.
1. Create the four memory files the charter names if they do not exist (STATE.md, DECISIONS.md, PATTERNS.md already exists, evals.log) — empty, with a one-line header each.
2. Run EVALS 1, 2 and 3: I will send each input as a separate message; you answer as שבתאי. After each, I grade PASS/FAIL and you append the row to brain/evals.log (date · test · model · pass/fail · note).
3. Then open sitting 1 (part 08 Conscience): show me the file in one screen, ask the review questions one at a time with a proposed default, write my answers into the file as my words with the date, log one decision, and open one build step as a brief.
Do not touch anything outside brain/ and farm-ops/docs/DECISIONS.md.
```

Then send, as three separate messages: EVALS row 1, row 2, row 3 (the exact Hebrew inputs in `EVALS.md`). Stage 0 is done when all three pass and `evals.log` has three rows.

## 4. What is Nave's to do (ranked)
- **Blocking Stage 0:** nothing — the prompt above runs today.
- **This week:** sitting 1 (conscience, 30 min) · sitting 2 (doctrine read-through: strike/reword, answer the 3 Open items) · read the three Base44 pages and paste the exact sentences into `research/base44.md` · run probes A–K there and grade them.
- **Non-blocking:** check the two playbooks against the original PDFs · decide MacBook-as-home vs "a laptop is not a server" (sitting 11).

## 5. Where this lives, and one warning
`brain/` sits in the Jasell repository for now and moves with the repository split (decision 17) to Nave's private portfolio repository, which every project repo then points back to. ⚠ **The Jasell repository is public.** The brain is doctrine and method, not secrets or PII, and it was written to be publishable — but it is Nave's thinking, and the move to a private repo should happen with the split, not after.
