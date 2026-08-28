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
  // Order acceptance (incoming zone + settings)
  'ממתינות לאישור': 'Awaiting approval',
  'הזמנות ממתינות': 'Orders waiting',
  'אשר הזמנה': 'Accept order',
  'אשר הזמנה מתוזמנת': 'Confirm pre-order',
  'שיחה עם נציג': 'Human handoff',
  'הכנסות (שולם)': 'Revenue (paid)',
  'ממתין לתשלום': 'Awaiting payment',
  'שורת הסרה ("להסרה השב הסר") תתווסף אוטומטית, ולקוחות שביקשו הסרה ידולגו.':
    'An opt-out line is appended automatically, and customers who asked to be removed are skipped.',
  'דילגנו (ביקשו הסרה)': 'Skipped (opted out)',
  'נכשלו:': 'Failed:',
  'שולח...': 'Sending...',
  'כשמעבירים שיחה לנציג הבוט מפסיק לענות ללקוח. אם אף אחד לא ממשיך את השיחה, הלקוח נשאר תקוע — לכן היא חוזרת לבוט אוטומטית.':
    'Handing a chat to an agent stops the bot from answering that customer. If nobody picks it up they are stuck, so it returns to the bot automatically.',
  'התראה למנהלים אם לקוח ממתין': 'Alert admins if a customer waits',
  'החזרה אוטומטית לבוט אחרי': 'Return to the bot after',
  'דקות ללא מענה נציג': 'minutes with no agent reply',
  'אישור מתחייב להכנה בשעה זו; ההזמנה תיכנס למטבח אוטומטית לפני המועד':
    'Confirming commits you to that time; the order enters the kitchen automatically before it',
  'זמן הכנה': 'Prep time',
  'דחה': 'Reject',
  'אזל במלאי': 'Out of stock',
  'אשר והתחל הכנה': 'Accept & start',
  'הזמנה אושרה — הלקוח עודכן': 'Order accepted — customer notified',
  'ממתין לתשלום': 'Awaiting payment',
  'אושרה — נשלחה למטבח': 'accepted — sent to kitchen',
  'הזמנה חדשה': 'New order',
  'מתוזמנות': 'Scheduled',
  'מוכנות': 'Ready',
  'ביט': 'Bit',
  'לקוח': 'Customer',
  'הפעל התראות כדי לא לפספס הזמנות': 'Enable notifications so you never miss an order',
  'בלי התראות push לא תקבל עדכון על הזמנות חדשות כשהדשבורד סגור': "Without push notifications you won't hear about new orders when the dashboard is closed",
  'הפעל התראות': 'Enable notifications',
  'לא עכשיו': 'Not now',
  'אישור הזמנות': 'Order approval',
  'אישור ידני (מומלץ)': 'Manual approval (recommended)',
  'כל הזמנה חדשה ממתינה לאישור שלך. הלקוח מקבל "ההזמנה נשלחה לאישור המסעדה", ורק אחרי שתאשר — הודעת אישור עם זמן הכנה וההזמנה עוברת למטבח.':
    'Every new order waits for your approval. The customer is told "sent to the restaurant for approval", and only after you accept do they get a confirmation with prep time and the order moves to the kitchen.',
  'אישור אוטומטי': 'Auto approval',
  '⚠️ שים לב: כל הזמנה תאושר ללקוח מיד וללא בדיקה שלך, ותעבור ישר למטבח. ודא שהתפריט והמלאי מעודכנים תמיד — הזמנה שאושרה מחייבת אותך כלפי הלקוח.':
    '⚠️ Note: every order is confirmed to the customer immediately without your review, and goes straight to the kitchen. Keep your menu and stock always up to date — a confirmed order is a commitment to the customer.',
  'זמן הכנה — ברירת מחדל': 'Default prep time',
  'דקות': 'minutes',
  'תזכורת אם הזמנה לא אושרה תוך': 'Remind if an order is not accepted within',
  'דקות (push + וואטסאפ למנהלים)': 'minutes (push + WhatsApp to admins)',
  // Shared / status
  'חדשה': 'New', 'מתוזמנת': 'Scheduled', 'בהכנה': 'Preparing', 'מוכן': 'Ready',
  'יצא למשלוח': 'Out for delivery', 'נמסרה': 'Delivered', 'הסתיימה': 'Done', 'בוטלה': 'Cancelled',
  'משלוח': 'Delivery', 'איסוף': 'Pickup', 'איסוף עצמי': 'Pickup',
  'שולם': 'Paid', 'ממתין': 'Pending', 'ממתין לBit': 'Awaiting Bit',
  'טוען...': 'Loading...', 'שמור': 'Save', 'ביטול': 'Cancel', 'עריכה': 'Edit',
  'מחיקה': 'Delete', 'מחק': 'Delete', 'הסר': 'Remove', 'שלח': 'Send', 'חזרה': 'Back',
  'נשמר': 'Saved', 'שגיאה': 'Error', 'הדפסה': 'Print', 'הדפס': 'Print', 'נקה': 'Clear',
  // Orders page
  'כל הסטטוסים': 'All statuses', 'חדשות': 'New', 'בדרך': 'On the way', 'נמסרו': 'Delivered',
  'הסתיימו': 'Done', 'בוטלו': 'Cancelled', 'כל הסוגים': 'All types', 'כל התשלומים': 'All payments',
  'מזומן': 'Cash', 'אשראי': 'Credit card', 'מ:': 'From:', 'טוען הזמנות...': 'Loading orders...',
  'אין הזמנות תואמות': 'No matching orders', 'נסה לשנות את הפילטרים': 'Try adjusting the filters',
  'נקה פילטרים': 'Clear filters', 'פרטי לקוח': 'Customer details', 'סטטוס': 'Status',
  'פריטים': 'Items', 'אין פריטים': 'No items', 'פריט': 'Item',
  'סה"כ': 'Total', 'כולל מע"מ 18%': 'Incl. 18% VAT', 'סכום ביניים': 'Subtotal',
  'ערוך פריטים': 'Edit items', 'פריט חסר': 'Missing item', 'מחלוקת פתוחה': 'Open dispute',
  'זיכוי ידני נדרש': 'Manual refund needed', 'נדרש זיכוי ידני בכרטקום': 'Manual refund needed in Cardcom',
  'זיכוי ידני': 'Manual refund', 'בוטל ע"י לקוח': 'Cancelled by customer', 'בוטל ע"י העסק': 'Cancelled by business',
  'כתובת לא ידועה': 'Address unknown', 'הזמנה': 'Order', 'לקוח': 'Customer',
  'הערות': 'Notes', 'הערה': 'Note', 'שעה': 'Time', 'תאריך': 'Date', 'סכום': 'Amount', 'תשלום': 'Payment',
  // Order edit modal
  'כתובת למשלוח': 'Delivery address', 'עיר': 'City', 'רחוב': 'Street', 'מספר': 'No.',
  'סוג יעד': 'Destination type', 'הערות לשליח': 'Courier notes', 'פריטי ההזמנה': 'Order items',
  '+ הוסף מוצר': '+ Add product', 'סיכום כספי': 'Financial summary', 'שמור שינויים': 'Save changes',
  'קומה, צד, הוראות כניסה...': 'Floor, side, entry instructions...', '— בחר —': '— Select —',
  'בית': 'House', 'דירה': 'Apartment', 'עסק': 'Business',
  // Cancel/refund modal
  'ביטול הזמנה': 'Cancel order', 'סיבת הביטול': 'Cancellation reason', 'יוזמת העסק': 'Business initiated',
  'בקשת הלקוח': 'Customer request', 'הערה פנימית / סיבה': 'Internal note / reason',
  'שלח הערה ללקוח': 'Send note to customer', 'ההערה תצורף להודעת הביטול ב-WhatsApp': 'The note is attached to the WhatsApp cancellation message',
  'הודעה ללקוח — ניתן לעריכה': 'Customer message — editable', '↺ אפס': '↺ Reset', 'אשר ביטול': 'Confirm cancellation',
  'לדוגמה: אזל המלאי, בעיה תפעולית, לקוח ביקש לבטל...': 'e.g. out of stock, operational issue, customer asked to cancel...',
  // Products page
  'תוספות': 'Toppings', 'פריטים במלאי': 'items in stock', 'ניהול': 'Manage',
  'אין מוצרים בקטגוריה זו': 'No products in this category', 'זמין': 'Available', 'אזל': 'Out of stock',
  'אין קטגוריות עדיין': 'No categories yet', 'זמינות לכל המנות — לחיצה משביתה/מחזירה למלאי': 'Available on every dish — click to toggle stock',
  // Customers page
  'סה"כ לקוחות': 'Total customers', 'לקוחות חוזרים': 'Returning customers', 'סה"כ הזמנות': 'Total orders',
  'סה"כ הכנסות': 'Total revenue', 'חוזר': 'Returning', 'שם לקוח': 'Customer name', 'טלפון': 'Phone',
  'הזמנות': 'Orders', 'סה"כ רכישות': 'Total spent', 'אין לקוחות תואמים לחיפוש': 'No customers match the search',
  'לקוחות חוזרים בלבד': 'Returning customers only', 'שלח הודעה': 'Send message',
  // Stats page
  'תקופה:': 'Period:', 'היום': 'Today', 'שבוע': 'Week', 'חודש': 'Month', 'שנה': 'Year', 'הכל': 'All',
  'הזמנות לפי יום': 'Orders per day', 'שעות עומס': 'Busy hours', 'שיטת אספקה': 'Delivery method',
  'אמצעי תשלום': 'Payment methods', 'סטטוס הזמנות': 'Order status', 'מוצרים מובילים': 'Top products',
  'הכנסות לפי יום': 'Revenue per day', 'ממוצע להזמנה': 'Avg. order', 'הכנסות': 'Revenue',
  'ביטולים': 'Cancellations', 'לקוחות': 'Customers',
  // Settings page
  'פרטי העסק': 'Business details', 'פרטים המוצגים ללקוחות בבוט ובתפריט הציבורי': 'Details shown to customers in the bot and public menu',
  'שם העסק': 'Business name', 'שם לועזי (לקישור התפריט הציבורי)': 'English name (public menu link)',
  'כתובת העסק': 'Business address', 'כתובת שרת הבוט': 'Bot server URL', 'כתובת לאיסוף עצמי': 'Pickup address',
  'מספר וואטסאפ להזמנות (בתפריט הציבורי)': 'WhatsApp number for orders (public menu)',
  'מיתוג תפריט': 'Menu branding', 'צבע, לוגו וסלוגן של דף התפריט הציבורי שנשלח ללקוחות': 'Color, logo and tagline of the public menu page sent to customers',
  'צבע ראשי': 'Primary color', 'כל התפריט נצבע לפי הצבע הזה — כפתורים, כותרת ומחירים': 'The whole menu is themed by this color — buttons, header and prices',
  'איפוס לברירת מחדל': 'Reset to default', 'כתובת לוגו (URL לתמונה)': 'Logo URL (image link)',
  'סלוגן בכותרת התפריט': 'Menu header tagline', 'שינויים נראים בתפריט הציבורי מיד אחרי שמירה.': 'Changes appear on the public menu immediately after saving.',
  'אילו אמצעי תשלום הבוט מציע ללקוחות': 'Which payment methods the bot offers customers',
  'תשלום במזומן בעת המסירה': 'Cash on delivery', 'תשלום מאובטח בכרטיס אשראי': 'Secure credit-card payment',
  'ביט': 'Bit', 'העברה למספר הביט של העסק': 'Transfer to the business Bit number', 'מספר טלפון לBit': 'Bit phone number',
  'פייבוקס': 'PayBox', 'העברה בפייבוקס': 'PayBox transfer', 'אחר': 'Other',
  'תיאום אמצעי תשלום אחר מול העסק': 'Arrange another payment method with the business',
  'סוגי הזמנה': 'Order types', 'אילו אפשרויות קבלה פתוחות ללקוחות': 'Which fulfillment options are open to customers',
  'משלוח מאופשר': 'Delivery enabled', 'הבוט יציע משלוח עד הבית לפי אזורי המשלוח': 'The bot offers home delivery per the delivery zones',
  'איסוף עצמי מאופשר': 'Pickup enabled', 'הבוט יציע איסוף מכתובת העסק': 'The bot offers pickup from the business address',
  'בוט פתוח לקבלת הזמנות': 'Bot open for orders', 'כיבוי עוצר מיידית קבלת הזמנות חדשות': 'Turning off immediately stops new orders',
  'הזמנות מתוזמנות': 'Scheduled orders', 'כמה דקות לפני השעה המבוקשת להעביר את ההזמנה להכנה': 'How many minutes before the requested time the order moves to preparing',
  'דקות לפני': 'minutes before', 'שינויי הזמנות': 'Order changes', 'מה לקוח יכול לשנות אחרי שההזמנה נשלחה': 'What a customer can change after ordering',
  'אפשר ללקוח לשנות/לבטל הזמנה': 'Allow customers to edit/cancel orders',
  'זמין כל עוד ההזמנה לא עברה למצב "בהכנה" — מרגע שההכנה מתחילה ההזמנה ננעלת': 'Available until the order enters "preparing" — once preparation starts the order locks',
  'שעות פעילות': 'Business hours', 'מתי הבוט מקבל הזמנות; מחוץ לשעות אלה לקוחות יקבלו הודעת סגור': 'When the bot accepts orders; outside these hours customers get a closed message',
  'שעות משלוח': 'Delivery hours', 'באילו שעות מוצע משלוח; בימים שאינם פעילים יוצע איסוף בלבד': 'When delivery is offered; on inactive days only pickup is offered',
  'אזורי משלוח': 'Delivery zones', 'ערים ואזורים שהעסק משלח אליהם, כולל דמי משלוח ומינימום הזמנה': 'Cities and areas the business delivers to, with fees and minimum order',
  'אזור': 'Area', 'דמי משלוח (₪)': 'Delivery fee (₪)', 'מינימום (₪)': 'Minimum (₪)', 'זמן משוער (דק׳)': 'ETA (min)',
  '+ הוסף אזור': '+ Add zone', 'אין אזורי משלוח — הוסף אזור ראשון': 'No delivery zones — add the first one',
  'שליחים': 'Couriers', 'שליחת פרטי הזמנה לשליחים בוואטסאפ': 'Sending order details to couriers on WhatsApp',
  'שלח פרטי הזמנה לשליח אוטומטית': 'Send order details to couriers automatically',
  'הודעת וואטסאפ עם פרטי ההזמנה והכתובת תישלח לכל השליחים': 'A WhatsApp message with the order details and address goes to every courier',
  'שלח בסטטוס:': 'Send on status:', 'שם השליח': 'Courier name', '+ הוסף שליח': '+ Add courier',
  'אין שליחים — הוסף שליח ראשון': 'No couriers — add the first one', 'הסר שליח': 'Remove courier',
  'שיחות שלא נענו': 'Missed calls',
  'תוספות': 'Toppings',
  'תמחור תוספות חלקיות — לקוחות מבקשים חופשי (חצי זיתים, רבע פטריות)': 'Partial-topping pricing — customers ask freely (half olives, quarter mushrooms)',
  'ברירת המחדל: תוספת חלקית עולה כמו תוספת מלאה. אפשר לתמחר חצי/רבע כאחוז ממחיר התוספת.': 'Default: a partial topping costs the same as a full one. You can price half/quarter as a percentage of the topping price.',
  'מחיר חצי תוספת (% ממחיר מלא)': 'Half-topping price (% of full)',
  'מחיר רבע תוספת (% ממחיר מלא)': 'Quarter-topping price (% of full)',
  'לקוח שהתקשר ולא נענה מקבל אוטומטית הזמנה להזמין בוואטסאפ': 'Callers who go unanswered automatically get a WhatsApp invitation to order',
  'שלח וואטסאפ אוטומטי למי שהתקשר ולא נענה': 'Auto-send WhatsApp to unanswered callers',
  'שלח גם כשהעסק סגור': 'Send even when the business is closed',
  'מינימום': 'At least', 'שעות בין הודעות לאותו מתקשר': 'hours between messages to the same caller',
  'ערוץ ההודעה:': 'Message channel:', 'וואטסאפ (תבנית מאושרת)': 'WhatsApp (approved template)',
  'SMS עם קישור לוואטסאפ': 'SMS with a WhatsApp link',
  "חיבור מספר הטלפון לשירות נעשה על ידי ג'אסל.": 'Connecting the phone number to this service is done by Jasell.',
  'יום ראשון': 'Sunday', 'יום שני': 'Monday', 'יום שלישי': 'Tuesday', 'יום רביעי': 'Wednesday',
  'יום חמישי': 'Thursday', 'יום שישי': 'Friday', 'יום שבת': 'Saturday',
  'מנהלי וואצפ': 'WhatsApp admins', 'מספרי טלפון שיוכלו לנהל את הבוט דרך וואצפ': 'Phone numbers that can manage the bot via WhatsApp',
  '+ הוסף מנהל': '+ Add admin', 'שם': 'Name', 'תפקיד': 'Role', 'נוסף': 'Added', 'מנהל': 'Admin', 'מנג׳ר': 'Manager',
  'אין מנהלים עדיין — לחץ "+ הוסף מנהל" כדי להתחיל': 'No admins yet — click "+ Add admin" to start',
  // Settings anchor nav
  'תשלום': 'Payment', 'מתוזמנות': 'Scheduled', 'שינויי': 'Changes',
  // Kitchen tab
  'חלון מטבח': 'Kitchen Display', 'מתחבר…': 'Connecting…', 'מחובר': 'Connected', 'מתחבר מחדש…': 'Reconnecting…',
  'אין הזמנות פעילות': 'No active orders', 'הזמנות פעילות': 'active orders',
  // Toasts / misc
  'אין הזמנות חדשות': 'No new orders', 'ההזמנה עודכנה': 'Order updated', 'ההזמנה בוטלה': 'Order cancelled',
  // Add-admin modal
  'הוסף מנהל וואצפ': 'Add WhatsApp admin', 'שם מלא': 'Full name', 'מספר טלפון (בינלאומי)': 'Phone number (international)',
  'ללא + או רווחים, לדוגמה: 972501234567': 'No + or spaces, e.g. 972501234567',
  'מנהל — גישה מלאה': 'Admin — full access', 'מנג׳ר — צפייה בהזמנות בלבד': 'Manager — orders view only',
  'הוסף': 'Add', 'שומר...': 'Saving...',
  // Order edit modal
  'עריכת הזמנה': 'Edit order', 'דירה': 'Apartment', 'בית פרטי': 'House', 'משרד': 'Office', 'מלון': 'Hotel',
  // Dispute modal
  'סמן את הפריטים/תוספות שנגמרו במלאי': 'Mark the items/toppings that ran out',
  'הודעה שתישלח ללקוח ב-WhatsApp': 'Message that will be sent to the customer on WhatsApp',
  'שלח ללקוח': 'Send to customer',
  // Product / category / addition modals
  'קטגוריה חדשה': 'New category', 'עריכת קטגוריה': 'Edit category', 'שם הקטגוריה': 'Category name',
  'שם באנגלית': 'English name', 'קטגוריה זו תומכת בתוספות (לדוגמה: פיצות)': 'This category supports toppings (e.g. pizzas)',
  'מוצר חדש': 'New product', 'עריכת מוצר': 'Edit product', 'שם (עברית)': 'Name (Hebrew)', 'שם (אנגלית)': 'Name (English)',
  'מחיר (₪)': 'Price (₪)', 'תמונה': 'Image', 'העלאת קובץ': 'Upload file',
  'תיאור קצר (יוצג בתפריט הלקוחות)': 'Short description (shown on the customer menu)',
  'תיאור טעים של המנה...': 'A tasty description of the dish...',
  'תוספת חדשה': 'New topping', 'עריכת תוספת': 'Edit topping', 'אמוג׳י': 'Emoji',
  // Broadcast modal
  'שליחת הודעת WhatsApp': 'Send WhatsApp message',
  'שליחת הודעות ללא יזימת לקוח עלולה לגרום לחסימה. מומלץ עד 50 נמענים.': 'Messaging customers who did not write first may get the number blocked. Up to 50 recipients recommended.',
  'כתוב הודעה...': 'Write a message...', 'חיפוש לפי שם, טלפון או כתובת...': 'Search by name, phone or address...',
  // Dynamic chrome (app.js)
  'מתוזמן': 'Scheduled', 'אין הזמנות לייצוא': 'No orders to export', 'יוצאו': 'Exported',
  'מספר הזמנה': 'Order #', 'סוג אספקה': 'Fulfillment', 'כתובת': 'Address',
  'סטטוס תשלום': 'Payment status', 'סטטוס הזמנה': 'Order status',
  'אשר קבלת תשלום Bit': 'Confirm Bit payment received', 'פתח': 'Open',
  'אין הזמנות עדיין': 'No orders yet', 'הזמנות יופיעו כאן ברגע שלקוח יזמין': 'Orders will appear here once a customer orders',
  'אין עדיין נתונים לתקופה זו': 'No data for this period yet', 'השבוע': 'This week', 'החודש': 'This month', 'השנה': 'This year',
  'זמן מסירה ממוצע': 'Avg. delivery time', 'יחס המרה': 'Conversion rate', 'כמות': 'Quantity', 'הכנסה': 'Revenue',
  'תוספת': 'Topping', 'אין פריטים בהזמנה': 'No items in this order',
  'יש לסמן לפחות פריט אחד כדי לראות תצוגה מקדימה.': 'Mark at least one item to see a preview.',
  'יש לסמן לפחות פריט אחד': 'Mark at least one item', 'שולח...': 'Sending...',
  'הודעה נשלחה ללקוח': 'Message sent to customer', 'שגיאה בשליחת המחלוקת': 'Failed to send the dispute',
  'לאשר קבלת תשלום Bit עבור הזמנה': 'Confirm Bit payment received for order', 'תשלום אושר!': 'Payment confirmed!',
  'שגיאה באישור תשלום': 'Failed to confirm payment', 'אשראי — יינתן זיכוי': 'Credit card — will be refunded',
  'לא שולם': 'Not paid', 'ההערה תישמר פנימית בלבד — לא תישלח ללקוח': 'The note is kept internal only — not sent to the customer',
  'מבטל...': 'Cancelling...', 'הזמנה בוטלה': 'Order cancelled', 'שם המוצר:': 'Product name:', 'מחיר:': 'Price:',
  'הזמנה עודכנה': 'Order updated', 'אין קטגוריות — לחץ "+ קטגוריה"': 'No categories — click "+ Category"',
  '+ מוצר': '+ Product', '+ קטגוריה': '+ Category', 'אין מוצרים — לחץ "+ מוצר"': 'No products — click "+ Product"',
  'זמין — לחץ לסימון כאזל': 'In stock — click to mark as out', 'אזל — לחץ להחזרה': 'Out of stock — click to restore',
  'שם תוספת': 'Topping name', 'מחיר': 'Price', '+ הוסף': '+ Add', 'סגור': 'Close',
  'חזרה למלאי': 'back in stock', 'סומנה כאזלה': 'marked out of stock', 'המחיר עודכן בכל המוצרים': 'Price updated on all products',
  'למחוק את התוספת': 'Delete the topping', 'הוסרה': 'removed', 'שם ומחיר נדרשים': 'Name and price are required',
  'נוספה לכל המנות': 'added to all dishes', 'מעלה...': 'Uploading...', 'תמונה הועלתה': 'Image uploaded',
  'שגיאה בהעלאה': 'Upload failed', 'למחוק את': 'Delete', 'יש לבחור לקוחות לפני השליחה': 'Select customers before sending',
  'נמענים נבחרו': 'Recipients selected', 'יש לכתוב הודעה': 'Write a message first', 'נשלח': 'Sent', 'נכשל': 'Failed',
  'עברה להכנה': 'moved to preparing', "דק'": 'min', 'בטיפול נציג': 'Handled by agent', 'נציג': 'Agent', 'בוט': 'Bot',
  'השיחה הועברה לנציג': 'Conversation handed to an agent', 'הודעות': 'Live Chats', 'הבוט חזר לניהול השיחה': 'The bot is back on the conversation',
  'התראות push פעילות — לחץ לכיבוי': 'Push notifications on — click to disable', 'הפעל התראות push': 'Enable push notifications',
  'הדפדפן שלך לא תומך בהתראות push': 'Your browser does not support push notifications',
  'התראות push כובו': 'Push notifications disabled', 'נדרשת הרשאה להתראות בדפדפן': 'Browser notification permission required',
  'שגיאה בהגדרת push': 'Failed to set up push', 'התראות push הופעלו!': 'Push notifications enabled!',
  'נוסף כמנהל': 'added as admin', 'הוסר': 'removed', 'שגיאת שרת': 'Server error',
  // ── Region, currency & tax (2026-08-26) ──────────────────────────────────
  'אזור ומטבע': 'Region & currency',
  'המדינה שבה העסק פועל — קובעת מטבע, מודל מס ופורמט תאריך':
    'The country the business operates in — sets currency, tax model and date format',
  'אזור פעילות': 'Region', 'ישראל': 'Israel', 'ארצות הברית': 'United States', 'מטבע': 'Currency',
  'שינוי האזור מעדכן את מודל המס, המטבע והתווית לברירות המחדל של אותה מדינה. אפשר לשנות כל ערך בנפרד אחר כך.':
    'Changing the region resets the tax model, currency and label to that country\'s defaults. Every value stays editable afterwards.',
  'מס': 'Tax',
  'איך המס מחושב ומוצג — כלול במחיר או מתווסף בקופה':
    'How tax is calculated and shown — contained in the price, or added at checkout',
  'מודל המס': 'Tax model',
  'כלול במחיר (ישראל)': 'Included in the price (Israel)',
  'מתווסף בקופה (ארה"ב)': 'Added at checkout (US)',
  'שיעור המס': 'Tax rate', 'תווית בקבלה': 'Receipt label',
  'המילה שתופיע בקבלה. "VAT" לא קיים בארה"ב ו-"Sales Tax" לא קיים בישראל — זו לא שאלה של תרגום.':
    'The word printed on the receipt. "VAT" does not exist in the US and "Sales Tax" does not exist in Israel — this is not a translation choice.',
  'לחייב מס גם על דמי המשלוח': 'Charge tax on the delivery fee too',
  'בקליפורניה חיוב משלוח של המוכר חייב במס בחלק מהמקרים — התייעץ עם רואה החשבון של העסק':
    'In California a seller\'s delivery charge is taxable in some cases — check with the business\'s accountant',
  'כך זה ייראה ללקוח': 'What the customer sees',
  'מחיר בתפריט': 'Menu price', 'כלול': 'included', 'הלקוח משלם': 'Customer pays',
  'המס מתווסף לסכום שנגבה בפועל. התפריט והבוט מציגים מחיר לפני מס.':
    'Tax is added to the amount actually charged. The menu and the bot quote pre-tax prices.',
  'המס כבר כלול במחיר שבתפריט. הקבלה רק מפרקת כמה מתוך הסכום היה מס.':
    'Tax is already inside the menu price. The receipt only itemises how much of the total was tax.',
  'מדינה': 'Country',
  // Per-zone tax rate + per-category exemption (US: tax is set per jurisdiction,
  // and CA's 80/80 rule exempts some items)
  'מס באזור': 'Zone tax', 'ריק = שיעור המס של העסק': 'Empty = the business\u2019s own tax rate',
  'משלוח ממוסה לפי יעד. השאר ריק כדי להשתמש בשיעור המס של העסק; איסוף עצמי ממוסה תמיד לפי כתובת העסק.':
    'A delivery is taxed where it lands. Leave blank to use the business\u2019s own rate; pickup is always taxed at the business address.',
  'פטור ממס': 'Tax exempt', 'חייב במס': 'Taxable',
  'מיקודים': 'ZIP codes', 'מיקוד': 'ZIP code', 'מדינה (state)': 'State',
  'ללא + או רווחים, לדוגמה': 'No + or spaces, for example', 'ריק = התאמה לפי שם העיר': 'Empty = match by city name',
  'מיקוד הוא מפתח החיפוש המדויק: הוא מנצח את שם העיר. אפשר לרשום קידומת (904) כדי לכסות טווח.':
    'A ZIP is the precise lookup key and beats the city name. A prefix (904) covers a range.',
  'בטל כדי לפטור את הקטגוריה ממס (לדוגמה: מזון קר לקחת)':
    'Uncheck to exempt this category from tax (for example: cold food to go)',
  // Receipt
  'קבלה': 'Receipt', 'טל׳': 'Tel', 'מנה': 'Item', 'לפני מס': 'Subtotal',
  'סה"כ לתשלום': 'Total due', 'תודה שבחרת': 'Thank you for choosing',
  'הודפס': 'Printed', 'זיכוי של': 'refund of', 'דמי משלוח': 'Delivery fee',
  // Effective open/close state (open_override)
  'מע"מ': 'VAT', 'שיעור מע"מ': 'VAT rate',
  'העסק פתוח כרגע ללקוחות': 'The business is open to customers right now',
  'העסק סגור כרגע ללקוחות': 'The business is closed to customers right now',
  '(מחוץ לשעות הפעילות)': '(outside opening hours)', 'פתוח': 'Open',
  'פתיחה חריגה עד': 'Temporarily open until', 'סגירה חריגה עד': 'Temporarily closed until',
  'בטל חריגה': 'Cancel override',
  'החריגה בוטלה — חוזרים ללוח השעות הרגיל': 'Override cancelled — back to the regular schedule',
  // Menu translation coverage (2026-08-26)
  'פריטים בתפריט בלי שם באנגלית': 'menu items have no English name',
  'הם יוצגו בעברית ללקוחות שמזמינים באנגלית. פתח כל פריט ומלא את שדה השם באנגלית.':
    'They will show in Hebrew to customers ordering in English. Open each one and fill in its English name.',
  // ── Tooltips, aria-labels and placeholders (2026-08-26) ──────────────────
  // These translate without an opt-in marker; an entry here IS the opt-in.
  'תפריט': 'Menu',
  'English / עברית': 'English / עברית',   // the language toggle names both, deliberately
  'התראות push': 'Push notifications',
  'הזמנות חדשות': 'New orders',
  'מצב לילה/יום': 'Dark / light mode',
  'ייצוא הזמנות מסוננות לאקסל': 'Export the filtered orders to Excel',
  'אפס לברירת מחדל': 'Reset to default',
  'הדפסת קבלה': 'Print receipt',
  'עריכה': 'Edit',
  'מחלוקת פתוחה': 'Open dispute',
  'פריט חסר': 'Missing item',
  'ביטול': 'Cancel',
  // Example placeholders — a US tenant should not be shown Israeli samples.
  'ישראל ישראלי': 'Jane Smith',
  'פיצות': 'Pizzas',
  // Login page
  'שם משתמש': 'Username', 'סיסמא': 'Password', 'כניסה': 'Sign in', 'מתחבר...': 'Signing in...',
  'שגיאת כניסה': 'Sign-in failed',
  // Kitchen (standalone KDS)
  'ממתין להכנה': 'Waiting', 'בתנור': 'In the oven', 'הזמנה חדשה': 'New order',
  'הזמנה עברה להכנה': 'Order moved to preparing', 'הזמנה מוכנה': 'Order ready',
  'אין הזמנות': 'No orders', 'הרגע': 'Just now', "ש'": 'h ',
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
function resolveLang() {
  try {
    const chosen = localStorage.getItem('lang');            // the toggle
    if (chosen === 'en' || chosen === 'he') return chosen;
    const tenant = localStorage.getItem('lang_default');    // written at login
    if (tenant === 'en' || tenant === 'he') return tenant;
  } catch { /* private mode / storage blocked — fall through to Hebrew */ }
  return 'he';
}
const LANG = resolveLang();

function tr(he) {
  if (LANG !== 'en') return he;
  return HE2EN[he] ?? he;
}

// Apply direction before first paint
document.documentElement.lang = LANG;
document.documentElement.dir  = LANG === 'en' ? 'ltr' : 'rtl';

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
  if (LANG !== 'en' || !root) return;
  for (const attr of ['title', 'aria-label', 'placeholder']) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      const v = (el.getAttribute(attr) || '').trim();
      if (!v) return;
      const hit = HE2EN[v];
      if (hit) el.setAttribute(attr, hit);
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
