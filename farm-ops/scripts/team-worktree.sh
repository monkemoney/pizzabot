#!/bin/bash
# Company OS kit — one worktree + branch per role, next to the repo: ../<repo>-wt/<role> on branch head/<x> or team/<x>.
#   scripts/team-worktree.sh head-a        → ../<repo>-wt/head-a, branch head/a
#   scripts/team-worktree.sh a1            → ../<repo>-wt/a1,     branch team/a1
#   scripts/team-worktree.sh cos           → ../<repo>-wt/cos,    branch team/cos
set -euo pipefail
role="${1:-}"
[[ "$role" =~ ^(head-[a-z]|[a-z][1-3]|cos)$ ]] || { echo "usage: $0 head-<x> | <x><1-3> | cos"; exit 2; }
repo="$(git rev-parse --show-toplevel)"
main="$(node -p "try{JSON.parse(require('fs').readFileSync('$(git rev-parse --show-toplevel)/os.config.json','utf8')).mainBranch||'main'}catch(e){'main'}" 2>/dev/null || echo main)"
name="$(basename "$repo")"
wt="$(dirname "$repo")/${name}-wt/${role}"
case "$role" in head-*) branch="head/${role#head-}" ;; *) branch="team/${role}" ;; esac
if git -C "$repo" show-ref --quiet "refs/heads/$branch"; then
  git -C "$repo" worktree add "$wt" "$branch" 2>/dev/null || echo "worktree exists: $wt"
else
  git -C "$repo" worktree add -b "$branch" "$wt" "$main"
fi
echo "worktree: $wt  branch: $branch"
