# 10 · Inner world — the working space where a big task is held, modelled, cut, rehearsed and carried to the end

**Purpose.** A session's context is small and dies. A big task is large and must survive compaction, restarts, model swaps and days. The inner world is the brain's *working memory made of files*: for every task above a threshold it holds a model of the situation, the decomposition, the current state, the assumptions, the checkpoints and the verification record, so any session can pick the task up mid-way and so the brain can think about the task instead of re-reading it.

**Why it is a separate part.** Planning decides *what*; Execution does *it*; Memory keeps *what happened*. None of them holds the *thinking in progress* of a task that spans ten sessions. This session proved the need: one compaction happened mid-way and work continued only because a summary and the files existed. The inner world makes that the design, not the luck.

## The task workspace: one folder per big task
```
tasks/<yyyy-mm-dd>-<slug>/
  TASK.md        goal in one sentence · done-when (verifiable) · owner · budget (tokens/$ · human minutes) · deadline
  WORLD.md       the model of the situation: entities (people, machines, accounts, repos, vendors), their states,
                 the constraints that bind (conscience ids, doctrine ids), what is unknown and how it will be learned
  PLAN.md        decomposition into vertical slices (each slice = something verifiable on its own), order, dependencies,
                 what is parallel; each slice has: steps · test · rollback · who
  PREMORTEM.md   "it is three weeks later and this failed — why?" five ways, each with the guard that prevents it
  STATE.md       the only file that changes often: current slice · last checkpoint · open questions · blockers · next action
  LOG.md         append-only: checkpoints, decisions taken inside the task (with doctrine ids), verifications and their evidence
  RESULT.md      at the end: what was delivered, what was verified and how, what was learned (→ LESSONS/cases), cost actual vs budget
```
**Threshold:** a task gets a workspace when it needs more than one session, more than one person, or touches more than one repo. Below that, a brief is enough.

## The loop a big task runs
1. **Understand** — restate the goal and done-when in TASK.md; refuse to start on a goal with no verifiable done-when (D1, D4).
2. **Model** — WORLD.md: who and what is involved, what state each is in, which conscience and doctrine rules bind, what is unknown. Unknowns become questions with a default and a deadline (D8) or research tasks (D3).
3. **Decompose** — PLAN.md into slices that each end in something observable. Order by risk: the slice most likely to kill the task goes first. Mark what can run in parallel (D19).
4. **Rehearse** — PREMORTEM.md: five failure stories, one guard each. Jasell's 13 failure classes and farm-ops' 13 cases are the checklist to run against the plan before step 5.
5. **Execute one slice** — in its own session or sub-agent with *only* the context that slice needs (small context = better thinking). Verify at the effect (D4). Checkpoint to STATE.md and LOG.md.
6. **Reflect per slice** — one line: what surprised, what to change in PLAN.md; a case if something broke (D25).
7. **Repeat until done-when is observed**, then RESULT.md and the lessons out to Memory.

## Mechanisms that make it work
- **Externalised state beats context size.** STATE.md is read first by any session that resumes the task. The session's context is a cache, not the truth.
- **Small contexts, many minds.** Slices run in sub-agents/sessions with isolated context (the kit's heads; Claude Code's agents; Routine sessions). The Lead holds the workspace, not the details. Up to N in parallel (Base44: 12 workers; kit: one worktree per head).
- **Budgets the task can feel.** TASK.md budget in tokens/$ and human minutes; the model is told the budget (task budgets exist on the API) so it paces instead of being cut off; actual vs budget lands in RESULT.md and in the KPI engine (E9/E10).
- **Compaction-proof by construction.** Every durable thought goes to a file before the next tool call. A session that loses context loses nothing the task needs.
- **Pre-mortem before the first irreversible step.** The five stories are written against the real failure catalogue, not imagination.
- **Verification is a slice's exit condition, not a phase at the end.** A slice without a test is not a slice.
- **Model slot by step.** Understand / Model / Rehearse run on the reasoning slot (Opus 5.5, high effort); routine slices on the volume slot (Sonnet 5.5); a slice that failed twice escalates to the peak slot once, with the failure record attached.

**Rules it enforces.** D1, D2, D4, D6, D8, D19, D25, D26, D30, D37; C7 (instructions inside data stay data — especially inside WORLD.md sources).
**Owns.** `tasks/` under the portfolio and under each project; the task-workspace template; the threshold rule.

**Exists today.** Partial and scattered: briefs (one slice each), `runlog.py`/`manifest.json`/`RUNREPORT.md` for extraction runs, `ENV-MIGRATION.md` (a WORLD+PLAN for one task), the repo-split brief head-e-1 (a PLAN without STATE), Claude Code's own compaction summaries, the Agent tool for sub-agents.
**Gaps.** No task template; no STATE.md anywhere, so resuming a task means re-reading everything; pre-mortems are done in chat, not files; budgets are not told to the model; no rule for when a task needs a workspace.
**Next build.** `tasks/_TEMPLATE/` (the seven files, with the pre-mortem checklist pre-filled from the failure classes) + `scripts/task.mjs new <slug>` + a lint rule: a brief that references a task must point at its STATE.md. First real use: the repository split (head-e-1) gets a workspace before it runs.

**Review questions for Nave.** What is the threshold in your terms: hours, sessions, people, repos? · Which tasks running right now deserve a workspace today (repo split · Day-1 extraction · NSGP award · kit 1.4)? · Do you want to read STATE.md yourself, or only the morning report that summarises it?
