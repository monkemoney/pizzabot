'use strict';

// Runs the REAL order bot's brain in isolation: the real system prompt
// (real menu + settings from Supabase, read-only) + the real model, but with an
// in-memory conversation so nothing touches WhatsApp, orders, or customer records.
//
// This deliberately mirrors src/services/claude.js#callClaude and the action
// grammar in src/bot/ai-handler.js so we test what production actually does.

const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('../../src/bot/prompts');
const { BOT_MODEL, MAX_HISTORY_MESSAGES, TENANT_ID } = require('../config');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Same grammar the production handler parses.
const ACTION_RE = /<!--ACTION:(CREATE_PAYMENT|SAVE_ORDER|RESET|SHOW_TOPPINGS)(?::(\{[\s\S]*?\}))?-->/;
const TERMINAL_ACTIONS = new Set(['CREATE_PAYMENT', 'SAVE_ORDER']);

function stripAction(text) {
  return text.replace(ACTION_RE, '').trim();
}

function parsePayload(jsonStr) {
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch (_) { return null; }
}

/**
 * A stateful order-bot session for one simulated conversation.
 * Reuses ONE cached system prompt for the whole conversation (menu/settings are
 * stable within a run), which also mirrors prod's prompt-cache behavior.
 */
class OrderBotSession {
  /**
   * @param {object} [opts]
   * @param {string} [opts.lessons]  extra "seniority" block appended to the system prompt (A/B)
   * @param {string} [opts.tenantId]
   */
  constructor(opts = {}) {
    this.tenantId = opts.tenantId || TENANT_ID;
    this.lessons = opts.lessons || '';
    this.history = [];          // [{role:'user'|'assistant', content}]
    this.systemPrompt = null;
    this.latencies = [];        // ms per model call — lets evals compare bot models
  }

  async init() {
    let base = await buildSystemPrompt(null, this.tenantId);
    if (this.lessons && this.lessons.trim()) {
      base += `\n\n══════════════════════════════════════════\n` +
        `לקחים שנצברו מאימון (עדיפות גבוהה — פעל לפיהם)\n` +
        `══════════════════════════════════════════\n${this.lessons.trim()}\n`;
    }
    this.systemPrompt = base;
    return this;
  }

  /**
   * Feed one customer message, get the bot's reply.
   * @returns {Promise<{raw:string, text:string, action:?{type:string,payload:?object}}>}
   */
  async send(customerMessage) {
    if (!this.systemPrompt) await this.init();

    const trimmed = this.history.slice(-MAX_HISTORY_MESSAGES);
    const messages = [...trimmed, { role: 'user', content: customerMessage }];

    const t0 = Date.now();
    const res = await client.messages.create({
      model: BOT_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: this.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    });
    this.latencies.push(Date.now() - t0);
    const raw = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

    // Commit to history exactly like production does (raw text, action markers included).
    this.history.push({ role: 'user', content: customerMessage });
    this.history.push({ role: 'assistant', content: raw });

    const m = raw.match(ACTION_RE);
    const action = m ? { type: m[1], payload: parsePayload(m[2]) } : null;
    return { raw, text: stripAction(raw), action };
  }
}

module.exports = { OrderBotSession, stripAction, parsePayload, ACTION_RE, TERMINAL_ACTIONS };
