'use strict';

/**
 * No Hebrew literal reaches a customer except through the catalogue.
 *
 * The pass that emptied these files found fourteen sites; I reported eleven,
 * because the scan I counted with only looked at one line at a time and every
 * multi-line reply() slipped past it. Then I reported four remaining and two of
 * those were already correct he/en ternaries, because "contains Hebrew" is not
 * the same question as "is monolingual". Both mistakes are the reason this file
 * exists: the check has to be mechanical, and it has to span line breaks.
 *
 * An exemption is a comment, not a line number. `// i18n-exempt: <why>` above
 * the call opts one out — line numbers move, and an allowlist that drifts off
 * its target passes silently, which is the failure this guards against.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** Files that talk to customers. Adding one here is how it gets covered. */
const FILES = [
  'src/bot/ai-handler.js',
  'src/services/order-state.js',
  'src/services/status-notifier.js',
  'src/routes/payment.js',
];

const HEBREW = /[֐-׿]/;

/**
 * Every reply()/sendMessage() call in `src`, with its start offset.
 *
 * Balanced to one level of nesting, which covers `say(...)` and
 * `foo.bar(x)` inside an argument list — the shapes that actually occur here.
 */
function sendCalls(src) {
  const re = /\b(?:reply|sendMessage)\s*\((?:[^()]|\([^()]*\))*\)/gs;
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push({ text: m[0], at: m.index });
  return out;
}

function lineOf(src, offset) {
  return src.slice(0, offset).split('\n').length;
}

/** Is the call preceded (within a few lines) by an explicit exemption? */
function isExempt(src, offset) {
  const before = src.slice(0, offset).split('\n').slice(-6).join('\n');
  return /i18n-exempt/.test(before);
}

describe('customer-facing Hebrew', () => {
  test.each(FILES)('%s sends no bare Hebrew to a customer', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');

    const offenders = sendCalls(src)
      .filter((c) => HEBREW.test(c.text))
      .filter((c) => !isExempt(src, c.at))
      .map((c) => `${rel}:${lineOf(src, c.at)}  ${c.text.replace(/\s+/g, ' ').slice(0, 90)}`);

    expect(offenders).toEqual([]);
  });

  test('the scan actually spans line breaks', () => {
    // The bug that produced three wrong counts, pinned so the guard cannot
    // quietly regress into a single-line matcher.
    const multiline = `
      await reply(phone,
        \`ההזמנה עודכנה\`,
        tid
      );`;
    const found = sendCalls(multiline);
    expect(found).toHaveLength(1);
    expect(HEBREW.test(found[0].text)).toBe(true);
  });

  test('an exemption comment is honoured, and only where it is written', () => {
    const exempt = `
      // i18n-exempt: goes to admins
      await sendMessage(admin.phone, \`שלום\`, tid);`;
    expect(sendCalls(exempt).filter((c) => !isExempt(exempt, c.at))).toHaveLength(0);

    const bare = `      await sendMessage(phone, \`שלום\`, tid);`;
    expect(sendCalls(bare).filter((c) => !isExempt(bare, c.at))).toHaveLength(1);
  });
});
