# 04 · Planning — from a goal to briefs that a session can execute without asking

**Purpose.** Hold the few things that matter in view, cut them into executable units, and refuse the rest. Planning is where scale happens: the WIP limit and the kill rate, not more agents.

**Artifacts, top to bottom.** Goal in one sentence → `PRIORITIES.md` (P0–P3, each with owner and "done when") → `PLAN-90D.md` (weeks × tracks, gates per week) → `shifts/<date>-<role>-<n>.md` (one brief per run: goal · who feels it · read first · facts the Lead read · numbered steps, tests first · report shape · never-do) → ledger lines.

**Rules it enforces.** D2 (challenge before building) · D10 (separate structurally different cases) · D14 (plans are hypotheses with kill criteria) · D19 (parallel streams) · D20 (Tier 1 first) · D40 (steps that fit slots) · WIP ≤ 3 (CHARTER).
**Owns.** Priorities, plans, briefs, the WIP count, the idea triage (with Perception).

**How a brief is judged before it is spawned.** `npm run lint` refuses a brief without the five parts. Beyond the lint: a brief that needs a human for more than 30 minutes is split; a brief that depends on an open decision says so and waits; a brief that cannot name its "done when" is not a brief.

**Exists today.** farm-ops PRIORITIES, PLAN-90D, six briefs, KPI-PLAN; Jasell STRATEGY.md (D1–D13), AGENDA/PIPELINE/EXPERIMENTS; the kit's templates and lint.
**Gaps.** No portfolio-level priorities across Jasell / farm / kit / immigration / money · WIP limit exists as a rule, not as a check · 90-day plan review cadence is not scheduled.
**Next build.** `portfolio/PRIORITIES.md` with the three active projects named; a lint rule: more than 3 "active" → FAIL; a Sunday Routine that renders the board across repos.

**Review questions for Nave.** Which three are active this month, by name? · What is parked, with its re-open condition? · What gets killed today?
