'use strict';

/**
 * phone.test.js
 *
 * The old rule lived twice, character for character, in greenapi.js and
 * meta-whatsapp.js:
 *
 *     if (phone.startsWith('0') && phone.length === 10) phone = '972' + phone.slice(1);
 *
 * It is *safe* for a US number — an area code cannot begin with 0 — but it is
 * not sufficient: a US number arrives as ten bare digits and WhatsApp needs the
 * country code on the front, so an American tenant's messages would have gone
 * to a malformed recipient. These tests pin both halves: Israel is unchanged,
 * and the US case the old rule skipped now works.
 */

const { normalize, display } = require('../src/services/phone');

describe('Israel (the default) is unchanged', () => {
  test('a local number gains the country code', () => {
    expect(normalize('0501234567')).toBe('972501234567');
    expect(normalize('050-123-4567')).toBe('972501234567');
    expect(normalize('050 123 4567')).toBe('972501234567');
  });

  test('an already-international number is left alone', () => {
    expect(normalize('972501234567')).toBe('972501234567');
    expect(normalize('+972-50-123-4567')).toBe('972501234567');
  });

  test('a WhatsApp chat id is stripped', () => {
    expect(normalize('972501234567@c.us')).toBe('972501234567');
  });

  test('empty and junk input do not throw', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null)).toBe(null);
    expect(normalize(undefined)).toBe(undefined);
    expect(normalize('abc')).toBe('');
  });
});

describe('United States', () => {
  test('a bare ten-digit number gains its country code', () => {
    // This is the case the old Israel-only rule fell straight through.
    expect(normalize('3105551234', '1')).toBe('13105551234');
    expect(normalize('(310) 555-1234', '1')).toBe('13105551234');
    expect(normalize('310-555-1234', '1')).toBe('13105551234');
  });

  test('an already-prefixed number is left alone', () => {
    expect(normalize('13105551234', '1')).toBe('13105551234');
    expect(normalize('+1 (310) 555-1234', '1')).toBe('13105551234');
  });

  test('a US number under the Israeli default is not mangled', () => {
    // It gets no country code (the old bug), but it is not corrupted either —
    // which is why this was silent rather than loud.
    expect(normalize('3105551234')).toBe('3105551234');
  });
});

describe('normalisation is stable — the result is also a lookup key', () => {
  test('normalising twice changes nothing', () => {
    for (const [raw, dial] of [['0501234567', '972'], ['3105551234', '1'], ['972501234567', '972']]) {
      const once = normalize(raw, dial);
      expect(normalize(once, dial)).toBe(once);
    }
  });

  test('the same number written differently compares equal', () => {
    const forms = ['(310) 555-1234', '310-555-1234', '3105551234', '+13105551234', '13105551234'];
    const set = new Set(forms.map((f) => normalize(f, '1')));
    expect(set.size).toBe(1);
  });

  test('an unrecognised length is passed through, never invented', () => {
    // call-events.js compares couriers and callers on this output; corrupting
    // an unfamiliar number would make two equal numbers stop matching.
    expect(normalize('44207123456', '1')).toBe('44207123456');
    expect(normalize('12345', '1')).toBe('12345');
  });

  test('an unknown dial code still normalises predictably', () => {
    expect(normalize('020 7123 4567', '44')).toBe('442071234567');
    expect(normalize('442071234567', '44')).toBe('442071234567');
  });
});

describe('display formatting', () => {
  test('US reads the way Americans write it', () => {
    expect(display('3105551234', '1')).toBe('(310) 555-1234');
  });

  test('Israel reads the way Israelis write it', () => {
    expect(display('972501234567', '972')).toBe('050-123-4567');
  });

  test('anything else falls back to plain E.164', () => {
    expect(display('442071234567', '44')).toBe('+442071234567');
    expect(display('')).toBe('');
  });
});
