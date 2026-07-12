# Design Review — Jasell Platform (Full Makeover Assessment)

Reviewed against: DESIGN_BRIEF.md (Confident SaaS — Linear/Notion/Vercel)
Date: 2026-07-12
Scope: login, dashboard (orders/products/customers/stats/settings/inbox/kitchen), vendor portal, public menu — desktop + mobile

## Summary

The token system and Lucide icon migration from the previous pass hold up well — the platform is consistent in color and spacing. But it reads "friendly startup MVP," not "professional SaaS platform." Three root causes: (1) **the pill-everything geometry** — every button, card, badge, and input uses very large radii (18px+ / full pills), which reads playful/childlike at scale; (2) **no data-density discipline** — screens built for operators (orders, kitchen, inbox) use the same airy card layout as marketing surfaces, wasting space and slowing scanning; (3) **residual emoji and placeholder-grade content** (product categories use emoji as icons; empty charts render axes with no empty-state).

## Screen-by-Screen

### Login
- Purpose: gateway; sets the first impression of professionalism.
- Found: floating white card on beige, pill inputs, `admin / manager` placeholder leaks internal role names. English-only placeholder in RTL form. No password-visibility toggle, no error state styling seen.

### Orders (main work surface)
- Purpose: the operator's cockpit — highest-frequency screen, scan-and-act.
- Found: six enormous KPI tiles consume the entire first viewport; the actual orders list starts below the fold. Filters take a full-width card. Order rows are generous cards, ~80px each. Status colors are pastel chips.
- Verdict: hierarchy inverted — KPIs (glanceable, secondary) dominate; orders (actionable, primary) are buried.

### Kitchen
- Purpose: heads-down environment, greasy hands, distance viewing. Needs max font, max contrast, zero chrome.
- Found: white cards on beige with default-size text, thin green edge accent, order number is large but items are small; no elapsed-time indicator, no "מוכן" button visible on cards (mobile), sidebar still present on desktop (wasted 300px).

### Inbox (new)
- Purpose: human takeover of bot conversations; a mini-helpdesk.
- Found: functional on desktop but visually unfinished — raw phone numbers as titles, no avatars/initials, no timestamps, agent badge is orange (off-palette). **Broken on mobile** — split-pane squeezes into a sliver ("בחר שיחה" column ~90px wide).

### Products
- Purpose: catalog management, occasional use.
- Found: category rows use emoji (🍕🍝🥗🥤🧀) as icons — direct violation of the brief. Lavender row background differs from every other list surface in the app.

### Stats
- Purpose: insight; occasional, reflective use.
- Found: empty charts render bare axes (0–1) with no empty state. KPI cards use 4 different accent colors with no semantic meaning. Period filter pills fine.

### Settings
- Purpose: infrequent configuration; needs findability.
- Found: one long scroll of cards; no section nav/anchors. Works but tedious.

### Customers
- **Bug found during review:** `column customers.tenant_id does not exist` — the customers VIEW was never rebuilt with tenant_id. Page is dead.

### Vendor portal
- Purpose: platform-owner confidence; the "investor demo" surface.
- Found: strongest screen in the product — dark aubergine sidebar + clean tables reads professional. Tenant column truncates UUIDs meaninglessly ("aaaaaaaa…"). Should be the design north star for the rest.

### Public menu
- Purpose: customer-facing storefront; appetite appeal + conversion to WhatsApp.
- Found: purple→pink dotted hero feels like a party invite, not a restaurant. Emoji pizza slice as hero image and as product-image fallback. Product cards strong otherwise. CTA bar good.

## Must Fix
1. **Customers page dead** — recreate `customers` VIEW with `tenant_id`.
2. **Inbox mobile layout** — stack panes (list → thread as two screens with back button).
3. **Emoji as UI icons** in products categories + menu fallback images (brief violation).

## Should Fix (the makeover core)
4. Radius scale: 18px → tiered (6/10/14). Kill full-pill buttons except tags.
5. Orders: KPI strip (one row, compact) + dense table rows (~48px), status as small dot+label, not pastel pills.
6. Kitchen: dedicated fullscreen mode, 2× font scale, elapsed-time timer per card, giant tap-target "מוכן" button, dark high-contrast option.
7. Inbox: avatars with initials, customer name resolution, timestamps, WhatsApp-green bubble for customer / brand for agent, unread dot.
8. Empty states everywhere (charts, lists): icon + one line + action.
9. Login: neutral placeholder, error styling, brand moment (gradient panel or logo animation).
10. Stats: single accent color + semantic red/green only for deltas.

## Could Improve
11. Settings: sticky section side-nav (anchors).
12. Vendor tenant column: business name + copy-on-click for UUID.
13. Public menu hero: food-photography or solid brand panel instead of dotted gradient; real product images.
14. Typography: Poppins for Latin is fine but Hebrew falls back to system — consider Heebo/Assistant pairing for a sharper Hebrew voice.

## What Works Well
- Token discipline (tokens.css) — makeover is cheap because of it.
- Lucide icon language in chrome.
- Vendor portal layout and dark sidebar.
- Public menu product cards + sticky WhatsApp CTA.
- Mobile bottom-nav pattern on dashboard.
