# Priorities — the Lead reads this before every brief (updated 30.9.2026)

**The goal in one sentence:** give Limor a farm that funds itself from grants and donors on evidence, not on memory — counts and dated records out of her own devices, a grants pipeline that brings her three decisions a week, and the $190,000 NSGP award spent without losing a dollar to a missed rule — with zero participant PII ever leaving her machines.

## P0 — now (blocks the goal or a deadline this week)
- ✅ **DONE 1.10 11:06 LA** (fresh cloud session in Default, `monitor.py probe` → hitCount 203/161/180, errorcode 0; root `curl` 403 as expected) — **Cloud network access** — owner Nave (operator) — done when a fresh cloud session prints hit counts from `monitor.py probe` (not 000/403). Deadline: before Sunday 4.10 05:47 LA (first Routine run). Path: `docs/ops/farm/ENV-MIGRATION.md`.
- **NSGP obligations skeleton** — owner head-c — done when `docs/ops/tools/grants/obligations.csv` exists with the known dates (webinar 1.10 10:00 PT, Phase I notice +20 days, PoP 1.9.2025–31.8.2028 federal), `monitor.py digest` shows a T-30/14/3 block, demo asserts it. Deadline: 3.10.
- **Limor: NSGP webinar 1.10 + ask EMD for the approved IJ/budget + Phase I dates** — owner Limor via Nave, sheet `docs/ceo/2026-10-01-limor-nsgp.md` — done when the IJ budget PDF is in Tiran's vault and the Phase I dates are in `obligations.csv`.
- **First live grants run from the cloud** — owner head-a — done when `runs.csv` has a row `status=ok, fetched>0, runner=routine|cloud` pushed to the branch and the reviewer section is in `digest.md`. Depends on P0 item 1.

## P1 — this week (30.9–6.10)
- **Day-1 extraction on Limor's Mac** (photos · contacts counts · calendar) — owner head-d + Nave on site — done when `RUNREPORT.md` + `_share` files are pasted back, LESSONS rows written, handoff bundle re-issued. Needs: a date with Limor (L-05).
- **KPI system (plan + catalogue done 1.10):** kit 1.3 KPI engine (D/E generic) → farm-ops adapters (A/B/C) → Routine + report wiring — owner head-b, then head-a/head-c — done when the first Sunday snapshot is in `docs/okr/kpi.csv` and a planted breach opened a case. Plan: `docs/KPI-PLAN.md`.
- **Company OS kit 1.2: loop alarm as code** — owner head-b — done when `lint-docs` names a repeated ask (same L-id asked twice in INBOX/changes.log) and tests cover it; CHANGELOG 1.2.
- **Grants scoring review after run 5** — owner head-a — done when false positives at 50+ are ≤ 2 and the Youth Community Access Grant (CA NRA, deadline 4.11) has a go/no-go from Limor (L-06).
- **Owner morning report in Hebrew, daily** — owner cos — done when `docs/reports/<date>-owner-morning.md` exists each working day and Nave forwards it.

## P2 — this month (October)
- **Day-3 money extraction with Tiran** (Chase 3 y, Wix, Venmo, Zelle) → `money_summary.csv` → `org.json.budget` filled — owner head-d — needs a date (L-07).
- **Funder cycles, not just hashes**: real "how to apply / when" per funder in `funders.csv` (JCF, Federation, Ahmanson, Annenberg, Parsons, Weingart, Petco Love; LA County DMH/Animal Care; City of LA DCA; NPG) — owner head-a.
- **Answer Library v1** (`docs/ops/tools/grants/answers/`): mission · history (2009 rescue / 2020 public / 2023 501c3 — pending L-02) · populations · 3 programs · outcomes with evidence grade — owner head-a; **gate:** no number without a source row.
- **Google Sheet writer + WhatsApp digest sender** — owner head-a — after the Sheet exists in the farm's Google account (L-08).
- **Kit 1.3–1.4**: chain scan · copies list · report generator in `ownerLanguage` — owner head-b.
- **990 voluntary filing decision** with Tiran and the CPA (990.md) — owner Tiran — default: file for FY2025 if the money data supports it.

## P3 — later / parked (with the reason)
- **Security posture page for the cyber-nonprofit audience** — parked until kit 1.3 (chain scan) exists; re-opens when Nave sets the intro meeting.
- **Tier 2 (Supabase + one web page + two-way WhatsApp)** — parked until 2 submission cycles ran on Tier 1 (spec §5).
- **Instagram captions in the share file** — parked until Limor's consent is recorded (L-04).
- **Multi-tenant Company OS** — parked: the product question, 2027 (STRATEGY.md governs Jasell).
- **Retire the old cloud session** — after the first live run lands in git (its network can never open).

**Standing notes (quoted):** Nave 28.9: "כל עבודה עם המסוף אני צריך שתהיה יותר ספציפי ונוח" → one block per step. Nave 29.9: "הכל באינטרנט זה מידע ציבורי" → public research first, ask second. Nave 29.9: "אנחנו באמת צריכים את זה כדי להתקדם?" → rank every ask as blocking / non-blocking before making it. Nave 30.9: "בוא נעשה ריסט" → this folder. A head with nothing in its P0–P2 gets a `paused:` line, never an invented task.
