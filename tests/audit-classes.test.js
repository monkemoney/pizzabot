'use strict';

// The failure-class list as a test: runs on every `npm test` (mandatory before
// every push), so a new instance of a known class fails at write time instead
// of surfacing as the next production incident. See scripts/audit-classes.js.

const { runAudit } = require('../scripts/audit-classes');

test('failure-class audit — no new instances of mechanically-checkable classes', () => {
  const { violations } = runAudit();
  expect(violations).toEqual([]);
});
