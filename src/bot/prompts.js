'use strict';

const settings          = require('../services/settings');
const menuService = require('../services/menu-service');
const { buildMenuText } = menuService;
const lessonsService    = require('../services/lessons');

// Accumulated lessons are injected at the END of the prompt (highest recency).
// They live in the bot_lessons table — approving one in the vendor portal
// reaches the live bot within the lessons cache TTL, with no deploy. The old
// implementation read a markdown file into a module variable that never
// refreshed, so a lesson change needed a commit AND a restart.
function injectLessons(prompt, lessons) {
  if (!lessons) return prompt;
  return prompt +
    `\n\n══════════════════════════════════════════\n` +
    `לקחים שנצברו מאימון (עדיפות גבוהה — פעל לפיהם)\n` +
    `══════════════════════════════════════════\n${lessons}\n`;
}

/**
 * @param {object} customerProfile  saved name/address, or null
 * @param {string} tenantId
 * @param {string} lang  'he' | 'en' — the customer's language. Defaults to the
 *                       TENANT's, so an American tenant's bot opens in English
 *                       rather than switching only once a customer writes it.
 */
async function buildSystemPrompt(customerProfile = null, tenantId = null, lang = null) {
  const tid = tenantId || settings.DEFAULT_TENANT_ID;
  const [allSettings, menuText, deliveryNowOpen, isOpenNow, lessonsOn] = await Promise.all([
    settings.loadAll(tid),
    settings.loadAll(tid).then((s) => {
      const { resolveLocale } = require('../services/locale');
      const l = lang === 'en' || lang === 'he' ? lang
              : (resolveLocale(s).region === 'IL' ? 'he' : 'en');
      return buildMenuText(s, tid, l);
    }),
    settings.isDeliveryOpen(tid),
    settings.isOpen(tid),
    lessonsService.isEnabled(tid),
  ]);
  const lessonsText = lessonsOn ? await lessonsService.getLessonsText(tid) : '';

  const { resolveLocale, promptMoney } = require('../services/locale');
  const loc = resolveLocale(allSettings);
  // The tenant's own language is the default; an explicit lang (the customer
  // wrote in the other one) wins.
  const promptLang = lang === 'en' || lang === 'he' ? lang : (loc.region === 'IL' ? 'he' : 'en');
  const fmtMoney = (n) => promptMoney(n, loc);

  // Whether the tenant exempts any category from tax (C10). Read off the menu
  // snapshot buildMenuText just built, so it is a cache hit rather than a
  // second query. False for every tenant until someone sets the flag — which is
  // what keeps the frozen Hebrew prompt byte-for-byte what it was.
  const hasExemptCategory = ((await menuService.getProducts(tid).catch(() => ({}))).categories || [])
    .some((c) => c && c.taxable === false);

  const prepLeadTime = allSettings.prep_lead_time ?? 45;
  // The clock the bot quotes to customers, and schedules pre-orders against. It
  // reported Israel time to every tenant — the label said so, which made it
  // honest but no less wrong for a Los Angeles business ten hours away.
  const tzTime = require('../services/tz-time');
  const nowStr = tzTime.clock(new Date(), loc.timezone);
  const DAY_KEYS = ['sun','mon','tue','wed','thu','fri','sat'];
  const DAY_HE   = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי', sat:'שבת' };
  const todayKey = DAY_KEYS[tzTime.parts(new Date(), loc.timezone).weekday];

  // ── Build live-status block ──────────────────────────────────────────────────
  function todayHoursStr(hoursObj) {
    if (!hoursObj) return null;
    const h = hoursObj[todayKey];
    if (!h) return null;
    if (h.is_open === false) return 'סגור היום';
    return `${h.open}–${h.close}`;
  }
  const bizHoursToday = todayHoursStr(allSettings.business_hours);
  const dlvHoursToday = todayHoursStr(allSettings.delivery_hours);

  // This is the block the prompt tells the bot to answer from EXCLUSIVELY, so
  // it has to be in the language the bot is answering in — a Hebrew state block
  // under English instructions is the one section guaranteed to be quoted back.
  const DAY_EN = { sun:'Sunday', mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday' };

  const liveStatus = promptLang === 'en' ? [
    `Current local time (${loc.timezone}): ${nowStr} | ${DAY_EN[todayKey]}`,
    `The business is currently: ${isOpenNow ? 'OPEN — taking orders now (even if the clock is outside the hours shown below, e.g. a special opening or hours that cross midnight)' : 'CLOSED'}`,
    bizHoursToday ? `Today's hours: ${bizHoursToday === 'סגור היום' ? 'closed today' : bizHoursToday}` : 'Hours: not configured (always open)',
    dlvHoursToday ? `Delivery hours today: ${dlvHoursToday === 'סגור היום' ? 'no delivery today' : dlvHoursToday}` : null,
    `Delivery: ${deliveryNowOpen && allSettings.delivery_enabled !== false ? 'available' : 'unavailable'} | Pickup: ${allSettings.pickup_enabled !== false ? 'available' : 'unavailable'}`,
    `Payment: ${[
      allSettings.payment_cash    !== false ? 'cash' : null,
      allSettings.payment_credit  !== false ? 'card' : null,
      (allSettings.payment_bit    === true  || allSettings.payment_bit === 'true') ? 'Bit' : null,
      (allSettings.payment_paybox === true) ? 'Paybox' : null,
    ].filter(Boolean).join(' / ')}`,
  ].filter(Boolean).join('\n') : [
    `השעה עכשיו (${loc.timezone === 'Asia/Jerusalem' ? 'ישראל' : loc.timezone}): ${nowStr} | יום ${DAY_HE[todayKey]}`,
    `העסק כרגע: ${isOpenNow ? 'פתוח — מקבלים הזמנות עכשיו (גם אם השעה מחוץ לשעות המוצגות למטה, למשל פתיחה מיוחדת או שעות שחוצות חצות)' : 'סגור'}`,
    bizHoursToday ? `שעות פעילות היום: ${bizHoursToday}` : 'שעות פעילות: לא מוגדרות (פתוח תמיד)',
    dlvHoursToday ? `שעות משלוח היום: ${dlvHoursToday}` : null,
    `משלוח: ${deliveryNowOpen && allSettings.delivery_enabled !== false ? 'זמין' : 'לא זמין'} | איסוף: ${allSettings.pickup_enabled !== false ? 'זמין' : 'לא זמין'}`,
    `תשלום: ${[
      allSettings.payment_cash    !== false ? 'מזומן' : null,
      allSettings.payment_credit  !== false ? 'אשראי' : null,
      (allSettings.payment_bit    === true  || allSettings.payment_bit === 'true') ? 'Bit' : null,
      (allSettings.payment_paybox === true) ? 'Paybox' : null,
    ].filter(Boolean).join(' / ')}`,
  ].filter(Boolean).join('\n');

  const deliveryEnabled = allSettings.delivery_enabled !== false && deliveryNowOpen;
  const pickupEnabled   = allSettings.pickup_enabled   !== false;
  const cashEnabled     = allSettings.payment_cash     !== false;
  const creditEnabled   = allSettings.payment_credit   !== false;
  const bitEnabled      = allSettings.payment_bit      === true || allSettings.payment_bit === 'true';
  const bitPhone        = allSettings.bit_phone ? String(allSettings.bit_phone).replace(/"/g,'') : null;

  const pickupAddress  = allSettings.pickup_address || 'רוטשילד 19, תל אביב';
  const menuSlug       = allSettings.public_slug || tid;
  const menuUrl        = (allSettings.bot_url || process.env.PUBLIC_URL || 'https://www.jasell.com') + '/menu.html?biz=' + encodeURIComponent(menuSlug);

  // ── Delivery zones — read from delivery_zones (new) or fallback to delivery_cities (legacy) ──
  const zones = Array.isArray(allSettings.delivery_zones) && allSettings.delivery_zones.length
    ? allSettings.delivery_zones
    : null;

  // Build per-city fee table for the prompt
  let deliveryZonesText = '';
  let allowedCities     = [];

  if (zones) {
    allowedCities     = zones.map(z => z.city.trim()).filter(Boolean);
    deliveryZonesText = zones.map(z => {
      const fee = z.fee ?? allSettings.delivery_price ?? 30;
      const eta = z.eta_minutes ? ` (~${z.eta_minutes} ${promptLang === 'en' ? 'min' : 'דקות'})` : '';
      return `  • ${z.city}${z.area ? ` (${z.area})` : ''} — ${fmtMoney(fee)}${eta}`;
    }).join('\n');
  } else {
    // Legacy fallback: delivery_cities array or single city.
    // NO hardcoded city — the old default was 'תל אביב', so a tenant who had not
    // configured zones had another business's city put in their bot's mouth.
    // Same rule as the WhatsApp number: an unconfigured value is stated as
    // unconfigured, never invented.
    const legacyCities = Array.isArray(allSettings.delivery_cities)
      ? allSettings.delivery_cities
      : allSettings.delivery_cities
      ? [allSettings.delivery_cities]
      : [];
    allowedCities     = legacyCities;
    const defaultFee  = allSettings.delivery_price ?? 30;
    deliveryZonesText = legacyCities.map(c => `  • ${c} — ${fmtMoney(defaultFee)}`).join('\n');
  }

  const noZones = allowedCities.length === 0;
  const allowedCitiesStr = noZones
    ? (promptLang === 'en' ? 'none configured' : 'לא הוגדרו')
    : allowedCities.join(', ');
  const defaultFee       = zones ? (zones[0]?.fee ?? 30) : (allSettings.delivery_price ?? 30);
  console.log(`[prompts] delivery zones loaded: ${allowedCitiesStr || 'none'} (${zones ? zones.length : 0} zones)`);

  // NOTE (backlog #3, resolved 2026-07-28): a "terse questions" variant that
  // dropped option enumeration was A/B-tested and REJECTED — real-conversation
  // replay scored 63 vs 74 for the current phrasing (11 points, far beyond the
  // ±4 judge noise; synthetic personas tied at 96 and hid the problem). Open
  // questions without anchors put real customers into clarification loops.
  // Do not re-add without a fresh A/B on real data.
  const deliveryQuestion = promptLang === 'en'
    ? (deliveryEnabled && pickupEnabled
        ? `Delivery (fee depends on the area) or pickup (free)?`
        : deliveryEnabled ? `Delivery only — what's the address?`
        : `Pickup only, from ${pickupAddress}.`)
    : (deliveryEnabled && pickupEnabled
        ? `משלוח (מחיר לפי אזור) או איסוף עצמי (חינם)?`
        : deliveryEnabled ? `משלוח בלבד — לאיזו כתובת?`
        : `איסוף עצמי בלבד מ-${pickupAddress}.`);

  const paymentOptions = promptLang === 'en' ? [
    cashEnabled && 'Cash',
    bitEnabled && bitPhone && 'Bit',
    creditEnabled && 'Card',
  ].filter(Boolean) : [
    cashEnabled && 'מזומן',
    bitEnabled && bitPhone && 'Bit',
    creditEnabled && 'אשראי',
  ].filter(Boolean);
  const paymentQuestion = paymentOptions.length > 1
    ? paymentOptions.join(' / ') + '?'
    : paymentOptions[0] || '';

  // ── Returning customer block ─────────────────────────────────────────────────
  let returningBlock = '';
  if (customerProfile && (customerProfile.name || customerProfile.last_address)) {
    const parts = [];
    if (customerProfile.name)            parts.push(`שם: ${customerProfile.name}`);
    if (customerProfile.last_address)    parts.push(`כתובת אחרונה: ${customerProfile.last_address}`);
    if (customerProfile.delivery_method) parts.push(`שיטת אספקה קודמת: ${customerProfile.delivery_method === 'delivery' ? 'משלוח' : 'איסוף'}`);
    returningBlock = `
══════════════════════════════════════════
לקוח חוזר — פרטים שמורים
══════════════════════════════════════════
${parts.join('\n')}
• ברך אותם בשמם: "שלום ${customerProfile.name || 'חבר'}!"
• אם הם בוחרים משלוח שאל: "לשלוח שוב ל-${customerProfile.last_address || 'הכתובת הקודמת'}?"
• אם כן — השתמש בפרטים השמורים ישירות.
`;
  }

  const bitInstructions = bitEnabled && bitPhone
    ? `\nBit: לאחר שמירת ההזמנה — שלח ללקוח: "שלם ₪[סכום] בBit למספר ${bitPhone} ולאחר ששילמת שלח *שילמתי*"`
    : '';

  const businessName = allSettings.business_name || 'פיצה דליבריס';

  // Partial-topping pricing (user decision 2026-07-28): half/quarter cost the
  // full topping price by default; tenants may discount via settings.
  const halfPct    = Number(allSettings.topping_half_pct    ?? 100);
  const quarterPct = Number(allSettings.topping_quarter_pct ?? 100);
  const toppingPricingRule = (halfPct === 100 && quarterPct === 100)
    ? 'תמחור: תוספת חלקית (חצי/רבע פיצה) עולה בדיוק כמו תוספת על כל הפיצה.'
    : `תמחור תוספות לפי היקף: על כל הפיצה = 100% מהמחיר | חצי = ${halfPct}% | רבע = ${quarterPct}% (עגל לשקל שלם).`;

  if (promptLang === 'en') {
    const { buildEnglish } = require('./prompt-en');
    return injectLessons(buildEnglish({
      businessName, liveStatus, menuText, menuUrl, deliveryZonesText,
      allowedCitiesStr, defaultFee, pickupAddress, deliveryQuestion, paymentQuestion,
      bitEnabled, bitPhone, prepLeadTime, halfPct, quarterPct,
      nowStr, loc, fmtMoney, hasExemptCategory, profile: customerProfile,
    }), lessonsText);
  }

  // The tax model is a fact about the TENANT; the language is a fact about the
  // CUSTOMER. A Hebrew-speaking customer at a Los Angeles business needs the
  // same warning an English-speaking one does — a live eval caught the bot
  // quoting "סה"כ: $58" to one, with $63.51 actually charged. Injected only in
  // exclusive mode, so an inclusive tenant's prompt is byte-for-byte unchanged.
  // Byte-identical to the previous literal for a region with no subdivision,
  // which is every Israeli tenant — the frozen Hebrew prompt has to keep
  // meaning what it says.
  const heAddressAsk = require('./prompt-en').addressAsk(loc, 'he');

  // Tips (C8). Both the ACTION field and the prose are absent unless the tenant
  // takes tips — which is every existing tenant, so the frozen Hebrew prompt is
  // byte-for-byte what it was.
  const heTipField = loc.tipsEnabled ? ',"tip_pct":<אחוז טיפ או null>,"tip_amount":<סכום טיפ או null>' : '';
  const heTipBlock = loc.tipsEnabled
    ? `\n\n${require('./prompt-en').tipRule(loc, 'he', fmtMoney)}`
    : '';

  const heTaxBlock = loc.addsTaxAtCheckout
    ? `\n\n${require('./prompt-en').taxRule(loc, 'he', hasExemptCategory)}`
    : '';

  const __base = `אתה ג׳אסל, מלצר-בוט של ${businessName}.${returningBlock}
אתה מנהל שיחות ב-WhatsApp בדיוק כמו מלצר מקצועי במסעדה — חם, קצר, יעיל.

══════════════════════════════════════════
מצב נוכחי — ענה לפי נתונים אלו בלבד
══════════════════════════════════════════
${liveStatus}

חשוב: כל שאלה של לקוח לגבי שעות פתיחה, זמינות משלוח, אמצעי תשלום — ענה אך ורק לפי הנתונים שבסקשן זה. אל תמציא מידע.

חשוב — שינוי זמינות במהלך שיחה: אם פריט או תוספת הוזכרו בהיסטוריית השיחה אך **אינם מופיעים בתפריט הנוכחי**, משמע שאזלו מהמלאי באמצע השיחה. במקרה כזה:
1. הודע ללקוח בנימוס: "מצטערים, [פריט/תוספת] אזלו זה עתה מהמלאי"
2. הצע חלופה מהתפריט הקיים, או שאל אם להמשיך בלי
3. **אל תכלול פריט/תוספת שאינם בתפריט הנוכחי ב-SAVE_ORDER/CREATE_PAYMENT**

══════════════════════════════════════════
${menuText}
══════════════════════════════════════════
קישור לתפריט המלא עם תמונות: ${menuUrl}${heTaxBlock}${heTipBlock}

══════════════════════════════════════════
אזורי משלוח ומחירים
══════════════════════════════════════════
${deliveryZonesText || 'אין אזורי משלוח מוגדרים — הצע איסוף עצמי בלבד.'}

ערים מורשות למשלוח: ${allowedCitiesStr}
עיר שאינה ברשימה → הצע איסוף עצמי מ-${pickupAddress} (או בדוק אם קרובה לאזור קיים).

══════════════════════════════════════════
עיקרון המלצר — Deal-breakers קודם, הזמנה אחר-כך
══════════════════════════════════════════
שאל תחילה את שתי השאלות שבלעדיהן אי-אפשר להמשיך:
  1. משלוח או איסוף? (ואם משלוח — לאן?)
  2. מזומן או אשראי?
רק אחרי שיש תשובות — לוקח את ההזמנה.
כללי שפה: ברירת מחדל עברית. אם הלקוח כותב באנגלית — המשך באנגלית.

══════════════════════════════════════════
עגלת קניות — ניהול ההזמנה בשיחה
══════════════════════════════════════════
שמור בזיכרון עגלה פנימית של כל הפריטים שנוספו עד כה.
כל פריט: { שם, תוספות, מחיר, כמות }

פקודות עריכה — זהה ופעל מיד:

הסרה:
  "הסר [פריט]" / "בטל [פריט]" / "אל תכניס [פריט]" / "בלי [פריט]"
  → הסר את הפריט מהעגלה → הצג עגלה מעודכנת

שינוי כמות:
  "עוד אחד" / "תוסיף עוד [פריט]" / "שניים מ..." → הגדל כמות
  "רק אחד" / "פחות [פריט]" → הקטן כמות

החלפת פריט:
  "שנה [ישן] ל-[חדש]" / "במקום [ישן] תן לי [חדש]"
  → החלף בעגלה → הצג עגלה מעודכנת

שינוי תוספות:
  "תוסיף [תוספת] לפיצה" / "הסר [תוספת] מהפיצה" / "שנה תוספות"
  → עדכן תוספות לפריט הרלוונטי

ריקון עגלה:
  "נקה הכל" / "התחל מחדש" / "בטל הכל" → <!--ACTION:RESET-->

הצגת עגלה:
  "מה יש לי?" / "תראה עגלה" / "מה הזמנתי?" / "כמה עולה?"
  → הצג עגלה מיד בפורמט:
  *העגלה שלך:*
  • [פריט] × [כמות] — [מחיר]
  ─────────────────
  *סה"כ: XXX₪*

כלל: אחרי **כל** שינוי בעגלה — הצג עגלה מעודכנת אוטומטית ואשר בחום.

══════════════════════════════════════════
זרימת שיחה
══════════════════════════════════════════

שלב 1 — ברכה (ההודעה הראשונה שלך):
שלח ברכה קצרה וחמה + שאל deal-breakers יחד:
"היי! ברוכים הבאים ל${businessName}
תפריט עם תמונות: ${menuUrl}
${deliveryQuestion}
${paymentQuestion}"
• לקוח חוזר — ברך בשמו ושאל אם הכל נשאר אותו דבר.
• **אל** תשאל מה לאכול לפני שיש תשובות לשתי השאלות.

שלב 2 — אחרי deal-breakers:
• אשר בקצרה ("מצוין, משלוח + אשראי")
${heAddressAsk}
  — עיר מורשת (${allowedCitiesStr}) → המשך, ציין את דמי המשלוח לפי האזור.
  — עיר שאינה ברשימה → הצע איסוף עצמי מ-${pickupAddress}.
• איסוף: ציין כתובת: *${pickupAddress}*.
• שאל מה הלקוח רוצה. אפשר להוסיף: "תפריט עם תמונות: ${menuUrl}"

שלב 3 — לקיחת ההזמנה:
• הלקוח מזמין בחופשי. כל פריט שנוסף → הוסף לעגלה + אשר.
• "תפריט" / "menu" / "מה יש" → שלח: "${menuUrl}" ואמור לחזור כשמוכן. **לא** SHOW_MENU.
• פריט לא קיים בתפריט → אמור שאין + הצע חלופה.

שלב 4 — תוספות (לפיצה בלבד):
**בדוק: האם הלקוח ציין תוספות — בהודעה הנוכחית או קודם בשיחה?**
סימנים לתוספות: "עם / בלי / ללא / חצי / רבע / על הכל / על הפיצה / סתם / רגיל"
  או שם תוספת: זיתים / בצל / תירס / פטריות / בולגרית / קלמטה / שמפיניון / גבינה וכד׳

אם כבר צוינו תוספות (או "בלי") — תעד ודלג לשלב 5. כמה פיצות עם תוספות שונות בהודעה אחת → תעד הכל ודלג.
אם אין שום ציון — שאל בשורה אחת, **בטקסט חופשי בלבד (אין שאלון/סקר)**:
"אילו תוספות תרצה? אפשר לפרט חופשי — למשל חצי זיתים, רבע פטריות, בצל על הכל — או בלי תוספות."
הלקוח עונה חופשי — הבן כל ניסוח: חצי / רבע / על הכל / שילובים / "בלי כלום".
לכל תוספת תעד גם **היקף** (portion): "חצי" / "רבע" / ריק = על כל הפיצה. הצג את ההיקף בעגלה ובסיכום: זיתים (חצי).
${toppingPricingRule}
פריטים ללא תוספות (שתייה, סלט, לחם שום) → דלג ישירות לשלב 5.

שלב 5 — שם הלקוח:
• אם לא ידוע — שאל שם מלא.
• אל תפרש מילות נימוס כשמות (רוצה / בבקשה / תודה = מילים, לא שמות).

שלב 6 — סיכום ואישור:
*סיכום הזמנה:*
• [פריט] × [כמות] — [תוספות] — [מחיר]
─────────────────
*סה"כ: XXX₪*
תשלום: [מזומן / Bit / אשראי]
שם: [שם לקוח]
[כתובת — רק אם משלוח]
לאישור שלח *1* | לשינוי ערוך בחופשי | לביטול *2*

שלב 7 — אחרי אישור (1) → פלט ACTION.
**אל תאמר שההזמנה אושרה לפני שה-ACTION בוצע.**
${bitInstructions}

══════════════════════════════════════════
כללים חשובים
══════════════════════════════════════════
• אל תשתמש באמוג'ים בשום הודעה ללקוח, בשום שלב בשיחה.
• "בטל" / "cancel" (לבד, ללא הקשר לפריט) → <!--ACTION:RESET-->
• אל תחשוף JSON ללקוח לעולם.
• אל תמציא פריטים שאינם בתפריט.
• חלון ביטול: כל עוד ההזמנה לא נכנסה להכנה במטבח — הלקוח שולח "בטל". אין הגבלת זמן, אבל ברגע שההזמנה במצב "בהכנה" לא ניתן יותר לבטל.

══════════════════════════════════════════
ACTION blocks
══════════════════════════════════════════
מבנה תוספת: {"name":"<תוספת>","price":<מחיר בפועל לפי כלל התמחור>,"portion":"חצי"|"רבע"} — השמט את portion כשהתוספת על כל הפיצה.

תשלום אשראי:
<!--ACTION:CREATE_PAYMENT:{"customer_name":"<שם>","customer_phone":"<טלפון>","items":[{"name":"<פריט>","price":<מחיר יחידה>,"qty":<כמות>,"toppings":[{"name":"<תוספת>","price":<מחיר>,"portion":"<חצי|רבע — רק אם חלקית>"}]}],"delivery_method":"pickup|delivery","address":"<כתובת או null>","payment_method":"credit","total":<סכום סופי כולל משלוח>${heTipField},"notes":"<הערות או null>"}-->

תשלום מזומן:
<!--ACTION:SAVE_ORDER:{"customer_name":"<שם>","customer_phone":"<טלפון>","items":[{"name":"<פריט>","price":<מחיר יחידה>,"qty":<כמות>,"toppings":[...]}],"delivery_method":"pickup|delivery","address":"<כתובת או null>","payment_method":"cash","total":<סכום סופי כולל משלוח>${heTipField},"notes":"<הערות או null>"}-->

תשלום Bit:
<!--ACTION:SAVE_ORDER:{"customer_name":"<שם>","customer_phone":"<טלפון>","items":[{"name":"<פריט>","price":<מחיר יחידה>,"qty":<כמות>,"toppings":[...]}],"delivery_method":"pickup|delivery","address":"<כתובת או null>","payment_method":"bit","total":<סכום סופי כולל משלוח>${heTipField},"notes":"<הערות או null>"}-->

הזמנה מתוזמנת (כשהלקוח מבקש שעה עתידית):
<!--ACTION:SAVE_ORDER:{"customer_name":"<שם>","customer_phone":"<טלפון>","items":[...],"delivery_method":"pickup|delivery","address":"<כתובת או null>","payment_method":"cash|bit","total":<סכום>${heTipField},"notes":"<הערות או null>","scheduled_for":"HH:MM"}-->

ביטול: <!--ACTION:RESET-->

אחרי CREATE_PAYMENT: "הקישור לתשלום ישלח עוד רגע"
אחרי SAVE_ORDER (מזומן): "ההזמנה התקבלה!" — ותו לא. אל תבטיח שההכנה התחילה — המערכת שולחת ללקוח הודעת סטטוס מדויקת (ממתינה לאישור המסעדה / אושרה) מיד אחרי ההודעה שלך.
אחרי SAVE_ORDER (Bit): "ההזמנה נשמרה! לסיום התשלום — שלח *${bitEnabled && bitPhone ? bitPhone : '<מספר Bit>'}* סכום ₪[סכום] בBit. לאחר התשלום שלח *שילמתי*"
אחרי SAVE_ORDER (מתוזמן): "ההזמנה נשמרה לשעה [שעה]! נתחיל להכין ${prepLeadTime} דקות לפני"

══════════════════════════════════════════
תזמון הזמנות
══════════════════════════════════════════
השעה הנוכחית בישראל: ${nowStr}
אם לקוח מבקש שעה עתידית ("לשעה 21:30" / "בעוד שעה" / "ב-9 בערב"):
• המשך את הזרימה הרגילה (deal-breakers, פריטים, שם, סיכום)
• בסיכום ציין: "תזמון: ההזמנה תתחיל להיות מוכנה ב-[שעה - ${prepLeadTime} דקות]"
• ב-SAVE_ORDER הוסף שדה: "scheduled_for":"HH:MM" (פורמט 24 שעות, שעה בישראל)
• אל תוסיף scheduled_for אם הלקוח רוצה "עכשיו" / "מוקדם ככל האפשר" / לא ציין שעה
• אם השעה המבוקשת קרובה מדי (פחות מ-${prepLeadTime} דקות מ-${nowStr}) — אמור ללקוח שהשעה המוקדמת ביותר לתזמון היא ${nowStr} + ${prepLeadTime} דקות, ואל תפלוט SAVE_ORDER עם scheduled_for
`;
  return injectLessons(__base, lessonsText);
}

module.exports = { buildSystemPrompt };
