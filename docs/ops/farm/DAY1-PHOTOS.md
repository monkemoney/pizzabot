# יום 1 — הגלריה כציר הזמן · runbook למק של לימור

> **הוחלט (28.9.2026):** ללימור iPhone + מק עם iCloud Photos ⇒ **המסלול המועדף**: `osxphotos` על המק מייצא מטא-דאטה בלבד; `timeline.py` מנקה ומקבץ. **אף תמונה, אף שם, אף כיתוב לא יוצאים מהמחשב.** החוצה יוצא רק `events_seed.csv`.
> מי מריץ: Nave ליד המק של לימור, גישה מלאה, NDA חתום (FACTS #8). הכלל שנשאר: **הדאטה נשאר על המק שלה** — הסקריפטים רצים שם, החוצה יוצא רק `events_seed.csv`. אין להעביר טוקנים/סיסמאות/קבצים גולמיים לסשן של Claude.

> **אומת מול המקורות (28.9.2026):** osxphotos 0.77.x, uv, TCC של macOS, מבנה ייצוא Instagram, מסד אנשי הקשר. הפרקים למטה מתוקנים לפי זה — **לא לחזור לגרסה עם pip / "Download Originals" / דגל לסל המחזור.**

## 0. לפני שמתחילים (5 דק׳)
1. iCloud Photos במק: **הגדרות → Apple ID → iCloud → Photos** דלוק. **אין צורך ב-"Download Originals to this Mac"** — תאריך, GPS והעיר (reverse-geocode) שמורים במסד הנתונים של הספרייה (Photos.sqlite) לכל תמונה, גם כשהמקור ״בענן בלבד״. osxphotos קורא משם, לא מקבצי התמונות. הורדת מקוריים רק תעלה שעות ודיסק ולא תשנה כלום בציר הזמן.
2. **Photos סגור** — מומלץ, לא חובה. כש-Photos פתוח הוא נועל את מסד הנתונים ו-osxphotos עובד מעותק זמני שלו (עשרות שניות + מקום זמני בדיסק לספרייה גדולה). סגירה חוסכת את זה; לא סגרנו — עדיין עובד.
3. תיקיית עבודה: `~/farm-data/` (מקומית, לא בתוך iCloud Drive / Dropbox). כמה GB פנויים — הייצוא הגולמי גדול (שלב 3).
4. **הפקודה הראשונה במק — לפני שמקלידים `python3` לבד:**
   ```bash
   xcode-select -p >/dev/null 2>&1 && python3 --version || echo 'no CLT — fine, we use uv'
   ```
   במק טרי `python3` הוא stub של אפל שמקפיץ דיאלוג ״install Command Line Tools?״. אם הדיאלוג קופץ — **לא ללחוץ Install** (Not Now / Cancel). לא צריך אותו: ~1–2 GB ו-5–10 דק׳ בשביל פייתון 3.9.6 ש-osxphotos ממילא לא יכול להשתמש בו.
5. **איזה פייתון מריץ את הסקריפטים שלנו — נקבע כאן, פעם אחת:**
   - הפקודה הדפיסה `no CLT` ⇒ **כל `python3 X.py` בהמשך המסמך רץ כ-`python3.13 X.py`** (הפייתון של uv, מותקן בשלב 1).
   - הפקודה הדפיסה `Python 3.9.6` ⇒ יש CLT; ה-3.9.6 של אפל מריץ את `timeline.py` ו-`contacts.py` כמו שהם (ספריית תקן בלבד, 3.9+). רק osxphotos צריך 3.10+ — ואת זה uv פותר.

## 1. התקנה (3–5 דק׳, חד-פעמי)
```bash
mkdir -p ~/farm-data && cd ~/farm-data
curl -LsSf https://astral.sh/uv/install.sh | sh      # בלי סיסמה; ~/.local/bin/uv + מוסיף שורה ל-~/.zshrc
source ~/.local/bin/env                              # או: לפתוח חלון Terminal חדש
uv python install 3.13                               # CPython מנוהל -> ~/.local/bin/python3.13 (בלי stub של אפל, בלי CLT)
uv tool install --python 3.13 osxphotos              # -> ~/.local/bin/osxphotos (כמה דקות: pyobjc wheels, בלי קומפיילר)
osxphotos --version                                  # צפוי: 0.77.x — להתקין את האחרונה, לא לנעוץ גרסה
```
⚠️ **לא להשתמש ב-pip של המערכת לזה.** ה-`python3` של macOS הוא 3.9.6; osxphotos דורש 3.10+; `pip install osxphotos` על 3.9 **לא נכשל בקול** — הוא מתקין בשקט גרסה מספטמבר 2024 (0.68.6) שלא מכירה את Photos של macOS 26, ומפיל את הבינארי ב-`~/Library/Python/3.9/bin` שלא ב-PATH. Homebrew (`brew tap RhetTbull/osxphotos && brew install osxphotos`) רק אם Homebrew **כבר** מותקן במק שלה — אחרת זה סיסמת אדמין + CLT + `/opt/homebrew` קבוע במחשב של הלקוחה.

**Full Disk Access — macOS לא מבקש, אין דיאלוג.** ספריית Photos ו-AddressBook מוגנות TCC, ואי-אפשר לבקש את ההרשאה מתוך תוכנה. **לתת לפני הריצה הראשונה:** System Settings → Privacy & Security → Full Disk Access → (+) → `/Applications/Utilities/Terminal.app` → on → **לצאת מ-Terminal לגמרי (⌘Q)** ולפתוח מחדש → `source ~/.local/bin/env` שוב. חלון Terminal שהיה פתוח שומר את ההרשאה הישנה. תסמין אם דילגתם: `Operation not permitted` — בלי שום חלון שקופץ. (מוסר בסוף היום, שלב 6.)

`timeline.py`, `contacts.py` ו-`cal_events.py` מגיעים אליה **בהעתקה מהריפו** (`docs/ops/tools/farm/`) דרך AirDrop/USB — קובץ אחד כל אחד, ספריית תקן בלבד, אין מה להתקין. לא דרך Claude.

## 2. בדיקה על דאטה סינתטי — לפני שנוגעים בגלריה (1 דק׳)
```bash
python3 timeline.py demo          # אין CLT? -> python3.13 timeline.py demo (שלב 0.5)
# צפוי: demo OK: 945 synthetic records -> 942 scrubbed rows -> 32 events (30 farm, 2 off-site)
```
זה מוכיח ללימור, על המכונה שלה, ששמות (״Alice Example״), נתיבי קבצים וכיתובים **לא עוברים** — לפני שראה דאטה אמיתי. אם זה לא עובר, עוצרים. אם `python3` מקפיץ את דיאלוג ה-CLT — Cancel, ו-`python3.13`.

## 3. ייצוא המטא-דאטה (5–20 דק׳ לפי גודל הספרייה)
```bash
osxphotos query --count --from-date 2020-06-01 --not-hidden                     # בדיקה מהירה: מוכיחה Full Disk Access ואומרת N
osxphotos query --json --from-date 2020-06-01 --not-hidden > photos_meta.json   # החווה נפתחה יוני 2020 (FACTS #1)
ls -lh photos_meta.json           # קובץ טקסט; מאות MB לספרייה גדולה (כל רשומה כמה KB) — נורמלי. 0 בייט = שגיאה, ראה טבלה
```
- הבדיקה המהירה קודם: `Operation not permitted` יופיע תוך שניות ולא אחרי ריצה של דקות; אם זה קורה — שלב 1 (FDA), ולוודא ש-Terminal נסגר ב-⌘Q.
- **אין דגל לסל המחזור, ולא צריך:** ברירת המחדל של `query` כבר מוציאה את Recently Deleted; scrub מסנן hidden/intrash שוב בעצמו. דגל שלא קיים בגרסה **מפיל את הכלי** (`No such option`) ומשאיר `photos_meta.json` **ריק** — לכן `ls -lh` אחרי.
- הקובץ הזה **מכיל שמות** (persons, face_info, כיתובים, נתיבים, ואפילו נתיב הספרייה עם שם המשתמש). הוא נשאר ב-`~/farm-data/` ונמחק בסוף היום (שלב 6).

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
- **Instagram (משני, לא מעודכן):** הייצוא המלא נעשה דרך Accounts Center (הנתיב הישן ״Settings → Your activity → Download your information״ כבר לא קיים): אינסטגרם → פרופיל → ≡ → Settings and activity → **Accounts Center → Your information and permissions → Download your information** (בחלק מהגרסאות: Export your information) → Create export → לסמן את פרופיל האינסטגרם → Next → **Export to device** (לא external service) → Customise: All available information · Date range = **All time** · Format = **JSON** · Media quality = **Low** (צריכים רק כיתובים) → Start export. מגיע במייל + Available downloads (שעות עד יומיים, רשמית עד 30 יום); הלינק תקף 4 ימים; חשבון גדול מגיע בכמה חלקי ZIP — להוריד את כולם. התיקייה: `instagram-<user>-<date>-<id>/` — הכלי מחפש בעצמו את `your_instagram_activity/media/posts_1.json` (בייצוא ישן: `.../content/posts_1.json`), `stories.json`, `reels.json`. **אם בתיקייה יש `posts_1.html` — נבחר HTML; לייצא שוב ב-JSON.** ואז `--instagram ~/Downloads/instagram-<user>-<date>-<id>/` מוסיף `ig_posts` + כיתוב הפוסט הארוך ביותר של אותו יום. כיתובים הם **ציבוריים ממילא**; זה מקור התיאור/השותף, לא מקור השמות.
- חשבון Business: Meta Business Suite → Insights → Content → Export data נותן **רק מטריקות של 90 הימים האחרונים** (Posts ו-Stories בנפרד) — לא תחליף לייצוא המלא.

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

שאלות בקרה: כמה אירועים בשנה — **2020–2022 (לפני העמותה) לעומת 2023–2025**? זה ההבדל בין ״שש שנות עשייה״ ל״שנתיים וחצי כעמותה״ בשקף.  יש חודשים ריקים (= לא צולם, או לא היה)? ה-off-site תואם לריטריטים שהיא זוכרת? `no-gps` גדול ⇒ **לא** עניין של ענן — שירותי מיקום כבויים במצלמה של ה-iPhone, או תמונות שיובאו ממצלמה בלי GPS (טבלה למטה); הורדת מקוריים לא תוסיף GPS שלא נרשם.

## 6. סיום היום (2 דק׳)
```bash
rm photos_meta.json              # הגולמי עם השמות — נמחק
open events_seed.csv             # נטען לטאב Events בגיליון המשותף (ידני, לימור)
cat processing_log.csv           # לוג: תאריך · שלב · שורות · מי — נשאר אצלה
```
`photos_meta.csv` (בלי שמות, עם GPS מדויק) **נשאר אצלה** לריצות חודשיות — לא עולה לגיליון.

**להסיר את Terminal מ-Full Disk Access** (System Settings → Privacy & Security → Full Disk Access → Terminal → off) — זה המחשב של הלקוחה, ההרשאה הייתה ליום אחד.

**שאריות — להסיר uv ו-osxphotos, אלא אם הריצה החודשית (שלב 7) מתקיימת:** אם כן — לדלג על הבלוק הזה ולהשאיר uv + osxphotos. אם לא — שלא יישאר שלנו כלום במק שלה:
```bash
uv tool uninstall osxphotos
uv cache clean
rm -r "$(uv python dir)" "$(uv tool dir)"
rm -f ~/.local/bin/python3.13
rm ~/.local/bin/uv ~/.local/bin/uvx ~/.local/bin/env
```
ולמחוק מ-`~/.zshrc` את השורה `. "$HOME/.local/bin/env"` (ומ-`~/.bashrc` אם נוספה גם שם).

## 6ב. אנשי הקשר — ספר המשתתפים, בספירה בלבד (20 דק׳, באותו ביקור)
לימור תייגה עשרות אלפי אנשי קשר במילות מפתח (״סיור״, ״נובה״, פריסטייל). **זה הקובץ הרגיש ביותר במחשב** — שמות וטלפונים של שורדים וחיילים. `contacts.py` לא כותב שם, טלפון או מייל לשום מקום. דורש את אותו Full Disk Access משלב 1 (AddressBook מוגן TCC; `python3` שרץ מ-Terminal יורש את ההרשאה).

**מה לצפות:** עם iCloud אנשי הקשר חיים ב-`~/Library/Application Support/AddressBook/Sources/<UUID>/AddressBook-v22.abcddb` (+ `-wal`/`-shm` לידו — הכלי מעתיק את שלושתם יחד); קובץ השורש `AddressBook/AddressBook-v22.abcddb` בדרך כלל **ריק** — זה נורמלי, לא כישלון. הכלי מדפיס **ספירה לכל מקור** (`<UUID or root>: N people, G groups`); הגדול הוא שלה. מקור ישן/מנותק שלא נפתח — מדולג עם אזהרה, לא מפיל את הריצה.
```bash
python3 contacts.py demo                                    # demo OK לפני הכל
python3 contacts.py vocab -o vocab_local.csv --min 5        # המילים שמופיעות ב-≥5 אנשי קשר. LOCAL — יש בו שמות פרטיים נפוצים
open vocab_local.csv                                        # עם לימור: אילו מילים הן תגיות שלה? -> לערוך tags.txt (נוצר אוטומטית עם תגיות מוצא)
python3 contacts.py count --tags tags.txt -o contacts_counts.csv
open contacts_timeline.csv                                  # בדיקת שפיות — לפני שמציגים משהו (למטה)
```
להשוות את `N` בשורת `vocab: N contacts (db)` למספר ש-Contacts מציג ב-All Contacts. גבוה בהרבה ⇒ שני חשבונות חופפים (iCloud + Google/Exchange) — `--db` על המקור הגדול.

פלט משותף: `contacts_counts.csv` (תגית × שנת יצירת איש הקשר → n; קבוצות; מדינת טלפון IL/US) ו-`contacts_timeline.csv` (חודש → אנשי קשר חדשים = **עקומת הגדילה של הקהילה**).

**בדיקת שפיות — חובה לפני שהעקומה יוצאת מהחדר:** לפתוח `contacts_timeline.csv`. אם **חודש אחד מחזיק אלפים** (בדרך כלל החודש שבו המק / חשבון ה-iCloud הוגדרו) — תאריכי היצירה הם **תאריכי סנכרון ראשון**, לא פגישה ראשונה, ועקומת 2020–2022 **אינה ראיה**. הכלי מזהיר על זה בעצמו; אומרים את זה בפלט במקום להציג את העקומה. תאריך יצירה ≈ פגישה ראשונה **רק** אם החשבון חי במק הזה מ-2020 — ההיסטוגרמה החודשית היא הבדיקה.

**Fallback A — אם FDA נדחה או נכשל (עדיף):** Contacts → File → Export → **Contacts Archive…** → לשמור כ-`~/farm-data/Contacts.abbu` →
```bash
python3 contacts.py count --db "$HOME/farm-data/Contacts.abbu" --tags tags.txt -o contacts_counts.csv
```
הארכיון הוא חבילה עם אותו מסד SQLite בפנים (וגם `Sources/<UUID>/`) — הכלי מטפל בזה בעצמו. **תאריכי יצירה וקבוצות נשמרים**, ולא צריך Full Disk Access כי הקובץ נכתב לתיקייה שלנו. `Contacts.abbu` מחזיק כל שם וטלפון — **נמחק בסוף היום.**

**Fallback B — vCard, מוצא אחרון:** Contacts → Settings… → vCard → Format **3.0**, לסמן **Export notes in vCards**, **לבטל** Export photos in vCards → בסיידבר **All Contacts** → לחיצה על כרטיס אחד → ⌘A → File → Export → **Export vCard…** → `~/farm-data/all.vcf` →
```bash
grep -c '^BEGIN:VCARD' all.vcf                              # חייב להיות שווה למספר ש-Contacts מציג (באג ידוע: כרטיסים מדולגים בשקט)
grep -c '^NOTE' all.vcf                                     # > 0 = ההערות (התגיות שלה) עברו
python3 contacts.py count --tags tags.txt --vcf all.vcf -o contacts_counts.csv
```
ב-vCard **אין תאריך יצירה** — השנים הן `REV` (שינוי אחרון), והכלי אומר זאת. `all.vcf` נמחק בסוף היום.

`vocab_local.csv` ו-`tags.txt` נשארים אצלה. `tags.txt` בלי שמות — אפשר לשלוח לי. משותף רק `contacts_counts.csv` + `contacts_timeline.csv` (ספירות, בלי שמות/טלפונים).

## 6ג. היומן (Apple Calendar) — הרשומה שנכתבה לפני האירוע = דרגה R (15 דק׳, באותו ביקור)
כל היומן של לימור על Apple (FACTS #12). רשומת יומן נכתבת **לפני** שהאירוע קורה — זו רשומה מהזמן, הדרגה שקרנות מקבלות. קלאסטר תמונות ביום שיש בו רשומת יומן = אירוע **מתועד**, לא רק מצולם.
1. **ייצוא, יומן-יומן:** Calendar.app → בסרגל הצד ללחוץ על שם היומן (״חווה״ / ״Home״ / …) → File → Export → **Export…** → לשמור ב-`~/farm-data/ics/<שם>.ics`. לחזור לכל יומן שרלוונטי (גם ״Home״ — פעילות החווה ב-2020–2022 כנראה שם). לא Calendar Archive (.icbu).
2. ```bash
   mkdir -p ~/farm-data/ics          # לפני הייצוא
   python3 cal_events.py demo
   python3 cal_events.py scan ~/farm-data/ics/*.ics --tags tags.txt --farm 34.xxxxx,-118.xxxxx -o calendar_events.csv
   ```
   `--farm` = הקואורדינטות משורת ״farm (inferred)״ של timeline (שלב 4). `tags.txt` = אותו קובץ מאנשי הקשר (§6ב) — תגית אחת לכל המקורות.
3. **לחבר לתמונות:**
   ```bash
   python3 timeline.py cluster photos_meta.csv -o events_seed.csv --farm 34.xxxxx,-118.xxxxx --calendar calendar_events.csv
   ```
   הפלט: `calendar: D days with entries; K clusters upgraded to grade R`. ב-`events_seed.csv` נוספו `cal_events` · `cal_tag` · `cal_headcount` (מספר שהופיע בכותרת, כמו ״40 ילדים״) · `cal_hours`, ו-`evidence_grade` הופך ל-**R** באותם ימים.
4. **מה יוצא:** `calendar_events.csv` (משותף: תאריך · שעות · יומן · חוזר · תגית · headcount hint · מס׳ משתתפים · בחווה/לא · R) ו-`calendar_local.csv` (**נשאר אצלה:** כותרות ומיקומים — משם לימור מתייגת). אירועים חוזרים (חוג שבועי) מורחבים לשורה לכל מופע; ביטולים (EXDATE/CANCELLED) מוסרים; החלון 1.6.2020 → היום.
5. **בדיקה:** הכלי מדפיס לכל שנה כמה אירועים וכמה מכל תגית. שנים 2020–2022 ריקות? → היומן ההוא לא יוצא (״Home״?) או שהיומן התחיל מאוחר — לשאול את לימור.

## 7. ריצה חודשית (אחרי הפיילוט — AUTOMATION.md §שכבה 2)
```bash
$HOME/.local/bin/osxphotos query --json --from-date $(date -v-45d +%Y-%m-%d) --not-hidden > new.json
$HOME/.local/bin/python3.13 timeline.py scrub new.json -o new.csv && $HOME/.local/bin/python3.13 timeline.py cluster new.csv --farm 34.xxxxx,-118.xxxxx --since $(date -v-40d +%Y-%m-%d) -o events_new.csv && rm new.json
```
זה מה ש-launchd יריץ ב-1 לחודש; לימור מתייגת 20 דק׳. הקואורדינטות **מקובעות** מיום 1 (לא `auto`) כדי שלא ״יזוזו״ בחודש עם ריטריט גדול.
- **נתיבים מלאים, לא `osxphotos` / `python3`:** launchd לא קורא `~/.zshrc`, ה-PATH שלו מינימלי ו-`~/.local/bin` לא בו.
- **TCC לריצה לא-אינטראקטיבית:** Full Disk Access שניתן ל-Terminal לא עובר ל-launchd (תהליך אחראי אחר). **להריץ פעם אחת דרך launchd בזמן שעדיין באתר** ולראות שזה עובד — לא לגלות את זה ב-1 לחודש הבא.
- אם שלב 7 מתקיים — לא מריצים את בלוק ה״שאריות״ בשלב 6.

## מה יכול להשתבש
| תסמין | סיבה | פתרון |
|---|---|---|
| `osxphotos` לא נמצא | `~/.local/bin` לא ב-PATH בחלון הזה | `source ~/.local/bin/env`, או `uv tool update-shell` ואז לפתוח Terminal מחדש; חלופה בלי התקנה: `uvx --python 3.13 osxphotos ...` |
| `python3` מקפיץ דיאלוג ״install Command Line Tools״ | אין CLT — זה ה-stub של אפל | Cancel; להריץ `python3.13 X.py` (שלב 0.5) |
| ״Operation not permitted״ — בלי דיאלוג | אין Full Disk Access, או Terminal לא נסגר ב-⌘Q אחרי ההוספה | שלב 1; אחרי הפתיחה מחדש `source ~/.local/bin/env` |
| `No such option` ו-`photos_meta.json` ב-0 בייט | דגל שלא קיים בגרסת osxphotos הזו | להשמיט את הדגל; `osxphotos query --help`; להריץ שוב |
| כל האירועים `no-gps` | שירותי מיקום כבויים במצלמה, או תמונות שיובאו ממצלמה בלי GPS — **לא** אחסון ״בענן בלבד״ | iPhone → Settings → Privacy → Location → Camera; תמונות ממצלמה בלי GPS יישארו `no-gps` — זה נכון |
| החווה ״זוהתה״ בבית של לימור | היא צילמה יותר בבית | `--farm lat,lon` ידני |
| ריטריט מפוצל לשתי שורות | שני מוקדים במרחק >1 ק״מ | זה נכון — שני מקומות באותו יום; לימור ממזגת בתיוג |
| אירוע חסר | <5 תמונות | `--min-photos 3` ולהשוות; ברירת המחדל שמרנית בכוונה |
| `ZABCDRECORD not found` / `unable to open database file` | תיקיית חשבון ישנה/מנותקת תחת `Sources/` | הכלי מדלג עליה בעצמו; אם לא — `--db` על הקובץ הגדול ביותר ב-`Sources/<UUID>/AddressBook-v22.abcddb` |
| ספירת אנשי קשר גבוהה בהרבה ממה ש-Contacts מציג | אותם אנשים בשני חשבונות (iCloud + Google/Exchange) | `--db` על מקור אחד |
| `grep -c BEGIN:VCARD` קטן ממה ש-Contacts מציג | ייצוא vCard דילג על כרטיסים (באג ידוע) | להשתמש ב-`.abbu` (Fallback A) |
| חודש אחד ב-`contacts_timeline.csv` מחזיק אלפים | תאריכי יצירה = סנכרון ראשון למק, לא פגישה ראשונה | לא להציג את העקומה שלפני הספייק כראיה; לומר זאת בפלט |
