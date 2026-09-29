# grants/ — מערכת ניטור מענקים · Tier 1 (גיליון + סקריפטים)

איפיון: [`docs/ops/farm/GRANTS-SYSTEM-SPEC.md`](../../farm/GRANTS-SYSTEM-SPEC.md). כלי ops (D13): ספריית תקן, בלי שרת, בלי PII.

| קובץ | מה |
|---|---|
| `org.json` | פרופיל הארגון לדירוג (תחומים, טווח בקשה, קיבולת). בלי שמות. |
| `seed_funders.py` → `funders.csv` | שכבה 2: הקרנות מהבנצ׳מרק עם חציון/רבעונים/מענקים למקבילות + תוכניות ממשלתיות. `funders_manual.csv` = תוספות ידניות (לא נדרס). |
| `monitor.py pull` | Grants.gov Search2 · California Grants Portal (CKAN) · hash של עמודי הקרנות → `opportunities.csv` (upsert, שומר החלטות) |
| `monitor.py score` | ציון 0–100 עם נימוקים: תחומים 40 · סכום 20 · זמן עד מועד 15 · גיאוגרפיה 10 · עומס דיווח 10 · קרן מהבנצ׳מרק +5. זכאות קשה / סגור / מועד עבר = 0 |
| `monitor.py digest` | הודעת WhatsApp שבועית ללימור: החלטות · מועדים ב-45 יום · צינור |
| `monitor.py demo` | בדיקה עצמית על `fixtures/` (הסנדבוקס חסום לרשת; ריצה חיה מהמק) |

**ריצה חיה (מק של Nave):**
```bash
cd docs/ops/tools/grants && python3 seed_funders.py && python3 monitor.py pull && python3 monitor.py score && python3 monitor.py digest
```
`opportunities.csv` הוא הגיליון של דרגה 1 — עמודת `decision` (approved/rejected/submitted/won/lost) נערכת ביד או מהגיליון המשותף; `pull` לא דורס אותה.

**הבא (לפי האיפיון):** `--to-sheet` (Google Sheets API) · שליחת digest ל-WhatsApp · Answer Library (`answers/`) · `obligations.csv` ל-NSGP · Grants.gov fetchOpportunity לפרטי סכומים.
