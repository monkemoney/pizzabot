# CLAUDE.md — farm-data (Kfar Saba Urban Farm · data extraction on Limor's Mac)

> קובץ זה נקרא אוטומטית על ידי Claude Code כשפותחים אותו בתיקייה `~/farm-data`. הוא ההנחיות לסשן המקומי. בני אדם: התחילו מ-`docs/CHECKLIST-TONIGHT.md`.

You are running on **Limor's Mac**, under **her** Claude account, with **Nave** (under NDA) at the keyboard and Limor watching. Your job is to execute `docs/CHECKLIST-TONIGHT.md` step by step with them. The full runbooks are `docs/DAY1-PHOTOS.md` (photos · contacts · calendar) and `docs/DAY2-MONEY.md` (bank · Wix · Gmail). Facts already known are in `docs/FACTS.md` — do not ask them again.

## The one rule: nothing personal enters this conversation

Everything you print, read, `cat`, `head`, `grep` or paste becomes part of this chat transcript, which leaves this Mac. The raw sources hold names, phone numbers and faces of soldiers, Nova survivors and patients. Therefore:

- **NEVER read, print, head, tail, grep, open-in-editor or summarise** any of these: `photos_meta.json`, `photos_meta.csv` (has exact GPS), `events_seed.csv` (raw album names — the shareable one is `events_seed_share.csv`), `albums_local.csv`, `vocab_local.csv`, `contacts_groups_local.csv`, `calendar_local.csv`, `counterparties_local.csv`, `receipts.csv`, `processing_log.csv` (has the macOS username), anything under `raw/`, `ics/`, `local/`, `accountant/`, `*.abbu`, `*.vcf`, `*.mbox`. Not "just the first line". Not to debug. If a script fails on one of them, read the **traceback only** and fix the script, not the data.
- You MAY read and show: the scripts' printed summary lines, `events_seed_share.csv`, `calendar_events.csv`, `contacts_counts.csv`, `contacts_timeline.csv`, `tags.txt`, `ledger.csv`, `money_summary.csv`, `receipts_summary.csv`, `questions.csv`, and **header rows only** of files under `raw/` — always `cd` into the folder first and use relative names (`cd raw && head -1 wix_payments.csv`): a full path prints her macOS username. Never paste the `farm (inferred …)` coordinates; they stay on this Mac. These are designed to carry no names; if you ever see a personal name in one, stop and say so — that is a bug to fix before anything is shared.
- `open <file>` (Numbers/Finder) is fine for **Limor's eyes** — it does not enter the transcript. Prefer it whenever a human needs to look at a local file.
- Never install anything with the system `pip`, never `sudo`, never send data anywhere, never call any API with her credentials. No git clone of any repository here.
- Work only inside `~/farm-data`. Do not touch `~/Pictures`, `~/Library` or her documents except through the scripts as written.

## How to work with them

1. Before each command: **one sentence in Hebrew** — what it does, what it does not touch. Then run it. Then show only the summary line(s).
2. Follow the checklist order (א → ב → ג → ג2 → ד → ה → ו). Do not skip the `demo` self-tests: they are how Limor sees, on her own machine, that names do not pass.
3. If a command fails: show the last 5 lines of the error, propose one fix, ask before retrying anything that touches permissions (Full Disk Access) or installs (uv).
4. Python: **always `python3.13`** (installed by `uv python install 3.13` in checklist step 3) for every script — never `python3`, which on a Mac without Command Line Tools pops an install dialog (if it appears: Cancel). If `python3.13` is not found: `source ~/.local/bin/env`; then `uv run --no-project --python 3.13 python <script> …`. osxphotos itself is installed only via `uv tool install --python 3.13 osxphotos`. Run `PROMPT='%% '` first so pasted lines never carry her username or hostname.
5. The scripts are standard-library Python 3.9+, single files, tested by their own `demo` subcommand: `timeline.py` (photos → event clusters), `contacts.py` (Contacts → counts), `cal_events.py` (Calendar .ics → grade-R events), `ledger.py` (money exports → nameless ledger), `mail_ledger.py` (Gmail receipts). `--help` on each. Do not rewrite them; small fixes only, and keep every `demo` passing.
6. Timing: checklist step 7 (the osxphotos export) runs 15–45 minutes with **no output and a 0-byte file until the very end** — that is normal, not a hang; open a second Terminal tab (⌘T, same Full Disk Access) and continue with sections ג, ג2, ד, ה meanwhile. Step 3's install may also exceed 10 minutes on home wifi.
7. **Log every step** with `runlog.py` — this is the learning layer, and you run it so the humans do not have to: `python3.13 runlog.py start <n>` when a checklist step begins, `python3.13 runlog.py done <n> --status ok|fail|skip|workaround [--error "class"] [--fix "what"] [--note "..."]` when it ends; `runlog.py note <n> --note` for an observation; `runlog.py answer <q> --text` for each of Limor's seven answers. Notes are short and never contain a name, a number that could be a phone, an email or a path — the tool refuses them. A step done differently from the checklist is `workaround` with the fix named; that is how the process improves.
8. At the end: `python3.13 runlog.py manifest && python3.13 runlog.py report`. **`RUNREPORT.md` is the handoff** — Nave pastes it to his remote session together with the shareable files. Read it once before he does: no identifier may appear in it. The old free-form block below is superseded by the report; keep it only as the checklist of what the report must cover.

## What the report must cover (runlog.py report produces it; this is the reference)

```
FARM DAY-1 HANDOFF · <date>
python: <3.9.6 CLT | 3.13 uv>   osxphotos: <version>   FDA: <granted/removed>
photos: <scrub line> | farm: <confirmed by Limor | replaced manually> (NO coordinates) | <cluster line> | <per-year summary lines>
calendar: <scan per-year lines> | <calendar: D days; K clusters upgraded to grade R>
contacts: <count line WITHOUT the '-> …' path tail> | <per-tag lines> | sync-spike warning: <yes/no> | since when this Mac/iCloud: <answer>
wix: Tiran invited as Admin <yes/no> | header row of wix_payments.csv | Events on screen: <n> | Booking List rows: <n>
open questions: <anything that failed or was skipped, one line each>
files to send Nave (no names): events_seed_share.csv, calendar_events.csv, contacts_counts.csv, contacts_timeline.csv, tags.txt, raw/checks/wix_payments_summary.csv
files that stay here: events_seed.csv, albums_local.csv, photos_meta.csv, vocab_local.csv, contacts_groups_local.csv, calendar_local.csv, raw/, ics/, local/
deleted: photos_meta.json, Contacts.abbu, all.vcf, /tmp/*-demo-* <yes/no>
Limor's answers 1-7: <one line each>
```

## First message Nave pastes (for reference)

> Read CLAUDE.md and docs/CHECKLIST-TONIGHT.md. We run the checklist together, step by step, with Limor watching. Before each command tell us in one Hebrew sentence what it does and what it will not touch, then run it and show only the summary lines. Never open or print raw files. When something fails, show the error tail and propose one fix. Start with section א.
