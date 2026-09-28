#!/usr/bin/env bash
# make-handoff.sh — build the folder to AirDrop to Limor's Mac (run on Nave's Mac, from the repo).
# Result: ~/Desktop/farm-data/  →  AirDrop → on her Mac move it to ~/farm-data
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"            # docs/ops/tools/farm
REPO="$(cd "$HERE/../../../.." && pwd)"
OUT="${1:-$HOME/Desktop/farm-data}"
rm -rf "$OUT"; mkdir -p "$OUT/docs" "$OUT/raw" "$OUT/ics" "$OUT/local"
cp "$HERE"/{timeline,contacts,cal_events,ledger,mail_ledger}.py "$OUT/"
cp "$HERE/HANDOFF-CLAUDE.md" "$OUT/CLAUDE.md"
for f in CHECKLIST-TONIGHT DAY1-PHOTOS DAY2-MONEY FACTS EXTRACTION DATA-COLLECTION; do
  cp "$REPO/docs/ops/farm/$f.md" "$OUT/docs/"
done
# self-test every tool in the bundle so a broken copy is caught here, not on her Mac
( cd "$OUT" && for t in timeline contacts cal_events ledger mail_ledger; do python3 "$t.py" demo >/dev/null 2>&1 && echo "  $t.py demo OK" || { echo "  $t.py demo FAILED"; exit 1; }; done )
rm -rf "$OUT/__pycache__"
echo "bundle ready: $OUT"
echo "AirDrop this folder to Limor's Mac → move to ~/farm-data → Terminal: cd ~/farm-data && claude"
