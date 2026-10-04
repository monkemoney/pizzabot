# 09 · Body — the hands, the carriers, the models, and the data tiers

**Purpose.** Everything that touches the world is a replaceable organ behind one adapter: models, phone, email, messaging, storage, compute. The brain never depends on a vendor; it depends on a contract.

**Adapters (one file each, one capability each):**
| Capability | Today | Candidates / owned already | Adapter contract |
|---|---|---|---|
| Model (reasoning) | Claude via Claude Code (cloud, Max on the Mac) | self-hosted open-weight for tier 1; any provider with commercial terms + ZDR | `complete(messages, tools) → text/tool_calls`; model name only in a log column |
| Phone (voice) | none owned; Base44 agent can dial on its provisioned number | a voice-agent provider on a number Nave owns (DIDWW already in Jasell) | `call(number, script, handover_rule) → transcript, outcome` |
| Messaging | Meta WhatsApp Cloud API (own WABA, Jasell); DIDWW SMS | — | `send(channel, to, template, vars)`; inbound via signed webhook |
| Email | Gmail (Nave's), farm Gmail | own SMTP/API key through a backend function | `send(to, template, vars)`; approval gate per CHARTER |
| Storage/DB | git repos (truth); Supabase (Jasell) | — | files first; a DB only for live product data |
| Compute | cloud sessions, GitHub runners, Nave's Mac bridge, Limor's Mac (data tier 0) | — | which runs what: `parts/05-execution.md` |
| Hands provider | Base44 hosted agent ("Operations Hands") | replaceable | outbound webhooks → `actions.log`; export daily; no doctrine stored there |

**Data tiers decide where a task may run.**
| Tier | What | Runs on |
|---|---|---|
| 0 | PII, secrets, raw exports, anything of Limor's/Tiran's | its owner's machine, scripts only, no model |
| 1 | Nave's private material: finances, doctrine, legal drafts, health | local model or commercial-terms model with ZDR; never a consumer plan |
| 2 | public data, code, ops text | any model by quality and price |

**Home and channel (Nave's spec §6, reconciled with D28).** Nave's spec: the MacBook that already runs 24/7 is the home — zero new infrastructure to rent; core = Claude Code or the Agent SDK with access to the memory folder; a two-way Telegram/WhatsApp channel so שבתאי can *initiate*; green autonomous, yellow stops for approval in the channel, **red blocked at the tool level**; daily backup of the memory folder to the cloud; keys, passwords and sensitive client documents never through the open channel and never in the open memory — a separate encrypted store. The brain's earlier rule "a laptop is not a server" (D28) was written for *unattended batch runs*; Nave's spec is about the *proactive channel and memory*. Reconciliation to decide in sitting 11: the Mac is the home for memory, the channel and the rituals **as long as its uptime is measured** (a missed 08:00 ritual is a case); heavy or scheduled runs stay in the cloud (Routines, runners); the daily backup is what makes the Mac replaceable.
**Rules it enforces.** D22 (own brain, rent hands) · D28 · D46–D48 · C1, C2, C8.
**Exists today.** Jasell's channel facade (`greenapi.js` Meta-first dispatch) is the template for an adapter: callers never know the provider. Phone/SMS via DIDWW exists for missed-call recovery.
**Gaps.** No model adapter · no owned voice line · hands provider not wired to our logs · no eject test run yet.
**Next build.** (1) voice-call adapter study: two providers, cost per minute, handover rule, one week (brief for the Lead) · (2) `actions.log` receiver · (3) model adapter spec with the swap drill.

**Review questions for Nave.** Which number do you want calls to come from: yours, a new one you own, or the provider's? · Which model runs tier 1 first: a local one on the Mac or a commercial-terms API? · Monthly budget ceiling for the body (credits, minutes, tokens)?
