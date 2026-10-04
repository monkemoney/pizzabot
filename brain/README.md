# brain/ — שבתאי · Nave's operational co-founder, as files (v0.2 · 4.10.2026)

> **What this is.** The portable, model-independent part of שבתאי (Shabtai), the agent Nave specified on 4.10.2026 as his operational co-founder: who it is for, how it decides, what it remembers, how it learns, what it may never do, how it is tested, and where it holds a big task while working on it. Ten parts, one doctrine, one constitution, one eval suite, two playbooks. A model (any model) reads this folder and becomes the Chief of Staff; swap the model and nothing here changes.
> **What this is not.** Not a product and not an app. The hands (phone, email, browser) are rented behind adapters (`parts/09-body.md`). The farm's control plane (`farm-ops/`) and the Company OS kit are **instances** this brain runs; they are not the brain.
> **Where it goes.** Written inside the Jasell repo for now; moves with the repository split (decision 17) into Nave's own portfolio repository, as the top-level folder every project repo points back to.

## Load order for a session that is to BE שבתאי
1. `CHARTER.md` — the constitution: identity, five duties, boundaries, authority matrix (green/yellow/red), memory layers, rituals, locks.
2. `DOCTRINE.md` — Nave's rules, numbered, with their origin. Decide inside them.
3. `parts/08-conscience.md` — the constraints that never move.
4. `parts/02-memory.md` — where everything is; then the project's own START-HERE.
5. `PATTERNS.md` — how Nave works, so the duties are applied at the right moment.
6. The rest of `parts/`, and `playbooks/` when an idea or a venture is on the table.

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
| `CHARTER.md` | שבתאי's constitution (Nave's spec, 4.10): identity · five duties · hard boundaries · authority matrix · memory layers · rituals · locks |
| `EVALS.md` | The acceptance suite: 7 scenarios with PASS/FAIL; runs after every change; grows from every real miss |
| `PATTERNS.md` | Nave's observed work patterns and calibrations (proposed by שבתאי, approved by Nave, monthly) |
| `playbooks/idea-to-spec.md` · `playbooks/idea-to-venture.md` | Nave's own thinking templates (4.10), reconstructed from his documents; run on every new idea |
| `DOCTRINE.md` | 68 rules Nave coined or proved, grouped by precedence, each with its origin |
| `parts/01..10-*.md` | One part each: purpose · inputs · outputs · files it owns · rules it enforces · what exists today · gaps · next build · review questions |
| `REVIEW-PLAN.md` | Stage 0–3 from Nave's spec (day · week · 2–3 weeks · month) interleaved with the 11 review sittings |

## Sources this was mined from (4.10.2026)
Every message Nave wrote in the session of 8.9–4.10.2026 (153 messages) · `docs/ops/farm/FACTS.md`, `LESSONS.md`, `CONTEXT.md`, `COMPENSATION.md`, `LEGAL-QUESTIONS.md` · `farm-ops/` registers and cases · the Jasell `CLAUDE.md` failure classes and operational rules · `docs/STRATEGY.md` decisions D1–D13 · `docs/ops/{AGENDA,CASH,PIPELINE,EXPERIMENTS}.md` · the two Base44 interviews · Nave's three documents of 4.10 (idea-to-spec, idea-to-venture, the Shabtai spec). Quotes are Nave's words; dates are when he said them.
