'use strict';

// Thin Anthropic wrapper shared by the customer bots, the judge and the improver.
// Adds retry-with-backoff and a tolerant JSON extractor.

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call a model and return the concatenated text output.
 *
 * @param {object}  opts
 * @param {string}  opts.model
 * @param {string}  opts.system
 * @param {Array}   opts.messages     [{role,content}]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @returns {Promise<string>}
 */
async function chat({ model, system, messages, maxTokens = 1024 }) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        // note: temperature omitted — deprecated on newer models (sonnet-5 etc.)
        system: system ? [{ type: 'text', text: system }] : undefined,
        messages,
      });
      return res.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      // Retry on rate-limit / overloaded / transient 5xx.
      if (status === 429 || status === 529 || (status >= 500 && status < 600)) {
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Ask a model for JSON and parse it tolerantly (strips ```json fences, grabs the
 * outermost {...} or [...] if there's chatter around it).
 */
async function chatJSON(opts) {
  const raw = await chat(opts);
  return extractJSON(raw);
}

function extractJSON(raw) {
  if (!raw) return null;
  let text = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (_) { /* fall through to bracket-scan */ }

  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch (_) { return null; }
      }
    }
  }
  return null;
}

module.exports = { chat, chatJSON, extractJSON };
