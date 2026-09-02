'use strict';

/**
 * Writing direction, and the shape of the rule that decides it.
 *
 * The dashboard had `LANG === 'en' ? 'ltr' : 'rtl'` while the server and the
 * landing page had `lang === 'he' ? 'rtl' : 'ltr'`. Both are correct while
 * there are exactly two languages, and they disagree the instant there is a
 * third: Spanish is not 'en', so the dashboard would have laid itself out
 * right-to-left in Spanish — silently, because nothing renders these files in a
 * test and nothing asserts direction.
 *
 * RTL is a property of the SCRIPT, not of "which language is not English".
 * Stated that way the rule survives a fourth language; stated the other way it
 * breaks on the third. This file pins both the behaviour and the shape.
 *
 * No jsdom in this repo, so dirFor is lifted out of the source and evaluated
 * rather than loaded — which has the side benefit of testing the file that
 * actually ships rather than a copy of the rule.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('dirFor', () => {
  const src = read('public/i18n.js');
  const m = src.match(/function dirFor\(lang\)\s*\{[^}]*\}/);

  test('is defined in public/i18n.js', () => {
    expect(m).not.toBeNull();
  });

  const dirFor = new Function(`${m[0]}; return dirFor;`)();

  test('Hebrew is right-to-left', () => {
    expect(dirFor('he')).toBe('rtl');
  });

  test('English and Spanish are left-to-right', () => {
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('es')).toBe('ltr');
  });

  test('an unknown language is left-to-right, not right-to-left', () => {
    // A language nobody has added yet is far more likely to be LTR, and an
    // unexpectedly mirrored page is a much worse failure than an unmirrored one.
    for (const l of ['fr', 'pt', '', undefined, null]) {
      expect(dirFor(l)).toBe('ltr');
    }
  });
});

describe('the direction rule is stated the same way everywhere', () => {
  const FILES = [
    'src/index.js',
    'public/i18n.js',
    'public/landing.html',
    'public/menu.html',
    'public/onboarding.html',
    'public/dashboard.html',
    'public/admin.html',
  ];

  // A line that decides direction must key on Hebrew. Keying on English is the
  // exact defect this file exists for: it silently mirrors every language that
  // is neither.
  const DECIDES = /\?\s*'(?:rtl|ltr)'|'(?:rtl|ltr)'\s*:/;
  const KEYS_ON_EN = /===\s*'en'\s*\?\s*'ltr'|!==\s*'he'\s*\?\s*'ltr'/;

  test.each(FILES)('%s keys on Hebrew, never on English', (rel) => {
    const offenders = read(rel)
      .split('\n')
      .map((line, i) => [i + 1, line])
      // strip comments — the explanation of the old bug quotes it verbatim
      .filter(([, l]) => !/^\s*(\/\/|\*|<!--)/.test(l))
      .filter(([, l]) => DECIDES.test(l) && KEYS_ON_EN.test(l))
      .map(([n, l]) => `${rel}:${n}  ${l.trim()}`);

    expect(offenders).toEqual([]);
  });
});
