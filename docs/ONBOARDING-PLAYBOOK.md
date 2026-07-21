# Client Onboarding Playbook — Business Number + Missed-Call Recovery

**Manual pilot path (pre Tech Provider).** Validated end-to-end on 2026-07-19 against the
default tenant: DIDWW 03 number → forwarding → CDR webhook → caller identified → Meta
template dispatch. Every gotcha below was hit in practice that day — follow the order.

The platform side is fully multi-tenant already: zero code changes are needed to onboard
a client. This is an ops checklist.

---

## Phase 0 — Platform onboarding (existing flow)

1. Send the client the onboarding wizard link (vendor portal → אונבורדינג → לינק).
2. Client fills business details, hours, zones, menu; submits.
3. Vendor approves in the portal → tenant + settings + dashboard user are provisioned.
4. Note the **tenant_id** — everything below is keyed to it.

## Phase 1 — DIDWW: number + forwarding

1. Buy a DID in the client's area code (03 for center — area code mismatch hurts local trust).
   Identity/Address records are reusable across purchases (Jasell's, one-time setup).
2. **Cleanliness check BEFORE anything else** — DIDWW only reveals the full number after
   purchase, so: buy → try adding the number in Meta WhatsApp Manager → error
   `already registered to a WhatsApp account` (#2655122) means a recycled, dirty number.
   **Do NOT register it in the WhatsApp app to check** — a dirty number floods you with
   spam groups instantly. Dirty → cancel the DID (monthly, no commitment), buy another.
   Buying 2–3 and keeping the cleanest is cheap.
3. Create an **Inbound (Voice IN) trunk** → forward to the client's mobile. CLI number
   list empty (no filtering), capacity Pay-Per-Minute (no dedicated channels).
4. Attach the trunk to the DID (My DID Numbers → routing).
5. **Test call:** DID rings the client's mobile AND the original caller ID is shown.
   Forwarding must work before Meta's voice verification (the code call rides on it).

## Phase 2 — Meta: WABA + number + template

1. WhatsApp Manager (Jasell's Business portfolio) → Add phone number → the new DID →
   verify via **Phone call** (client answers the forwarded call, relays the code).
   Display name = the client's business name (this is what customers see).
2. **Assign the WABA asset to the System User** whose token the platform uses
   (Business Settings → System Users → Assign Assets → WhatsApp Accounts → Full Control).
   Until this is done the token gets `does not exist / missing permissions` on every call —
   even listing the WABA. After assignment, the WABA/phone IDs are discoverable via API.
3. **Subscribe the app to the WABA** — `POST /{waba_id}/subscribed_apps`. A fresh WABA has
   an EMPTY subscription list and Meta silently delivers nothing. approve() does this for
   tenants provisioned with meta creds; verify with GET regardless.
4. **Submit the template on THIS WABA** — templates are per-WABA; an approval on another
   WABA does not carry over (send fails `#132001 template does not exist`):
   ```
   POST /{waba_id}/message_templates
   { "name": "missed_call_recovery", "language": "he", "category": "UTILITY",
     "allow_category_change": true,
     "components": [{ "type": "BODY",
       "text": "היי 👋 ראינו שהתקשרתם אלינו ולא הספקנו לענות 🙏 אפשר להזמין כאן בהודעה — מה תרצו?" }] }
   ```
   Approval: usually minutes–hours, officially up to 24–48h. PENDING → sends fail with 404/#132001.
5. **Payment method on the WABA** (WhatsApp Manager → Billing) — business-initiated
   template messages are paid; without billing they fail even when approved.
6. Sanity: `GET /{phone_id}?fields=status,code_verification_status,quality_rating` →
   CONNECTED / VERIFIED / GREEN-or-UNKNOWN.

## Phase 3 — Platform wiring (settings seed)

Seed via Supabase REST (service key) — upsert `on_conflict=tenant_id,key`:

| key | value |
|---|---|
| `meta_phone_number_id` / `meta_access_token` / `meta_waba_id` | from Phase 2 (default tenant: env vars on Render instead) |
| `missed_call_enabled` | `true` |
| `missed_call_webhook_token` | `openssl rand -hex 24` |
| `missed_call_forward_number` | client's mobile (972…) — this phone is never messaged |
| `missed_call_template` / `missed_call_template_lang` | `missed_call_recovery` / `he` |
| `missed_call_when_closed` / `missed_call_throttle_hours` | per client preference (defaults: false / 3) |

Webhook URL for the next phase:
`https://www.jasell.com/webhook/calls/<tenant_id>?token=<webhook_token>`
Sanity: GET on that URL (no token needed) returns `{"ok":true,"service":"call-events"}`.

## Phase 3b — Optional: SMS channel (no Meta dependency)

`missed_call_channel = sms` sends the recovery as a DIDWW SMS with a `wa.me` link
instead of a WhatsApp template — useful while a template is pending, and as the
only channel that reaches callers without WhatsApp. One-time account setup:

1. DIDWW panel → SMS → create an **HTTP OUT trunk** → note username/password →
   env `DIDWW_SMS_USER` / `DIDWW_SMS_PASSWORD` on Render.
2. Whitelist Render's outbound IPs in the trunk config (Render dashboard →
   service → Connect → Outbound IP addresses) — without it every send 403s.
3. Per tenant: `missed_call_sms_sender` (usually the tenant's DID) and make sure
   `bot_whatsapp` is set (it feeds the wa.me link).
4. Keep the SMS text service-toned (Israeli spam law: this is a response to the
   customer's call, not marketing — no promotional language).

## Phase 4 — DIDWW CDR streaming

1. Panel → APIs → **Call Events API**. If it says *not activated for your account* —
   email support@didww.com (one-time per account; already activated for Jasell).
2. Configure Voice IN CDR Streaming: Endpoint = the URL above, **GZIP off**,
   Authentication/Headers empty (auth is the token in the URL).
3. Their IP whitelist note is irrelevant (our endpoint is public + token-authed).
4. Known quirk (already handled in code): DIDWW POSTs the CDR JSON with
   `Content-Type: text/plain` — the calls route parses any content type itself.

## Phase 5 — E2E test

1. Call the DID from a phone that is NOT the forward target, let it ring out, hang up.
2. Within seconds the recovery message should arrive from the business number.
3. Reply to it — the ordering bot must answer (opens the free 24h service window).
4. Also send a plain WhatsApp to the number — verifies inbound routing/subscription.
5. Logs (Render): `[calls:<tenant>]` lines show the decision per event; failed sends log
   the Meta error. Caller-field surprises log raw attrs for parser calibration.
6. Only after E2E passes: client publishes the number (menus, Google Business, flyers).

---

## Gotcha index (all hit on 2026-07-19)

| Symptom | Cause / fix |
|---|---|
| Meta: "already registered to a WhatsApp account" | Recycled DID — swap it (Phase 1.2) |
| Spam-group flood on the number | Same, but you registered it in the app — delete account, swap |
| Token: "Object does not exist / missing permissions" on WABA | System User lacks the asset — Phase 2.2 |
| Webhook verified but zero POSTs from Meta | `subscribed_apps` empty — Phase 2.3 |
| Send fails `#132001 template does not exist` | Template not approved / wrong WABA — Phase 2.4 |
| Send fails `#131030 recipient not in allowed list` | Still on sandbox creds — swap to real number creds |
| CDR arrives as empty `{}` body | DIDWW's text/plain content type — handled in code since 4c8d427 |
| Owner gets recovery messages | `missed_call_forward_number` not set/wrong |
| Cloud session: node scripts can't reach APIs but curl can | Node https bypasses the egress proxy — use curl |
