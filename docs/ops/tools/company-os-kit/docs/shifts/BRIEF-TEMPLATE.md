# Head <X> — run <n>, <date> (<one line: why this run exists>)
Worktrees: <repo>-wt/head-<x> (branch head/<x>). First `git merge -q main`; `npm run lint` (check its exit code). Model: <per the policy>. <Docs only | code + tests>.
**Goal of the run:** <one sentence: what the customer or the owner can feel when it is done, or what it prevents>.
**Who feels it:** <customer/ship #n · owner/decision L-nn · prevented · preparation for <date>>.
Read first: <the files, in order>.
**Facts the Lead read (date, time, read-only):** <numbered facts with their source; never a guess>.
**Lead's answers to your last needs:** <(n) yes/no/ok — one line each>.
1. **<Item, tests first if code>:** <what exactly; what the test proves; what must not change>.
2. **<Item>**
3. **<Item>**
docs/meetings/<date>-head-<x>-<n>.md (short), then a ledger line for your role.
Commit small as you go (your real model in the trailer), push your branch, never force-push. Report a short English summary (<the exact shape: what changed; tests count; anything the Lead must decide>). Never contact the owner; never ship; no live writes (read-only reads with secrets by name are fine); no secret values and no private data anywhere.
