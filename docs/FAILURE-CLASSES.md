# Failure classes — the checklist that found ~50 defects in one session

> Extracted from Jasell (monkemoney/pizzabot, CLAUDE.md, July 2026), where naming *why* a flow was broken — instead of
> fixing it — turned one repair into about fifty, because the same shapes recurred everywhere.
> **Run this list against any process before changing it, and against your own change before committing it.**
> Add a class when a new shape recurs twice; keep the origin line so the rule stays tied to what earned it.

1. **Multi-step process with no atomicity.** Step 4 fails, steps 1–3 stand; no rollback, no resume.
   → Record per-step progress so a retry resumes and skips what already succeeded.
2. **No idempotency key.** A retry, a race or a double-click duplicates instead of recognising "already done".
   → A real constraint (unique index, claimed state), not a string check.
3. **A state with no exit.** Something enters a state and nothing ever takes it out.
   → Every such state gets a timestamp and a watchdog that acts when it ages.
4. **A `catch` that swallows.** The error is logged and the flow reports success. *The single most common root cause.*
   → Audit before every commit that touches an error path:
   `grep -rn "catch {}\|catch (.*) {}\|\.catch(() => {})" src/` — each hit either genuinely does not matter, or must surface.
5. **Trusting external input.** An unsigned webhook, an amount an LLM computed, an identity taken from a request body.
   → Verify cryptographically where the provider allows; cross-check against your own record where it does not.
6. **A dropped scope key** (tenant, user, account). A signature with a default plus a caller that forgets it.
   → No defaults on scope parameters — the default is the trap, not the safety net.
7. **Notifications from one path only.** An action happens in six places and one of them broadcasts.
   → Route every writer through a single exit point.
8. **Derived data diverging from its source.** The dashboard says X, the database or the processor says Y, nothing compares.
   → Define each number by what it means (revenue = money received), and select every field you filter on.
9. **Success reported at the write, not at the effect.** The user wants an *effective* state derived from several inputs;
   the handler writes one input, the write succeeds, "done ✅" — while another input vetoes the effect.
   → Ask per command: *what observable outcome does the user intend, and does the handler read it back after acting?*
   Also: status displays must show the derived state, not the raw input; and give an LLM an action for every intent,
   or it picks the nearest one that type-checks and declares victory.
10. **Duplicated infrastructure diverges.** The same plumbing hand-rolled N times, each copy at a different robustness level,
    because a fix landed where the pain was felt instead of on the class.
    → One owner per long-lived resource (connection, subscription, watcher): it detects death, reconnects with backoff,
    and re-syncs what was missed. Grep for the same primitive constructed twice.
11. **State that assumes it outlives its process.** A module-level map resets on every deploy and multiplies on scale-out.
    → For every new in-memory store, answer in a comment: what happens when this resets, and what happens with two instances.
12. **Local-calendar time at a product boundary.** The server clock is UTC; every business question is in someone's timezone.
    → Anything that buckets or compares by calendar day goes through one timezone helper. Epoch math is fine.
13. **Append-only data with no retention owner.** The failure is not growth — it is growth nobody decided on.
    → Every store that only grows carries a declared retention decision, even "keep forever, because …".

## Two habits that made the difference
- **Verify against production, not only against tests.** Tests confirm what you thought of; production shows what you did not.
- **Turn a rule into a file that runs.** Every "remember to…" is a candidate for a script in the test run. A guard must be
  shown to fail once (plant a violation) — a guardrail that cannot fail is class 9.
