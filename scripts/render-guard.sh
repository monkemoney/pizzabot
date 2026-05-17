#!/usr/bin/env bash
# render-guard.sh
# Called as a PreToolUse hook before Bash commands.
# Blocks dangerous Render API calls unless .env.production is fresh.

STDIN=$(cat)
CMD=$(echo "$STDIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only care about Render service-destructive commands
if ! echo "$CMD" | grep -qiE "(render\.com/v1/services|RENDER_API|srv-[a-z0-9]+).*(DELETE|delete|d831jc8)|(DELETE.*srv-|services.*DELETE)"; then
  exit 0
fi

ENV_FILE="$(dirname "$0")/../.env.production"

# Check existence
if [ ! -f "$ENV_FILE" ]; then
  echo '{"decision":"block","reason":"⛔ RENDER GUARD: .env.production does not exist. Run: node scripts/backup-render-env.js\nThis backs up all 15 env vars before you make destructive Render API changes."}'
  exit 0
fi

# Check freshness (warn if older than 24h)
if [ "$(uname)" = "Darwin" ]; then
  FILE_AGE=$(( $(date +%s) - $(stat -f %m "$ENV_FILE") ))
else
  FILE_AGE=$(( $(date +%s) - $(stat -c %Y "$ENV_FILE") ))
fi

if [ "$FILE_AGE" -gt 86400 ]; then
  HOURS=$(( FILE_AGE / 3600 ))
  echo "{\"decision\":\"block\",\"reason\":\"⛔ RENDER GUARD: .env.production is ${HOURS}h old (>24h). Run: node scripts/backup-render-env.js to refresh before proceeding.\"}"
  exit 0
fi

# All good — allow
exit 0
