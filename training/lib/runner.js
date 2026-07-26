'use strict';

// Runs ONE full conversation between a persona (customer bot) and the order bot.
// Returns a structured record: transcript, the final captured order (if any),
// and metadata for the judge.

const { OrderBotSession, TERMINAL_ACTIONS } = require('./order-bot');
const { nextCustomerMessage } = require('./customer-bot');
const { MAX_TURNS } = require('../config');

/**
 * @param {object} persona
 * @param {object} [opts]
 * @param {string} [opts.lessons]   optional accumulated lessons to A/B test
 * @param {string} [opts.tenantId]
 * @returns {Promise<object>} conversation record
 */
async function runConversation(persona, opts = {}) {
  const bot = new OrderBotSession({ lessons: opts.lessons, tenantId: opts.tenantId });
  await bot.init();

  const transcript = [];         // [{speaker, text}]
  const actions = [];            // every action the bot emitted
  let capturedOrder = null;      // payload of the terminal order action
  let terminalType = null;       // 'SAVE_ORDER' | 'CREATE_PAYMENT'
  let error = null;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // 1) Customer speaks.
      const { text: custText, done: custDone } = await nextCustomerMessage(persona, transcript);
      if (custText) transcript.push({ speaker: 'customer', text: custText });

      // 2) Bot replies.
      const { text: botText, action } = await bot.send(custText || '(...)');
      if (botText) transcript.push({ speaker: 'bot', text: botText });
      if (action) {
        actions.push(action);
        if (TERMINAL_ACTIONS.has(action.type) && action.payload) {
          capturedOrder = action.payload;
          terminalType = action.type;
          break; // order placed — conversation is effectively over
        }
      }

      // 3) Customer signalled they're done (satisfied or gave up).
      if (custDone) break;
    }
  } catch (err) {
    error = err.message || String(err);
  }

  return {
    persona: { id: persona.id, title: persona.title, goal: persona.goal, probes: persona.probes },
    transcript,
    actions: actions.map((a) => a.type),
    capturedOrder,
    terminalType,
    completed: !!capturedOrder,
    turns: transcript.filter((t) => t.speaker === 'customer').length,
    error,
    usedLessons: !!(opts.lessons && opts.lessons.trim()),
  };
}

/** Pretty-print a transcript for reports / judge input. */
function renderTranscript(transcript) {
  return transcript
    .map((t) => `${t.speaker === 'customer' ? 'לקוח' : 'בוט'}: ${t.text}`)
    .join('\n');
}

module.exports = { runConversation, renderTranscript };
