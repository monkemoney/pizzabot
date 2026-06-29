# Design Brief — Jasell Dashboard System

## What We're Building
A unified visual redesign of the Jasell platform UI — business dashboard (`dashboard.html`), vendor portal (`admin.html`), and shared components. The goal is to make all three surfaces feel like one product, not three separate apps.

## Who Uses It
- **Business owner / manager** — uses `dashboard.html` daily: orders, products, settings. Stressed, time-pressured, needs clarity at a glance.
- **Platform vendor (Jasell owner)** — uses `admin.html` occasionally: client management, cost tracking, alerts. Needs confidence and professionalism.
- **Customers** — see `menu.html`. Out of scope for this brief.

## The Problem
1. **Emojis everywhere in UI** — 💳🔴🤖✅❌ used as status indicators, icons, feedback. Looks playful, not professional.
2. **Inconsistency** — `dashboard.html` and `admin.html` share the same brand colors but feel like different products.
3. **No icon system** — visual communication relies on emoji, text, and ad-hoc unicode characters (↻, ✕).

## What Success Looks Like
- Open any page and immediately know it's Jasell — same spacing, same component patterns, same icon language.
- Zero emoji in UI chrome (badges, buttons, status, alerts). Emojis only in WhatsApp message content.
- A developer can build a new feature and naturally stay on-brand using existing tokens.

## Aesthetic Philosophy: Confident SaaS
- **Reference:** Linear, Notion, Vercel — clean, purposeful, with personality.
- **Not:** Enterprise gray (Salesforce), dark/gaming, childlike.
- **Emotion:** calm authority. The user feels in control.
- **Warmth:** Israeli product — not cold Scandinavian. The purple brand (#5e17eb) stays.

## Hard Constraints
- RTL (Hebrew) — all layouts must work right-to-left.
- Mobile responsive — dashboard has burger menu + order cards; vendor portal has bottom nav.
- No framework change — plain HTML + CSS + vanilla JS. No React, no Tailwind.
- No dark mode (token-ready structure, but no implementation now).
- WhatsApp message strings keep their emojis — only UI chrome is cleaned.

## Existing Tokens (to extend, not replace)
```css
--primary:      #5e17eb
--primary-dark: #4a0fd4
--primary-soft: #ede8fd
--accent:       #ff66c4
--bg:           #eeede9
--white:        #ffffff
--text:         #1a1028
--text-muted:   #7a6f8a
--border:       #e8e3f2
--radius:       18px
Font: Poppins 400–800
```

## Icon System Decision
Replace all UI emojis with **Lucide Icons** (inline SVG, `currentColor`, `stroke-width: 1.75`).

| Was | Becomes | Usage |
|-----|---------|-------|
| 💳 | `<CreditCard>` | זיכוי ידני badge |
| ✅ | `<CheckCircle>` | הצלחה / toast |
| ❌ | `<XCircle>` | שגיאה |
| ⚠️ | `<AlertTriangle>` | אזהרה |
| 🔴 | `<AlertCircle>` | שגיאת שרת |
| 🤖 | `<Bot>` | שגיאת בוט |
| 🔄 | `<RotateCw>` | אתחול שרת |
| ↻  | `<RefreshCw>` | רענן |
| ✕  | `<X>` | סגור |

## Scope
1. **Token system** — extend existing CSS variables with semantic tokens (status colors, icon sizes, shadow scale)
2. **Icon system** — inline SVG constants replacing all UI emojis
3. **dashboard.html + app.js** — apply tokens + icons
4. **admin.html + admin.js** — apply tokens + icons
5. Cross-surface consistency check

## Out of Scope
- `menu.html` (customer-facing, different audience)
- WhatsApp message content
- Backend changes
