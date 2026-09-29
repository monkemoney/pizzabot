# grants/ — מערכת ניטור מענקים · Tier 1 (גיליון + סקריפטים)

איפיון: [`docs/ops/farm/GRANTS-SYSTEM-SPEC.md`](../../farm/GRANTS-SYSTEM-SPEC.md). כלי ops (D13): ספריית תקן, בלי שרת, בלי PII.

| קובץ | מה |
|---|---|
| `org.json` | פרופיל הארגון לדירוג (תחומים, טווח בקשה, קיבולת). בלי שמות. |
| `seed_funders.py` → `funders.csv` | שכבה 2: הקרנות מהבנצ׳מרק עם חציון/רבעונים/מענקים למקבילות + תוכניות ממשלתיות. `funders_manual.csv` = תוספות ידניות (לא נדרס). |
| `monitor.py pull` | Grants.gov Search2 · California Grants Portal (CKAN) · hash של עמודי הקרנות → `opportunities.csv` (upsert, שומר החלטות) |
| `monitor.py score` | ציון 0–100 עם נימוקים: תחומים 40 · סכום 20 · זמן עד מועד 15 · גיאוגרפיה 10 · עומס דיווח 10 · קרן מהבנצ׳מרק +5. זכאות קשה / סגור / מועד עבר / `stale` = 0. מסננים שנלמדו מריצות חיות: תחום גנרי בלי תחום ליבה → תקרה 40 · מילה לא-רלוונטית לצד ליבה → 15- · שתי מילים של ״בית חולים/מחקר״ (`HARD_OFF`) → תקרה 30 גם עם ליבה · תקרה מעל ×5 מהבקשה בלי רצפה → 4/20 |
| `monitor.py digest` | הודעת WhatsApp שבועית ללימור: החלטות · מועדים ב-45 יום · צינור |
| `monitor.py run` | pull + score + digest בתהליך אחד, ושורה אחת ב-`runs.csv` (תאריך, מריץ, סטטוס, משך, נשאבו/חדשות/stale, מעל 70/50, עמודי קרנות). ריצה שמתה משאירה שורת `failed`; שבוע בלי שורה = הכשל שהסוקר השבועי קיים בשבילו |
| `monitor.py demo` | בדיקה עצמית על `fixtures/` (הסנדבוקס חסום לרשת; ריצה חיה מהמק או מ-GitHub Actions) |

**ריצה אוטומטית (מ-29.9):** `.github/workflows/grants-monitor.yml` — `workflow_dispatch` על הענף (schedule של GitHub רץ רק מ-main, והעבודה על ענף משלה בכלל). Routine שבועי (ראשון 05:47 LA, סשן ענן חדש) מפעיל אותו, מחכה, מושך, קורא את `runs.csv` + `digest.md` מול הצ'קליסט ב-LESSONS, מוסיף שורת לקח כשיש, וכותב את טקסט הוואטסאפ ללימור. ה-Action מבצע commit של הפלטים לאותו ענף עם `[skip ci]`. המק = דיבוג חי בלבד (לפטופ הוא לא שרת).

**ריצה חיה (מק של Nave):**
```bash
cd docs/ops/tools/grants && python3 seed_funders.py && python3 monitor.py pull && python3 monitor.py score && python3 monitor.py digest
```
`pull` מסמן `status=stale` כל שורה שמקור שנשאב הפעם כבר לא מחזיר (סוכנות שסוננה, נסגר, נעלם) — נשמרת להיסטוריה, מקבלת 0. עמודי קרנות: ריצה ראשונה אחרי שינוי ה-hash מדווחת ״הכל השתנה״ פעם אחת.

`opportunities.csv` הוא הגיליון של דרגה 1 — עמודת `decision` (approved/rejected/submitted/won/lost) נערכת ביד או מהגיליון המשותף; `pull` לא דורס אותה.

**ממצא מריצה חיה 4 (29.9):** שני המקורות האוטומטיים (Grants.gov + פורטל קליפורניה) נותנים כמעט אפס התאמות אמיתיות לחווה — תחרויות פדרליות/מדינתיות פתוחות הן לא המקום שממנו חוות טיפול-בחיות קטנות ממומנות. ההזדמנויות האמיתיות הן שכבה 2 (קרנות, עמודי how-to-apply) והתוכניות החוזרות (NSGP/CSNSGP, LA County, NPG). לכן סדר הפיתוח הבא: `obligations.csv` ל-NSGP · מחזורי הגשה אמיתיים לכל קרן ב-`funders.csv` (לא רק hash) · LA County · ואז `--to-sheet` · WhatsApp · Answer Library.
