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

describe('no language decision is keyed on English', () => {
  const FILES = [
    'src/index.js',
    'public/i18n.js',
    'public/landing.html',
    'public/menu.html',
    'public/onboarding.html',
    'public/dashboard.html',
    'public/admin.html',
    // The two files the locale instance actually lived in. Absent from this
    // list, the guard passed while the defect was present — a checklist that
    // does not cover the place the bug was found is not a guard.
    'public/app.js',
    'public/admin.js',
  ];

  // Direction was the first instance; the date locale was the second, written
  // `LANG === 'en' ? 'en-US' : 'he-IL'` so Spanish would have been formatted as
  // Israeli. The defect is the SHAPE, not the values: a two-valued decision
  // keyed on English silently lumps every third language in with Hebrew. Keyed
  // on Hebrew instead, the same line degrades the safe way.
  const DECIDES    = /\?\s*'(?:rtl|ltr|[a-z]{2}-[A-Z]{2})'|'(?:rtl|ltr|[a-z]{2}-[A-Z]{2})'\s*:/;
  // Closing parens are allowed between the comparison and the `?`: the real
  // instance read `(typeof LANG !== 'undefined' && LANG === 'en') ? …`, and a
  // pattern demanding them adjacent watched the mutation walk straight past.
  const KEYS_ON_EN = /(?:===|!==)\s*'en'[\s)]*\?/;

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
