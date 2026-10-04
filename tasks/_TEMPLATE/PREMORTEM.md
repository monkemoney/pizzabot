# PREMORTEM — "it is three weeks later and this failed. Why?"

Write five failure stories before the first irreversible step, each with the guard that prevents it.

| # | How it failed | Guard (test · check · watchdog · switch) |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | | |

## Run the plan against docs/FAILURE-CLASSES.md
- [ ] 1 multi-step without resume  - [ ] 2 no idempotency key  - [ ] 3 state with no exit
- [ ] 4 swallowing catch  - [ ] 5 trusted external input  - [ ] 6 dropped scope key
- [ ] 7 notifications from one path  - [ ] 8 derived data diverging  - [ ] 9 success at the write, not the effect
- [ ] 10 duplicated infrastructure  - [ ] 11 state assumed to outlive the process  - [ ] 12 local-calendar time
- [ ] 13 append-only with no retention owner
