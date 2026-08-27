'use strict';

/**
 * Resolve the delivery fee for an address from the tenant's configured zones.
 *
 * The fee was never recorded on the order, and every surface that needed it —
 * the expanded order row, the edit modal, the printed receipt — fell back to a
 * literal 30. Since `orders.delivery_fee` did not exist, the fallback was the
 * only branch that ever ran: a tenant charging 25 or 40 printed ₪30 on every
 * receipt, which is a tax document with a wrong number on it.
 *
 * Recording the fee at order time also means later edits to the zone table
 * cannot rewrite the past.
 */

const settings = require('./settings');

/** Cheap Hebrew/Latin normalisation for city comparison. */
function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/["'`־–—]/g, '').replace(/\s+/g, ' ');
}

/**
 * The configured zone whose city appears in `address`, or null.
 *
 * Split out of feeForAddress because the fee stopped being the only thing a
 * zone decides: in an exclusive-tax region the RATE is a fact about the
 * delivery address too (City of Los Angeles 9.5%, Santa Monica 10.25%), and
 * both answers have to come from the same match — a fee resolved from one zone
 * and a tax resolved from another would be two authorities on one address.
 *
 * @param {string} address     free-text address; the city is matched inside it
 * @param {object} allSettings already-loaded settings (avoids a second fetch)
 * @returns {object|null}      the matched zone row
 */
function zoneForAddress(address, allSettings = {}) {
  const zones = Array.isArray(allSettings.delivery_zones) ? allSettings.delivery_zones : [];
  const a = norm(address);
  if (!a || !zones.length) return null;

  // Longest city name first, so "תל אביב יפו" wins over "תל אביב" — and, for
  // exactly the same reason, "West Hollywood" over "Hollywood".
  const sorted = [...zones]
    .filter((z) => z && z.city)
    .sort((x, y) => norm(y.city).length - norm(x.city).length);
  return sorted.find((z) => a.includes(norm(z.city))) || null;
}

/**
 * @param {string} address    free-text address; the city is matched inside it
 * @param {object} allSettings already-loaded settings (avoids a second fetch)
 * @returns {number|null}     the fee, or null when it cannot be determined
 */
function feeForAddress(address, allSettings = {}) {
  const zone = zoneForAddress(address, allSettings);
  if (zone) {
    const fee = zone.fee ?? allSettings.delivery_price;
    return fee == null ? null : Number(fee);
  }

  // No zone matched: a flat configured price is still better than a guess.
  const flat = allSettings.delivery_price;
  return flat == null ? null : Number(flat);
}

/** Same, fetching settings itself. Returns null when nothing is configured. */
async function resolveDeliveryFee(address, tenantId) {
  try {
    const all = await settings.loadAll(tenantId);
    return feeForAddress(address, all);
  } catch {
    return null;
  }
}

module.exports = { zoneForAddress, feeForAddress, resolveDeliveryFee };
