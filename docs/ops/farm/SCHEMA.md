# SCHEMA — חוזה הנתונים בין כלי החילוץ למערכת הניטור · גרסה 1.0

> קבצים **shareable** = מה שיוצא מהמק של לימור/טירן ומה שמערכת הניטור (בהמשך) קוראת. אין בהם שם, טלפון, מייל, כותרת, כיתוב, נתיב או קואורדינטה. כל שינוי עמודה = גרסה חדשה כאן + ב-`runlog.py CONTRACT`. `runlog.py manifest` מסמן `schema_drift` כשקובץ לא תואם.

## shareable

| קובץ | כלי | שורה = | עמודות | דרגה |
|---|---|---|---|---|
| `events_seed_share.csv` | `timeline.py cluster` | יום × מקום עם ≥5 תמונות (״יום-מועמד״) | `event_id date weekday place first_time last_time photos videos max_faces favorites albums(קודים) ig_posts ig_caption(ריק אלא אם --share-captions) cal_events cal_tag cal_headcount cal_hours type population headcount partner evidence_grade notes` | E; R כשיש רשומת יומן |
| `calendar_events.csv` | `cal_events.py scan` | מופע אירוע ביומן | `event_id date weekday start end hours all_day calendar recurring tag tags_all headcount_hint attendees at_farm has_location evidence_grade` | R |
| `contacts_counts.csv` | `contacts.py count` | ספירה לממד × מפתח × שנה | `dimension(tag/group/phone_country/all) key(תגית / group_NN / IL,US / contacts) year n` | E (שנה = יצירת איש הקשר; לא ראיה אם יש ספייק סנכרון) |
| `contacts_timeline.csv` | `contacts.py count` | חודש | `month created` | E |
| `tags.txt` | לימור | תגית ומילים נרדפות | טקסט; **לא שמות אנשים** | — |
| `ledger.csv` | `ledger.py ingest/reconcile` | תנועה כספית | `row_id date year month source source_file direction amount currency category cp_id(hash) cp_type kind external_id counted dup_of receipt_ref` | R |
| `money_summary.csv` | `ledger.py summary` | שנה × חודש × כיוון × קטגוריה × מקור | `year month direction category source n total` | R |
| `receipts_summary.csv` | `mail_ledger.py summary` | חודש × כיוון × קטגוריה × סוג שולח | `month direction category from_kind n total` | R |
| `questions.csv` | `ledger.py reconcile` | שאלה לטירן | `side date direction amount category source_or_domain ref question` | — |
| `raw/checks/wix_payments_summary.csv` | Wix Analytics | חודש × אמצעי תשלום | כפי ש-Wix מייצא; **לבדוק שאין עמודת Customer** | R (בדיקת שפיות) |
| `RUNREPORT.md` · `manifest.json` | `runlog.py` | דוח ריצה · חוזה | ראה PROTOCOL.md | — |

## local only (לא עוזבים את המק)
`photos_meta.json` (נמחק בסוף היום) · `photos_meta.csv` (GPS מדויק) · `events_seed.csv` (שמות אלבומים) · `albums_local.csv` · `vocab_local.csv` · `contacts_groups_local.csv` · `calendar_local.csv` (כותרות) · `counterparties_local.csv` (שמות תורמים/ספקים) · `receipts.csv` (נושאי מייל) · `processing_log.csv` (שם משתמש) · `raw/` · `ics/` · `local/` · `accountant/` · `Contacts.abbu` · `all.vcf` · `runlog.jsonl`

## עובדות הארגון שמערכת הניטור תגזור (v1)
| עובדה | מקור | חישוב |
|---|---|---|
| אירועים בשנה, לפי דרגה | `events_seed_share.csv` (אחרי תיוג לימור: `type` לא ריק) + `calendar_events.csv` | ספירת ימים מתויגים; R = יש רשומת יומן / Bookings |
| משתתפים בשנה (proxy → R) | `headcount` (לימור) · `cal_headcount` · `max_faces` · Bookings | סכום headcount; כשחסר — max_faces כמינימום |
| הכנסות בשנה לפי מקור | `money_summary.csv` | `direction=in`, `counted=1` (payouts/העברות כבר לא נספרים) |
| הוצאות בשנה לפי קטגוריה | `money_summary.csv` | `direction=out` |
| תורמים ייחודיים בשנה | `ledger.csv` | `cp_type in (person, org)`, `direction=in`, `category=donation` → distinct `cp_id` |
| founders' contribution | `ledger.csv` מהחשבון הפרטי (`source_file` chase_private_*) | סכום הוצאות חווה |
| קהילה (אנשי קשר לפי תגית) | `contacts_counts.csv` | `dimension=tag` (שנה רק אם אין ספייק) |
| חיות | טאב Assets בגיליון (לימור, S→R עם קבלות וטרינר) | — |

## גרסאות
- **1.0 (28.9.2026):** ראשונה. שינוי עמודה = 1.1; שינוי משמעות = 2.0.
