# ימים 2–3 — הכסף · runbook למק של טירן

> **הכלל:** ייצואי הבנק והפלטפורמות והמייל **לא עוזבים את המחשב של טירן.** שני הכלים מוציאים שתי שכבות: קבצי `*_local.csv` / `receipts.csv` (עם שמות — נשארים אצלו) ו-`ledger.csv` / `money_summary.csv` / `receipts_summary.csv` (בלי שמות — עולים לגיליון). מי מריץ: טירן, אני לידו.
> הכלים: [`tools/farm/ledger.py`](../tools/farm/ledger.py) · [`tools/farm/mail_ledger.py`](../tools/farm/mail_ledger.py). לפני הכל: `python3 ledger.py demo && python3 mail_ledger.py demo` — שניהם צריכים להדפיס `demo OK` על המכונה שלו.

## יום 2 — ייצוא (טירן לבד, ~2 שעות)
תיקייה: `~/farm-data/raw/` (מקומית). לכל ערוץ שקיים — ייצוא **1.1.2023 → היום**, CSV:

| ערוץ | איפה | שם קובץ |
|---|---|---|
| בנק העמותה | Online banking → Statements/Activity → Download → **CSV** (לא PDF); שנה-שנה אם יש מגבלת טווח | `bank_2023.csv` `bank_2024.csv` `bank_2025.csv` |
| כרטיס אשראי (אם נפרד) | אותו דבר | `card_2023.csv` … |
| PayPal | Activity → **Download** → Custom date range → CSV ("Balance affecting" מספיק) | `paypal.csv` |
| Venmo | venmo.com → Statement → חודש-חודש → Download CSV (12 קבצים בשנה, זה בסדר — הכלי מאחד) | `venmo_2024-01.csv` … |
| Square | Dashboard → Transactions → Export | `square.csv` |
| Stripe | Payments → Export | `stripe.csv` |
| Eventbrite | Orders → Export → Attendee/Orders report CSV | `eventbrite.csv` |
| GoFundMe | Campaign → Donations → Export | `gofundme.csv` |
| Zelle | אין ייצוא נפרד — מופיע בבנק ("Zelle payment from …") | — |

**Gmail של העמותה — קבלות וחשבוניות:**
1. בחיפוש, להדביק ולבדוק כמה תוצאות יש. להתאים לספקים האמיתיים שרואים:
   ```
   after:2022/12/31 (from:(paypal.com OR venmo.com OR squareup.com OR stripe.com OR eventbrite.com OR gofundme.com OR chewy.com OR amazon.com OR tractorsupply.com OR homedepot.com OR wix.com OR squarespace.com OR godaddy.com OR zoom.us OR hiscox.com) OR subject:(receipt OR invoice OR "payment received" OR "you received" OR "order confirmation" OR "payment confirmation" OR donation OR statement OR קבלה OR חשבונית OR תרומה))
   ```
2. **Select all → (Select all conversations that match) → Label → צור `Farm/Receipts`.** אם הרבה חסר — לחפש גם `has:attachment filename:pdf after:2022/12/31` ולתייג את הרלוונטי.
3. **Google Takeout** (takeout.google.com) → Deselect all → **Mail** → "All Mail data included" → לבטל הכל ולסמן **רק `Farm/Receipts`** → Export once → ZIP → להוריד ולפרוס: הקובץ `*.mbox` → `~/farm-data/raw/receipts.mbox`.
   Takeout לוקח מדקות עד שעות — מפעילים בתחילת היום.

## יום 3 — עיבוד (טירן + אני, ~1 שעה)
```bash
cd ~/farm-data
python3 ledger.py ingest raw/bank_*.csv raw/card_*.csv raw/paypal.csv raw/venmo_*.csv raw/eventbrite.csv raw/gofundme.csv -o ledger.csv
#   מדפיס לכל קובץ את הפורמט שזוהה ומס׳ שורות. "UNRECOGNISED" = לשלוח לי את שורת הכותרת (בלי נתונים) — אני מוסיף מתאם.
python3 mail_ledger.py scan raw/receipts.mbox -o receipts.csv --attachments accountant/ --since 2023-01-01
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
1. `summary` מדפיס לכל שנה `in / out / net`. **זה המספר הראשון מבין ארבעה** בשקף "stand". סביר? אם ההכנסות של 2024 הן פי 3 מהזיכרון — כנראה payout של פלטפורמה נספר פעמיים: לבדוק ש-`dup_of` מסומן על שורות הבנק של PayPal/Venmo.
2. `dup_of` / `counted=0`: העברות פנימיות ו-payouts. **לא נמחקים** — נשארים בקובץ, לא נספרים.
3. `zelle_in`: הבנק לא יודע אם זו תרומה או תשלום על ביקור. טירן מסווג בטאב Money (עמודת `category`), לא בקובץ.
4. `questions.csv` — עוברים מלמעלה (הסכומים הגדולים קודם). לכל שורה: קבלה קיימת בקובץ אחר? היה מזומן? עסקה פרטית שנכנסה לחשבון העמותה? (זו התשובה החשובה ל-990: **founders' contribution**.)
5. `counterparties_local.csv` מסודר לפי `total_in` — **זו רשימת התורמים הקיימת**, מי שכבר נתן. עשרת הראשונים = השיחות הראשונות של ערב התורמים.

## מה יכול להשתבש
| תסמין | סיבה | פתרון |
|---|---|---|
| `UNRECOGNISED header` | פורמט בנק שלא מוכר | לשלוח לי **שורת הכותרת בלבד**; מתאם חדש = 10 שורות |
| הכנסות כפולות | payout של פלטפורמה נספר גם בבנק וגם בפלטפורמה | לוודא ש**גם** ייצוא הפלטפורמה **וגם** הבנק נטענו באותה ריצה — הזיהוי עובד רק כששניהם קיימים |
| הכל `other` | תיאורי הבנק מקוצרים | הקטגוריות משתלמות מ-`receipts.csv` ב-reconcile; מה שנשאר — טירן בגיליון |
| `scan` איטי / נתקע | mbox של כל התיבה במקום התווית | ב-Takeout לבחור **רק** את התווית; לחלופין `--since 2023-01-01` |
| PDF לא נשמר | חשבונית בגוף המייל (HTML) ולא כקובץ | הסכום נחלץ בכל מקרה; לרו״ח מדפיסים ל-PDF ידנית רק את הגדולות |
| Venmo לא מזוהה | הורד PDF ולא CSV | Statement → **Download CSV** |
| סכום שגוי ב-receipts | מייל עם כמה סכומים | `amounts_all` מציג את כולם; `confidence=low/medium` = לבדוק ידנית |
