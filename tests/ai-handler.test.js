'use strict';

// Mock all external services so no real calls are made
jest.mock('../src/services/claude');
jest.mock('../src/services/greenapi');
jest.mock('../src/services/supabase');
jest.mock('../src/services/cardcom');
jest.mock('../src/services/settings');
jest.mock('../src/bot/prompts');

const { stripAction, detectLang, parsePayload } = require('../src/bot/ai-handler');

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
