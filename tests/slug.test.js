'use strict';

/**
 * slug.test.js
 *
 * Public menu URLs (/menu.html?biz=<slug>) hang off these slugs — a broken
 * slug means a dead customer-facing link on every story/bio the business
 * shares. Covers slugify/transliteration and collision-suffix assignment.
 */

// Rows the Supabase mock returns for the collision lookup
const mockSlugRows = [];
const mockUpserts  = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: (col, val) => Object.assign(
            Promise.resolve({ data: mockSlugRows.filter(r => r.value === val), error: null }),
            { maybeSingle: async () => {
                const hit = mockSlugRows.find(r => r.value === val);
                return { data: hit || null, error: null };
              } }
          ),
        }),
      }),
      upsert: async (row) => { mockUpserts.push(row); return { error: null }; },
    }),
  }),
}));

const { slugify, transliterateHebrew, assignSlug, resolveTenantBySlug } = require('../src/services/slug');

beforeEach(() => { mockSlugRows.length = 0; mockUpserts.length = 0; });

describe('slugify', () => {
  test.each([
    ['Pizza Deliveries',   'pizza-deliveries'],
    ['  Pizza   Prime!  ', 'pizza-prime'],
    ['פיצה דליבריס',       'pytzh-dlybrys'],   // Hebrew transliterated, spaces → hyphen
    ['Café 24/7',          'caf-24-7'],        // non-ascii dropped, symbols → hyphen
    ['', ''],
    [null, ''],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  test('never produces leading/trailing/double hyphens', () => {
    const s = slugify('--שלום -- עולם--');
    expect(s).not.toMatch(/^-|-$|--/);
  });
});

describe('transliterateHebrew', () => {
  test('maps final letters like their regular forms', () => {
    expect(transliterateHebrew('םן')).toBe(transliterateHebrew('מנ'));
  });
  test('passes non-Hebrew through unchanged', () => {
    expect(transliterateHebrew('abc 123')).toBe('abc 123');
  });
});

describe('assignSlug', () => {
  test('uses English name when available and persists it', async () => {
    const slug = await assignSlug('tenant-1', { businessNameEn: 'Pizza Prime', businessNameHe: 'פיצה פריים' });
    expect(slug).toBe('pizza-prime');
    expect(mockUpserts[0]).toMatchObject({ tenant_id: 'tenant-1', key: 'public_slug', value: 'pizza-prime' });
  });

  test('falls back to Hebrew transliteration, then to "business"', async () => {
    expect(await assignSlug('t2', { businessNameHe: 'שלום' })).toBe(slugify('שלום'));
    expect(await assignSlug('t3', {})).toBe('business');
  });

  test('collision with ANOTHER tenant → -2 suffix', async () => {
    mockSlugRows.push({ tenant_id: 'other-tenant', key: 'public_slug', value: 'pizza-prime' });
    const slug = await assignSlug('tenant-1', { businessNameEn: 'Pizza Prime' });
    expect(slug).toBe('pizza-prime-2');
  });

  test('re-assigning the SAME tenant keeps its own slug (idempotent, no -2)', async () => {
    mockSlugRows.push({ tenant_id: 'tenant-1', key: 'public_slug', value: 'pizza-prime' });
    const slug = await assignSlug('tenant-1', { businessNameEn: 'Pizza Prime' });
    expect(slug).toBe('pizza-prime');
  });
});

describe('resolveTenantBySlug', () => {
  test('returns tenant_id for a known slug, null for unknown', async () => {
    mockSlugRows.push({ tenant_id: 'tenant-9', key: 'public_slug', value: 'pizza-nine' });
    expect(await resolveTenantBySlug('pizza-nine')).toBe('tenant-9');
    expect(await resolveTenantBySlug('nope')).toBeNull();
  });
});
