# Problems & solutions log — one row per problem, every problem

**Before you debug: search this file for the symptom.** `grep -i "<word from the error>" docs/cases/LOG.md`
**Who writes:** whoever solved it, in the same shift; the Debug head checks every row at its next run and marks it `✓G`. No secret values, phone numbers or customer names.
**Cause classes (pick one):** `unwalked` we trusted a description of a screen/API nobody had seen · `drift` two things that must match stopped matching · `monitor` a check raised a false alarm or missed a real one · `session` tools, restarts, disk · `process` a rule was missing.

| # | Date | Problem | Area | Cost | Cause (evidence) | Class | Solution | Guard | Status | Refs | Checked |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | <date> | <what happened, in one sentence> | <area> | <owner minutes · money · Lead minutes> | <proven / not proven, with the file or screen> | <class> | <what was done> | <the test / check that stops it next time, or "to come: …"> | open / closed <date> | <case, decision, loop> | not checked |
