# יום 1 — הגלריה כציר הזמן · runbook למק של לימור

> **הוחלט (28.9.2026):** ללימור iPhone + מק עם iCloud Photos ⇒ **המסלול המועדף**: `osxphotos` על המק מייצא מטא-דאטה בלבד; `timeline.py` מנקה ומקבץ. **אף תמונה, אף שם, אף כיתוב לא יוצאים מהמחשב.** החוצה יוצא רק `events_seed.csv`.
> מי מריץ: Nave ליד המק של לימור, גישה מלאה, NDA חתום (FACTS #8). הכלל שנשאר: **הדאטה נשאר על המק שלה** — הסקריפטים רצים שם, החוצה יוצא רק `events_seed.csv`. אין להעביר טוקנים/סיסמאות/קבצים גולמיים לסשן של Claude.

## 0. לפני שמתחילים (5 דק׳)
1. iCloud Photos במק: **הגדרות → Apple ID → iCloud → Photos** דלוק, וב-Photos: **Settings → iCloud → "Download Originals to this Mac"** — לא חובה למטא-דאטה, אבל אם התמונות ״בענן בלבד״ חלק מנתוני המיקום עלולים להיות חסרים. אם לא מוריד — נריץ פעם אחת, נראה כמה שורות בלי GPS, ונחליט.
2. **Photos סגור** בזמן הריצה (osxphotos קורא את מסד הנתונים של הספרייה).
3. תיקיית עבודה: `~/farm-data/` (מקומית, לא בתוך iCloud Drive / Dropbox).

## 1. התקנה (10 דק׳, חד-פעמי)
```bash
mkdir -p ~/farm-data && cd ~/farm-data
python3 --version                 # 3.9+ מגיע עם macOS (Xcode CLT יותקן אם יבקש — לאשר)
python3 -m pip install --user osxphotos   # או: brew install pipx && pipx install osxphotos
osxphotos --version
```
פעם ראשונה שהכלי ניגש לספרייה macOS יבקש **Full Disk Access** לטרמינל: System Settings → Privacy & Security → Full Disk Access → Terminal ✓ → לפתוח טרמינל מחדש.

`timeline.py` מגיע אליה **בהעתקה מהריפו** (`docs/ops/tools/farm/timeline.py`) — קובץ אחד, ספריית תקן בלבד, אין מה להתקין.

## 2. בדיקה על דאטה סינתטי — לפני שנוגעים בגלריה (1 דק׳)
```bash
python3 timeline.py demo
# צפוי: demo OK: 945 synthetic records -> 942 scrubbed rows -> 32 events (30 farm, 2 off-site)
```
זה מוכיח ללימור, על המכונה שלה, ששמות (״Alice Example״), נתיבי קבצים וכיתובים **לא עוברים** — לפני שראה דאטה אמיתי. אם זה לא עובר, עוצרים.

## 3. ייצוא המטא-דאטה (5–20 דק׳ לפי גודל הספרייה)
```bash
osxphotos query --json --from-date 2020-06-01 --not-hidden --not-in-trash > photos_meta.json   # החווה נפתחה יוני 2020 (FACTS #1)
ls -lh photos_meta.json           # קובץ טקסט; עשרות MB לספרייה גדולה, בסדר
# אם גרסת osxphotos לא מכירה דגל — להשמיט אותו: scrub מסנן hidden/trash בעצמו
```
הקובץ הזה **מכיל שמות** (persons, כיתובים, נתיבים). הוא נשאר ב-`~/farm-data/` ונמחק בסוף היום (שלב 6).

## 4. ניקוי → קיבוץ (1 דק׳)
```bash
python3 timeline.py scrub   photos_meta.json -o photos_meta.csv
python3 timeline.py cluster photos_meta.csv  -o events_seed.csv --farm auto
```
פלט צפוי:
```
scrub: N records in, N rows out -> photos_meta.csv
farm (inferred, densest 100 m cell): 34.xxxxx, -118.xxxxx (K photos) — confirm with Limor
cluster: N rows -> E events (F at the farm, O off-site/no-gps) -> events_seed.csv
```
- **״farm (inferred)״** — הכלי מזהה את החווה כ**המקום שבו צולמו הכי הרבה תמונות**. לימור מאשרת שזה Keokuk (Google Maps → לחיצה ארוכה → קואורדינטות). אם לא — `--farm 34.xxxxx,-118.xxxxx`.
- **Instagram (משני, לא מעודכן):** אם יש ייצוא (Settings → Your activity → Download your information → JSON) — `--instagram ~/Downloads/instagram-xxxx/` מוסיף `ig_posts` + כיתוב הפוסט הארוך ביותר של אותו יום. כיתובים הם **ציבוריים ממילא**; זה מקור התיאור/השותף, לא מקור השמות.

## 5. מה מסתכלים עליו יחד (15 דק׳)
`events_seed.csv` — שורה = **אירוע** (יום × מקום × ≥5 תמונות):

| עמודה | מה זה | דרגה |
|---|---|---|
| `date` `weekday` `first_time` `last_time` | מתי, ומשך הפעילות | E |
| `place` | `farm` / `offsite: <עיר>` / `no-gps` | E |
| `photos` `videos` `favorites` `albums` | עוצמת התיעוד; אלבום = רמז לסוג | E |
| `max_faces` | הכי הרבה פנים בתמונה אחת = **headcount מינימלי** מוכח | E |
| `ig_posts` `ig_caption` | תיאור פומבי של אותו יום (אם יש) | E |
| **`type` `population` `headcount` `partner` `notes`** | **לימור ממלאת** — 3 ישיבות של שעה | S→ (עם ראיה: R) |
| `evidence_grade` | `E` ברירת מחדל; `R` כשיש רשומה מהזמן (מייל ״מחר מגיעים 40״, טופס) | |

שאלות בקרה: כמה אירועים בשנה — **2020–2022 (לפני העמותה) לעומת 2023–2025**? זה ההבדל בין ״שש שנות עשייה״ ל״שנתיים וחצי כעמותה״ בשקף.  יש חודשים ריקים (= לא צולם, או לא היה)? ה-off-site תואם לריטריטים שהיא זוכרת? `no-gps` גדול ⇒ להוריד מקוריים (שלב 0.1) ולהריץ שוב.

## 6. סיום היום (2 דק׳)
```bash
rm photos_meta.json              # הגולמי עם השמות — נמחק
open events_seed.csv             # נטען לטאב Events בגיליון המשותף (ידני, לימור)
cat processing_log.csv           # לוג: תאריך · שלב · שורות · מי — נשאר אצלה
```
`photos_meta.csv` (בלי שמות, עם GPS מדויק) **נשאר אצלה** לריצות חודשיות — לא עולה לגיליון.

## 7. ריצה חודשית (אחרי הפיילוט — AUTOMATION.md §שכבה 2)
```bash
osxphotos query --json --from-date $(date -v-45d +%Y-%m-%d) --not-hidden --not-in-trash > new.json
python3 timeline.py scrub new.json -o new.csv && python3 timeline.py cluster new.csv --farm 34.xxxxx,-118.xxxxx --since $(date -v-40d +%Y-%m-%d) -o events_new.csv && rm new.json
```
זה מה ש-launchd יריץ ב-1 לחודש; לימור מתייגת 20 דק׳. הקואורדינטות **מקובעות** מיום 1 (לא `auto`) כדי שלא ״יזוזו״ בחודש עם ריטריט גדול.

## מה יכול להשתבש
| תסמין | סיבה | פתרון |
|---|---|---|
| `osxphotos` לא נמצא | pip --user לא ב-PATH | `python3 -m osxphotos ...` או pipx |
| ״Operation not permitted״ | אין Full Disk Access | שלב 1 |
| כל האירועים `no-gps` | תמונות בענן בלבד / שירותי מיקום כבויים במצלמה | להוריד מקוריים; לבדוק iPhone → Settings → Privacy → Location → Camera |
| החווה ״זוהתה״ בבית של לימור | היא צילמה יותר בבית | `--farm lat,lon` ידני |
| ריטריט מפוצל לשתי שורות | שני מוקדים במרחק >1 ק״מ | זה נכון — שני מקומות באותו יום; לימור ממזגת בתיוג |
| אירוע חסר | <5 תמונות | `--min-photos 3` ולהשוות; ברירת המחדל שמרנית בכוונה |
