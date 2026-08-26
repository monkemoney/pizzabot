'use strict';

/**
 * Phone normalisation to the digits WhatsApp wants (E.164 without the '+').
 *
 * This logic existed twice, character for character, in greenapi.js and
 * meta-whatsapp.js — and both copies were Israel-only:
 *
 *     if (phone.startsWith('0') && phone.length === 10) phone = '972' + phone.slice(1);
 *
 * That rule is safe for a US number (an area code cannot start with 0 or 1, so
 * it falls through untouched) but it is not *sufficient*: a US number arrives as
 * ten bare digits and WhatsApp needs the country code on the front. So an
 * American tenant's messages would have gone to a malformed recipient.
 *
 * The dial code defaults to Israel so every existing call behaves exactly as it
 * did; the send paths pass the tenant's.
 *
 * ⚠️ The result is used as a COMPARISON KEY as well as a destination (matching a
 * caller against couriers and admins in call-events.js). Callers comparing two
 * numbers must normalise both with the SAME dial code, or equal numbers stop
 * looking equal.
 */

const DEFAULT_DIAL = '972';

// Digits after the country code, per dial code. Used to recognise a bare
// national number that needs the country code prepended.
const NATIONAL_LEN = {
  972: 9,    // Israel: 50-123-4567 written locally as 050-123-4567
  1: 10,     // NANP: 310-555-1234
};

/**
 * @param {string} raw        anything: '050-123-4567', '+1 (310) 555-1234',
 *                            '972501234567@c.us'
 * @param {string} dialCode   the tenant's country code, digits only
 * @returns {string}          digits only, country code included
 */
function normalize(raw, dialCode = DEFAULT_DIAL) {
  if (!raw) return raw;
  const dial = String(dialCode || DEFAULT_DIAL).replace(/\D/g, '') || DEFAULT_DIAL;
  const nat  = NATIONAL_LEN[dial] ?? null;

  const digits = String(raw).split('@')[0].trim().replace(/\D/g, '');
  if (!digits) return digits;

  // Already carries this country code.
  if (digits.startsWith(dial) && (nat == null || digits.length > nat)) return digits;

  // National trunk prefix ('0' in Israel and most of Europe).
  if (digits.startsWith('0')) return dial + digits.slice(1);

  // A bare national number — the US case the old rule silently skipped.
  if (nat != null && digits.length === nat) return dial + digits;

  // Anything else is assumed to already be international; never mangle a number
  // we do not recognise, because the result is also a lookup key.
  return digits;
}

/** Human-readable, for display only — never for storage or comparison. */
function display(raw, dialCode = DEFAULT_DIAL) {
  const digits = normalize(raw, dialCode);
  if (!digits) return '';
  const dial = String(dialCode || DEFAULT_DIAL).replace(/\D/g, '') || DEFAULT_DIAL;
  const rest = digits.startsWith(dial) ? digits.slice(dial.length) : digits;

  if (dial === '1' && rest.length === 10) {
    return `(${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`;
  }
  if (dial === '972' && rest.length === 9) {
    return `0${rest.slice(0, 2)}-${rest.slice(2, 5)}-${rest.slice(5)}`;
  }
  return `+${digits}`;
}

module.exports = { normalize, display, DEFAULT_DIAL, NATIONAL_LEN };
