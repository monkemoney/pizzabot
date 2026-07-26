'use strict';

// Central config for the bot-training network.
// Everything here can be overridden via env vars so a run can be tuned without code edits.

require('dotenv').config();

module.exports = {
  // The bot UNDER TEST — must match production so we exercise the real thing.
  // (production callClaude() uses this model; see src/services/claude.js)
  BOT_MODEL: process.env.SIM_BOT_MODEL || 'claude-opus-4-7',

  // Cheaper/faster model for the simulated customers.
  SIM_MODEL: process.env.SIM_CUSTOMER_MODEL || 'claude-sonnet-5',

  // The judge — needs to be reliable, so a strong model.
  JUDGE_MODEL: process.env.SIM_JUDGE_MODEL || 'claude-sonnet-5',

  // The improver synthesizes lessons across a whole batch — run once per batch, so use the best.
  IMPROVE_MODEL: process.env.SIM_IMPROVE_MODEL || 'claude-opus-4-8',

  // Tenant to simulate against (defaults to the pizza-bot default tenant).
  TENANT_ID: process.env.TENANT_ID || 'aaaaaaaa-0000-0000-0000-000000000001',

  // Safety limits for a single simulated conversation.
  MAX_TURNS: Number(process.env.SIM_MAX_TURNS || 14),      // max customer<->bot exchanges
  MAX_HISTORY_MESSAGES: 40,                                 // mirror production trimming

  // How many conversations to run per invocation and how many in parallel.
  DEFAULT_RUNS: Number(process.env.SIM_RUNS || 12),
  CONCURRENCY: Number(process.env.SIM_CONCURRENCY || 4),

  // Where accumulated "seniority" lives.
  paths: {
    knowledge: __dirname + '/knowledge',
    lessons:   __dirname + '/knowledge/lessons.md',
    examples:  __dirname + '/knowledge/examples.jsonl',
    dataset:   __dirname + '/knowledge/dataset.jsonl',
    reports:   __dirname + '/reports',
  },
};
