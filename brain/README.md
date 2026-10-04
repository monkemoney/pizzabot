# brain/ — the Chief of Staff's brain · Nave's operating mind, in files (v0.1 · 4.10.2026)

> **What this is.** The portable, model-independent part of "Jarvis": who it is for, how it decides, what it remembers, how it learns, what it may never do, and where it holds a big task while working on it. Ten parts, one doctrine, one charter. A model (any model) reads this folder and becomes the Chief of Staff; swap the model and nothing here changes.
> **What this is not.** Not a product and not an app. The hands (phone, email, browser) are rented behind adapters (`parts/09-body.md`). The farm's control plane (`farm-ops/`) and the Company OS kit are **instances** this brain runs; they are not the brain.
> **Where it goes.** Written inside the Jasell repo for now; moves with the repository split (decision 17) into Nave's own portfolio repository, as the top-level folder every project repo points back to.

## Load order for a session that is to BE the Chief of Staff
1. `CHARTER.md` — the role, the decision rights, the ratchet.
2. `DOCTRINE.md` — Nave's rules, numbered, with their origin. Decide inside them.
3. `parts/08-conscience.md` — the constraints that never move.
4. `parts/02-memory.md` — where everything is; then the project's own START-HERE.
5. The rest of `parts/` as the task needs them.

## The ten parts and how they connect
```
            ┌──────────────┐    signals, ideas, mail, events, data
            │ 01 Perception│◄──────────────────────────────────────── the world, Nave, projects
            └──────┬───────┘
                   ▼
   ┌───────────────────────────┐          ┌──────────────────┐
   │ 02 Memory (files, registers)│◄───────►│ 08 Conscience    │  constraints checked on every decision
   └──────┬────────────────────┘          └──────────────────┘
          ▼
   ┌──────────────┐   doctrine · defaults · decision rights
   │ 03 Judgment  │
   └──────┬───────┘
          ▼
   ┌──────────────┐   priorities · WIP limit · briefs · 90-day plans
   │ 04 Planning  │
   └──────┬───────┘
          ▼
   ┌──────────────┐   per big task: WORLD · PLAN · PREMORTEM · STATE · LOG (survives compaction, sessions, model swaps)
   │ 10 Inner world│◄────────────► 05 Execution runs one slice at a time from it
   └──────┬───────┘
          ▼
   ┌──────────────┐   sessions/heads · gates · verify at the effect
   │ 05 Execution │──────────────► 09 Body (hands: tools, carriers, models, data tiers)
   └──────┬───────┘
          ▼
   ┌──────────────┐   cases · lessons · KPIs · weekly review · the ratchet
   │ 06 Reflection│───────────────► back into 02 Memory and DOCTRINE.md
   └──────┬───────┘
          ▼
   ┌──────────────┐   the owner report · Nave's screen · one block per step
   │ 07 Communication│
   └──────────────┘
```

## Files
| File | What |
|---|---|
| `CHARTER.md` | Role: Chief of Staff & Operating Partner. Owns / never / style / autonomy / ratchet |
| `DOCTRINE.md` | 41 rules Nave coined or proved, grouped, each with origin and when it applies |
| `parts/01..10-*.md` | One part each: purpose · inputs · outputs · files it owns · rules it enforces · what exists today · gaps · next build · review questions |
| `REVIEW-PLAN.md` | The order Nave and the Chief of Staff go through the parts together, and what each session must decide |

## Sources this was mined from (4.10.2026)
Every message Nave wrote in the session of 8.9–4.10.2026 (153 messages) · `docs/ops/farm/FACTS.md`, `LESSONS.md`, `CONTEXT.md`, `COMPENSATION.md`, `LEGAL-QUESTIONS.md` · `farm-ops/` registers and cases · the Jasell `CLAUDE.md` failure classes and operational rules · `docs/STRATEGY.md` decisions D1–D13 · `docs/ops/{AGENDA,CASH,PIPELINE,EXPERIMENTS}.md` · the two Base44 interviews. Quotes are Nave's words; dates are when he said them.
