'use strict';

/**
 * i18n.js — dashboard chrome localization (Hebrew RTL / English LTR).
 *
 * Usage:
 *   <html> gets dir+lang set immediately on load (before paint).
 *   Static elements: add data-i18n="key" — translated on DOMContentLoaded.
 *   Dynamic strings in JS: window.t('key') (falls back to Hebrew, then key).
 *   Toggle: setLang('en'|'he') — persists and reloads.
 *
 * Scope: UI chrome (nav, titles, common buttons). Customer-facing WhatsApp
 * content and the public menu stay Hebrew — they follow the tenant, not the
 * dashboard operator.
 */

const I18N = {
  he: {
    logo_sub: 'ממשק ניהול',
    nav_orders: 'הזמנות', nav_products: 'מוצרים', nav_customers: 'לקוחות',
    nav_stats: 'סטטיסטיקות', nav_settings: 'הגדרות', nav_inbox: 'הודעות',
    nav_kitchen: 'חלון מטבח', nav_kitchen_short: 'מטבח', nav_logout: 'יציאה',
    title_orders: 'הזמנות', title_products: 'קטגוריות', title_customers: 'לקוחות',
    title_stats: 'סטטיסטיקות', title_settings: 'הגדרות', title_inbox: 'הודעות',
    title_kitchen: 'חלון מטבח',
    btn_refresh: 'רענן', btn_excel: 'Excel', btn_save: 'שמור',
    btn_add_product: '+ מוצר', btn_add_category: '+ קטגוריה', btn_send_msg: 'שלח הודעה',
    kpi_total: 'סה"כ', kpi_new: 'חדשות', kpi_preparing: 'בהכנה',
    kpi_out: 'בדרך ללקוח', kpi_delivered: 'נמסרו', kpi_pending_pay: 'ממתינות לתשלום',
    search_orders: 'חיפוש שם, טלפון, כתובת...',
    inbox_pick: 'בחר שיחה', inbox_send: 'שלח', inbox_back: '‹ חזרה',
    inbox_handoff: 'העבר לנציג', inbox_return: 'החזר לבוט', inbox_empty: 'אין שיחות ממתינות',
    kitchen_ready: 'מוכן', kitchen_connected: 'מחובר', kitchen_orders: 'הזמנות',
    lang_toggle: 'EN',
  },
  en: {
    logo_sub: 'Admin Console',
    nav_orders: 'Orders', nav_products: 'Products', nav_customers: 'Customers',
    nav_stats: 'Analytics', nav_settings: 'Settings', nav_inbox: 'Live Chats',
    nav_kitchen: 'Kitchen', nav_kitchen_short: 'Kitchen', nav_logout: 'Sign out',
    title_orders: 'Orders', title_products: 'Categories', title_customers: 'Customers',
    title_stats: 'Analytics', title_settings: 'Settings', title_inbox: 'Live Chats',
    title_kitchen: 'Kitchen Display',
    btn_refresh: 'Refresh', btn_excel: 'Excel', btn_save: 'Save',
    btn_add_product: '+ Product', btn_add_category: '+ Category', btn_send_msg: 'Send message',
    kpi_total: 'Total', kpi_new: 'New', kpi_preparing: 'Preparing',
    kpi_out: 'Out for delivery', kpi_delivered: 'Delivered', kpi_pending_pay: 'Awaiting payment',
    search_orders: 'Search name, phone, address...',
    inbox_pick: 'Select a conversation', inbox_send: 'Send', inbox_back: '‹ Back',
    inbox_handoff: 'Hand off to agent', inbox_return: 'Return to bot', inbox_empty: 'No waiting conversations',
    kitchen_ready: 'Ready', kitchen_connected: 'Connected', kitchen_orders: 'orders',
    lang_toggle: 'עב',
  },
};

// ── String-keyed dictionary (Hebrew → English) ──────────────────────────────
// tr('עברית') returns the English translation in EN mode, the input otherwise.
// Missing entries fall back to the Hebrew input — safe to add strings gradually.
const HE2EN = {
  // First-run tour (tour.js keeps its own copy for the steps themselves; these
  // three are dashboard chrome and belong here).
  'סיור במערכת': { en: 'System tour' },
  'ההסבר הקצר על המסכים, מההתחלה': { en: 'The short walkthrough of the screens, from the top' },
  'הצג שוב': { en: 'Show again' },

  // Order acceptance (incoming zone + settings)
  'ממתינות לאישור': { en: 'Awaiting approval' },
  'הזמנות ממתינות': { en: 'Orders waiting' },
  'אשר הזמנה': { en: 'Accept order' },
  'אשר הזמנה מתוזמנת': { en: 'Confirm pre-order' },
  'שיחה עם נציג': { en: 'Human handoff' },
  'הכנסות (שולם)': { en: 'Revenue (paid)' },
  'ממתין לתשלום': { en: 'Awaiting payment' },
  'שורת הסרה ("להסרה השב הסר") תתווסף אוטומטית, ולקוחות שביקשו הסרה ידולגו.':
    { en: 'An opt-out line is appended automatically, and customers who asked to be removed are skipped.' },
  'דילגנו (ביקשו הסרה)': { en: 'Skipped (opted out)' },
  'נכשלו:': { en: 'Failed:' },
  'שולח...': { en: 'Sending...' },
  'כשמעבירים שיחה לנציג הבוט מפסיק לענות ללקוח. אם אף אחד לא ממשיך את השיחה, הלקוח נשאר תקוע — לכן היא חוזרת לבוט אוטומטית.':
    { en: 'Handing a chat to an agent stops the bot from answering that customer. If nobody picks it up they are stuck, so it returns to the bot automatically.' },
  'התראה למנהלים אם לקוח ממתין': { en: 'Alert admins if a customer waits' },
  'החזרה אוטומטית לבוט אחרי': { en: 'Return to the bot after' },
  'דקות ללא מענה נציג': { en: 'minutes with no agent reply' },
  'אישור מתחייב להכנה בשעה זו; ההזמנה תיכנס למטבח אוטומטית לפני המועד':
    { en: 'Confirming commits you to that time; the order enters the kitchen automatically before it' },
  'זמן הכנה': { en: 'Prep time' },
  'דחה': { en: 'Reject' },
  'אזל במלאי': { en: 'Out of stock' },
  'אשר והתחל הכנה': { en: 'Accept & start' },
  'הזמנה אושרה — הלקוח עודכן': { en: 'Order accepted — customer notified' },
  'ממתין לתשלום': { en: 'Awaiting payment' },
  'אושרה — נשלחה למטבח': { en: 'accepted — sent to kitchen' },
  'הזמנה חדשה': { en: 'New order' },
  'מתוזמנות': { en: 'Scheduled' },
  'מוכנות': { en: 'Ready' },
  'ביט': { en: 'Bit' },
  'לקוח': { en: 'Customer' },
  'הפעל התראות כדי לא לפספס הזמנות': { en: 'Enable notifications so you never miss an order' },
  'בלי התראות push לא תקבל עדכון על הזמנות חדשות כשהדשבורד סגור': { en: "Without push notifications you won't hear about new orders when the dashboard is closed" },
  'הפעל התראות': { en: 'Enable notifications' },
  'לא עכשיו': { en: 'Not now' },
  'אישור הזמנות': { en: 'Order approval' },
  'אישור ידני (מומלץ)': { en: 'Manual approval (recommended)' },
  'כל הזמנה חדשה ממתינה לאישור שלך. הלקוח מקבל "ההזמנה נשלחה לאישור המסעדה", ורק אחרי שתאשר — הודעת אישור עם זמן הכנה וההזמנה עוברת למטבח.':
    { en: 'Every new order waits for your approval. The customer is told "sent to the restaurant for approval", and only after you accept do they get a confirmation with prep time and the order moves to the kitchen.' },
  'אישור אוטומטי': { en: 'Auto approval' },
  '⚠️ שים לב: כל הזמנה תאושר ללקוח מיד וללא בדיקה שלך, ותעבור ישר למטבח. ודא שהתפריט והמלאי מעודכנים תמיד — הזמנה שאושרה מחייבת אותך כלפי הלקוח.':
    { en: '⚠️ Note: every order is confirmed to the customer immediately without your review, and goes straight to the kitchen. Keep your menu and stock always up to date — a confirmed order is a commitment to the customer.' },
  'זמן הכנה — ברירת מחדל': { en: 'Default prep time' },
  'דקות': { en: 'minutes' },
  'תזכורת אם הזמנה לא אושרה תוך': { en: 'Remind if an order is not accepted within' },
  'דקות (push + וואטסאפ למנהלים)': { en: 'minutes (push + WhatsApp to admins)' },
  // Shared / status
  'חדשה': { en: 'New' }, 'מתוזמנת': { en: 'Scheduled' }, 'בהכנה': { en: 'Preparing' }, 'מוכן': { en: 'Ready' },
  'יצא למשלוח': { en: 'Out for delivery' }, 'נמסרה': { en: 'Delivered' }, 'הסתיימה': { en: 'Done' }, 'בוטלה': { en: 'Cancelled' },
  'משלוח': { en: 'Delivery' }, 'איסוף': { en: 'Pickup' }, 'איסוף עצמי': { en: 'Pickup' },
  'שולם': { en: 'Paid' }, 'ממתין': { en: 'Pending' }, 'ממתין לBit': { en: 'Awaiting Bit' },
  'טוען...': { en: 'Loading...' }, 'שמור': { en: 'Save' }, 'ביטול': { en: 'Cancel' }, 'עריכה': { en: 'Edit' },
  'מחיקה': { en: 'Delete' }, 'מחק': { en: 'Delete' }, 'הסר': { en: 'Remove' }, 'שלח': { en: 'Send' }, 'חזרה': { en: 'Back' },
  'נשמר': { en: 'Saved' }, 'שגיאה': { en: 'Error' }, 'הדפסה': { en: 'Print' }, 'הדפס': { en: 'Print' }, 'נקה': { en: 'Clear' },
  // Orders page
  'כל הסטטוסים': { en: 'All statuses' }, 'חדשות': { en: 'New' }, 'בדרך': { en: 'On the way' }, 'נמסרו': { en: 'Delivered' },
  'הסתיימו': { en: 'Done' }, 'בוטלו': { en: 'Cancelled' }, 'כל הסוגים': { en: 'All types' }, 'כל התשלומים': { en: 'All payments' },
  'מזומן': { en: 'Cash' }, 'אשראי': { en: 'Credit card' }, 'מ:': { en: 'From:' }, 'טוען הזמנות...': { en: 'Loading orders...' },
  'אין הזמנות תואמות': { en: 'No matching orders' }, 'נסה לשנות את הפילטרים': { en: 'Try adjusting the filters' },
  'נקה פילטרים': { en: 'Clear filters' }, 'פרטי לקוח': { en: 'Customer details' }, 'סטטוס': { en: 'Status' },
  'פריטים': { en: 'Items' }, 'אין פריטים': { en: 'No items' }, 'פריט': { en: 'Item' },
  'סה"כ': { en: 'Total' }, 'כולל מע"מ 18%': { en: 'Incl. 18% VAT' }, 'סכום ביניים': { en: 'Subtotal' },
  'ערוך פריטים': { en: 'Edit items' }, 'פריט חסר': { en: 'Missing item' }, 'מחלוקת פתוחה': { en: 'Open dispute' },
  'זיכוי ידני נדרש': { en: 'Manual refund needed' }, 'נדרש זיכוי ידני בכרטקום': { en: 'Manual refund needed in Cardcom' },
  'זיכוי ידני': { en: 'Manual refund' }, 'בוטל ע"י לקוח': { en: 'Cancelled by customer' }, 'בוטל ע"י העסק': { en: 'Cancelled by business' },
  'כתובת לא ידועה': { en: 'Address unknown' }, 'הזמנה': { en: 'Order' }, 'לקוח': { en: 'Customer' },
  'הערות': { en: 'Notes' }, 'הערה': { en: 'Note' }, 'שעה': { en: 'Time' }, 'תאריך': { en: 'Date' }, 'סכום': { en: 'Amount' }, 'תשלום': { en: 'Payment' },
  // Order edit modal
  'כתובת למשלוח': { en: 'Delivery address' }, 'עיר': { en: 'City' }, 'רחוב': { en: 'Street' }, 'מספר': { en: 'No.' },
  'סוג יעד': { en: 'Destination type' }, 'הערות לשליח': { en: 'Courier notes' }, 'פריטי ההזמנה': { en: 'Order items' },
  '+ הוסף מוצר': { en: '+ Add product' }, 'סיכום כספי': { en: 'Financial summary' }, 'שמור שינויים': { en: 'Save changes' },
  'קומה, צד, הוראות כניסה...': { en: 'Floor, side, entry instructions...' }, '— בחר —': { en: '— Select —' },
  'בית': { en: 'House' }, 'דירה': { en: 'Apartment' }, 'עסק': { en: 'Business' },
  // Cancel/refund modal
  'ביטול הזמנה': { en: 'Cancel order' }, 'סיבת הביטול': { en: 'Cancellation reason' }, 'יוזמת העסק': { en: 'Business initiated' },
  'בקשת הלקוח': { en: 'Customer request' }, 'הערה פנימית / סיבה': { en: 'Internal note / reason' },
  'שלח הערה ללקוח': { en: 'Send note to customer' }, 'ההערה תצורף להודעת הביטול ב-WhatsApp': { en: 'The note is attached to the WhatsApp cancellation message' },
  'הודעה ללקוח — ניתן לעריכה': { en: 'Customer message — editable' }, '↺ אפס': { en: '↺ Reset' }, 'אשר ביטול': { en: 'Confirm cancellation' },
  'לדוגמה: אזל המלאי, בעיה תפעולית, לקוח ביקש לבטל...': { en: 'e.g. out of stock, operational issue, customer asked to cancel...' },
  // Products page
  'תוספות': { en: 'Toppings' }, 'פריטים במלאי': { en: 'items in stock' }, 'ניהול': { en: 'Manage' },
  'אין מוצרים בקטגוריה זו': { en: 'No products in this category' }, 'זמין': { en: 'Available' }, 'אזל': { en: 'Out of stock' },
  'אין קטגוריות עדיין': { en: 'No categories yet' }, 'זמינות לכל המנות — לחיצה משביתה/מחזירה למלאי': { en: 'Available on every dish — click to toggle stock' },
  // Customers page
  'סה"כ לקוחות': { en: 'Total customers' }, 'לקוחות חוזרים': { en: 'Returning customers' }, 'סה"כ הזמנות': { en: 'Total orders' },
  'סה"כ הכנסות': { en: 'Total revenue' }, 'חוזר': { en: 'Returning' }, 'שם לקוח': { en: 'Customer name' }, 'טלפון': { en: 'Phone' },
  'הזמנות': { en: 'Orders' }, 'סה"כ רכישות': { en: 'Total spent' }, 'אין לקוחות תואמים לחיפוש': { en: 'No customers match the search' },
  'לקוחות חוזרים בלבד': { en: 'Returning customers only' }, 'שלח הודעה': { en: 'Send message' },
  // Stats page
  'תקופה:': { en: 'Period:' }, 'היום': { en: 'Today' }, 'שבוע': { en: 'Week' }, 'חודש': { en: 'Month' }, 'שנה': { en: 'Year' }, 'הכל': { en: 'All' },
  'הזמנות לפי יום': { en: 'Orders per day' }, 'שעות עומס': { en: 'Busy hours' }, 'שיטת אספקה': { en: 'Delivery method' },
  'אמצעי תשלום': { en: 'Payment methods' }, 'סטטוס הזמנות': { en: 'Order status' }, 'מוצרים מובילים': { en: 'Top products' },
  'הכנסות לפי יום': { en: 'Revenue per day' }, 'ממוצע להזמנה': { en: 'Avg. order' }, 'הכנסות': { en: 'Revenue' },
  'ביטולים': { en: 'Cancellations' }, 'לקוחות': { en: 'Customers' },
  // Settings page
  'פרטי העסק': { en: 'Business details' }, 'פרטים המוצגים ללקוחות בבוט ובתפריט הציבורי': { en: 'Details shown to customers in the bot and public menu' },
  'שם העסק': { en: 'Business name' }, 'שם לועזי (לקישור התפריט הציבורי)': { en: 'English name (public menu link)' },
  'כתובת העסק': { en: 'Business address' }, 'כתובת שרת הבוט': { en: 'Bot server URL' }, 'כתובת לאיסוף עצמי': { en: 'Pickup address' },
  'מספר וואטסאפ להזמנות (בתפריט הציבורי)': { en: 'WhatsApp number for orders (public menu)' },
  'מיתוג תפריט': { en: 'Menu branding' }, 'צבע, לוגו וסלוגן של דף התפריט הציבורי שנשלח ללקוחות': { en: 'Color, logo and tagline of the public menu page sent to customers' },
  'צבע ראשי': { en: 'Primary color' }, 'כל התפריט נצבע לפי הצבע הזה — כפתורים, כותרת ומחירים': { en: 'The whole menu is themed by this color — buttons, header and prices' },
  'איפוס לברירת מחדל': { en: 'Reset to default' }, 'כתובת לוגו (URL לתמונה)': { en: 'Logo URL (image link)' },
  'סלוגן בכותרת התפריט': { en: 'Menu header tagline' }, 'שינויים נראים בתפריט הציבורי מיד אחרי שמירה.': { en: 'Changes appear on the public menu immediately after saving.' },
  'אילו אמצעי תשלום הבוט מציע ללקוחות': { en: 'Which payment methods the bot offers customers' },
  'תשלום במזומן בעת המסירה': { en: 'Cash on delivery' }, 'תשלום מאובטח בכרטיס אשראי': { en: 'Secure credit-card payment' },
  'ביט': { en: 'Bit' }, 'העברה למספר הביט של העסק': { en: 'Transfer to the business Bit number' }, 'מספר טלפון לBit': { en: 'Bit phone number' },
  'פייבוקס': { en: 'PayBox' }, 'העברה בפייבוקס': { en: 'PayBox transfer' }, 'אחר': { en: 'Other' },
  'תיאום אמצעי תשלום אחר מול העסק': { en: 'Arrange another payment method with the business' },
  'סוגי הזמנה': { en: 'Order types' }, 'אילו אפשרויות קבלה פתוחות ללקוחות': { en: 'Which fulfillment options are open to customers' },
  'משלוח מאופשר': { en: 'Delivery enabled' }, 'הבוט יציע משלוח עד הבית לפי אזורי המשלוח': { en: 'The bot offers home delivery per the delivery zones' },
  'איסוף עצמי מאופשר': { en: 'Pickup enabled' }, 'הבוט יציע איסוף מכתובת העסק': { en: 'The bot offers pickup from the business address' },
  'בוט פתוח לקבלת הזמנות': { en: 'Bot open for orders' }, 'כיבוי עוצר מיידית קבלת הזמנות חדשות': { en: 'Turning off immediately stops new orders' },
  'הזמנות מתוזמנות': { en: 'Scheduled orders' }, 'כמה דקות לפני השעה המבוקשת להעביר את ההזמנה להכנה': { en: 'How many minutes before the requested time the order moves to preparing' },
  'דקות לפני': { en: 'minutes before' }, 'שינויי הזמנות': { en: 'Order changes' }, 'מה לקוח יכול לשנות אחרי שההזמנה נשלחה': { en: 'What a customer can change after ordering' },
  'אפשר ללקוח לשנות/לבטל הזמנה': { en: 'Allow customers to edit/cancel orders' },
  'זמין כל עוד ההזמנה לא עברה למצב "בהכנה" — מרגע שההכנה מתחילה ההזמנה ננעלת': { en: 'Available until the order enters "preparing" — once preparation starts the order locks' },
  'שעות פעילות': { en: 'Business hours' }, 'מתי הבוט מקבל הזמנות; מחוץ לשעות אלה לקוחות יקבלו הודעת סגור': { en: 'When the bot accepts orders; outside these hours customers get a closed message' },
  'שעות משלוח': { en: 'Delivery hours' }, 'באילו שעות מוצע משלוח; בימים שאינם פעילים יוצע איסוף בלבד': { en: 'When delivery is offered; on inactive days only pickup is offered' },
  'אזורי משלוח': { en: 'Delivery zones' }, 'ערים ואזורים שהעסק משלח אליהם, כולל דמי משלוח ומינימום הזמנה': { en: 'Cities and areas the business delivers to, with fees and minimum order' },
  'אזור': { en: 'Area' }, 'דמי משלוח (₪)': { en: 'Delivery fee (₪)' }, 'מינימום (₪)': { en: 'Minimum (₪)' }, 'זמן משוער (דק׳)': { en: 'ETA (min)' },
  '+ הוסף אזור': { en: '+ Add zone' }, 'אין אזורי משלוח — הוסף אזור ראשון': { en: 'No delivery zones — add the first one' },
  'שליחים': { en: 'Couriers' }, 'שליחת פרטי הזמנה לשליחים בוואטסאפ': { en: 'Sending order details to couriers on WhatsApp' },
  'שלח פרטי הזמנה לשליח אוטומטית': { en: 'Send order details to couriers automatically' },
  'הודעת וואטסאפ עם פרטי ההזמנה והכתובת תישלח לכל השליחים': { en: 'A WhatsApp message with the order details and address goes to every courier' },
  'שלח בסטטוס:': { en: 'Send on status:' }, 'שם השליח': { en: 'Courier name' }, '+ הוסף שליח': { en: '+ Add courier' },
  'אין שליחים — הוסף שליח ראשון': { en: 'No couriers — add the first one' }, 'הסר שליח': { en: 'Remove courier' },
  'שיחות שלא נענו': { en: 'Missed calls' },
  'תוספות': { en: 'Toppings' },
  'תמחור תוספות חלקיות — לקוחות מבקשים חופשי (חצי זיתים, רבע פטריות)': { en: 'Partial-topping pricing — customers ask freely (half olives, quarter mushrooms)' },
  'ברירת המחדל: תוספת חלקית עולה כמו תוספת מלאה. אפשר לתמחר חצי/רבע כאחוז ממחיר התוספת.': { en: 'Default: a partial topping costs the same as a full one. You can price half/quarter as a percentage of the topping price.' },
  'מחיר חצי תוספת (% ממחיר מלא)': { en: 'Half-topping price (% of full)' },
  'מחיר רבע תוספת (% ממחיר מלא)': { en: 'Quarter-topping price (% of full)' },
  'לקוח שהתקשר ולא נענה מקבל אוטומטית הזמנה להזמין בוואטסאפ': { en: 'Callers who go unanswered automatically get a WhatsApp invitation to order' },
  'שלח וואטסאפ אוטומטי למי שהתקשר ולא נענה': { en: 'Auto-send WhatsApp to unanswered callers' },
  'שלח גם כשהעסק סגור': { en: 'Send even when the business is closed' },
  'מינימום': { en: 'At least' }, 'שעות בין הודעות לאותו מתקשר': { en: 'hours between messages to the same caller' },
  'ערוץ ההודעה:': { en: 'Message channel:' }, 'וואטסאפ (תבנית מאושרת)': { en: 'WhatsApp (approved template)' },
  'SMS עם קישור לוואטסאפ': { en: 'SMS with a WhatsApp link' },
  "חיבור מספר הטלפון לשירות נעשה על ידי ג'אסל.": { en: 'Connecting the phone number to this service is done by Jasell.' },
  'יום ראשון': { en: 'Sunday' }, 'יום שני': { en: 'Monday' }, 'יום שלישי': { en: 'Tuesday' }, 'יום רביעי': { en: 'Wednesday' },
  'יום חמישי': { en: 'Thursday' }, 'יום שישי': { en: 'Friday' }, 'יום שבת': { en: 'Saturday' },
  'מנהלי וואצפ': { en: 'WhatsApp admins' }, 'מספרי טלפון שיוכלו לנהל את הבוט דרך וואצפ': { en: 'Phone numbers that can manage the bot via WhatsApp' },
  '+ הוסף מנהל': { en: '+ Add admin' }, 'שם': { en: 'Name' }, 'תפקיד': { en: 'Role' }, 'נוסף': { en: 'Added' }, 'מנהל': { en: 'Admin' }, 'מנג׳ר': { en: 'Manager' },
  'אין מנהלים עדיין — לחץ "+ הוסף מנהל" כדי להתחיל': { en: 'No admins yet — click "+ Add admin" to start' },
  // Settings anchor nav
  'תשלום': { en: 'Payment' }, 'מתוזמנות': { en: 'Scheduled' }, 'שינויי': { en: 'Changes' },
  // Kitchen tab
  'חלון מטבח': { en: 'Kitchen Display' }, 'מתחבר…': { en: 'Connecting…' }, 'מחובר': { en: 'Connected' }, 'מתחבר מחדש…': { en: 'Reconnecting…' },
  'אין הזמנות פעילות': { en: 'No active orders' }, 'הזמנות פעילות': { en: 'active orders' },
  // Toasts / misc
  'אין הזמנות חדשות': { en: 'No new orders' }, 'ההזמנה עודכנה': { en: 'Order updated' }, 'ההזמנה בוטלה': { en: 'Order cancelled' },
  // Add-admin modal
  'הוסף מנהל וואצפ': { en: 'Add WhatsApp admin' }, 'שם מלא': { en: 'Full name' }, 'מספר טלפון (בינלאומי)': { en: 'Phone number (international)' },
  'ללא + או רווחים, לדוגמה: 972501234567': { en: 'No + or spaces, e.g. 972501234567' },
  'מנהל — גישה מלאה': { en: 'Admin — full access' }, 'מנג׳ר — צפייה בהזמנות בלבד': { en: 'Manager — orders view only' },
  'הוסף': { en: 'Add' }, 'שומר...': { en: 'Saving...' },
  // Order edit modal
  'עריכת הזמנה': { en: 'Edit order' }, 'דירה': { en: 'Apartment' }, 'בית פרטי': { en: 'House' }, 'משרד': { en: 'Office' }, 'מלון': { en: 'Hotel' },
  // Dispute modal
  'סמן את הפריטים/תוספות שנגמרו במלאי': { en: 'Mark the items/toppings that ran out' },
  'הודעה שתישלח ללקוח ב-WhatsApp': { en: 'Message that will be sent to the customer on WhatsApp' },
  'שלח ללקוח': { en: 'Send to customer' },
  // Product / category / addition modals
  'קטגוריה חדשה': { en: 'New category' }, 'עריכת קטגוריה': { en: 'Edit category' }, 'שם הקטגוריה': { en: 'Category name' },
  'שם באנגלית': { en: 'English name' }, 'קטגוריה זו תומכת בתוספות (לדוגמה: פיצות)': { en: 'This category supports toppings (e.g. pizzas)' },
  'מוצר חדש': { en: 'New product' }, 'עריכת מוצר': { en: 'Edit product' }, 'שם (עברית)': { en: 'Name (Hebrew)' }, 'שם (אנגלית)': { en: 'Name (English)' },
  'מחיר (₪)': { en: 'Price (₪)' }, 'תמונה': { en: 'Image' }, 'העלאת קובץ': { en: 'Upload file' },
  'תיאור קצר (יוצג בתפריט הלקוחות)': { en: 'Short description (shown on the customer menu)' },
  'תיאור טעים של המנה...': { en: 'A tasty description of the dish...' },
  'תוספת חדשה': { en: 'New topping' }, 'עריכת תוספת': { en: 'Edit topping' }, 'אמוג׳י': { en: 'Emoji' },
  // Broadcast modal
  'שליחת הודעת WhatsApp': { en: 'Send WhatsApp message' },
  'שליחת הודעות ללא יזימת לקוח עלולה לגרום לחסימה. מומלץ עד 50 נמענים.': { en: 'Messaging customers who did not write first may get the number blocked. Up to 50 recipients recommended.' },
  'כתוב הודעה...': { en: 'Write a message...' }, 'חיפוש לפי שם, טלפון או כתובת...': { en: 'Search by name, phone or address...' },
  // Dynamic chrome (app.js)
  'מתוזמן': { en: 'Scheduled' }, 'אין הזמנות לייצוא': { en: 'No orders to export' }, 'יוצאו': { en: 'Exported' },
  'מספר הזמנה': { en: 'Order #' }, 'סוג אספקה': { en: 'Fulfillment' }, 'כתובת': { en: 'Address' },
  'סטטוס תשלום': { en: 'Payment status' }, 'סטטוס הזמנה': { en: 'Order status' },
  'אשר קבלת תשלום Bit': { en: 'Confirm Bit payment received' }, 'פתח': { en: 'Open' },
  'אין הזמנות עדיין': { en: 'No orders yet' }, 'הזמנות יופיעו כאן ברגע שלקוח יזמין': { en: 'Orders will appear here once a customer orders' },
  'אין עדיין נתונים לתקופה זו': { en: 'No data for this period yet' }, 'השבוע': { en: 'This week' }, 'החודש': { en: 'This month' }, 'השנה': { en: 'This year' },
  'זמן מסירה ממוצע': { en: 'Avg. delivery time' }, 'יחס המרה': { en: 'Conversion rate' }, 'כמות': { en: 'Quantity' }, 'הכנסה': { en: 'Revenue' },
  'תוספת': { en: 'Topping' }, 'אין פריטים בהזמנה': { en: 'No items in this order' },
  'יש לסמן לפחות פריט אחד כדי לראות תצוגה מקדימה.': { en: 'Mark at least one item to see a preview.' },
  'יש לסמן לפחות פריט אחד': { en: 'Mark at least one item' }, 'שולח...': { en: 'Sending...' },
  'הודעה נשלחה ללקוח': { en: 'Message sent to customer' }, 'שגיאה בשליחת המחלוקת': { en: 'Failed to send the dispute' },
  'לאשר קבלת תשלום Bit עבור הזמנה': { en: 'Confirm Bit payment received for order' }, 'תשלום אושר!': { en: 'Payment confirmed!' },
  'שגיאה באישור תשלום': { en: 'Failed to confirm payment' }, 'אשראי — יינתן זיכוי': { en: 'Credit card — will be refunded' },
  'לא שולם': { en: 'Not paid' }, 'ההערה תישמר פנימית בלבד — לא תישלח ללקוח': { en: 'The note is kept internal only — not sent to the customer' },
  'מבטל...': { en: 'Cancelling...' }, 'הזמנה בוטלה': { en: 'Order cancelled' }, 'שם המוצר:': { en: 'Product name:' }, 'מחיר:': { en: 'Price:' },
  'הזמנה עודכנה': { en: 'Order updated' }, 'אין קטגוריות — לחץ "+ קטגוריה"': { en: 'No categories — click "+ Category"' },
  '+ מוצר': { en: '+ Product' }, '+ קטגוריה': { en: '+ Category' }, 'אין מוצרים — לחץ "+ מוצר"': { en: 'No products — click "+ Product"' },
  'זמין — לחץ לסימון כאזל': { en: 'In stock — click to mark as out' }, 'אזל — לחץ להחזרה': { en: 'Out of stock — click to restore' },
  'שם תוספת': { en: 'Topping name' }, 'מחיר': { en: 'Price' }, '+ הוסף': { en: '+ Add' }, 'סגור': { en: 'Close' },
  'חזרה למלאי': { en: 'back in stock' }, 'סומנה כאזלה': { en: 'marked out of stock' }, 'המחיר עודכן בכל המוצרים': { en: 'Price updated on all products' },
  'למחוק את התוספת': { en: 'Delete the topping' }, 'הוסרה': { en: 'removed' }, 'שם ומחיר נדרשים': { en: 'Name and price are required' },
  'נוספה לכל המנות': { en: 'added to all dishes' }, 'מעלה...': { en: 'Uploading...' }, 'תמונה הועלתה': { en: 'Image uploaded' },
  'שגיאה בהעלאה': { en: 'Upload failed' }, 'למחוק את': { en: 'Delete' }, 'יש לבחור לקוחות לפני השליחה': { en: 'Select customers before sending' },
  'נמענים נבחרו': { en: 'Recipients selected' }, 'יש לכתוב הודעה': { en: 'Write a message first' }, 'נשלח': { en: 'Sent' }, 'נכשל': { en: 'Failed' },
  'עברה להכנה': { en: 'moved to preparing' }, "דק'": { en: 'min' }, 'בטיפול נציג': { en: 'Handled by agent' }, 'נציג': { en: 'Agent' }, 'בוט': { en: 'Bot' },
  'השיחה הועברה לנציג': { en: 'Conversation handed to an agent' }, 'הודעות': { en: 'Live Chats' }, 'הבוט חזר לניהול השיחה': { en: 'The bot is back on the conversation' },
  'התראות push פעילות — לחץ לכיבוי': { en: 'Push notifications on — click to disable' }, 'הפעל התראות push': { en: 'Enable push notifications' },
  'הדפדפן שלך לא תומך בהתראות push': { en: 'Your browser does not support push notifications' },
  'התראות push כובו': { en: 'Push notifications disabled' }, 'נדרשת הרשאה להתראות בדפדפן': { en: 'Browser notification permission required' },
  'שגיאה בהגדרת push': { en: 'Failed to set up push' }, 'התראות push הופעלו!': { en: 'Push notifications enabled!' },
  'נוסף כמנהל': { en: 'added as admin' }, 'הוסר': { en: 'removed' }, 'שגיאת שרת': { en: 'Server error' },
  // ── Region, currency & tax (2026-08-26) ──────────────────────────────────
  'אזור ומטבע': { en: 'Region & currency' },
  'המדינה שבה העסק פועל — קובעת מטבע, מודל מס ופורמט תאריך':
    { en: 'The country the business operates in — sets currency, tax model and date format' },
  'אזור פעילות': { en: 'Region' }, 'ישראל': { en: 'Israel' }, 'ארצות הברית': { en: 'United States' }, 'מטבע': { en: 'Currency' },
  'שינוי האזור מעדכן את מודל המס, המטבע והתווית לברירות המחדל של אותה מדינה. אפשר לשנות כל ערך בנפרד אחר כך.':
    { en: 'Changing the region resets the tax model, currency and label to that country\'s defaults. Every value stays editable afterwards.' },
  'מס': { en: 'Tax' },
  'איך המס מחושב ומוצג — כלול במחיר או מתווסף בקופה':
    { en: 'How tax is calculated and shown — contained in the price, or added at checkout' },
  'מודל המס': { en: 'Tax model' },
  'כלול במחיר (ישראל)': { en: 'Included in the price (Israel)' },
  'מתווסף בקופה (ארה"ב)': { en: 'Added at checkout (US)' },
  'שיעור המס': { en: 'Tax rate' }, 'תווית בקבלה': { en: 'Receipt label' },
  'המילה שתופיע בקבלה. "VAT" לא קיים בארה"ב ו-"Sales Tax" לא קיים בישראל — זו לא שאלה של תרגום.':
    { en: 'The word printed on the receipt. "VAT" does not exist in the US and "Sales Tax" does not exist in Israel — this is not a translation choice.' },
  'לחייב מס גם על דמי המשלוח': { en: 'Charge tax on the delivery fee too' },
  'בקליפורניה חיוב משלוח של המוכר חייב במס בחלק מהמקרים — התייעץ עם רואה החשבון של העסק':
    { en: 'In California a seller\'s delivery charge is taxable in some cases — check with the business\'s accountant' },
  'כך זה ייראה ללקוח': { en: 'What the customer sees' },
  'מחיר בתפריט': { en: 'Menu price' }, 'כלול': { en: 'included' }, 'הלקוח משלם': { en: 'Customer pays' },
  'המס מתווסף לסכום שנגבה בפועל. התפריט והבוט מציגים מחיר לפני מס.':
    { en: 'Tax is added to the amount actually charged. The menu and the bot quote pre-tax prices.' },
  'המס כבר כלול במחיר שבתפריט. הקבלה רק מפרקת כמה מתוך הסכום היה מס.':
    { en: 'Tax is already inside the menu price. The receipt only itemises how much of the total was tax.' },
  'מדינה': { en: 'Country' },
  // Per-zone tax rate + per-category exemption (US: tax is set per jurisdiction,
  // and CA's 80/80 rule exempts some items)
  'מס באזור': { en: 'Zone tax' }, 'ריק = שיעור המס של העסק': { en: 'Empty = the business\u2019s own tax rate' },
  'משלוח ממוסה לפי יעד. השאר ריק כדי להשתמש בשיעור המס של העסק; איסוף עצמי ממוסה תמיד לפי כתובת העסק.':
    { en: 'A delivery is taxed where it lands. Leave blank to use the business\u2019s own rate; pickup is always taxed at the business address.' },
  'פטור ממס': { en: 'Tax exempt' }, 'חייב במס': { en: 'Taxable' },
  'מיקודים': { en: 'ZIP codes' }, 'מיקוד': { en: 'ZIP code' }, 'מדינה (state)': { en: 'State' },
  'ללא + או רווחים, לדוגמה': { en: 'No + or spaces, for example' },
  // Tips
  'טיפ': { en: 'Tip' }, 'האם הבוט והתפריט מציעים ללקוח להוסיף טיפ': { en: 'Whether the bot and menu offer the customer a tip' },
  'הצע טיפ ללקוח': { en: 'Offer a tip' }, 'אחוזים מוצעים': { en: 'Suggested percentages' },
  'הבוט ישאל פעם אחת, אחרי שההזמנה מוכנה ולפני התשלום. כבוי = אף אחד לא נשאל.':
    { en: 'The bot asks once, after the order is complete and before payment. Off = nobody is asked.' },
  'הטיפ מחושב על סכום הפריטים — לפני מס ולפני דמי משלוח — ואינו חייב במס. הלקוח תמיד יכול לנקוב בסכום אחר או לוותר.':
    { en: 'The tip is calculated on the food subtotal — before tax and before the delivery fee — and is never taxed. The customer can always name their own amount or decline.' },
  'אחוזי טיפ חייבים להיות מספרים בין 0 ל-100': { en: 'Tip percentages must be numbers between 0 and 100' },
  'על הזמנה של': { en: 'On an order of' }, 'ללא טיפ': { en: 'No tip' }, 'סכום אחר': { en: 'Other amount' }, 'ריק = התאמה לפי שם העיר': { en: 'Empty = match by city name' },
  'מיקוד הוא מפתח החיפוש המדויק: הוא מנצח את שם העיר. אפשר לרשום קידומת (904) כדי לכסות טווח.':
    { en: 'A ZIP is the precise lookup key and beats the city name. A prefix (904) covers a range.' },
  'בטל כדי לפטור את הקטגוריה ממס (לדוגמה: מזון קר לקחת)':
    { en: 'Uncheck to exempt this category from tax (for example: cold food to go)' },
  // Receipt
  'קבלה': { en: 'Receipt' }, 'טל׳': { en: 'Tel' }, 'מנה': { en: 'Item' }, 'לפני מס': { en: 'Subtotal' },
  'סה"כ לתשלום': { en: 'Total due' }, 'תודה שבחרת': { en: 'Thank you for choosing' },
  'הודפס': { en: 'Printed' }, 'זיכוי של': { en: 'refund of' }, 'דמי משלוח': { en: 'Delivery fee' },
  // Effective open/close state (open_override)
  'מע"מ': { en: 'VAT' }, 'שיעור מע"מ': { en: 'VAT rate' },
  'העסק פתוח כרגע ללקוחות': { en: 'The business is open to customers right now' },
  'העסק סגור כרגע ללקוחות': { en: 'The business is closed to customers right now' },
  '(מחוץ לשעות הפעילות)': { en: '(outside opening hours)' }, 'פתוח': { en: 'Open' },
  'פתיחה חריגה עד': { en: 'Temporarily open until' }, 'סגירה חריגה עד': { en: 'Temporarily closed until' },
  'בטל חריגה': { en: 'Cancel override' },
  'החריגה בוטלה — חוזרים ללוח השעות הרגיל': { en: 'Override cancelled — back to the regular schedule' },
  // Menu translation coverage (2026-08-26)
  'פריטים בתפריט בלי שם באנגלית': { en: 'menu items have no English name' },
  'הם יוצגו בעברית ללקוחות שמזמינים באנגלית. פתח כל פריט ומלא את שדה השם באנגלית.':
    { en: 'They will show in Hebrew to customers ordering in English. Open each one and fill in its English name.' },
  // ── Tooltips, aria-labels and placeholders (2026-08-26) ──────────────────
  // These translate without an opt-in marker; an entry here IS the opt-in.
  'תפריט': { en: 'Menu' },
  'English / עברית': { en: 'English / עברית' },   // the language toggle names both, deliberately
  'התראות push': { en: 'Push notifications' },
  'הזמנות חדשות': { en: 'New orders' },
  'מצב לילה/יום': { en: 'Dark / light mode' },
  'ייצוא הזמנות מסוננות לאקסל': { en: 'Export the filtered orders to Excel' },
  'אפס לברירת מחדל': { en: 'Reset to default' },
  'הדפסת קבלה': { en: 'Print receipt' },
  'עריכה': { en: 'Edit' },
  'מחלוקת פתוחה': { en: 'Open dispute' },
  'פריט חסר': { en: 'Missing item' },
  'ביטול': { en: 'Cancel' },
  // Example placeholders — a US tenant should not be shown Israeli samples.
  'ישראל ישראלי': { en: 'Jane Smith' },
  'פיצות': { en: 'Pizzas' },
  // Login page
  'שם משתמש': { en: 'Username' }, 'סיסמא': { en: 'Password' }, 'כניסה': { en: 'Sign in' }, 'מתחבר...': { en: 'Signing in...' },
  'שגיאת כניסה': { en: 'Sign-in failed' },
  // Kitchen (standalone KDS)
  'ממתין להכנה': { en: 'Waiting' }, 'בתנור': { en: 'In the oven' }, 'הזמנה חדשה': { en: 'New order' },
  'הזמנה עברה להכנה': { en: 'Order moved to preparing' }, 'הזמנה מוכנה': { en: 'Order ready' },
  'אין הזמנות': { en: 'No orders' }, 'הרגע': { en: 'Just now' }, "ש'": { en: 'h ' },
};

/**
 * The dashboard's language.
 *
 * It used to be `localStorage.lang` and nothing else — so the language was a
 * property of the BROWSER: every new device opened in Hebrew, and there was no
 * way to say "this business is American". Now the tenant supplies the default
 * (stored at login, where the tenant is first known) and an explicit choice by
 * this user overrides it, because someone who pressed the toggle meant it.
 *
 * Read synchronously from localStorage rather than fetched, because <html dir>
 * has to be right before the first paint — resolving it after an API round trip
 * lays the entire page out backwards for a frame.
 */
const LANGS = ['he', 'en', 'es'];

/**
 * Writing direction, from ONE definition.
 *
 * This rule was written two ways in this codebase: `lang === 'he' ? 'rtl' :
 * 'ltr'` on the server and the landing page, and `LANG === 'en' ? 'ltr' :
 * 'rtl'` here. Both are correct while there are exactly two languages and they
 * disagree the moment there is a third — Spanish is not 'en', so this file
 * would have laid the entire dashboard out right-to-left. RTL is a property of
 * the script, so it is stated as one: Hebrew is RTL, everything else is not.
 */
function dirFor(lang) { return lang === 'he' ? 'rtl' : 'ltr'; }

function resolveLang() {
  try {
    const chosen = localStorage.getItem('lang');            // the toggle
    if (LANGS.includes(chosen)) return chosen;
    const tenant = localStorage.getItem('lang_default');    // written at login
    if (LANGS.includes(tenant)) return tenant;
  } catch { /* private mode / storage blocked — fall through to Hebrew */ }
  return 'he';
}
const LANG = resolveLang();

/**
 * One dictionary entry, resolved for the active language.
 *
 * Fallback runs LANG -> en -> the Hebrew key. English before Hebrew is
 * deliberate: once a third language exists, a string nobody has translated yet
 * should show an American operator English, not Hebrew. The audit is what stops
 * an entry going missing; this is only what it degrades to in the meantime.
 */
function pick(entry, heKey) {
  if (!entry) return heKey;
  return entry[LANG] || entry.en || heKey;
}

function tr(he) {
  if (LANG === 'he') return he;
  return pick(HE2EN[he], he);
}

// Apply direction before first paint
document.documentElement.lang = LANG;
document.documentElement.dir  = dirFor(LANG);

function t(key) {
  return I18N[LANG][key] ?? I18N.he[key] ?? key;
}

function setLang(lang) {
  // Writing this key IS the explicit choice — from here on the tenant default
  // no longer moves this browser's language.
  try { localStorage.setItem('lang', lang === 'en' ? 'en' : 'he'); } catch { /* storage blocked */ }
  location.reload();
}

/**
 * The tenant's language, recorded at login. Never overwrites an explicit
 * choice: it is a default, and a default that overrules the user is not one.
 */
function setTenantLang(lang) {
  if (lang !== 'en' && lang !== 'he') return;
  try { localStorage.setItem('lang_default', lang); } catch { /* storage blocked */ }
}

function toggleLang() {
  setLang(LANG === 'en' ? 'he' : 'en');
}

/**
 * Translate title / aria-label / placeholder inside `root`.
 *
 * Only values that have a dictionary entry are touched, so a business name or a
 * customer's address in an attribute is left alone. Exported for markup
 * rendered after load — call it on the container you just filled.
 */
function translateAttrs(root) {
  if (LANG === 'he' || !root) return;
  for (const attr of ['title', 'aria-label', 'placeholder']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const v = (el.getAttribute(attr) || '').trim();
      if (!v) return;
      const hit = pick(HE2EN[v], v);
      if (hit !== v) el.setAttribute(attr, hit);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (I18N[LANG][key] !== undefined) el.textContent = I18N[LANG][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (I18N[LANG][key] !== undefined) el.placeholder = I18N[LANG][key];
  });
  if (LANG === 'en') {
    // String-keyed pass: elements marked data-tr translate their own text
    document.querySelectorAll('[data-tr]').forEach((el) => {
      el.textContent = tr(el.textContent.trim());
    });
    document.querySelectorAll('[data-tr-placeholder]').forEach((el) => {
      el.placeholder = tr(el.placeholder.trim());
    });

    // Attributes translate WITHOUT an opt-in marker: a tooltip's Hebrew IS its
    // key, so having an entry in HE2EN is the opt-in. Requiring data-tr on each
    // one is why 19 title attributes and 13 placeholders stayed Hebrew — the
    // mechanism only ever covered textContent, and nobody remembered the rest.
    translateAttrs(document);
  }
});
