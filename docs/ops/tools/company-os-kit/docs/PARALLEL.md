# Parallel work — streams, worktrees, merge order

**Streams.** One per division head (`head/a` … `head/g`), one per team when a case needs hands (`team/a1` …), one for the CoS (`team/cos`). Each stream owns files (its plan, its stream file `docs/streams/<role>.md`, its code area). Shared files (the ledger, changes.log, the registers) are appended, never rewritten, so merges conflict only on the ledger — resolve by keeping both sides.

**Worktrees.** `scripts/team-worktree.sh <role>` creates `../<repo>-wt/<role>` on branch `<kind>/<role>`; the agent works only there. Nobody force-pushes; a rebased branch is pushed as `<role>-2` and the Lead is told.

**Merge order (the Lead, one branch per command).**
1. `scripts/merge-one.sh <branch> "<what>"` — merges with `--no-ff`, proves `merge-base --is-ancestor`, appends the changes.log line only then.
2. `npm test`, lint, `npm run gate` (writes `docs/okr/gate-runs.log`).
3. `node scripts/log-usage.mjs "<role> run n" <branch> <model> <tokens> <tools> <minutes>` — before the next merge line, so `merge-lines-check` can find the sha.
4. Ship = the human's click; log `Publish #n … live (code <marker>)` in changes.log right after; smoke.
5. Next brief for that role, or `paused: <role> <date> <time> — <why>` in the ledger.

**Merge size.** Under 400 lines per merge; a bigger branch is merged at its earlier commits first (each part its own merge and gate), unless the branch already carries its own resolutions of the shared files — then one merge, stated in the message.
