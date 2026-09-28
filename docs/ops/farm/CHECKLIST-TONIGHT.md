# הערב, ליד המק של לימור — צעד · איפה · מה להביא לי

> נגזר מ-[`DAY1-PHOTOS.md`](DAY1-PHOTOS.md) (מלא, עם טבלת תקלות) ומ-[`DAY2-MONEY.md`](DAY2-MONEY.md) §Wix. כל פקודה כאן אומתה מול המקורות ב-28.9.2026 (osxphotos 0.77, uv, TCC, Instagram export, Contacts DB).

> כל הפקודות: להדביק **בטרמינל של המק שלה** (Spotlight ⌘Space → "Terminal"). כל קובץ שכתוב ״להביא לי״ — לשלוח לי כאן בצ׳אט. כל קובץ שכתוב ״נשאר״ — לא לשלוח, לא להעלות. אין טוקנים, אין סיסמאות, אין קבצים גולמיים אליי.
> חלון זמן: ~3 שעות. אם משהו נתקע יותר מ-10 דקות — לעבור לצעד הבא ולכתוב לי מה קרה.

## א. הכנה (10 דק׳)

1. **להעביר את הכלים למק שלה.** במק שלך: `git pull` על הבראנץ׳, ואז AirDrop של התיקייה `docs/ops/tools/farm/` אל המק שלה → לגרור ל-`~/farm-data/` (ליצור: Finder → Home → New Folder → `farm-data`).
2. **לבדוק מה יש על המק:**
   ```bash
   cd ~/farm-data && ls
   xcode-select -p >/dev/null 2>&1 && python3 --version || echo 'no CLT — fine, we use uv'
   ```
   אם קופץ דיאלוג ״Install Command Line Tools?״ — **Cancel**. לא מתקינים.
3. **Full Disk Access לטרמינל — לפני הכל, macOS לא יבקש לבד:** System Settings → Privacy & Security → Full Disk Access → (+) → Applications/Utilities/Terminal.app → להדליק → **⌘Q לטרמינל ולפתוח מחדש**.
4. **uv + osxphotos** (הפייתון של macOS הוא 3.9.6 — ישן מדי ל-osxphotos; ~3–5 דק׳, בלי סיסמת אדמין):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source ~/.local/bin/env
   uv python install 3.13
   uv tool install --python 3.13 osxphotos
   osxphotos --version
   ```
   צפוי: `0.77` ומעלה. **כלל לכל ההמשך:** אם בצעד 2 הודפס `no CLT` — כל `python3` בפקודות למטה = `python3.13`. אם הודפס `Python 3.9.6` — `python3` כמו שכתוב.

## ב. גלריה → ציר הזמן (30–60 דק׳, לפי גודל הספרייה)

5. **בדיקה עצמית על דאטה מזויף** (מוכיח ללימור ששמות לא עוברים, לפני שנוגעים באמיתי):
   ```bash
   cd ~/farm-data && python3 timeline.py demo
   ```
   צפוי: `demo OK: 945 synthetic records -> 942 scrubbed rows -> 32 events`.
6. **כמה תמונות יש** (מהיר, בודק הרשאות):
   ```bash
   osxphotos query --count --from-date 2020-06-01 --not-hidden
   ```
   אם ״Operation not permitted״ → צעד 3 לא נתפס: לוודא Terminal מסומן, ⌘Q, לפתוח מחדש, `source ~/.local/bin/env`.
7. **ייצוא מטא-דאטה** (Photos סגור = מהיר יותר, לא חובה):
   ```bash
   osxphotos query --json --from-date 2020-06-01 --not-hidden > photos_meta.json
   ls -lh photos_meta.json
   ```
   מאות MB לספרייה גדולה — נורמלי. **הקובץ הזה מכיל שמות** (תיוגי פנים, כיתובים). נמחק בצעד 17.
8. **ניקוי + קיבוץ:**
   ```bash
   python3 timeline.py scrub photos_meta.json -o photos_meta.csv
   python3 timeline.py cluster photos_meta.csv -o events_seed.csv --farm auto
   ```
9. **לאשר עם לימור** את שורת `farm (inferred…): 34.xxxxx, -118.xxxxx` — זה Keokuk? (Google Maps → לחיצה ארוכה על החווה → הקואורדינטות). אם זה הבית שלה: להריץ שוב `--farm 34.xxxxx,-118.xxxxx`.
10. **להסתכל יחד 5 דק׳:** `open events_seed.csv` — כמה אירועים ב-2020–2022 לעומת 2023–2025? ריטריטים מחוץ לחווה מופיעים?

**להביא לי מ-ב׳:** שלוש השורות שהודפסו (scrub / farm / cluster) + **הקובץ `events_seed.csv`** (אין בו שמות — תאריכים, מקום, ספירות, אלבום).

## ג. אנשי קשר → ספר המשתתפים, בספירה בלבד (20 דק׳)

11. ```bash
    python3 contacts.py demo
    python3 contacts.py vocab -o vocab_local.csv --min 5
    open vocab_local.csv
    ```
    עם לימור: אילו מילים ברשימה הן **התגיות שלה**? (״סיור״, ״נובה״, …). לפתוח `tags.txt` (נוצר אוטומטית) → להוסיף/למחוק שורות. שורה = תגית, פסיקים = מילים נרדפות.
12. ```bash
    python3 contacts.py count --tags tags.txt -o contacts_counts.csv
    open contacts_timeline.csv
    ```
    **בדיקת שפיות:** אם חודש אחד מחזיק אלפים (החודש שהמק/iCloud הוגדר) — תאריכי היצירה הם תאריכי סנכרון, לא פגישה ראשונה; הכלי מזהיר, ואז עקומת 2020–2022 לא ראיה. לכתוב לי.
    - אם ״no Contacts database found״: Contacts → File → Export → **Contacts Archive…** → לשמור `~/farm-data/Contacts.abbu` → `python3 contacts.py count --db "$HOME/farm-data/Contacts.abbu" --tags tags.txt`.
    - אם הספירה גדולה בהרבה ממה ש-Contacts מציג — אותם אנשים בשני חשבונות (iCloud + Google); הכלי מדפיס ספירה לכל מקור → `--db` על הגדול.

**להביא לי מ-ג׳:** שורת הסיכום + שורות התגיות שהודפסו · **`tags.txt`** · **`contacts_timeline.csv`** · **`contacts_counts.csv`** (ספירות בלבד). **נשאר אצלה:** `vocab_local.csv`.

## ג2. היומן → אירועים מתועדים, דרגה R (15 דק׳) — **הכי שווה**

12א. **לייצא כל יומן רלוונטי כ-.ics:** Calendar.app → בסרגל הצד ללחוץ על היומן (״חווה״, וגם ״Home״ — 2020–2022 כנראה שם) → File → Export → **Export…** → לשמור ב-`~/farm-data/ics/` (ליצור קודם: `mkdir -p ~/farm-data/ics`).
12ב. ```bash
    python3 cal_events.py demo
    python3 cal_events.py scan ~/farm-data/ics/*.ics --tags tags.txt --farm 34.xxxxx,-118.xxxxx -o calendar_events.csv
    python3 timeline.py cluster photos_meta.csv -o events_seed.csv --farm 34.xxxxx,-118.xxxxx --calendar calendar_events.csv
    ```
    `--farm` = הקואורדינטות משלב 9. השורה `calendar: D days with entries; K clusters upgraded to grade R` = כמה ימי צילום הפכו למתועדים.

**להביא לי מ-ג2:** שורות הסיכום של `scan` (לפי שנה ותגית) · **`calendar_events.csv`** (בלי כותרות) · `events_seed.csv` המעודכן. **נשאר אצלה:** `calendar_local.csv` (כותרות).

## ד. Wix — ייצוא כשאתה כבר בפנים (20 דק׳, נדרש אישור של לימור — בעל האתר)

בדשבורד של Wix (אם התפריט שונה — שורת החיפוש למעלה עם שם העמוד). לשמור הכל ב-`~/farm-data/raw/`:

13. **Payments** → סינון תאריכים 1.1.2023 → היום → אייקון Download → CSV → `wix_payments.csv`.
14. **Accept Payments** → Manage ליד Wix Payments → **Settlement Report** → טווח מלא, כל סוגי העסקאות → Download Detailed Table → `wix_settlement.csv` (זה עם העמלות).
15. **Orders** → סימון כל הזמנות התרומה (checkbox עליון, לכל עמוד) → Export → `raw/wix_donations.csv` (שיוך תורם/קמפיין; הכסף כבר ב-13 — הכלי מסמן אותן `counted=0`).
    **Booking List** → Filter → Session date & time 1.1.2023→היום → לגלול לסוף → Export → Filtered items → `raw/participation/wix_bookings.csv` (= נוכחות רשומה, דרגה R; יש בו שמות, לא נטען לכסף). **Events** → לכל אירוע: Manage → Guests → Export Guests → `raw/participation/`.
16. **Analytics → All Reports → Accounting → Payments Summary** → 1.1.2023→היום, Group by Month, + עמודת Payment method → Export → `raw/checks/wix_payments_summary.csv`.

**להביא לי מ-ד׳:** **שורת הכותרת בלבד** (השורה הראשונה) של כל קובץ — `head -1 ~/farm-data/raw/wix_*.csv` — בלי נתונים. ואת `raw/checks/wix_payments_summary.csv` השלם (סיכומים חודשיים, בלי שמות). הקובץ האמיתי הראשון של Wix כנראה יודפס אצלי כ-`UNRECOGNISED` — זה צפוי; הכותרת היא מה שמתקן את זה.

## ה. Instagram (5 דק׳ להפעיל, מגיע אחר כך — לא חובה הערב)

17. באפליקציה: פרופיל → ≡ → Settings and activity → **Accounts Center → Your information and permissions → Download your information** → Create export → הפרופיל → **Export to device** → All available information · Date range **All time** · Format **JSON** · Media quality Low → Start export. מגיע במייל (שעות–יומיים). כשמגיע: לפרוס ל-`~/farm-data/instagram/` ולהריץ שוב צעד 8 עם `--instagram ~/farm-data/instagram/`.

## ו. סיום (5 דק׳)

18. ```bash
    rm ~/farm-data/photos_meta.json
    cat ~/farm-data/processing_log.csv
    ```
    להוריד את Terminal מ-Full Disk Access (System Settings → Privacy & Security → Full Disk Access → Terminal → כבוי). **להשאיר** uv/osxphotos אם הריצה החודשית מתוכננת; אחרת בלוק ה-״residue״ ב-DAY1-PHOTOS.md.

## מה נשאר אצלה, מה מגיע אליי

| מגיע אליי (בלי שמות) | נשאר על המק שלה |
|---|---|
| `events_seed.csv` · `calendar_events.csv` · `contacts_counts.csv` · `contacts_timeline.csv` · `tags.txt` · `raw/checks/wix_payments_summary.csv` · שורות כותרת של Wix · שורות הסיכום שהודפסו | `photos_meta.json` (נמחק) · `photos_meta.csv` · `vocab_local.csv` · `calendar_local.csv` · `ics/` · כל `raw/` · `raw/participation/` · `Contacts.abbu` |

## שאלות שאני צריך תשובה עליהן (בהודעה אחת, בסוף)
1. הג׳ימייל של העמותה — חשבון נפרד מהפרטי של לימור?
2. ב-Wix: יש Bookings/Events עם הזמנות בפנים? (אם כן — זו הנוכחות הרשומה)
3. תאריך ליום 3 עם טירן (ייצוא Chase: ~24 חודשים CSV; מרץ 2023–ינואר 2024 מה-PDF).
