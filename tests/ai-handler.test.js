'use strict';

// Mock all external services so no real calls are made
jest.mock('../src/services/claude');
jest.mock('../src/services/greenapi');
jest.mock('../src/services/supabase');
jest.mock('../src/services/cardcom');
jest.mock('../src/services/settings');
jest.mock('../src/bot/prompts');

const { stripAction, detectLang, resolveLang, parsePayload } = require('../src/bot/ai-handler');

describe('stripAction', () => {
  test('removes RESET action', () => {
    expect(stripAction('שלום! <!--ACTION:RESET-->')).toBe('שלום!');
  });

  test('removes SHOW_TOPPINGS action', () => {
    expect(stripAction('בחר תוספות <!--ACTION:SHOW_TOPPINGS-->')).toBe('בחר תוספות');
  });

  test('removes SAVE_ORDER action with JSON payload', () => {
    const text = 'תודה! <!--ACTION:SAVE_ORDER:{"total":50}-->';
    expect(stripAction(text)).toBe('תודה!');
  });

  test('removes CREATE_PAYMENT action', () => {
    const text = 'לתשלום <!--ACTION:CREATE_PAYMENT:{"total":80}-->';
    expect(stripAction(text)).toBe('לתשלום');
  });

  test('returns text unchanged when no action present', () => {
    expect(stripAction('שלום, מה תרצה להזמין?')).toBe('שלום, מה תרצה להזמין?');
  });

  test('regression: pizza with toppings in same message (the bug)', () => {
    // This should clean text without corrupting it
    const text = 'מעולה! <!--ACTION:SHOW_TOPPINGS-->בחרת פיצה';
    const result = stripAction(text);
    expect(result).not.toContain('<!--ACTION:');
  });
});

describe('detectLang', () => {
  test('detects Hebrew from Hebrew text', () => {
    expect(detectLang('אני רוצה פיצה', [])).toBe('he');
  });

  test('detects English when mostly English', () => {
    expect(detectLang('I want to order a large pizza please', [])).toBe('en');
  });

  test('defaults to Hebrew on empty/neutral text', () => {
    expect(detectLang('', [])).toBe('he');
    expect(detectLang('123', [])).toBe('he');
  });

  test('considers history in detection', () => {
    const history = [
      { role: 'user', content: 'שלום אני רוצה לקנות' },
      { role: 'assistant', content: 'ברוך הבא! מה תרצה?' },
    ];
    expect(detectLang('pizza', history)).toBe('he');
  });
});

describe('parsePayload', () => {
  test('parses valid JSON', () => {
    const result = parsePayload('{"total":50,"items":[]}');
    expect(result).toEqual({ total: 50, items: [] });
  });

  test('returns null on invalid JSON', () => {
    expect(parsePayload('not json at all')).toBeNull();
  });

  test('returns null on undefined input', () => {
    expect(parsePayload(undefined)).toBeNull();
  });

  test('parses full order payload', () => {
    const payload = JSON.stringify({
      customer_name: 'ישראל',
      total: 120,
      delivery_method: 'delivery',
      address: 'תל אביב',
      items: [{ name: 'פיצה', qty: 1, price: 60 }],
    });
    const result = parsePayload(payload);
    expect(result.customer_name).toBe('ישראל');
    expect(result.total).toBe(120);
  });
});

/**
 * resolveLang — the customer's language, sticky across resets.
 *
 * detectLang() alone is recomputed per message from a history the 3h
 * stale-session guard wipes, so an English customer answering "ok" or a house
 * number scored as Hebrew. sessions.language is the durable answer — it existed
 * from the first schema but was only ever WRITTEN as 'he', and clearSession
 * reset it to 'he' every few hours, so the one place that read it (the
 * after-hours reply) always spoke Hebrew.
 */
describe('resolveLang', () => {
  const en = { language: 'en' };
  const he = { language: 'he' };

  test('a clear signal sets the language', () => {
    expect(resolveLang('I would like a large pizza please', [], null)).toBe('en');
    expect(resolveLang('אני רוצה פיצה משפחתית בבקשה', [], null)).toBe('he');
  });

  test('an ambiguous reply keeps what we already know', () => {
    // This is the whole point: these used to score as Hebrew and flip the
    // customer mid-conversation.
    for (const msg of ['ok', '👍', '12', '3', '']) {
      expect(resolveLang(msg, [], en)).toBe('en');
      expect(resolveLang(msg, [], he)).toBe('he');
    }
  });

  test('a mixed message does not flip an established language', () => {
    expect(resolveLang('אוקיי thanks', [], en)).toBe('en');
    expect(resolveLang('ok תודה', [], he)).toBe('he');
  });

  test('a genuine switch is still honoured', () => {
    expect(resolveLang('Actually can I change my order to a small one', [], he)).toBe('en');
    expect(resolveLang('רגע, אני רוצה לשנות את ההזמנה שלי לקטנה', [], en)).toBe('he');
  });

  test('no stored language and no signal defaults to Hebrew', () => {
    expect(resolveLang('', [], null)).toBe('he');
    expect(resolveLang('7', [], {})).toBe('he');
  });

  test('history counts toward the decision', () => {
    const history = [
      { role: 'user', content: 'Hi, do you deliver to Santa Monica?' },
      { role: 'assistant', content: 'Yes we do!' },
    ];
    expect(resolveLang('ok', history, null)).toBe('en');
  });
});
