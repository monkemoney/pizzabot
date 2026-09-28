# ימים 2–3 — הכסף · runbook למק של טירן

> **הכלל:** ייצואי הבנק והפלטפורמות והמייל **לא עוזבים את המחשב של טירן.** שני הכלים מוציאים שתי שכבות: קבצי `*_local.csv` / `receipts.csv` (עם שמות — נשארים אצלו) ו-`ledger.csv` / `money_summary.csv` / `receipts_summary.csv` (בלי שמות — עולים לגיליון). מי מריץ: טירן, אני לידו.
> הכלים: [`tools/farm/ledger.py`](../tools/farm/ledger.py) · [`tools/farm/mail_ledger.py`](../tools/farm/mail_ledger.py). לפני הכל: `python3 ledger.py demo && python3 mail_ledger.py demo` — שניהם צריכים להדפיס `demo OK` על המכונה שלו.

> **פייתון על המק של טירן — לבדוק לפני שמקלידים `python3`:** על מק נקי `python3` הוא stub של אפל — ההקלדה הראשונה פותחת דיאלוג להתקנת Command Line Tools (~1–2 GB, 5–10 דק׳) ומביאה Python 3.9.6.
> - אם ביום 1 הותקן uv (`~/.local/bin/uv` קיים) — מריצים את הסקריפטים שלנו עם **`python3.13`** (`uv python install 3.13` אם עוד לא הותקן), ואין צורך ב-CLT בכלל.
> - אם `xcode-select -p` מצליח (יש כבר CLT) — `python3` של אפל (3.9.6) **מספיק** לשני הכלים (שניהם נבדקו על 3.9; רק osxphotos של יום 1 צריך 3.10+).
> - בקובץ הזה `python3` = מה שיש אצלו מהשניים. אם הדיאלוג של אפל קופץ ויש uv — **Not Now**.

## יום 2 — ייצוא (טירן לבד, ~2–3 שעות)
תיקיות (מקומיות, לא בתוך iCloud Drive / Dropbox):
```
~/farm-data/raw/                  קבצי הכסף (נטענים ל-ingest) + קבצי ה-.mbox
~/farm-data/raw/pdf/              דוחות PDF של Chase — המקור להקלדה ידנית
~/farm-data/raw/participation/    Wix Bookings / Events — השתתפות, לא כסף, לא נטען
~/farm-data/raw/checks/           wix_payments_summary.csv — בדיקת שפיות בלבד, לא נטען
~/farm-data/local/                wix_contacts_local.csv — שמות; לא נטען לשום דבר
```
לכל ערוץ שקיים — ייצוא **CSV לכל מה שזמין**: הפלטפורמות 1.1.2023 → היום; **Chase נותן CSV רק ל-~24 החודשים האחרונים** (היום ≈ מאוקטובר 2024 — לא 7 שנים; 7 שנים זה רק PDF). מה שקדום יותר — דוחות PDF והקלדה, ראה שורות ה-PDF בטבלה.

| ערוץ | איפה | שם קובץ |
|---|---|---|
| **Chase — חשבון העמותה** (FACTS #3) | chase.com **בדפדפן על המק (לא באפליקציה — שם אין CSV)** → לחיצה על החשבון → **Activity** → אייקון חץ-הורדה (↓) מעל רשימת התנועות (בממשק ישן: ⋯ More → Download account activity) → **Choose a date range** → File type: **Spreadsheet (Excel, CSV)** → Download. ההיסטוריה הזמינה היא ~24 חודשים בלבד; להוריד **בפרוסות של ≤12 חודשים**; לבדוק `wc -l` — **קובץ עם ~1,000 שורות נחתך בשקט**, לפצל את הטווח ולהוריד שוב. Chase שומר `Chase1234_Activity_YYYYMMDD.CSV` — **לשנות שם באותיות קטנות** `.csv`, אחרת ה-glob `chase_*.csv` לא יתפוס אותו. | `chase_npo_2024q4.csv` `chase_npo_2025.csv` `chase_npo_2026.csv` |
| **Chase — חודשי העמותה שלפני חלון ה-CSV** (~פברואר–ספטמבר 2024, מהחודש שבו נפתח החשבון) | אין CSV. ☰ (Main menu, שמאל למעלה) → **Statements & documents** → החשבון → להוריד את הדוחות החודשיים כ-PDF (זמינים 7 שנים) ל-`raw/pdf/`. טירן מקליד את שורות החווה לקובץ עם שורה ראשונה `Date,Description,Amount` — תאריך MM/DD/YYYY, הוצאה במינוס, הכנסה בפלוס. הכלי קולט בדיוק את הצורה הזו (ענף bank גנרי, נבדק ב-demo). | `chase_npo_2024_pdf.csv` |
| **Chase — החשבון הפרטי, מרץ 2023 → ינואר 2024** | **אין CSV לתקופה הזו** (כולה מחוץ לחלון 24 החודשים). אותו מסלול: ☰ → **Statements & documents** → החשבון הפרטי → 11 ה-PDF החודשיים ל-`raw/pdf/`. טירן מקליד **רק את שורות החווה** (chewy, vet, feed, tractor supply…) לקובץ עם הכותרת `Date,Description,Amount`, MM/DD/YYYY, הוצאה במינוס. **זה ה-founders' contribution** — ההוצאות על החווה מהכיס הפרטי לפני שהחשבון של העמותה נפתח (FACTS #2). | `chase_private_2023.csv` |
| כרטיס אשראי (אם נפרד) | כרטיס Chase: אותו מסלול Activity → ↓ מתוך חשבון הכרטיס. הכותרת תהיה `Transaction Date,Post Date,Description,Category,Type,Amount,Memo` (Memo לפעמים חסר) — תקין, נקלט בענף bank הגנרי (קניות במינוס, תשלומים בפלוס). **תשלומים לכרטיס** ("Payment Thank You", AUTOPAY, "Chase card ending …") הם **transfer / counted=0 בשני הצדדים** — ההוצאה האמיתית היא הקנייה בכרטיס. כרטיס שאינו Chase: כל CSV עם תאריך/תיאור/סכום נקלט; לקרוא לו `card_2025.csv` ולהוסיף לפקודת ה-ingest במפורש. | `chase_card_2025.csv` … (כך ש-`chase_*.csv` תופס) |
| **Wix — הערב (28.9) עם לימור:** רק הזמנת טירן כ-Admin (Settings → Roles & Permissions → Invite People) + שורת כותרת של Payments + סיכום חודשי (Analytics). **הייצוא המלא — טירן, ביום 2, במק שלו**, כי `ledger.py ingest` רץ אצלו והקבצים הגולמיים לא עוברים בין מחשבים. | — | — |
| **Wix Payments** (FACTS #4, #5) | **שני ייצואים.** (א) **Payments** (בדשבורד האתר) → סינון תאריכים 1.1.2023 → היום, Status: all → אייקון **Download** → CSV. זה **קובץ הכסף** — כל ספקי התשלום (Wix Payments, PayPal, ידני שסומן paid). (ב) **Accept Payments** → **Manage** ליד Wix Payments → **Settlement Report** → טווח תאריכים, כל סוגי העסקאות → **Download Detailed Table** → CSV — הקובץ עם **העמלות ומזהי ה-payout** (Wix Payments בלבד). **Payouts** בדשבורד — לצפייה בלבד, אין מה לייצא; ההפקדות עצמן נמצאות ב-Chase. לרשום **איך הפקדה של Wix נראית בתיאור ב-Chase** — הזיהוי של payout בבנק מחפש את שם הפלטפורמה. | `wix_payments.csv` `wix_settlement.csv` |
| **Wix Donations** | **אין ייצוא תרומות ייעודי** (feature request פתוח). **Orders** → סינון/סימון כל הזמנות התרומה (checkbox עליון; לחזור לכל עמוד) → **Export** → שורה להזמנה; להשאיר: order number, date created, customer/contact, item (=קמפיין), total, payment status, payment method. תרומה חוזרת = **הזמנה חדשה בכל מחזור** (התוכניות עצמן תחת Subscriptions). ⚠️ **הכסף כבר ב-`wix_payments.csv`** — הקובץ הזה הוא לשיוך תורם/קמפיין בלבד; הכלי מסמן את שורותיו `counted=0` / `dup_of=wix payment` כשהוא נטען **באותה ריצה** עם Payments. | `wix_donations.csv` |
| Wix Bookings (אם קיים) | **Booking List** → Filter → Session date & time: 1.1.2023 → היום → **לגלול עד סוף הרשימה** (שהכל ייטען) → אייקון **Export** (ימין למעלה) → Filtered items → CSV. (חלופה: Booking Calendar → Manage → Export booking data → Booking List.) זו **נוכחות — Events בדרגה R**, לא הכנסה: הכסף כבר ב-Payments. יש בו שמות — לא נטען ל-ingest. | `participation/wix_bookings.csv` |
| Wix Events (אם קיים) | **Events** → **Manage** ליד כל אירוע → **Orders** → **Export Order List**; ואז **Guests** → **Export Guests**. **לכל אירוע בנפרד** — אין ייצוא מרוכז. גם זה השתתפות (דרגה R), לא כסף. | `participation/wix_events_<event>_orders.csv` `_guests.csv` |
| Wix Contacts (ספירה בלבד) | **Contacts** → תפריט **Import / Export** (מעל הרשימה) → **Export** → Regular CSV. רק **בעל האתר** יכול לייצא; עד 50,000; **תוויות (labels) לא מיוצאות** — לספירה לפי תוכנית: לסנן לפי תווית → Select all → Export "selected". **נשאר אצל טירן (שמות)** — לא ל-`raw/`, לא ל-ingest, לא לגיליון. | `local/wix_contacts_local.csv` |
| Wix Analytics — סיכומים חודשיים | **Analytics → All Reports** → קטע **Accounting** → **Payments Summary** → טווח מותאם 1.1.2023 → היום → Group by: **Month** → להוסיף עמודת **Payment method** → אייקון **Export** (ימין למעלה) → CSV. **בדיקת שפיות ל-4 המספרים** — מכסה את כל ספקי התשלום (ה-Settlement רק Wix Payments). לא נטען ל-ingest; משווים על המסך מול `summary`. | `checks/wix_payments_summary.csv` |
| PayPal (אם היה) | Activity → **Download** → Custom date range → CSV | `paypal.csv` |
| **Venmo** (FACTS #4) | venmo.com → כניסה → **Statements** בסיידבר (או ישירות account.venmo.com/statement) → **בדרופדאון העליון לבחור את פרופיל העסק/הצדקה של החווה אם קיים** (הפרופיל הפרטי מייצא רק פעילות פרטית) → דרופדאון חודש+שנה → **Download CSV**. חודש לקובץ (רבעון בתקופות עם פעילות נמוכה), **מקסימום 90 ימים לקובץ, 3 שנים אחורה**; קובץ גדול נשלח למייל במקום להורדה. 12 קבצים בשנה זה בסדר — הכלי מאחד. הכלי מזהה **רק** את ה-CSV הזה: שורת הכותרת מתחילה ב-`,ID,Datetime,Type` (לא PDF, לא ה-CSV של "Sales tax collected"). | `venmo_2024-01.csv` … |
| Square | Dashboard → Transactions → Export | `square.csv` |
| Stripe | Payments → Export | `stripe.csv` |
| Eventbrite | Orders → Export → Attendee/Orders report CSV | `eventbrite.csv` |
| GoFundMe | Campaign → Donations → Export | `gofundme.csv` |
| **Zelle** (FACTS #4) | **אין ייצוא משלו** — אפליקציית Zelle העצמאית נסגרה (ההיסטוריה שם נעלמה במרץ 2025); המקור היחיד הוא פעילות הבנק: ה-CSV של Chase, ולפני חלון ה-CSV — ה-PDF. בתיאור: `Zelle payment from NAME 12345678` / `Zelle payment to NAME Jpm99…` (מזהה JPM אלפאנומרי). הכלי מחלץ את השם משתי הצורות ל-`counterparties_local.csv` ומסמן `zelle_in`. | — |

- **אם התפריט הצדדי ב-Wix שונה אצל טירן** (הוא ניתן להתאמה) — שורת החיפוש בראש הדשבורד עם שם העמוד: Payments / Accept Payments / Orders / Booking List / Events / Contacts / All Reports.
- **הקובץ האמיתי הראשון של Wix עלול להדפיס `UNRECOGNISED`** — שמות העמודות של Wix לא מתועדים בשום מקום נגיש. טירן שולח **שורת הכותרת בלבד** (בלי נתונים), מתאם = 10 שורות, ריצה חוזרת.
- **בדיקת Chase לפני שממשיכים** (בטרמינל):
  ```bash
  head -1 ~/farm-data/raw/chase_npo_2025.csv
  # חייב להדפיס בדיוק: Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
  wc -l ~/farm-data/raw/chase_*.csv
  # קובץ עם ~1,000 שורות = נחתך בשקט. לפצל את הטווח לשניים ולהוריד שוב.
  ```

**Gmail של העמותה — קבלות וחשבוניות** (בדפדפן על המק; באפליקציה אין "select all matching"):
0. **אם ממשק ה-Gmail בעברית** — כל המחרוזות למטה יופיעו בעברית. או להעביר לאנגלית לערב (⚙ → **See all settings** → Language) או לתרגם תוך כדי.
1. בחיפוש להדביק את השאילתה, Enter, ולרשום **כמה תוצאות** (למעלה מימין: "1–50 of N"). להתאים לספקים האמיתיים שרואים:
   ```
   after:2022/12/31 (from:(paypal.com OR venmo.com OR squareup.com OR stripe.com OR eventbrite.com OR gofundme.com OR chewy.com OR amazon.com OR tractorsupply.com OR homedepot.com OR wix.com OR squarespace.com OR godaddy.com OR zoom.us OR hiscox.com) OR subject:(receipt OR invoice OR "payment received" OR "you received" OR "order confirmation" OR "payment confirmation" OR donation OR statement OR קבלה OR חשבונית OR תרומה))
   ```
2. **תיוג המוני (N < ~1,000):** ה-checkbox העליון של הרשימה → בבאנר "All 50 conversations on this page are selected" ללחוץ **Select all conversations that match this search** → אייקון **Labels** (תגית) בסרגל → **Create new** → שם `Farm/Receipts` (הסלאש = תווית מקוננת תחת Farm) → Create → אם קופץ אישור "will affect all N conversations" → **OK**. Gmail מבצע ברקע כמה דקות.
   **N ≥ ~1,000** (Google ממליצה על פחות מ-1,000 הודעות לפעולה) — אחת משתיים:
   - **לפצל לפי שנה**: להוסיף לשאילתה `after:2022/12/31 before:2024/01/01`, ואז `after:2023/12/31 before:2025/01/01`, `after:2024/12/31 before:2026/01/01`, `after:2025/12/31` — ולחזור על התיוג לכל פרוסה (בפעם השנייה: Labels → ✓ Farm/Receipts → Apply, התווית כבר קיימת).
   - **מסלול הפילטר**: אייקון המחוונים בשורת החיפוש (Show search options) → להדביק את השאילתה ב-**Has the words** → **Create filter** → ✓ **Apply the label** → **New label…** `Farm/Receipts` → ✓ **Also apply filter to matching conversations** → **Create filter** → על האזהרה שטווח תאריכים "will never match incoming mail" → **OK** (זה עדיין מתייג את כל הקיים). אחר כך למחוק את הפילטר (⚙ → See all settings → Filters and Blocked Addresses).
3. סבב שני: `has:attachment filename:pdf after:2022/12/31` → לסמן את הרלוונטי (או הכל אם זה בעיקר חשבוניות) → Labels → ✓ `Farm/Receipts` → Apply.
4. **לפני Takeout:** לחפש `label:Farm-Receipts` (Gmail כותב את הסלאש כמקף) ולחכות **שהמספר מפסיק לגדול** — Takeout מצלם את המצב ברגע הייצוא.
5. **Google Takeout** (takeout.google.com, מחובר לחשבון העמותה) → **Deselect all** → ✓ **Mail** → ללחוץ על **All Mail data included** → להסיר ✓ מ-**Include all messages in Mail** → ✓ **רק `Farm/Receipts`** → OK → **Next step** → Transfer to: **Send download link via email** · Frequency: **Export once** · File type: **.zip** · File size: **10 GB** (מונע פיצול) → **Create export**. ייצוא של תווית אחת הוא בדרך כלל דקות (הפאנל יגיד "hours or days") — מפעילים בתחילת היום בכל מקרה.
6. מייל **"Your Google data is ready to download"** (הלינק תקף ~7 ימים) → Download → לפרוס (דאבל-קליק) → `Takeout/Mail/` מחזיק **קובץ .mbox אחד לכל תווית**. איך Takeout מאיית תווית מקוננת בשם הקובץ — לא מאומת (`Farm-Receipts.mbox` או דומה) — **לוקחים את ה-.mbox שיש**:
   ```bash
   mkdir -p ~/farm-data/raw
   mv ~/Downloads/Takeout/Mail/*.mbox ~/farm-data/raw/receipts.mbox     # קובץ אחד
   mv ~/Downloads/Takeout/Mail/*.mbox ~/farm-data/raw/                  # כמה חלקים (…-002.mbox) — כפי שהם
   ```
   כמה חלקים זה בסדר — `mail_ledger.py scan` מקבל כמה קבצים (`raw/*.mbox`), אין צורך ב-cat.

**מה טירן מביא לי מיום 2 (בלי שמות, בלי קבצים):** מספר התוצאות של החיפוש · כמה שיחות תויגו · גודל ה-ZIP · **שם ה-.mbox המדויק כפי ש-Takeout איית אותו** (כדי שה-runbook יפסיק לגמגם) · שורת הכותרת של כל קובץ Chase/Wix/Venmo · הפלט של `wc -l`. לא את ה-mbox, לא את הקבצים.

## יום 3 — עיבוד (טירן + אני, ~1 שעה)
```bash
cd ~/farm-data
python3 ledger.py ingest raw/chase_*.csv raw/wix_*.csv raw/venmo_*.csv -o ledger.csv          # + raw/paypal.csv raw/card_*.csv raw/eventbrite.csv אם קיימים — הכל באותה ריצה
#   מדפיס לכל קובץ: שם · הפורמט שזוהה (chase / bank / wix / orders / venmo…) · מס׳ שורות · skipped by status אם היו.
#   "UNRECOGNISED" = לשלוח לי את שורת הכותרת (בלי נתונים) — אני מוסיף מתאם.
python3 mail_ledger.py scan raw/*.mbox -o receipts.csv --attachments accountant/ --since 2023-01-01
#   מדפיס קודם "indexing … (N MB)" ואז שקט ~8–10 שניות לכל GB — זה לא נתקע. --since מקצץ פלט, לא זמן.
python3 ledger.py reconcile ledger.csv receipts.csv -o ledger.csv --questions questions.csv
python3 ledger.py summary ledger.csv -o money_summary.csv
python3 mail_ledger.py summary receipts.csv -o receipts_summary.csv
```

**מה נוצר ואיפה זה חי:**
| קובץ | מה יש בו | עולה לגיליון? |
|---|---|---|
| `ledger.csv` | שורה לכל תנועה: תאריך · מקור · כיוון · סכום · קטגוריה · `cp_id` (מזהה קבוע, לא שם) · `counted` · `dup_of` · `receipt_ref` | **כן** → טאב Money (גולמי) |
| `money_summary.csv` | שנה × חודש × כיוון × קטגוריה × מקור: מס׳ · סה״כ | **כן** → 4 המספרים; בסיס ל-990 |
| `receipts_summary.csv` | חודש × כיוון × קטגוריה × סוג שולח | **כן** |
| `counterparties_local.csv` | `cp_id` → שם · סה״כ נכנס/יוצא · ראשון/אחרון · ערוצים | **לא.** מקור טאב Donors — טירן בוחר מה עולה (שם פרטי, סכום, תאריך) |
| `receipts.csv` | שורה למייל כספי, כולל **נושא** (יכול להכיל שם תורם) | **לא.** נשאר לצד הקודם |
| `accountant/2024/…pdf` | חשבוניות ה-PDF, `תאריך_דומיין_שם.pdf` | **לא.** לרו״ח, ל-990 מרצון |
| `questions.csv` | הוצאות בלי מסמך · הכנסות שהבנק לא יודע לסווג (Zelle) | טירן עונה — הרשימה קצרה בכוונה |
| `processing_log.csv` | תאריך · שלב · שורות · מי | נשאר אצלו (סעיף 8 ב-EXTRACTION) |

**מה בודקים יחד (15 דק׳):**
1. `summary` מדפיס לכל שנה `in / out / net`. **זה המספר הראשון מבין ארבעה** בשקף "stand". סביר? החלק של Wix — מול `checks/wix_payments_summary.csv` (אותם חודשים, אותו סדר גודל). אם ההכנסות של 2024 הן פי 3 מהזיכרון — כנראה payout של פלטפורמה נספר פעמיים: לבדוק ש-`dup_of` מסומן `wix payout` / `venmo payout` על שורות הבנק. אם ההפקדה של Wix ב-Chase לא מכילה את המילה wix בתיאור — הזיהוי לא יתפוס אותה; להגיד לי את התיאור (בלי סכומים).
2. **Venmo פרופיל עסקי:** על השורה האמיתית הראשונה עם `Amount (fee)` לוודא ש-`Amount (total)` הוא **ברוטו** (סה״כ − עמלות בחודש = סכום ה-Standard Transfer של אותו חודש). `ledger.py` רושם את העמלה כשורה נפרדת; אם total כבר נטו — העמלה נספרת פעמיים.
3. `dup_of` / `counted=0`: העברות פנימיות, payouts, תשלומים לכרטיס, ושורות `wix_donations.csv` (`dup_of=wix payment`). **לא נמחקים** — נשארים בקובץ, לא נספרים. שורת תרומה של Wix עם `counted=1` = הקובץ נטען בלי `wix_payments.csv` באותה ריצה, או תרומה שאין לה תשלום מתאים — הכלי מדפיס כמה כאלה.
4. `zelle_in`: הבנק לא יודע אם זו תרומה או תשלום על ביקור. טירן מסווג בטאב Money (עמודת `category`), לא בקובץ.
5. `questions.csv` — עוברים מלמעלה (הסכומים הגדולים קודם). לכל שורה: קבלה קיימת בקובץ אחר? היה מזומן? עסקה פרטית שנכנסה לחשבון העמותה? (זו התשובה החשובה ל-990: **founders' contribution**.)
6. `counterparties_local.csv` מסודר לפי `total_in` — **זו רשימת התורמים הקיימת**, מי שכבר נתן. עשרת הראשונים = השיחות הראשונות של ערב התורמים.

## מה יכול להשתבש
| תסמין | סיבה | פתרון |
|---|---|---|
| `UNRECOGNISED header` | פורמט שלא מוכר — צפוי בקובץ Wix האמיתי הראשון (העמודות לא מתועדות) | לשלוח לי **שורת הכותרת בלבד**; מתאם חדש = 10 שורות |
| קובץ Chase עם ~1,000 שורות בדיוק | Chase חותך את הייצוא בשקט | לפצל את הטווח לשניים ולהוריד שוב; `wc -l` על כל קובץ |
| אין תנועות לפני ~10/2024 | ה-CSV של Chase מכסה ~24 חודשים בלבד | ☰ → Statements & documents → PDF → הקלדה לקובץ `Date,Description,Amount` (ראה שורות ה-PDF בטבלה) |
| הכנסות כפולות (payout) | payout של פלטפורמה נספר גם בבנק וגם בפלטפורמה | לוודא ש**גם** ייצוא הפלטפורמה **וגם** הבנק נטענו באותה ריצה — הזיהוי עובד רק כששניהם קיימים; ולוודא שהתיאור בבנק מכיל את שם הפלטפורמה |
| Wix מזוהה אבל 0 שורות / `skipped by status: …` | הסטטוסים של Wix הם `Successful` / `Paid Out` (לא `Approved`) — תוקן ב-`ledger.py`; סטטוס חדש שלא ברשימה נדפס | לשלוח לי את מילת הסטטוס שנדפסה ב-`skipped by status` |
| הכנסות Wix כפולות | גם `wix_payments.csv` וגם `wix_donations.csv` נספרו כהכנסה | תרומות/הזמנות = `counted=0` רק כשקובץ Payments **באותה ריצה**; לכסף — Payments בלבד |
| הכל `other` | תיאורי הבנק מקוצרים | הקטגוריות משתלמות מ-`receipts.csv` ב-reconcile; מה שנשאר — טירן בגיליון |
| `scan` "נתקע" בלי פלט | Python מאנדקס את כל הקובץ לפני ההודעה הראשונה — ~8–10 שניות לכל GB של שקט אחרי שורת ה-`indexing` | זה לא נתקע — לחכות. התיקון היחיד לזמן: לייצא ב-Takeout **רק** את התווית, לא את כל התיבה. `--since` **לא** מזרז (מסנן אחרי הפירסור) |
| PDF לא נשמר | חשבונית בגוף המייל (HTML) ולא כקובץ | הסכום נחלץ בכל מקרה; לרו״ח מדפיסים ל-PDF ידנית רק את הגדולות |
| Venmo לא מזוהה | הורד PDF/הדפסה, או ה-CSV של "Sales tax collected" מדשבורד העסק | הכלי מזהה רק את **Download CSV** מדף Statements — שורת הכותרת מתחילה ב-`,ID,Datetime,Type` |
| סכום שגוי ב-receipts | מייל עם כמה סכומים | `amounts_all` מציג את כולם; `confidence=low/medium` = לבדוק ידנית |
