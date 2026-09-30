#!/bin/bash
# Company OS kit — ONE merge per command: --no-ff merge, conflict stop, ancestor check, and only then the changes.log line.
#   scripts/merge-one.sh head/a "run 1: the thing it did"
# Never chain two merges with && and -q: a conflict in the first stops the chain silently (that is how a false "merged" line was born).
#   scripts/merge-one.sh --verify head/a "run 1: …"   after a conflict you resolved by hand: ancestor check + log line only
set -uo pipefail
verify=0; [ "${1:-}" = "--verify" ] && { verify=1; shift; }
branch="${1:-}"; what="${2:-}"
[ -n "$branch" ] && [ -n "$what" ] || { echo "usage: $0 [--verify] <branch> \"<what>\""; exit 2; }
git fetch -q origin 2>/dev/null || true
tip="$(git rev-parse "origin/$branch" 2>/dev/null || git rev-parse "$branch")" || { echo "no such branch: $branch"; exit 2; }
if [ "$verify" = 0 ]; then
  git merge --no-ff "$tip" -m "Merge $branch: $what" || {
    echo "CONFLICT — resolve by hand (keep both sides of append-only files), then: git add -A && git commit --no-edit && $0 --verify $branch \"$what\""
    exit 1
  }
fi
if git merge-base --is-ancestor "$tip" HEAD; then
  run="$(echo "$what" | grep -o -E 'run [0-9]+' | head -1)"
  printf '%s · Lead · %s: merged %s %s · tip %s · %s\n' "$(date +%Y-%m-%d)" "$(date +%H:%M)" "$branch" "${run:-}" "$(git rev-parse --short "$tip")" "$what" >> docs/meetings/changes.log
  echo "merged and verified: $branch @ $(git rev-parse --short "$tip") — now: npm test · lint · npm run gate · log-usage"
else
  echo "NOT an ancestor after the merge — do not log it"; exit 1
fi
