# The owner's morning report — dashboard format

Written every morning by the CoS/Delivery head as `docs/reports/<date>-owner-morning.md`; the Lead pastes it as the first message of the day. Plain words only — no internal ids, branch names or agent names in the owner's copy. **Written in the owner's language** (`ownerLanguage` in `os.config.json`); the internal files stay in English.

## 1. One line
What changed since the last report, in one sentence a stranger understands.

## 2. Products
| Product | What it does | Status | Progress | Next step | Waiting on |
Status words (only these): **Live** · **Ready — your click** · **Built, off** · **In development** · **Planned** · **Blocked**.
Progress = a whole-number %, the Lead's estimate of the way to "live and verified by the owner"; it never goes down without a sentence saying why.
"Waiting on" = **you** (with the minutes) · **us** · **a vendor** (named).

## 3. Overall
Counts (live / ready / built off / in development) and one line of overall progress toward the goal, with what the number is based on.

## 4. Today, only you
At most three items with minutes and the default; each backed by a walked sheet or marked "not walked yet".

## 5. Watch
One line each: the core loop's numbers · money · problems (open, in plain words) · yesterday's cost (tokens).
