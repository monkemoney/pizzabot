'use strict';

// Pure parsing + segmentation for WhatsApp chat exports.
// Format: `[D.M.YYYY, H:MM:SS] Sender: text`  (messages continue on following
// lines until the next timestamped line). The order bot's sender is "Jasell - ג׳אסל".

const crypto = require('crypto');

const LINE_RE = /^\[(\d{1,2})\.(\d{1,2})\.(\d{4}),\s+(\d{1,2}):(\d{2}):(\d{2})\]\s+([^:]+?):\s?([\s\S]*)$/;

// Strip unicode direction / invisible marks that WhatsApp injects.
function clean(s) {
  return (s || '').replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
}

function isBot(sender) {
  return /jasell|ג׳אסל|ג'אסל/i.test(sender);
}

// System / media / non-content lines we drop entirely.
function isSystemNoise(text) {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  return (
    /מוצפנות מקצה לקצה|end-to-end encrypted/i.test(t) ||
    /בהמתנה להודעה זו|waiting for this message/i.test(t) ||
    /הושמט|omitted|<Media|null\b/i.test(t) ||
    /^‎?image|^‎?audio|^sticker/i.test(t)
  );
}

// Developer/test pings (Aviel = the dev) — pure junk, not real customer intent.
const DEV_TOKENS = new Set(['123', 'test', 'hello', 'הלו', 'הלום', 'הלךו', 'היי', 'הי', '1', '.', 'a', 'aa', 'abc']);
function isDevPing(text) {
  const t = clean(text).toLowerCase();
  return DEV_TOKENS.has(t) || /^[0-9]{1,4}$/.test(t);
}

// The management-mode welcome block the old bot spat out — not part of ordering.
function isAdminModeBlock(text) {
  return /מערכת הניהול|מצב ניהול|מצב הזמנה/.test(text);
}

/**
 * Parse a raw _chat.txt into an ordered list of messages.
 * @returns {Array<{ts:Date, tsRaw:string, sender:string, role:'bot'|'customer', text:string}>}
 */
function parseChat(rawText) {
  const lines = rawText.split(/\r?\n/);
  const messages = [];
  let cur = null;

  for (const line of lines) {
    const m = line.match(LINE_RE);
    if (m) {
      if (cur) messages.push(cur);
      const [, d, mo, y, hh, mm, ss, sender, text] = m;
      const ts = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
      cur = {
        ts,
        tsRaw: `${d}.${mo}.${y} ${hh}:${mm}:${ss}`,
        sender: clean(sender),
        role: isBot(sender) ? 'bot' : 'customer',
        text: clean(text),
      };
    } else if (cur) {
      // continuation line of the current message
      cur.text = clean(cur.text + '\n' + line);
    }
  }
  if (cur) messages.push(cur);

  // Drop system/media noise but KEEP ordering content.
  return messages.filter((msg) => !isSystemNoise(msg.text) && !isAdminModeBlock(msg.text));
}

// Pseudonymize a real display name deterministically (no PII in artifacts).
function pseudonym(sender) {
  if (isBot(sender)) return 'בוט';
  const h = crypto.createHash('sha1').update(sender).digest('hex').slice(0, 6);
  return `לקוח_${h}`;
}

// Scrub phone-like digit runs and long digit sequences from free text.
function scrub(text) {
  return text
    .replace(/\+?972[\s-]?\d[\d\s-]{7,}/g, '[טלפון]')
    .replace(/\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[טלפון]')
    .replace(/\b\d{9,}\b/g, '[מספר]');
}

const ORDER_SIGNALS = /פיצה|משפחתית|אישית|מגש|תוספת|זית|פטריו|בצל|תירס|משלוח|איסוף|הזמנ|תפריט|מזומן|אשראי|₪|שקל|טוסט|שתי|קולה|סלט/i;

/**
 * Split one contact's message stream into ordering SESSIONS.
 * A gap > gapHours (default 3h, mirroring the bot's own stale-session reset)
 * starts a new session. Anonymizes as it goes.
 *
 * @returns {Array<{id, source, startedAt, turns:Array<{role,text,tsRaw}>, stats}>}
 */
function splitSessions(messages, { source, gapHours = 3 } = {}) {
  const sessions = [];
  let cur = null;
  const gapMs = gapHours * 3600 * 1000;

  for (const msg of messages) {
    const startNew = !cur || (msg.ts - cur._lastTs) > gapMs;
    if (startNew) {
      if (cur) finalize(cur, sessions);
      cur = { source, startedAt: msg.tsRaw, _lastTs: msg.ts, turns: [] };
    }
    cur._lastTs = msg.ts;
    cur.turns.push({
      role: msg.role,
      speaker: pseudonym(msg.sender),
      text: scrub(msg.text),
      tsRaw: msg.tsRaw,
    });
  }
  if (cur) finalize(cur, sessions);
  return sessions;
}

function finalize(session, sessions) {
  const customerTurns = session.turns.filter((t) => t.role === 'customer');
  const botTurns = session.turns.filter((t) => t.role === 'bot');
  const allText = session.turns.map((t) => t.text).join(' ');
  const nonDevCustomer = customerTurns.filter((t) => !isDevPing(t.text));

  session.stats = {
    turns: session.turns.length,
    customerTurns: customerTurns.length,
    botTurns: botTurns.length,
    hasOrderSignals: ORDER_SIGNALS.test(allText),
    hasTotal: /₪\s?\d|\d+\s?₪|סה"?כ/i.test(allText),
  };
  // "Useful" = a real back-and-forth with ordering content, not pure dev pings.
  session.useful =
    botTurns.length >= 1 &&
    nonDevCustomer.length >= 1 &&
    session.stats.hasOrderSignals &&
    session.turns.length >= 4;

  delete session._lastTs;
  session.id = crypto.createHash('sha1').update(session.source + session.startedAt).digest('hex').slice(0, 10);
  sessions.push(session);
}

module.exports = { parseChat, splitSessions, isBot, isDevPing, pseudonym, scrub, clean };
