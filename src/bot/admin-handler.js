'use strict';

const { callClaude }         = require('../services/claude');
const { sendMessage }        = require('../services/greenapi');
const { getSession, updateSession,
        getOrders, updateOrderStatus, updateOrder,
        getOrderById }       = require('../services/supabase');
const settings               = require('../services/settings');
const { invalidateCache }    = require('../services/menu-service');
const { createClient }       = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── Admin ACTION regex ────────────────────────────────────────────────────────
const ADMIN_ACTION_RE = /<!--ADMIN:([\w_]+)(?::(\{[\s\S]*?\}))?-->/g;

function stripAdminActions(text) {
  return text.replace(ADMIN_ACTION_RE, '').trim();
}

const DEFAULT_TENANT_ID = process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001';

function reply(phone, text, tenantId) {
  if (!text) return Promise.resolve();
  return sendMessage(phone, text, tenantId)
    .catch(err => console.error(`[admin-bot] send failed ${phone}:`, err.message));
}

// ── Build admin system prompt ─────────────────────────────────────────────────
async function buildAdminPrompt(adminUser, tenantId = DEFAULT_TENANT_ID) {
  const [allSettings, activeOrders] = await Promise.all([
    settings.loadAll(tenantId),
    getOrders().then(o => o.filter(x => !['done','cancelled'].includes(x.status) && (x.tenant_id === tenantId || !x.tenant_id)).slice(0, 20)),
  ]);

  // Load products for this tenant
  const { data: products } = await supabase
    .from('products').select('id, name_he, price, is_available, category_id').eq('tenant_id', tenantId).order('sort_order');
  const { data: additions } = await supabase
    .from('product_additions').select('id, product_id, name_he, price, is_available').order('sort_order');

  const productList = (products || []).map(p => {
    const tops = (additions || []).filter(a => a.product_id === p.id)
      .map(a => `  - ${a.name_he} +${a.price}₪ [${a.is_available ? '✅' : '❌'}]`).join('\n');
    return `• ${p.name_he} — ₪${p.price} [${p.is_available ? '✅ זמין' : '❌ לא זמין'}]${tops ? '\n' + tops : ''}`;
  }).join('\n');

  const STATUS_HE = { new:'חדשה', scheduled:'מתוזמן', preparing:'בהכנה', ready:'מוכן', out_for_delivery:'יצא למשלוח', delivered:'נמסרה' };
  const orderList = activeOrders.map(o => {
    const bitPending = o.payment_method === 'bit' && o.payment_status !== 'paid' ? ' 💳 ממתין לBit' : '';
    const schedTime  = o.status === 'scheduled' && o.scheduled_for
      ? ` 🕐 ${new Date(o.scheduled_for).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem',hour12:false})}`
      : '';
    return `• #${o.order_number} — ${o.customer_name || '—'} — ${STATUS_HE[o.status]||o.status}${schedTime} — ₪${o.total_price}${bitPending}`;
  }).join('\n') || 'אין הזמנות פעילות';

  const STATUS_MAP = { new:'חדשה', preparing:'בהכנה', out_for_delivery:'יצא למשלוח', delivered:'נמסרה', done:'הסתיימה', cancelled:'בוטלה' };

  return `אתה עוזר ניהול של פיצה דליבריס.
המנהל שמדבר איתך: *${adminUser.name}* (${adminUser.role})
שפה: עברית. תשובות קצרות ומהירות.

══════════════════════════
סטטוס המסעדה
══════════════════════════
• בוט פתוח: ${allSettings.is_open !== false ? 'כן ✅' : 'לא ❌'}
• משלוח: ${allSettings.delivery_enabled !== false ? 'כן' : 'לא'} | איסוף: ${allSettings.pickup_enabled !== false ? 'כן' : 'לא'}
${(() => {
  const dh = allSettings.delivery_hours;
  if (!dh || Object.keys(dh).length === 0) return '• שעות משלוח: לא מוגדרות (פתוח תמיד)';
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const DAY_HE = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי', sat:'שבת' };
  const nowIL = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const today = days[nowIL.getDay()];
  const todayH = dh[today];
  const todayStr = todayH
    ? (todayH.is_open === false ? 'סגור היום' : `${todayH.open}–${todayH.close}`)
    : 'לא מוגדר';
  return `• שעות משלוח היום (יום ${DAY_HE[today]}): ${todayStr}`;
})()}

══════════════════════════
תפריט נוכחי
══════════════════════════
${productList}

══════════════════════════
הזמנות פעילות
══════════════════════════
${orderList}

══════════════════════════
פעולות זמינות — ACTION blocks
══════════════════════════

**זמינות מוצר/תוספת:**
<!--ADMIN:SET_AVAILABLE:{"type":"product|topping","name":"<שם>","available":true|false}-->

**סטטוס הזמנה:**
<!--ADMIN:ORDER_STATUS:{"order_number":<מספר>,"status":"preparing|out_for_delivery|delivered|cancelled"}-->
סטטוסים אפשריים: ${Object.entries(STATUS_MAP).map(([k,v])=>`${k}=${v}`).join(', ')}

**ביטול הזמנה:**
<!--ADMIN:CANCEL_ORDER:{"order_number":<מספר>,"reason":"<סיבה>","notify_customer":true|false}-->

**פתח/סגור מחלוקת:**
<!--ADMIN:DISPUTE:{"order_number":<מספר>,"missing":["<פריט1>","<פריט2>"]}-->

**הגדרה:**
<!--ADMIN:SET:{"key":"is_open|delivery_enabled|pickup_enabled|payment_cash|payment_credit","value":true|false}-->

**שעות משלוח ליום ספציפי:**
<!--ADMIN:SET_DELIVERY_HOURS:{"day":"today|sun|mon|tue|wed|thu|fri|sat","open":"HH:MM","close":"HH:MM","is_open":true|false}-->

**עדכון מחיר:**
<!--ADMIN:UPDATE_PRICE:{"name":"<שם מוצר>","price":<מחיר חדש>}-->

**צפה בהזמנות:**
<!--ADMIN:LIST_ORDERS:{"status":"all|new|preparing|out_for_delivery"}-->

**אישור תשלום Bit:**
<!--ADMIN:CONFIRM_PAYMENT:{"order_number":<מספר>}-->

══════════════════════════
כללים
══════════════════════════
• אחרי כל ACTION — אשר בקצרה מה בוצע.
• אם לא מובן — שאל שאלת הבהרה אחת.
• פריט לא זמין = ❌, זמין = ✅.
• "נגמרה X" = SET_AVAILABLE available:false
• "חזרה X" / "יש X" = SET_AVAILABLE available:true
• "סגור" / "צאו" = SET is_open:false
• "פתח" = SET is_open:true
• "קיבלתי Bit" / "שילמו" / "אשר תשלום" + מספר הזמנה = CONFIRM_PAYMENT
• "משלוח עד 22:00" / "פתח משלוח מ-12:00" = SET_DELIVERY_HOURS עם day:today
• "סגור משלוח היום" = SET_DELIVERY_HOURS day:today is_open:false
`;
}

// ── Dispatch admin actions ────────────────────────────────────────────────────
async function dispatchActions(text, phone, adminUser, tenantId = DEFAULT_TENANT_ID) {
  const results = [];
  let match;
  const re = new RegExp(ADMIN_ACTION_RE.source, 'g');

  while ((match = re.exec(text)) !== null) {
    const action  = match[1];
    const payload = match[2] ? JSON.parse(match[2]) : {};

    try {
      switch (action) {

        case 'SET_AVAILABLE': {
          const { type, name, available } = payload;
          if (type === 'topping') {
            const { data: found } = await supabase
              .from('product_additions').select('id,name_he').ilike('name_he', `%${name}%`).limit(5);
            if (!found?.length) { results.push(`❌ לא נמצאה תוספת "${name}"`); break; }
            for (const a of found) {
              await supabase.from('product_additions').update({ is_available: available }).eq('id', a.id);
            }
          } else {
            const { data: found } = await supabase
              .from('products').select('id,name_he').ilike('name_he', `%${name}%`).limit(3);
            if (!found?.length) { results.push(`❌ לא נמצא מוצר "${name}"`); break; }
            for (const p of found) {
              await supabase.from('products').update({ is_available: available }).eq('id', p.id);
            }
          }
          invalidateCache(tenantId);
          results.push(`${available ? '✅' : '❌'} *${name}* — ${available ? 'מוחזר לתפריט' : 'סומן כאזל'}`);
          break;
        }

        case 'ORDER_STATUS': {
          const { order_number, status } = payload;
          const { data: orders } = await supabase
            .from('orders').select('id,order_number,phone,customer_name')
            .eq('order_number', order_number).single();
          if (!orders) { results.push(`❌ הזמנה #${order_number} לא נמצאה`); break; }
          await updateOrderStatus(orders.id, status);
          const STATUS_LABELS = { new:'חדשה', preparing:'בהכנה', out_for_delivery:'יצא למשלוח', delivered:'נמסרה', done:'הסתיימה', cancelled:'בוטלה' };
          // Notify customer
          const { notifyStatusChange } = require('../services/status-notifier');
          await notifyStatusChange(orders.phone, status, 'he', order_number).catch(() => {});
          results.push(`✅ הזמנה #${order_number} — ${STATUS_LABELS[status] || status}`);
          break;
        }

        case 'CANCEL_ORDER': {
          const { order_number, reason, notify_customer = true } = payload;
          const { data: ord } = await supabase
            .from('orders').select('*').eq('order_number', order_number).single();
          if (!ord) { results.push(`❌ הזמנה #${order_number} לא נמצאה`); break; }
          if (['cancelled','done'].includes(ord.status)) { results.push(`⚠️ הזמנה #${order_number} כבר ${ord.status}`); break; }
          await supabase.from('orders').update({
            status: 'cancelled', cancelled_by: 'business',
            cancel_reason: reason || null, updated_at: new Date().toISOString(),
          }).eq('id', ord.id);
          if (notify_customer) {
            const msg = `❌ הזמנה מספר *${order_number}* בוטלה על ידי העסק.${reason ? `\nסיבה: ${reason}` : ''}\n\nמצטערים על אי הנוחות 🙏`;
            await sendMessage(ord.phone, msg).catch(() => {});
          }
          results.push(`✅ הזמנה #${order_number} בוטלה`);
          break;
        }

        case 'DISPUTE': {
          const { order_number, missing = [] } = payload;
          const { data: ord } = await supabase
            .from('orders').select('*').eq('order_number', order_number).single();
          if (!ord) { results.push(`❌ הזמנה #${order_number} לא נמצאה`); break; }
          const { updateSession: us } = require('../services/supabase');
          const items = missing.map(n => ({ type: 'item', name: n, price: 0, qty: 1 }));
          await supabase.from('orders').update({ dispute_status: 'pending', dispute_item: missing.join(', '), updated_at: new Date().toISOString() }).eq('id', ord.id);
          await us(ord.phone, { pending_dispute: { order_id: ord.id, order_number, items, refund: 0, created_at: new Date().toISOString() } }, tenantId);
          const listStr = missing.map(n => `• *${n}*`).join('\n');
          const msg = `שלום${ord.customer_name ? ` ${ord.customer_name}` : ''}! 🙏\n\nלצערנו הפריטים הבאים אזלו:\n${listStr}\n\n(הזמנה *#${order_number}*)\n\n*1* — לבטל\n*2* — להמשיך בלי\n*3* — להחליף`;
          await sendMessage(ord.phone, msg, tenantId).catch(() => {});
          results.push(`✅ מחלוקת נפתחה להזמנה #${order_number} — הלקוח עודכן`);
          break;
        }

        case 'SET': {
          const { key, value } = payload;
          const allowed = ['is_open','delivery_enabled','pickup_enabled','payment_cash','payment_credit','payment_bit','payment_paybox'];
          if (!allowed.includes(key)) { results.push(`❌ מפתח "${key}" לא מורשה`); break; }
          await settings.set(key, value, tenantId);
          settings._clearCache(tenantId);
          const labels = { is_open:'בוט', delivery_enabled:'משלוח', pickup_enabled:'איסוף', payment_cash:'מזומן', payment_credit:'אשראי' };
          results.push(`${value ? '✅' : '❌'} *${labels[key] || key}* — ${value ? 'פועל' : 'מושבת'}`);
          break;
        }

        case 'SET_DELIVERY_HOURS': {
          const { day: rawDay, open: openTime, close: closeTime, is_open: dayOpen = true } = payload;
          const sysdays = ['sun','mon','tue','wed','thu','fri','sat'];
          const DAY_HE  = { sun:'ראשון', mon:'שני', tue:'שלישי', wed:'רביעי', thu:'חמישי', fri:'שישי', sat:'שבת' };
          const nowIL   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
          const targetDay = rawDay === 'today' ? sysdays[nowIL.getDay()] : rawDay;
          if (!sysdays.includes(targetDay)) { results.push(`❌ יום לא חוקי: "${rawDay}"`); break; }
          const current = (await settings.get('delivery_hours', tenantId)) || {};
          current[targetDay] = {
            is_open: dayOpen,
            open:  openTime  || current[targetDay]?.open  || '10:00',
            close: closeTime || current[targetDay]?.close || '23:00',
          };
          await settings.set('delivery_hours', current, tenantId);
          settings._clearCache(tenantId);
          const dayLabel = DAY_HE[targetDay] || targetDay;
          if (!dayOpen) {
            results.push(`❌ משלוח סגור ביום ${dayLabel}`);
          } else {
            results.push(`✅ שעות משלוח יום ${dayLabel}: ${current[targetDay].open}–${current[targetDay].close}`);
          }
          break;
        }

        case 'UPDATE_PRICE': {
          const { name, price } = payload;
          const { data: found } = await supabase
            .from('products').select('id,name_he').ilike('name_he', `%${name}%`).limit(3);
          if (!found?.length) { results.push(`❌ לא נמצא "${name}"`); break; }
          for (const p of found) {
            await supabase.from('products').update({ price, updated_at: new Date().toISOString() }).eq('id', p.id);
          }
          invalidateCache(tenantId);
          results.push(`✅ *${found[0].name_he}* — מחיר עודכן ל-₪${price}`);
          break;
        }

        case 'LIST_ORDERS': {
          const { status = 'all' } = payload;
          const orders = await getOrders(status === 'all' ? undefined : status);
          const active = orders.filter(o => !['done','cancelled'].includes(o.status));
          if (!active.length) { results.push('אין הזמנות פעילות כרגע.'); break; }
          const STATUS_L = { new:'חדשה', preparing:'בהכנה', out_for_delivery:'בדרך', delivered:'נמסרה' };
          const list = active.slice(0, 15).map(o =>
            `• *#${o.order_number}* ${o.customer_name || '—'} — ${STATUS_L[o.status] || o.status} — ₪${o.total_price}`
          ).join('\n');
          results.push(`📋 *הזמנות פעילות (${active.length}):*\n${list}`);
          break;
        }

        case 'CONFIRM_PAYMENT': {
          const { order_number } = payload;
          const { data: ord } = await supabase
            .from('orders').select('*').eq('order_number', order_number).single();
          if (!ord) { results.push(`❌ הזמנה #${order_number} לא נמצאה`); break; }
          if (ord.payment_status === 'paid') { results.push(`⚠️ הזמנה #${order_number} כבר שולמה`); break; }
          await supabase.from('orders').update({
            payment_status: 'paid', updated_at: new Date().toISOString(),
          }).eq('id', ord.id);
          const method = ord.payment_method === 'bit' ? 'Bit' : 'מזומן';
          await sendMessage(ord.phone,
            `✅ קיבלנו את התשלום ב${method}! הזמנה מספר *${order_number}* אושרה — מתחילים להכין 🍕`,
            tenantId
          ).catch(() => {});
          results.push(`✅ תשלום ${method} אושר להזמנה #${order_number} — הלקוח עודכן`);
          break;
        }

        default:
          results.push(`⚠️ פעולה לא מוכרת: ${action}`);
      }
    } catch (err) {
      console.error(`[admin-bot] action ${action} error:`, err.message);
      results.push(`❌ שגיאה בביצוע ${action}: ${err.message}`);
    }
  }

  return results;
}

// ── Main admin handler ────────────────────────────────────────────────────────
async function handleAdminMessage(phone, userMessage, adminUser, tenantId = DEFAULT_TENANT_ID) {
  console.log(`[admin-bot] phone=${phone} tenant=${tenantId} name="${adminUser.name}" msg="${userMessage.slice(0,60)}"`);

  const session = await getSession(`admin:${phone}`, tenantId);
  const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  if (['reset','אפס','נקה'].some(k => userMessage.trim().toLowerCase() === k)) {
    await updateSession(`admin:${phone}`, { conversation_history: [] }, tenantId);
    await reply(phone, '✅ היסטוריית שיחת הניהול נוקתה.', tenantId);
    return;
  }

  let systemPrompt;
  try { systemPrompt = await buildAdminPrompt(adminUser, tenantId); }
  catch (err) { console.error('[admin-bot] prompt error:', err.message); }

  let assistantText;
  try {
    assistantText = await callClaude(systemPrompt, history.slice(-20), userMessage);
  } catch (err) {
    console.error('[admin-bot] Claude error:', err.message);
    await reply(phone, '⚠️ שגיאה זמנית, נסה שוב.', tenantId);
    return;
  }

  const actionResults = await dispatchActions(assistantText, phone, adminUser, tenantId);

  const cleanText = stripAdminActions(assistantText);
  if (cleanText) await reply(phone, cleanText, tenantId);
  if (actionResults.length) await reply(phone, actionResults.join('\n'), tenantId);

  const updatedHistory = [
    ...history,
    { role: 'user',      content: userMessage    },
    { role: 'assistant', content: assistantText  },
  ].slice(-30);
  await updateSession(`admin:${phone}`, { conversation_history: updatedHistory }, tenantId);
}

module.exports = { handleAdminMessage };
