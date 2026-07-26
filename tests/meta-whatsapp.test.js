'use strict';

/**
 * meta-whatsapp.test.js
 *
 * The Meta Cloud API is the platform's primary WhatsApp channel.
 * Covers: incoming payload parsing (text / interactive replies / non-message
 * events), the GET verification handshake, and phone normalization.
 */

process.env.META_WA_VERIFY_TOKEN = 'test-verify-token';

const metaWA = require('../src/services/meta-whatsapp');

// ── Payload builders ──────────────────────────────────────────────────────────
function metaBody(message, phoneNumberId = 'PNID-1') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: phoneNumberId },
          messages: message ? [message] : undefined,
        },
      }],
    }],
  };
}

describe('parseIncoming', () => {
  test('plain text message → phone, text, phoneNumberId', () => {
    const out = metaWA.parseIncoming(metaBody({
      from: '972501234567', type: 'text', text: { body: 'שלום' },
    }));
    expect(out).toEqual({ phone: '972501234567', textMessage: 'שלום', phoneNumberId: 'PNID-1', interactiveId: null });
  });

  test('list_reply (topping pick) → "בחרתי: X"', () => {
    const out = metaWA.parseIncoming(metaBody({
      from: '972501234567', type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'topping_2', title: 'זיתים' } },
    }));
    expect(out.textMessage).toBe('בחרתי: זיתים');
  });

  test('list_reply topping_done → title passthrough (no "בחרתי" prefix)', () => {
    const out = metaWA.parseIncoming(metaBody({
      from: '972501234567', type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'topping_done', title: 'ללא תוספות נוספות' } },
    }));
    expect(out.textMessage).toBe('ללא תוספות נוספות');
  });

  test('button_reply → button title as text', () => {
    const out = metaWA.parseIncoming(metaBody({
      from: '972501234567', type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'אישור' } },
    }));
    expect(out.textMessage).toBe('אישור');
  });

  test('status-only webhook (delivery receipts, no messages) → null', () => {
    expect(metaWA.parseIncoming(metaBody(null))).toBeNull();
  });

  test('non-Meta payload (Green API shape) → null', () => {
    expect(metaWA.parseIncoming({ typeWebhook: 'incomingMessageReceived' })).toBeNull();
  });

  test('unsupported message type (image) → null', () => {
    expect(metaWA.parseIncoming(metaBody({
      from: '972501234567', type: 'image', image: { id: 'img1' },
    }))).toBeNull();
  });
});

describe('verifyWebhook (GET handshake)', () => {
  test('returns challenge for correct token', () => {
    expect(metaWA.verifyWebhook({
      'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'ch123',
    })).toBe('ch123');
  });

  test('returns null for wrong token', () => {
    expect(metaWA.verifyWebhook({
      'hub.mode': 'subscribe', 'hub.verify_token': 'WRONG', 'hub.challenge': 'ch123',
    })).toBeNull();
  });

  test('returns null for wrong mode', () => {
    expect(metaWA.verifyWebhook({
      'hub.mode': 'unsubscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'ch123',
    })).toBeNull();
  });
});

describe('formatPhone (Meta E.164, no + / suffix)', () => {
  test.each([
    ['0501234567',        '972501234567'],  // IL local → E.164
    ['972501234567',      '972501234567'],  // already E.164
    ['+972-50-123-4567',  '972501234567'],  // symbols stripped
    ['972501234567@c.us', '972501234567'],  // Green API suffix stripped
    ['12678793889',       '12678793889'],   // US number untouched
  ])('%s → %s', (input, expected) => {
    expect(metaWA.formatPhone(input)).toBe(expected);
  });
});
