'use strict';

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_HISTORY_MESSAGES = 40; // keep last 20 exchanges to bound context size

/**
 * Call Claude with the system prompt (cached) + conversation history + new user message.
 * Returns the assistant's reply text.
 *
 * @param {string}   systemPrompt        full system prompt text
 * @param {Array}    conversationHistory  prior [{role,content},...] messages
 * @param {string}   userMessage         the new incoming message
 * @returns {Promise<string>}
 */
async function callClaude(systemPrompt, conversationHistory, userMessage) {
  // Trim history to stay within token budget
  const history = conversationHistory.slice(-MAX_HISTORY_MESSAGES);

  const messages = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }, // cache the large system prompt
      },
    ],
    messages,
  });

  const block = response.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

module.exports = { callClaude };
