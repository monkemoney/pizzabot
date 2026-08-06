'use strict';

// Single source of truth for Claude API pricing (USD per token). Was duplicated
// in three places in dashboard-api.js; a rate change had to be made 3× or the
// cost KPIs would silently disagree.

// Per-model rates. Rows with a null/unknown model predate model logging and are
// priced as opus-4-7 (the only model the bot has ever used in production).
const MODEL_PRICES = {
  'claude-opus-4-7': { input: 15 / 1e6, output: 75 / 1e6, cache_read: 1.5 / 1e6, cache_write: 18.75 / 1e6 },
};
const DEFAULT_MODEL = 'claude-opus-4-7';

function ratesFor(model) {
  return MODEL_PRICES[model] || MODEL_PRICES[DEFAULT_MODEL];
}

/**
 * USD cost of one api_usage row (or an aggregated {input,output,cache_read,cache_write}).
 * Accepts either the DB column names (*_tokens) or short keys.
 */
function costOf(row) {
  const P = ratesFor(row.model);
  const inp = row.input_tokens ?? row.input ?? 0;
  const out = row.output_tokens ?? row.output ?? 0;
  const cr = row.cache_read_tokens ?? row.cache_read ?? 0;
  const cw = row.cache_write_tokens ?? row.cache_write ?? 0;
  return inp * P.input + out * P.output + cr * P.cache_read + cw * P.cache_write;
}

module.exports = { MODEL_PRICES, DEFAULT_MODEL, ratesFor, costOf };
