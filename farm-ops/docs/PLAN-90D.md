# 90-day work plan — farm-ops · 30.9.2026 → 29.12.2026

Tracks: **A** grants monitor & submissions · **B** Company OS kit · **C** NSGP award management · **D** farm data extraction & evidence · **E** owner reporting & governance. Each week names what is *verifiably* done. Dates are Los Angeles.

| Week | Dates | A grants | B kit | C NSGP | D data | E reporting / decisions |
|---|---|---|---|---|---|---|
| 1 | 30.9–6.10 | network open (L-01) · first cloud live run · scoring review after run 5 · Youth Access fit memo (L-06) | 1.2 loop alarm | webinar 1.10 (Limor+Tiran) · `obligations.csv` with known dates · ask EMD for IJ budget + Phase I dates | Day-1 evening (L-05): photos, contacts counts, calendar → RUNREPORT · LESSONS rows | first Hebrew morning report · L-02, L-05, L-09 answered |
| 2 | 7–13.10 | funder cycles for 7 foundations + 4 public programs in `funders.csv` · deadlines block in digest | 1.3 chain scan | Phase I notice signed within 20 days (Limor) · UEI/SAM status verified · EHP rule written into obligations | Day-3 with Tiran (L-07): Chase 3 y, Wix, Venmo → `money_summary.csv` · `org.json.budget` filled | L-03, L-08, L-10, L-11 answered · report daily |
| 3 | 14–20.10 | Answer Library v1 (8 canonical answers, every number sourced) · LA County source (DMH, Animal Care, Arts) | 1.4 copies list + report generator (Hebrew) | restricted-fund category `nsgp` in `ledger.py` · vendor quotes rule (2 CFR 200) in sheet | Instagram export processed if consented (L-04) · monthly extraction runbook | 990 voluntary filing decision (Tiran + CPA) |
| 4 | 21–27.10 | first 2 LOIs drafted (from the Answer Library; Limor signs) · Sheet writer if L-08 answered | kit README for outside readers · security posture page draft | EHP request prepared for the first purchase group | `manifest.json` → "org facts" table for the Answer Library | first monthly value report to Limor |
| 5–6 | 28.10–10.11 | Youth Access submission if go (deadline 4.11) · 2 more LOIs · WhatsApp digest sender | 2.0 scope decision: what the cyber-nonprofit would need | first purchases only after EHP approval · quarterly report calendar | Day-1 follow-up: tagging sessions with Limor (events, populations) | intro meeting with the cyber nonprofit set (P3 → P2) |
| 7–9 | 11.11–1.12 | 4 more submissions · reviewer loop tuned (false positives ≤ 2/run) | kit 2.0 candidate: multi-project config | FMFW first reimbursement request | evidence grades per year published in SCHEMA | mid-plan review: submissions-to-invitations ratio |
| 10–12 | 2–29.12 | 90-day measurement: 25 scored ≥ 70 (real) · 8 submissions/LOI · 3 funder meetings · 0 missed deadlines | 2.0 if pilot proves it | Q1 NSGP quarterly report filed | monthly extraction runs on their own | 90-day report · decide Tier 2 (spec §5) |

## Gates (a week is not done until)
- **A:** `runs.csv` row `ok` for the week · digest with reviewer section pushed · LESSONS row when something was learned.
- **B:** tests green · `npm run lint` and `npm run gate` green · CHANGELOG entry · verified in a seeded throwaway repo.
- **C:** every dated obligation in `obligations.csv` with source and owner · T-30/14/3 visible in the digest · nothing purchased before the EHP letter.
- **D:** `RUNREPORT.md` has no name and no path · `_share` files only · `manifest.json` schema matches `SCHEMA.md` (drift = a case).
- **E:** the morning report went out in Hebrew · open decisions count did not grow two weeks in a row.

## What is deliberately not in the plan
Tier 2 (Supabase/web) · donor CRM · crowdfunding · anything that pays Nave before E-2 · multi-tenant kit (2027, STRATEGY.md).

## Timing rules
- Limor's slot: ≤ 15 min/day, from a walked sheet in `docs/ceo/`. Tiran: one evening for Day 3, then monthly.
- A brief that runs > 30 min of a human's time is split. A cloud session that runs > 20 min is a case.
- Every deadline in `obligations.csv` and `DECISIONS-OPEN.md` shows on the board (`npm run board`) with days left; overdue is red in the morning report until closed.
