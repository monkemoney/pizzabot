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
const { zipsOf, resolveLocale, extractPostal } = require('./locale');

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

  // ── Postal code first, where the tenant has configured one ────────────────
  // A US address is street · city · state · ZIP, and the ZIP is the part that
  // actually names a jurisdiction: city-name matching gets "L.A.", "LA" and a
  // customer who writes only a street and a ZIP all wrong, and it cannot tell
  // an address in one city from a neighbouring one whose name is a substring.
  //
  // This branch only exists once a zone declares `zips`. That is deliberate:
  // no tenant has one today, so every existing address resolves through the
  // city path below, exactly as before.
  const withZips = zones.filter((z) => z && zipsOf(z).length);
  if (withZips.length) {
    const code = extractPostal(address, resolveLocale(allSettings));
    if (code) {
      // Most specific first, the same rule the city sort uses: an exact ZIP
      // beats a prefix, so "90401" wins over a zone that claims all of "904".
      const candidates = [];
      for (const z of withZips) {
        for (const zip of zipsOf(z)) {
          if (code === zip || code.startsWith(zip)) candidates.push({ z, len: zip.length });
        }
      }
      if (candidates.length) {
        return candidates.sort((x, y) => y.len - x.len)[0].z;
      }
    }
    // No ZIP, or no zone claims it — fall through to the city match rather than
    // giving up: a half-configured tenant still gets the answer it had before.
  }

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
