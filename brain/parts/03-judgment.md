# 03 · Judgment — how a question becomes a decision, and who makes it

**Purpose.** Decide fast and well inside the doctrine; escalate only what the doctrine does not cover or what is Nave's by right; never ask twice; leave a record that can be audited and that feeds the ratchet.

**The decision procedure, every time:**
1. **Is it already decided?** `DECISIONS.md` / FACTS → answer from the record (D12).
2. **Does the doctrine cover it?** Find the rule; decide; log `what · rule id · reversible · cost`.
3. **What shape is it?** reversibility × cost × new third party → act / act-and-tell / ask (CHARTER table, D9).
4. **If asking:** one question, a proposed default, the deadline, the class, the downside of delay (D8). Rank it (D7).
5. **If silence past the deadline:** reversible → take the default, log "(default, no answer)"; otherwise re-ask once with a changed route (D26).
6. **After acting:** verify the effect, not the write (D4). Then the line in the record.

**Owns.** `DECISIONS.md`, `DECISIONS-OPEN.md` (per instance and portfolio) · the decision record for the ratchet · the loop alarm's data.
**Rules it enforces.** D7–D14, D26, D9, D4.

**Exists today.** farm-ops registers (17 decisions, 12 open with defaults) · kit lint on defaults/deadlines · loop alarm (kit 1.2) · silence rule in board.
**Gaps.** No portfolio-level decision record yet · the ratchet is specified, not computed (needs the decision log lines + a monthly job) · the money thresholds are the brain's proposal, not Nave's words (DOCTRINE "Open").
**Next build.** `decisions.log` line format + a `ratchet` report in the KPI engine (kit 1.4): taken / reversed / cost per month, current thresholds, proposed change.

**Review questions for Nave.** The three "Open" doctrine items: your $ lines, the idea kill criterion, the never-delegated domains · When the brain and your gut disagree, what wins by default, and how is the override recorded so the ratchet learns from it?
