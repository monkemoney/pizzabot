# Weekly grants Routine — how it must be created (4.10.2026)

## What we learned (three attempts, one afternoon)

| Attempt | How it was created | Where it ran | Result |
|---|---|---|---|
| v1 `trig_01KzWBhVXwkqFt1irYEiP6to` | API (`create_trigger`), fresh session per fire | Default env | fired 1.10 (forced) and 4.10 05:47 (scheduled): ~60 s each, "succeeded", **nothing in git** |
| v2 `trig_0118y2H4rvne2K9ReUbHKZfe` | API, bound to a persistent runner session (`session_01Qp4iuo9uB4WaKxvhiFm4Ek`, full access, repo attached — its own probe passed: push credential + 5 hosts + demo) | forced fire **ignored the binding** and opened a fresh session in Default | 34 s, nothing in git |
| v3 `trig_01GRjW2MaitM6mycLUX2LUdL` | API, fresh session per fire, **environment = full access** | full access env | **15 s**, nothing in git |

v3 is the decisive one: the network was fine and it still died at step 0. A session the Routine opens through the API has **no repository attached** (`sources: []`, `folders: none`), and in this product the GitHub credential follows the attached repository — so `git clone`/`git push` have nothing to authenticate with, whatever the environment. The "succeeded" status means only that the session ended; **the only proof of a run is a new row in `runs.csv` on the branch.**

The API cannot attach a repository to a Routine. The claude.ai Routines page can. So the Routine is created **once, by Nave, in the UI**, with the repository and the environment selected — and the prompt below pasted in.

## Create it (Nave, ~3 minutes)

1. claude.ai → Code → **Routines** → new Routine.
2. Repository: `monkemoney/pizzabot`, branch `claude/landing-page-deploy-ai67y4`. Environment: **full access** (not Default). Model: Opus if offered.
3. Schedule: weekly, Sunday 05:47, America/Los_Angeles. Notifications: push + email.
4. Prompt: paste the block below exactly.
5. Save, then **Run now**. Proof = a new row in `docs/ops/tools/grants/runs.csv` on the branch within ~10 minutes and a commit "grants: weekly run 2026-10-04" by `grants-routine`. The phone notification is not proof.
6. Then disable `v2` (still enabled as a Sunday experiment: does a *scheduled* fire honour the persistent-session binding where a forced one did not? If v2's Sunday fire also lands nothing, delete v1–v3).

## Prompt (paste as-is)

```
Weekly grants monitor run and review for The Jewish Sanctuary Kfar Saba Urban Farm (a small religious 501(c)(3) animal-therapy urban farm in Los Angeles: animal rescue, healing visits for trauma survivors and soldiers, education tours, youth). This is an ops task in repo monkemoney/pizzabot on branch claude/landing-page-deploy-ai67y4 ONLY. Never push to main, never open a pull request, never edit src/, public/, tests/ or CLAUDE.md. Only public grant listings are involved; no farm, customer or donor data.

0. Sync. The repository is attached to this session. Run:
   git fetch origin claude/landing-page-deploy-ai67y4 && git checkout claude/landing-page-deploy-ai67y4 && git reset --hard origin/claude/landing-page-deploy-ai67y4
   Then verify the push credential BEFORE any work: git push --dry-run origin claude/landing-page-deploy-ai67y4 2>&1 | tail -3
   If it answers 403 or asks for authentication, the FIRST line of your final message says "FAILED: no push credential" with the exact text, and you stop. If there is no repository at all, the first line says "FAILED: no repository attached" and you stop.

1. Read docs/ops/tools/grants/README.md, the "grants" rows of docs/ops/farm/LESSONS.md, and farm-ops/docs/CONTEXT.md §2.

2. Run the pipeline:
   cd docs/ops/tools/grants && python3 monitor.py demo && python3 seed_funders.py && GRANTS_RUNNER=routine python3 monitor.py run
   If the demo fails: stop, report the assertion, push nothing.
   If the run row in runs.csv says status=empty or failed: report exactly which hosts were blocked (quote the proxy or URLError text) and stop; do not fabricate a digest. Do NOT try GitHub Actions.

3. Review (the part a script cannot do). Read runs.csv (last row), digest.md and the top 30 rows of opportunities.csv by score. Check against org.json and the LESSONS rows:
   - false positives among rows scoring 50+ (hospital/medical/research deliverables, infrastructure, reentry, programmes for institutions);
   - real candidates the filters demoted (rows 40-69 that genuinely fit a small LA animal-therapy/education nonprofit);
   - deadlines within 45 days that changed since last week;
   - runs.csv trend: fetched, stale, 70+ versus previous rows.
   Do NOT edit monitor.py scoring yourself; propose changes in the report. If you learned something concrete, append ONE row to the grants section of docs/ops/farm/LESSONS.md in the same table format (date | grants · weekly run | what happened | what to change | commit).
   Append a short section "הערות הסוקר (<date>)" at the bottom of digest.md: up to 5 bullets in Hebrew for Limor — real candidates to look at with links, false positives removed, anything needing a decision.
   Append one line to farm-ops/docs/okr/delivery-ledger.md: `closed-for-day: head-a <d.m> — routine run (<date>): <one line>` and one line to farm-ops/docs/meetings/changes.log in its documented shape. Dates are Los Angeles local dates.

4. Commit and push:
   git add docs/ops/tools/grants/opportunities.csv docs/ops/tools/grants/digest.md docs/ops/tools/grants/funders.csv docs/ops/tools/grants/runs.csv docs/ops/tools/grants/debug docs/ops/farm/LESSONS.md farm-ops/docs/okr/delivery-ledger.md farm-ops/docs/meetings/changes.log
   git -c user.name="grants-routine" -c user.email="grants-routine@users.noreply.github.com" commit -m "grants: weekly run <YYYY-MM-DD>" && git push -u origin claude/landing-page-deploy-ai67y4
   If the push is rejected (fetch first): git pull --rebase origin claude/landing-page-deploy-ai67y4 && git push -u origin claude/landing-page-deploy-ai67y4. Retry up to 4 times with backoff on network errors. A run that did not push is a failed run: say so in the first line.

5. Final message, in this order: (a) the full digest.md text, ready to forward on WhatsApp to Limor (Hebrew); (b) an English status of 6 lines max: run status and duration, rows total / stale / 70+ / 50+, real candidates count, lessons added, proposed scoring changes, the commit SHA pushed. If anything failed, the first line says so.
```

## Until the UI Routine exists

The Lead session (full access, repo attached) runs the same five steps by hand on Sunday: paste the prompt above to it. That is what produced run 5 on 1.10 (`113acae`).
