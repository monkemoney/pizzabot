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

async function reply(phone, text) {
  if (!text) return;
  await sendMessage(phone, text).catch(err =>
    console.error(`[admin-bot] send failed ${phone}:`, err.message)
  );
}

// ── Build admin system prompt ─────────────────────────────────────────────────
async function buildAdminPrompt(adminUser) {
  const [allSettings, activeOrders] = await Promise.all([
    settings.loadAll(),
    getOrders().then(o => o.filter(x => !['done','cancelled'].includes(x.status)).slice(0, 20)),
  ]);

  // Load products
  const { data: products } = await supabase
    .from('products').select('id, name_he, price, is_available, category_id').order('sort_order');
  const { data: additions } = await supabase
    .from('product_additions').select('id, product_id, name_he, price, is_available').order('sort_order');

  const productList = (products || []).map(p => {
    const tops = (additions || []).filter(a => a.product_id === p.id)
      .map(a => `  - ${a.name_he} +${a.price}₪ [${a.is_available ? '✅' : '❌'}]`).join('\n');
    return `• ${p.name_he} — ₪${p.price} [${p.is_available ? '✅ זמין' : '❌ לא זמין'}]${tops ? '\n' + tops : ''}`;
  }).join('\n');

  const orderList = activeOrders.map(o =>
    `• #${o.order_number} — ${o.customer_name || '—'} — ${o.status} — ₪${o.total_price}`
  ).join('\n') || 'אין הזמנות פעילות';

  const STATUS_MAP = { new:'חדשה', preparing:'בהכנה', out_for_delivery:'יצא למשלוח', delivered:'נמסרה', done:'הסתיימה', cancelled:'בוטלה' };

  return `אתה עוזר ניהול של פיצה דליבריס.
המנהל שמדבר איתך: *${adminUser.name}* (${adminUser.role})
שפה: עברית. תשובות קצרות ומהירות.

══════════════════════════
סטטוס המסעדה
══════════════════════════
• בוט פתוח: ${allSettings.is_open !== false ? 'כן ✅' : 'לא ❌'}
• משלוח: ${allSettings.delivery_enabled !== false ? 'כן' : 'לא'} | איסוף: ${allSettings.pickup_enabled !== false ? 'כן' : 'לא'}

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

**עדכון מחיר:**
<!--ADMIN:UPDATE_PRICE:{"name":"<שם מוצר>","price":<מחיר חדש>}-->

**צפה בהזמנות:**
<!--ADMIN:LIST_ORDERS:{"status":"all|new|preparing|out_for_delivery"}-->

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
`;
}

// ── Dispatch admin actions ────────────────────────────────────────────────────
async function dispatchActions(text, phone, adminUser) {
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
          invalidateCache();
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
          await us(ord.phone, { pending_dispute: { order_id: ord.id, order_number, items, refund: 0, created_at: new Date().toISOString() } });
          const listStr = missing.map(n => `• *${n}*`).join('\n');
          const msg = `שלום${ord.customer_name ? ` ${ord.customer_name}` : ''}! 🙏\n\nלצערנו הפריטים הבאים אזלו:\n${listStr}\n\n(הזמנה *#${order_number}*)\n\n*1* — לבטל\n*2* — להמשיך בלי\n*3* — להחליף`;
          await sendMessage(ord.phone, msg).catch(() => {});
          results.push(`✅ מחלוקת נפתחה להזמנה #${order_number} — הלקוח עודכן`);
          break;
        }

        case 'SET': {
          const { key, value } = payload;
          const allowed = ['is_open','delivery_enabled','pickup_enabled','payment_cash','payment_credit','payment_bit','payment_paybox'];
          if (!allowed.includes(key)) { results.push(`❌ מפתח "${key}" לא מורשה`); break; }
          await settings.set(key, value);
          const labels = { is_open:'בוט', delivery_enabled:'משלוח', pickup_enabled:'איסוף', payment_cash:'מזומן', payment_credit:'אשראי' };
          results.push(`${value ? '✅' : '❌'} *${labels[key] || key}* — ${value ? 'פועל' : 'מושבת'}`);
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
          invalidateCache();
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
async function handleAdminMessage(phone, userMessage, adminUser) {
  console.log(`[admin-bot] phone=${phone} name="${adminUser.name}" msg="${userMessage.slice(0,60)}"`);

  const session = await getSession(`admin:${phone}`);
  const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];

  // Reset command
  if (['reset','אפס','נקה'].some(k => userMessage.trim().toLowerCase() === k)) {
    await updateSession(`admin:${phone}`, { conversation_history: [] });
    await reply(phone, '✅ היסטוריית שיחת הניהול נוקתה.');
    return;
  }

  let systemPrompt;
  try { systemPrompt = await buildAdminPrompt(adminUser); }
  catch (err) { console.error('[admin-bot] prompt error:', err.message); }

  let assistantText;
  try {
    assistantText = await callClaude(systemPrompt, history.slice(-20), userMessage);
  } catch (err) {
    console.error('[admin-bot] Claude error:', err.message);
    await reply(phone, '⚠️ שגיאה זמנית, נסה שוב.');
    return;
  }

  // Execute all actions
  const actionResults = await dispatchActions(assistantText, phone, adminUser);

  // Send clean text (without action blocks)
  const cleanText = stripAdminActions(assistantText);
  if (cleanText) await reply(phone, cleanText);

  // Send action results summary if any
  if (actionResults.length) {
    await reply(phone, actionResults.join('\n'));
  }

  // Save history (admin session keyed with admin: prefix)
  const updatedHistory = [
    ...history,
    { role: 'user',      content: userMessage    },
    { role: 'assistant', content: assistantText  },
  ].slice(-30);
  await updateSession(`admin:${phone}`, { conversation_history: updatedHistory });
}

// ── Check if phone is an admin ────────────────────────────────────────────────
async function getAdminUser(phone) {
  const normalised = phone.replace(/\D/g, '');
  const { data } = await supabase
    .from('admin_users').select('*').eq('phone', normalised).single();
  return data || null;
}

module.exports = { handleAdminMessage, getAdminUser };
