'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Rough phonetic Hebrew → Latin map, good enough for unique slug generation
// (not meant to be a linguistically accurate transliteration).
const HEBREW_MAP = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'ch',
  'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n',
  'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'p', 'ף': 'p', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k',
  'ר': 'r', 'ש': 'sh', 'ת': 't',
};

function transliterateHebrew(str) {
  return String(str || '').split('').map((ch) => HEBREW_MAP[ch] ?? ch).join('');
}

function slugify(str) {
  return transliterateHebrew(String(str || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Compute a unique public slug for a tenant and persist it to settings
 * (key='public_slug'). Prefers businessNameEn; falls back to a
 * transliteration of businessNameHe. Appends -2, -3, ... on collision.
 */
async function assignSlug(tenantId, { businessNameEn, businessNameHe } = {}) {
  const base = slugify(businessNameEn) || slugify(businessNameHe) || 'business';
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const { data } = await supabase
      .from('settings')
      .select('tenant_id')
      .eq('key', 'public_slug')
      .eq('value', candidate);
    const taken = (data || []).some((row) => row.tenant_id !== tenantId);
    if (!taken) break;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  await supabase.from('settings').upsert(
    { tenant_id: tenantId, key: 'public_slug', value: candidate, updated_at: new Date().toISOString() },
    { onConflict: 'tenant_id,key' }
  );
  return candidate;
}

async function resolveTenantBySlug(slug) {
  const { data } = await supabase
    .from('settings')
    .select('tenant_id')
    .eq('key', 'public_slug')
    .eq('value', slug)
    .maybeSingle();
  return data ? data.tenant_id : null;
}

module.exports = { slugify, transliterateHebrew, assignSlug, resolveTenantBySlug };
