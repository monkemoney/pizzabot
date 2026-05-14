'use strict';

/**
 * Business owner WhatsApp bot — receives commands from the owner's phone.
 * Mounted at POST /webhook/business
 *
 * Requires a separate Green API instance configured via:
 *   GREEN_API_BUSINESS_INSTANCE_ID
 *   GREEN_API_BUSINESS_TOKEN
 *   OWNER_PHONE  — phone number of the authorized business owner
 */

const express  = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const settings = require('../services/settings');
const { sendMessage, formatPhone } = require('../services/greenapi');
const { invalidateCache } = require('../services/menu-service');
const { createClient }    = require('@supabase/supabase-js');

const router = express.Router();
router.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OWNER_PHONE = process.env.OWNER_PHONE || '';

const SYSTEM_PROMPT = `אתה עוזר לבעל פיצרייה בשם פיצה דליבריס.
הבעלים שולח לך פקודות ב-WhatsApp כדי לנהל את העסק.

פקודות אפשריות:
• עדכון מחיר: "עדכן מחיר [שם מוצר] ל-[מחיר]"
• ביטול זמינות: "סמן [שם מוצר] לא זמין"
• החזרת זמינות: "סמן [שם מוצר] זמין"
• סגירת הזמנות: "סגור הזמנות"
• פתיחת הזמנות: "פתח הזמנות"
• שינוי תשלום: "קבל רק מזומן" / "קבל רק אשראי" / "קבל הכל"
• שינוי אספקה: "רק משלוח" / "רק איסוף" / "הכל"

תפלט תמיד JSON בפורמט מדויק בתגית <!--CMD:{...}-->, ולאחר מכן הודעת אישור בעברית.
פורמט CMD:
{ "action": "update_price|set_availability|set_open|set_payment|set_delivery",
  "product_name": "...",
  "price": 0,
  "available": true/false,
  "is_open": true/false,
  "cash": true/false,
  "credit": true/false,
  "delivery": true/false,
  "pickup": true/false
}`;

async function replyOwner(text) {
  const instanceId = process.env.GREEN_API_BUSINESS_INSTANCE_ID;
  const token      = process.env.GREEN_API_BUSINESS_TOKEN;
  if (!instanceId || !token || !OWNER_PHONE) return;

  // Use business instance to reply
  const axios = require('axios');
  const base  = process.env.GREEN_API_BASE_URL || 'https://api.green-api.com';
  const chatId = OWNER_PHONE.includes('@') ? OWNER_PHONE : `${OWNER_PHONE}@c.us`;
  await axios.post(
    `${base}/waInstance${instanceId}/sendMessage/${token}`,
    { chatId, message: text }
  ).catch((err) => console.error('[business-bot] reply error:', err.message));
}

async function handleCmd(cmd) {
  switch (cmd.action) {
    case 'update_price': {
      if (!cmd.product_name || !cmd.price) return '❌ חסר שם מוצר או מחיר.';
      const { error } = await supabase
        .from('products')
        .update({ price: cmd.price, updated_at: new Date().toISOString() })
        .ilike('name_he', `%${cmd.product_name}%`);
      if (error) return `❌ שגיאה: ${error.message}`;
      invalidateCache();
      return `✅ מחיר ${cmd.product_name} עודכן ל-${cmd.price}₪`;
    }
    case 'set_availability': {
      if (!cmd.product_name) return '❌ חסר שם מוצר.';
      const { error } = await supabase
        .from('products')
        .update({ is_available: cmd.available, updated_at: new Date().toISOString() })
        .ilike('name_he', `%${cmd.product_name}%`);
      if (error) return `❌ שגיאה: ${error.message}`;
      invalidateCache();
      return `✅ ${cmd.product_name} סומן כ-${cmd.available ? 'זמין' : 'לא זמין'}`;
    }
    case 'set_open':
      await settings.set('is_open', cmd.is_open);
      return cmd.is_open ? '✅ הבוט פתוח לקבלת הזמנות' : '✅ הבוט סגור לקבלת הזמנות';
    case 'set_payment':
      if (cmd.cash  !== undefined) await settings.set('payment_cash',   cmd.cash);
      if (cmd.credit !== undefined) await settings.set('payment_credit', cmd.credit);
      return `✅ אמצעי תשלום עודכנו`;
    case 'set_delivery':
      if (cmd.delivery !== undefined) await settings.set('delivery_enabled', cmd.delivery);
      if (cmd.pickup   !== undefined) await settings.set('pickup_enabled',   cmd.pickup);
      return `✅ אפשרויות אספקה עודכנו`;
    default:
      return '❌ פקודה לא מוכרת.';
  }
}

router.post('/', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.typeWebhook !== 'incomingMessageReceived') return;

  const messageData = body.messageData;
  if (!messageData || messageData.typeMessage !== 'textMessage') return;

  const rawSender  = body.senderData?.sender;
  const textMessage = messageData.textMessageData?.textMessage;
  if (!rawSender || !textMessage) return;

  const phone = formatPhone(rawSender);

  // Only respond to the authorized owner
  if (OWNER_PHONE && !rawSender.includes(OWNER_PHONE.replace(/\D/g, ''))) {
    console.warn(`[business-bot] Unauthorized sender: ${phone}`);
    return;
  }

  console.log(`[business-bot] Command from ${phone}: "${textMessage}"`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let assistantText;
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: textMessage }],
    });
    assistantText = response.content[0]?.text || '';
  } catch (err) {
    console.error('[business-bot] Claude error:', err.message);
    await replyOwner('❌ שגיאה זמנית. נסה שוב.');
    return;
  }

  // Extract CMD
  const cmdMatch = assistantText.match(/<!--CMD:(\{[\s\S]*?\})-->/);
  const cleanText = assistantText.replace(/<!--CMD:[\s\S]*?-->/, '').trim();

  if (cmdMatch) {
    try {
      const cmd = JSON.parse(cmdMatch[1]);
      const result = await handleCmd(cmd);
      await replyOwner(result);
    } catch (err) {
      console.error('[business-bot] CMD error:', err.message);
      await replyOwner(cleanText || '❌ שגיאה בביצוע הפקודה.');
    }
  } else {
    await replyOwner(cleanText);
  }
});

module.exports = router;
