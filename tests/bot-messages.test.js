'use strict';

/**
 * The bot's customer-message catalogue.
 *
 * A missing language here is invisible at runtime: say() falls back, the bot
 * sends something, and the only symptom is a customer reading a language they
 * did not choose. That is precisely how the payment route shipped with no
 * language branch at all while status-notifier had carried he/en all along.
 * Coverage is therefore a build failure, not a review item.
 */

const { MESSAGES, say, LANGS } = require('../src/bot/messages');

describe('catalogue coverage', () => {
  const keys = Object.keys(MESSAGES);

  test('there are messages to check', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  test.each(LANGS)('every key has a %s translation', (lang) => {
    const missing = keys.filter((k) => MESSAGES[k][lang] === undefined);
    expect(missing).toEqual([]);
  });

  test('no key carries a language outside LANGS', () => {
    // A stray 'eng' or 'sp' would sit there looking translated and never be
    // selected, because say() asks for the exact code.
    const strays = [];
    for (const k of keys) {
      for (const l of Object.keys(MESSAGES[k])) {
        if (!LANGS.includes(l)) strays.push(`${k}.${l}`);
      }
    }
    expect(strays).toEqual([]);
  });

  test('a key that interpolates does so in every language', () => {
    // One language a function and another a plain string means the argument is
    // silently dropped for some customers — an order number that vanishes from
    // a confirmation is a support call.
    const mixed = keys.filter((k) => {
      const kinds = new Set(LANGS.map((l) => typeof MESSAGES[k][l]));
      return kinds.size > 1;
    });
    expect(mixed).toEqual([]);
  });

  test('interpolating messages take the same arity everywhere', () => {
    const mismatched = keys.filter((k) => {
      if (typeof MESSAGES[k][LANGS[0]] !== 'function') return false;
      const arities = new Set(LANGS.map((l) => MESSAGES[k][l].length));
      return arities.size > 1;
    });
    expect(mismatched).toEqual([]);
  });
});

describe('say()', () => {
  test('returns the requested language', () => {
    expect(say('status_delivered', 'he')).toMatch(/נמסרה/);
    expect(say('status_delivered', 'en')).toMatch(/delivered/i);
  });

  test('interpolates the order number', () => {
    expect(say('pay_paid_auto', 'en', 4321)).toContain('4321');
    expect(say('pay_paid_auto', 'he', 4321)).toContain('4321');
  });

  test('an unknown language falls back to English, not to Hebrew', () => {
    // The fallback order is the whole point: a customer who reads neither is far
    // better served by English than by Hebrew, and this product is going to the
    // United States.
    const out = say('status_delivered', 'es');
    expect(out).toBe(say('status_delivered', 'en'));
    expect(out).not.toMatch(/[֐-׿]/);
  });

  test('an unknown key throws rather than sending nothing', () => {
    // Silence is indistinguishable from a customer ignoring the message.
    expect(() => say('no_such_key', 'en')).toThrow(/unknown key/);
  });
});
