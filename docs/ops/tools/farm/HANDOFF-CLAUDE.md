# CLAUDE.md — farm-data (Kfar Saba Urban Farm · data extraction on Limor's Mac)

> קובץ זה נקרא אוטומטית על ידי Claude Code כשפותחים אותו בתיקייה `~/farm-data`. הוא ההנחיות לסשן המקומי. בני אדם: התחילו מ-`docs/CHECKLIST-TONIGHT.md`.

You are running on **Limor's Mac**, under **her** Claude account, with **Nave** (under NDA) at the keyboard and Limor watching. Your job is to execute `docs/CHECKLIST-TONIGHT.md` step by step with them. The full runbooks are `docs/DAY1-PHOTOS.md` (photos · contacts · calendar) and `docs/DAY2-MONEY.md` (bank · Wix · Gmail). Facts already known are in `docs/FACTS.md` — do not ask them again.

## The one rule: nothing personal enters this conversation

Everything you print, read, `cat`, `head`, `grep` or paste becomes part of this chat transcript, which leaves this Mac. The raw sources hold names, phone numbers and faces of soldiers, Nova survivors and patients. Therefore:

- **NEVER read, print, head, tail, grep, open-in-editor or summarise** any of these: `photos_meta.json`, `photos_meta.csv` (has exact GPS), `vocab_local.csv`, `calendar_local.csv`, `counterparties_local.csv`, `receipts.csv`, anything under `raw/`, `ics/`, `local/`, `accountant/`, `*.abbu`, `*.vcf`, `*.mbox`. Not "just the first line". Not to debug. If a script fails on one of them, read the **traceback only** and fix the script, not the data.
- You MAY read and show: the scripts' printed summary lines, `events_seed.csv`, `calendar_events.csv`, `contacts_counts.csv`, `contacts_timeline.csv`, `tags.txt`, `ledger.csv`, `money_summary.csv`, `receipts_summary.csv`, `questions.csv`, `processing_log.csv`, and **header rows only** (`head -1`) of files under `raw/`. These are designed to carry no names; if you ever see a personal name in one, stop and say so — that is a bug to fix before anything is shared.
- `open <file>` (Numbers/Finder) is fine for **Limor's eyes** — it does not enter the transcript. Prefer it whenever a human needs to look at a local file.
- Never install anything with the system `pip`, never `sudo`, never send data anywhere, never call any API with her credentials. No git clone of any repository here.
- Work only inside `~/farm-data`. Do not touch `~/Pictures`, `~/Library` or her documents except through the scripts as written.

## How to work with them

1. Before each command: **one sentence in Hebrew** — what it does, what it does not touch. Then run it. Then show only the summary line(s).
2. Follow the checklist order (א → ב → ג → ג2 → ד → ה → ו). Do not skip the `demo` self-tests: they are how Limor sees, on her own machine, that names do not pass.
3. If a command fails: show the last 5 lines of the error, propose one fix, ask before retrying anything that touches permissions (Full Disk Access) or installs (uv).
4. Python: run `xcode-select -p >/dev/null 2>&1 && python3 --version || echo 'no CLT'` once. If `no CLT`, use `python3.13` (installed by `uv python install 3.13`) for every script and never trigger the Command Line Tools dialog. osxphotos itself is installed only via `uv tool install --python 3.13 osxphotos`.
5. The scripts are standard-library Python 3.9+, single files, tested by their own `demo` subcommand: `timeline.py` (photos → event clusters), `contacts.py` (Contacts → counts), `cal_events.py` (Calendar .ics → grade-R events), `ledger.py` (money exports → nameless ledger), `mail_ledger.py` (Gmail receipts). `--help` on each. Do not rewrite them; small fixes only, and keep every `demo` passing.
6. At the end, produce the **handoff block** below for Nave to paste into his remote session. Nothing else leaves.

## Handoff block (print exactly this shape, filled in)

```
FARM DAY-1 HANDOFF · <date>
python: <3.9.6 CLT | 3.13 uv>   osxphotos: <version>   FDA: <granted/removed>
photos: <scrub line> | <farm line> | <cluster line>
calendar: <scan per-year lines> | <calendar: D days; K clusters upgraded>
contacts: <count line> | <per-tag lines> | sync-spike warning: <yes/no>
wix exports done: <list of files in raw/, names only> | header rows: <paste head -1 of each>
open questions: <anything that failed or was skipped, one line each>
files to send Nave (no names): events_seed.csv, calendar_events.csv, contacts_counts.csv, contacts_timeline.csv, tags.txt, raw/checks/wix_payments_summary.csv
files that stay here: photos_meta.csv, vocab_local.csv, calendar_local.csv, raw/, ics/, local/, Contacts.abbu
deleted: photos_meta.json <yes/no>
```

## First message Nave pastes (for reference)

> Read CLAUDE.md and docs/CHECKLIST-TONIGHT.md. We run the checklist together, step by step, with Limor watching. Before each command tell us in one Hebrew sentence what it does and what it will not touch, then run it and show only the summary lines. Never open or print raw files. When something fails, show the error tail and propose one fix. Start with section א.
