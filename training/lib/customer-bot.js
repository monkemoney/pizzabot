'use strict';

// Drives one simulated customer. Given the running transcript, produces the
// customer's next message. From the customer LLM's point of view the roles are
// swapped: the ORDER BOT's messages are the "user" turns it's replying to.

const { chat } = require('./llm');
const { SIM_MODEL } = require('../config');

const END_TOKEN = '[[END]]';

/**
 * @param {object} persona            one entry from personas.js
 * @param {Array}  transcript         [{speaker:'bot'|'customer', text}]
 * @returns {Promise<{text:string, done:boolean}>}
 */
async function nextCustomerMessage(persona, transcript) {
  // Build the message list from the CUSTOMER's perspective.
  // customer's own lines => assistant; bot's lines => user.
  const messages = [];
  for (const turn of transcript) {
    if (turn.speaker === 'customer') {
      messages.push({ role: 'assistant', content: turn.text });
    } else {
      messages.push({ role: 'user', content: turn.text });
    }
  }

  // If the transcript is empty, prompt the customer to open the conversation.
  if (messages.length === 0) {
    messages.push({ role: 'user', content: '(שלח את ההודעה הראשונה שלך כדי להתחיל את ההזמנה)' });
  } else if (messages[messages.length - 1].role === 'assistant') {
    // Last turn was the customer — shouldn't normally happen; nudge for a reply.
    messages.push({ role: 'user', content: '(המשך)' });
  }

  const text = await chat({
    model: SIM_MODEL,
    system: persona.prompt,
    messages,
    maxTokens: 300,
    temperature: 1,
  });

  const done = text.includes(END_TOKEN);
  const clean = text.replace(END_TOKEN, '').trim();
  return { text: clean, done };
}

module.exports = { nextCustomerMessage, END_TOKEN };
