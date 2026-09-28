# הערב, ליד המק של לימור — צעד · איפה · מה להביא לי

> נגזר מ-[`DAY1-PHOTOS.md`](DAY1-PHOTOS.md) (מלא, עם טבלת תקלות) ומ-[`DAY2-MONEY.md`](DAY2-MONEY.md). אומת מול המקורות ועבר ביקורת של שלושה סוקרים (ביצוע · פרטיות · זמן) ב-28.9.2026.
> **ריאלי: 1:45–2:45 בעבודה מקבילה** (לא 2.5 שעות בטור). צעד 7 רץ 15–45 דק׳ בשקט — זה החלון לסעיפים ג׳, ג2, ד׳, ה׳.
> **ידיים של לימור — שלוש פעמים, לא שמונה:** (1) בהתחלה: לפתוח את המק, Touch ID ל-Full Disk Access, ולענות על השאלות בזמן שההתקנה רצה; (2) כשצעד 7 רץ: Wix בדפדפן, Instagram בטלפון, 10 דק׳ על רשימת המילים ואישור החווה; (3) בסוף: Touch ID להסרת ההרשאה, ומבט משותף בתוצאה. להגיד לה זאת בהתחלה.
> **אם משהו נתקע יותר מ-10 דקות — חוץ מצעדים 4 ו-7 —** לעבור לצעד הבא ולכתוב לי מה קרה.

## שכבת הלמידה — שתי שניות לצעד
כל צעד נרשם: `python3.13 runlog.py start 7` בהתחלה, `python3.13 runlog.py done 7 --status ok` בסוף (או `fail` / `skip` / `workaround --fix "מה עשינו"`). ה-Claude Code המקומי עושה זאת לבד; ידנית — לפחות לצעדים שנכשלו/עקפו. תשובות לימור: `runlog.py answer 4 --text "..."`. בסוף: `runlog.py manifest && runlog.py report` → **`RUNREPORT.md` הוא מה שמדביקים לי**, יחד עם קבצי ה-share. הכלי מסרב להערה שנראית כמו טלפון/מייל/נתיב. הלופ המלא: [`PROTOCOL.md`](PROTOCOL.md).

## כללי פרטיות לערב — קצר
- הסקריפטים רצים על המק שלה; החוצה יוצאים רק **קבצי `_share` וספירות**. שום קובץ גולמי, שום `*_local.csv`.
- **להעתיק לצ׳אט רק שורות פלט.** אף שורה עם הפרומפט (`שם@מחשב %`), אף צילום מסך של הטרמינל, אף נתיב מלא (`/Users/<שם>`). בתחילת הסשן: `PROMPT='%% '`.
- העברת קבצים אליי: AirDrop מהמק שלה לטלפון/מק שלך, ומשם לצ׳אט. לא להתחבר ל-claude.ai שלך מהמק שלה, לא במייל/וואטסאפ שלה.
- **בסגירת קובץ שנפתח ב-Numbers: Delete, לא Keep** (Keep שומר ל-iCloud Drive). לכן הפקודות למטה פותחות ב-TextEdit.
- אם ה-Claude Code המקומי מריץ (צעד 1) — `CLAUDE.md` בחבילה כופה את הכללים האלה עליו.

## א. הכנה (15–25 דק׳)

1. **החבילה** (במק שלך, מהריפו, אחרי `git pull`): `bash docs/ops/tools/farm/make-handoff.sh` → `~/Desktop/farm-data`. במק שלה: Control Center → AirDrop → **Everyone for 10 Minutes**; Wi-Fi + Bluetooth דלוקים בשניים. AirDrop של התיקייה. במק שלה, בטרמינל:
   ```bash
   mv ~/Downloads/farm-data ~/farm-data && cd ~/farm-data && ls
   ```
   צפוי: `CLAUDE.md cal_events.py contacts.py docs ics ledger.py local mail_ledger.py raw timeline.py`. (יש לה Claude Code: `claude` מכאן, ולהדביק את ההודעה מסוף `CLAUDE.md`. לפני כן, 30 שניות: claude.ai → Settings → Privacy → "Help improve Claude" **כבוי** בחשבון שלה.)
2. **שלוש בדיקות לפני כל התקנה** (אם אחת נופלת — סעיף ב׳ נדחה לביקור 2, הערב עושים ג׳, ג2, ד׳, ה׳):
   - **הספרייה מלאה?** Photos במק → Library → לגלול לתחתית → ״N Photos, M Videos״. באייפון שלה: Photos → Library → תחתית. המק מראה **הרבה פחות**, או System Settings → Apple ID → iCloud → Photos כבוי? → **לא להדליק הערב** (סנכרון של שעות). לרשום N.
   - **דיסק:** `df -h ~ | tail -1` → צריך ≥ 5 GB פנויים.
   - **Photos סגור לגמרי (⌘Q)** — חובה, לא מומלץ: אחרת osxphotos מעתיק GBs של מסד נתונים בכל קריאה.
   בזמן הזה, לימור עונה על **השאלות 1–7** (סוף המסמך).
3. **uv + osxphotos** — קודם, בחלון הנוכחי, בלי סיסמה (~3–8 דק׳ על wifi ביתי):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source ~/.local/bin/env
   uv python install 3.13
   uv tool install --python 3.13 osxphotos
   osxphotos --version
   ```
   צפוי `0.77` ומעלה. **מעכשיו כל סקריפט רץ עם `python3.13` — כתוב כך למטה, בכל מק.** לא `python3`: במק בלי Command Line Tools זה מקפיץ דיאלוג התקנה; אם קופץ — Cancel. אם `python3.13: command not found` → `source ~/.local/bin/env`; אם עדיין → `uv run --no-project --python 3.13 python timeline.py demo`.
   *אם לימור שואלת:* ״מתקין שני כלים חופשיים בתיקיית המשתמש שלך, בלי סיסמה, בלי לשנות את המערכת; מסירים בשתי פקודות.״
4. **Full Disk Access — אחרי ההתקנה, לימור מאשרת ב-Touch ID:** System Settings → Privacy & Security → Full Disk Access → (+) → Applications/Utilities/Terminal.app → on → **⌘Q לטרמינל, לפתוח מחדש**, `cd ~/farm-data`. macOS לא מבקש לבד; בלי זה: ״Operation not permitted״ בלי שום חלון. בדיקה של שנייה:
   ```bash
   ls "$HOME/Pictures/Photos Library.photoslibrary/database/" "$HOME/Library/Application Support/AddressBook/Sources/" >/dev/null && echo FDA OK
   ```
   *אם לימור שואלת:* ״הרשאה לטרמינל לקרוא את מסד הנתונים של Photos ושל אנשי הקשר — כמו לתוכנת גיבוי. מסירים בסוף הערב, את תראי.״

## ב. גלריה → ציר הזמן (ב7 רץ ברקע 15–45 דק׳)

5. **בדיקה על דאטה מזויף** (לפני שנוגעים באמיתי):
   ```bash
   python3.13 timeline.py demo
   ```
   צפוי: `demo OK: 945 synthetic records -> 942 scrubbed rows -> 32 events`. *אם לימור שואלת:* ״945 תמונות מזויפות עם שמות מזויפים — מראה ששמות אנשים, כיתובים ונתיבים לא עוברים. שמות אלבומים ועיר של יום מחוץ לחווה עוברים כקודים בקובץ שנשלח.״
6. **כמה פריטים** (1–4 דק׳ של שקט — טוען את כל הספרייה, לא נתקע):
   ```bash
   osxphotos query --count --from-date 2020-06-01 --not-hidden
   ```
   **אם N > ~80,000:** הערב `--from-date 2023-01-01` (תקופת העמותה) בצעד 7, לרשום, ו-2020–2022 בביקור 2.
7. **ייצוא מטא-דאטה — להפעיל ולעזוב:**
   ```bash
   osxphotos query --json --from-date 2020-06-01 --not-hidden > photos_meta.json
   ```
   **הקובץ נשאר 0 בייט עד השנייה האחרונה — זה לא תקלה.** osxphotos בונה את כל ה-JSON בזיכרון וכותב פעם אחת. צפוי 15–45 דק׳ בלי שום פלט. חי? בטאב אחר: `top -l 1 -pid $(pgrep -f 'osxphotos query') | tail -1` (CPU > 0). **0 בייט אחרי שחזר הפרומפט = שגיאה.**
   **⌘T — טאב חדש** (אותו Terminal = אותו Full Disk Access) → `cd ~/farm-data` → **להמשיך לסעיפים ג׳, ג2, ד׳, ה׳ בזמן שזה רץ.**
   *אם לימור שואלת:* ״מייצא רק מידע *על* התמונות — תאריך, מיקום, כמה פנים — אף תמונה. הקובץ הזה כן מכיל שמות של תיוגי פנים, ולכן הוא נמחק לפני שאני יוצא, מולך.״
8. **כשצעד 7 סיים — לסגור דפדפן, ואז ניקוי + קיבוץ** (scrub קורא רשומה-רשומה; אם בכל זאת `Killed` — פרוסות שנתיות, DAY1 טבלת תקלות):
   ```bash
   ls -lh photos_meta.json
   python3.13 timeline.py scrub photos_meta.json -o photos_meta.csv
   python3.13 timeline.py cluster photos_meta.csv -o events_seed.csv --farm auto --calendar calendar_events.csv
   ```
   (`--calendar` רק אם ג2 כבר הופק; אחרת בלי.) הפלט: שורת `farm (inferred…)`, שורת `cluster`, **סיכום לפי שנה** (ימי-חווה · ימי-חווה עם ≥3 פנים · ימים מחוץ · דרגה R), ושתי שורות: `SHARE THIS ONE: events_seed_share.csv` ו-`LOCAL: events_seed.csv`.
9. **לימור מאשרת** ששורת `farm (inferred)` היא Keokuk (Google Maps → לחיצה ארוכה על החווה). אם זה הבית שלה: להריץ שוב עם `--farm 34.xxxxx,-118.xxxxx`. **הקואורדינטות לא נשלחות אליי** — נשארות אצלה בפתק לריצה החודשית.
10. **מבט משותף (2–5 דק׳):** `open -a TextEdit events_seed.csv`. להגיד במילים: ״אלה **ימים-מועמדים**, לא אירועים — את מסמנת מה אירוע בישיבות התיוג.״ אלבום שנקרא על שם אדם? בקובץ ה-share הוא כבר `album_07`.

**להביא לי מ-ב׳:** שורת `scrub` · שורת `cluster` · **שורות הסיכום לפי שנה** · המילה ״החווה אושרה״ / ״הוחלף ידנית״ (בלי מספרים משורת farm) · **הקובץ `events_seed_share.csv`** (אלבומים כקודים, בלי קואורדינטות, בלי כיתובים). **נשאר אצלה:** `events_seed.csv`, `albums_local.csv`, `photos_meta.csv`.

## ג. אנשי קשר → ספירות (20–30 דק׳, בזמן שב7 רץ)

11. לפני ההרצה לשאול: **״מאז מתי המק הזה / חשבון ה-iCloud הזה?״** (2023+ ⇒ ספייק סנכרון צפוי; אז `year` בספירות אינו ראיה, רק הסכומים).
    ```bash
    python3.13 contacts.py demo
    python3.13 contacts.py vocab -o vocab_local.csv --min 30
    open -a TextEdit vocab_local.csv
    ```
    אם קופץ ״Terminal would like to access your contacts״ → Allow. **לקרוא עם לימור את 100 השורות העליונות** (מסודר לפי תדירות): אילו מילים הן **תגיות** שלה? עידון — בישיבות התיוג, לא הערב.
    `open -e tags.txt` (נוצר אוטומטית עם תגיות מוצא) → להוסיף/למחוק שורות → ⌘S. **תגית = אוכלוסייה / תוכנית / ארגון שותף. תגית שהיא שם של אדם (״דרך רותי״) לא נכנסת** — אם חייבים, ״הפניה-1״ והפירוש נשאר אצלה. מילה של 2–3 אותיות תופסת גם שמות משפחה — רק תגיות ארוכות/חד-משמעיות (הכלי כבר דורש גבול מילה).
    *אם לימור שואלת:* ״רשימת מילים וכמה פעמים כל אחת מופיעה — לא אנשים. נשארת פה; רק מחפשים בה את התגיות שלך.״
12. ```bash
    python3.13 contacts.py count --tags tags.txt -o contacts_counts.csv 2>/dev/null | sed 's# -> .*##'
    open -a TextEdit contacts_timeline.csv
    ```
    שמות קבוצות מ-Contacts יוצאים **כקודים** (`group_01`); המפה ב-`contacts_groups_local.csv` אצלה. **ספייק:** חודש אחד עם אלפים = תאריכי סנכרון; הכלי מזהיר — לכתוב לי ״ספייק: כן״.
    - ״no Contacts database found״ → Contacts → File → Export → **Contacts Archive…** → `~/farm-data/Contacts.abbu` → `python3.13 contacts.py count --tags tags.txt --db "$HOME/farm-data/Contacts.abbu" -o contacts_counts.csv`.
    - ספירה גדולה בהרבה ממה ש-Contacts מציג → אותם אנשים בשני חשבונות; הכלי מדפיס לכל מקור `<UUID>: N people` → `--db "$HOME/Library/Application Support/AddressBook/Sources/<UUID>/AddressBook-v22.abcddb"`.
    *אם לימור שואלת:* ״ספירה — כמה אנשי קשר לכל תגית לכל שנה. אף שם, טלפון או מייל לא נכתבים לשום קובץ.״

**להביא לי מ-ג׳:** שורת `count` **כפי שה-sed מדפיס אותה** (בלי הנתיב) + שורות התגיות · **`tags.txt`** (אחרי שקראת אותו בעין) · **`contacts_counts.csv`** · **`contacts_timeline.csv`** · ״ספייק: כן/לא״. **נשאר אצלה:** `vocab_local.csv`, `contacts_groups_local.csv`.

## ג2. היומן → אירועים מתועדים, דרגה R (15 דק׳, בזמן שב7 רץ) — **הכי שווה**

13. Calendar.app → בסרגל הצד ללחוץ על היומן (״חווה״, **וגם ״Home״** — 2020–2022 כנראה שם) → File → Export → **Export…** → `~/farm-data/ics/<שם>.ics`. לכל יומן רלוונטי. לא Calendar Archive.
14. ```bash
    python3.13 cal_events.py demo
    python3.13 cal_events.py scan ~/farm-data/ics/*.ics --tags tags.txt -o calendar_events.csv
    ```
    (`--farm lat,lon` אופציונלי — מסמן ״בחווה״ לפי מיקום; אפשר בלי, או להוסיף אחרי צעד 9.) הפלט: שורת `scan` וסיכום **לפי שנה ותגית**. `calendar_local.csv` (כותרות) נשאר אצלה. שנים 2020–2022 ריקות? → היומן ההוא לא יוצא — לשאול.
    *אם לימור שואלת:* ״רשומת יומן נכתבת לפני האירוע — זו ראיה שקרנות מקבלות. יוצאים רק תאריך, שעות, תגית ומספרים. הכותרות נשארות פה.״

**להביא לי מ-ג2:** שורות `scan` לפי שנה · **`calendar_events.csv`** (בלי כותרות). אחרי צעד 8 עם `--calendar`, `events_seed_share.csv` כבר מכיל את החיבור.

## ד. Wix — הערב רק שני דברים (10 דק׳, לימור מחוברת)

15. **להזמין את טירן:** Wix → Settings → **Roles & Permissions** → Invite People → המייל של טירן → **Admin (Co-Owner)**. זה הדבר היחיד בסעיף שדורש את לימור, ומונע שיום 2 ייתקע על ״רק בעל האתר יכול לייצא״. הייצוא המלא (Payments, Settlement, Donations, Bookings, Events) — **טירן, ביום 2, במק שלו**, לפי DAY2-MONEY §Wix. לא הערב.
16. **סיכום חודשי בלי שמות:** Analytics → All Reports → Accounting → **Payments Summary** → 1.1.2023→היום · Group by **Month** · + עמודת Payment method → Export → הקובץ יורד ל-Downloads → `mv ~/Downloads/<שם>.csv ~/farm-data/raw/checks/wix_payments_summary.csv`. ואז:
    ```bash
    cd ~/farm-data/raw/checks && head -3 wix_payments_summary.csv | cut -c1-200; cd ~/farm-data
    ```
    בכותרת צריכות להיות רק עמודות של תקופה / אמצעי תשלום / סכום / מספר. אם יש Customer / Name / Email / Order → להפיק שוב Group by Month בלבד.
17. **שורת כותרת של Payments** (לאימות המתאם לפני יום 3): Payments (בדשבורד) → סינון תאריכים → Download → `mv ~/Downloads/<שם>.csv ~/farm-data/raw/wix_payments.csv` → `cd ~/farm-data/raw && head -1 wix_payments.csv; cd ~/farm-data`. **תמיד `cd` קודם — נתיב מלא מדפיס את שם המשתמש שלה.** הקובץ עצמו נשאר אצלה (יש בו שמות) עד שטירן מייצא בעצמו.
    בסוף: `ls ~/Downloads | grep -i -E 'wix|payment|orders'` צריך להיות ריק.
    *אם לימור שואלת:* ״ייצוא מהחשבון שלך למק שלך; אליי מגיעים רק שורת כותרת של עמודות וסיכום חודשי.״

**להביא לי מ-ד׳:** `raw/checks/wix_payments_summary.csv` השלם · שורת הכותרת של `wix_payments.csv` · ״טירן הוזמן: כן/לא״ · **כמה אירועים** מופיעים במסך Events של Wix וכמה הזמנות ב-Booking List (מספרים בלבד, מהמסך).

## ה. Instagram (5 דק׳, בטלפון **שלה**, בידיים שלה)

18. פרופיל → ≡ → Settings and activity → **Accounts Center → Your information and permissions → Download your information** → Create export → הפרופיל → **Export to device** → All available information · Date range **All time** · Format **JSON** · Media quality Low → Start export. Meta כנראה תבקש סיסמה — היא מקלידה. מגיע במייל (שעות–יומיים; הלינק תקף 4 ימים). **כשמגיע:** לימור מורידה את כל חלקי ה-ZIP ל-`~/farm-data/instagram/`; ההרצה עם `--instagram` היא **ביקור 2 / שיחת מסך איתי**. הכיתובים ציבוריים אבל יכולים לנקוב בשמות — **לשאול במילים:** ״מסכימה שכיתובי הפוסטים הציבוריים ייכנסו לקובץ שאני שולח?״ ולרשום. בלי הסכמה — הם נשארים ריקים בקובץ ה-share (ברירת המחדל).

## ו. סיום (5–10 דק׳, לימור מאשרת ב-Touch ID)

19. ```bash
    cd ~/farm-data && rm -f photos_meta.json all.vcf && rm -rf Contacts.abbu /tmp/timeline-demo-* /tmp/contacts-demo-* /tmp/calendar-demo-* && ls
    ```
    להראות ללימור את ה-`ls`: אין `photos_meta.json`, אין `Contacts.abbu`. `processing_log.csv` — להסתכל, **לא להעתיק** (יש בו שם משתמש).
20. System Settings → Privacy & Security → **Full Disk Access → Terminal → כבוי**; ואם הופיע — **Contacts → Terminal → כבוי**. **להשאיר** uv/osxphotos לריצה החודשית (אחרת בלוק ה-residue ב-DAY1 §6).
21. **דוח הריצה:**
    ```bash
    python3.13 runlog.py manifest && python3.13 runlog.py report
    ```
    לקרוא את `RUNREPORT.md` פעם אחת על המסך (אין בו שם? אין נתיב?) → זה מה שמדביקים לי. `runlog.jsonl` ו-`manifest.json` נשארים בתיקייה.

## מה נוסע, מה נשאר, מה עוד חסר

| מגיע אליי (בלי שמות) | נשאר על המק שלה | נמחק הערב |
|---|---|---|
| **`RUNREPORT.md`** · `events_seed_share.csv` · `calendar_events.csv` · `contacts_counts.csv` · `contacts_timeline.csv` · `tags.txt` · `raw/checks/wix_payments_summary.csv` · שורת כותרת של wix_payments · שורות scrub/cluster/סיכום-שנים/scan/count (בלי נתיבים, בלי קואורדינטות) | `events_seed.csv` · `albums_local.csv` · `photos_meta.csv` · `vocab_local.csv` · `contacts_groups_local.csv` · `calendar_local.csv` · `ics/` · `raw/wix_payments.csv` · `processing_log.csv` | `photos_meta.json` · `Contacts.abbu` · `all.vcf` · תיקיות demo |

**מה עוד חסר אחרי הערב ומי מביא:** הכנסות ותורמים → טירן, ימים 2–3 (Chase CSV 24 חודשים + PDF למרץ 2023–ינואר 2024, Wix מלא, Venmo). משתתפים → לימור 3×1 שעה תיוג + ספירות Bookings (R). חיות → לימור הערב (S) → קבלות וטרינר (R) ביום 3.

**סדר הקרבה אם נגמר הזמן** (הראשון נופל ראשון): ד17 → ד16 → עומק ג11 (להשאיר תגיות מוצא) → ב10 מקוצר → ה18 רק אם הטלפון לא בחדר. **לא מקריבים:** צעד 4, ב6–ב8, ג12, ג2, ו19–20, והשאלות.

## שאלות ללימור (בזמן שההתקנה / צעד 7 רצים — תשובות בהודעה אחת)
1. הג׳ימייל של העמותה — חשבון נפרד מהפרטי שלה?
2. **חיות היום לפי מין (מספרים)** · כמה נכנסו/יצאו ב-2023/2024/2025 · וטרינר בשנה בערך.
3. **מהזיכרון:** כמה אירועים בשנה וכמה משתתפים בשנה ב-2023/2024/2025, לפי אוכלוסייה (S — להשוואה מול מה שהכלים מצאו).
4. מאז מתי המק הזה / חשבון ה-iCloud הזה?
5. לטירן יש גישה ל-Wix ול-Chase של העמותה? (Wix — הוזמן בצעד 15.)
6. תאריך ליום 3 עם טירן.
7. הסכמה לכיתובי אינסטגרם בקובץ (צעד 18): כן/לא.

## סיימנו הערב כש…
(1) אצלי בצ׳אט: **`RUNREPORT.md`** · `events_seed_share.csv` · `calendar_events.csv` · `contacts_counts.csv` · `contacts_timeline.csv` · `tags.txt` · `wix_payments_summary.csv` · שורות הסיכום · כותרת wix_payments; (2) `ls ~/farm-data` בלי `photos_meta.json` ובלי `Contacts.abbu`; (3) Terminal לא ברשימת Full Disk Access — לימור ראתה; (4) לימור ענתה על 1–7; (5) ייצוא Instagram הופעל או נדחה במפורש. **לביקור 2:** `--instagram`, ואם ב׳ נדחה — הגלריה אחרי סנכרון iCloud.
