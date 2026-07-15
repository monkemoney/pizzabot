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
    nav_stats: 'Analytics', nav_settings: 'Settings', nav_inbox: 'Inbox',
    nav_kitchen: 'Kitchen', nav_kitchen_short: 'Kitchen', nav_logout: 'Sign out',
    title_orders: 'Orders', title_products: 'Categories', title_customers: 'Customers',
    title_stats: 'Analytics', title_settings: 'Settings', title_inbox: 'Inbox',
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

const LANG = localStorage.getItem('lang') === 'en' ? 'en' : 'he';

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
});
