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
  // Login page
  'שם משתמש': 'Username', 'סיסמא': 'Password', 'כניסה': 'Sign in', 'מתחבר...': 'Signing in...',
  'שגיאת כניסה': 'Sign-in failed',
  // Kitchen (standalone KDS)
  'ממתין להכנה': 'Waiting', 'בתנור': 'In the oven', 'הזמנה חדשה': 'New order',
  'הזמנה עברה להכנה': 'Order moved to preparing', 'הזמנה מוכנה': 'Order ready',
  'אין הזמנות': 'No orders', 'הרגע': 'Just now', "ש'": 'h ',
};

const LANG = localStorage.getItem('lang') === 'en' ? 'en' : 'he';

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
  localStorage.setItem('lang', lang === 'en' ? 'en' : 'he');
  location.reload();
}

function toggleLang() {
  setLang(LANG === 'en' ? 'he' : 'en');
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
  }
});
