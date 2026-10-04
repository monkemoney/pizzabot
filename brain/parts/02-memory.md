# 02 · Memory — what is remembered, where, for how long, and what is forgotten on purpose

**Purpose.** A new session is as capable as the last one. Memory is files in repositories, never a vendor's "I remember". Three kinds, like a person's: **semantic** (facts, decisions, doctrine), **episodic** (what happened: logs, cases, run records), **procedural** (how to do things: runbooks, briefs, scripts).

| Kind | Files | Writer | Retention |
|---|---|---|---|
| Semantic | `FACTS.md`, `DECISIONS.md`, `DECISIONS-OPEN.md`, `DOCTRINE.md`, `org.json`, `SCHEMA.md` | Lead / CoS, in the person's words | forever; corrections append, never edit |
| Episodic | `changes.log`, `delivery-ledger.md`, `runs.csv`, `gate-runs.log`, `agent-usage.log`, `cases/LOG.md`, `kpi.csv` | scripts and the Lead | forever; append-only |
| Procedural | `shifts/*.md` (briefs), `ceo/*.md` (sheets), runbooks (`DAY1-PHOTOS.md`…), `README`s, scripts with `demo` | Lead | versioned with the code; superseded files are marked, not deleted |
| Working | the session's context, `/tmp`, scratch | the session | dies with the session, by design |

**Owns.** The map (`START-HERE.md` per instance; `brain/README.md` above them) · the rule that every durable thing has a file and a path · the daily export of anything that lives on a platform (D48).
**Rules it enforces.** D12 (read before asking) · D15 · D31 (PII never stored; coded ids only) · D46/D48 (platform memory is a mirror).

**Forgetting, on purpose.** Sessions prune (90 days in Jasell). `conversation_history` sliced. Raw exports stay on their owner's machine and are never copied. A fact superseded gets a CORRECTION line. A KPI nobody acted on in four snapshots is deleted. Memory that is not read is noise.

**Exists today.** All of the above in Jasell, farm-ops and the kit; `CONTEXT.md` for the "how we work" layer; this `brain/` folder for the identity layer.
**Gaps.** Nave's personal registers (portfolio FACTS, personal decisions, doctrine) did not exist before today · artifacts (business plan, decks) live outside the repo (DECK-CORRECTIONS.md tracks the gap) · no search across repos ("where did we decide X?") beyond `grep`.
**Next build.** `portfolio/` repo with its own FACTS/DECISIONS/CONTEXT; a `recall` script: grep across all registers of all repos with a one-line answer and the file:line; the daily export job for the Base44 agent's memory and notes.

**Review questions for Nave.** What must the brain never write down even in coded form? · Which of your past projects' data should be imported as FACTS now (Jasell numbers, the pivot briefs, the cash plan)? · Who else may read the portfolio memory, and which parts?
