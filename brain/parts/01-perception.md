# 01 · Perception — what the brain notices, and how a signal becomes a line in a file

**Purpose.** Nothing Nave says, sees or receives is lost, and nothing enters the brain unclassified. Perception turns a stream (chat, mail, calendar, data pulls, webhooks, Nave's voice notes) into typed lines: idea · fact · decision request · problem · deadline · signal from the world.

**Inputs.** Nave's messages in any channel · project data pulls (grants runs, extraction reports, KPIs) · webhooks from carriers (Base44 agent events, Meta, DIDWW) · the calendar · mail (farm Gmail, Nave's) · screenshots and pasted outputs.
**Outputs.** One line per signal, in the right register: `INBOX.md` (ideas, cases), `FACTS.md` (facts), `DECISIONS-OPEN.md` (questions), `obligations`/board (deadlines), `changes.log` (events).

**Owns.** The idea inbox (portfolio-level) · the project inboxes (`docs/cases/INBOX.md` per instance) · the classification rule below.
**Rules it enforces.** D3 (public first) · D11/D12 (unclear ≠ unanswered) · D15 (if it is not in a file it does not exist) · D31 (PII never recorded).

**Classification, one minute, no judgment yet:**
| Signal looks like | Goes to | Line shape |
|---|---|---|
| "what if…", "we could…" | idea inbox | `idea: <one sentence> · from <who/where> · <date>` |
| a number, a name of a thing, a date that is true | FACTS | `| n | fact | source | date |` |
| "should we…", a fork in the road | DECISIONS-OPEN | id · question · default · deadline |
| "it broke", "didn't work", a stack trace | cases INBOX → `case.mjs` | `case: <what> · since <when> · blocks <what>` |
| a date with a consequence | obligations / board | T-30/14/3 tracked |
| a paste of a run / probe / screen | changes.log + the project's run record | one line, evidence linked |

**Exists today.** Jasell: webhooks (Meta, DIDWW, Cardcom), SSE, inbox tab. farm-ops: INBOX.md, FACTS.md, case tool, ledger, changes.log. Grants: `runs.csv`, digest. Base44 agent: outbound webhooks `message.created/completed` with HMAC (not yet wired).
**Gaps.** No single portfolio inbox across projects · no voice-note path (Nave on the phone, outdoors) · webhooks from the hands provider not connected to any file · mail and calendar are read by Nave, not by the brain.
**Next build.** `portfolio/INBOX.md` + a 20-line `intake` script: one command, one line, classified by a keyword rule, with a weekly triage view. Then one webhook receiver (your own stack) that appends carrier events to `actions.log`.

**Review questions for Nave.** Which channels may the brain read on its own (mail? calendar? WhatsApp?) and which only when you paste? · Do voice notes go through a transcriber you trust (data tier 1)? · What is the one-minute capture habit you will actually keep on a phone?
