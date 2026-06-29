# Information Architecture — Jasell Dashboard System

## Surface 1: Business Dashboard (`dashboard.html`)

### Navigation
- Desktop: fixed right sidebar (240px), `showTab(name)` pattern
- Mobile: bottom nav (5 buttons) + burger menu

### Pages
| Tab | Access | Content |
|-----|--------|---------|
| הזמנות | all | status cards, filter bar, order table, expandable rows |
| מוצרים | admin | categories + products CRUD, image upload, topping toggles |
| לקוחות | admin | stats grid, search, customer table, broadcast modal |
| הגדרות | admin | business settings, admin users, courier config |
| סטטיסטיקות | admin | KPI cards, 7 Chart.js charts, period picker |

### IA Issues Found
- None structural — tabs are correctly ordered by frequency of use

---

## Surface 2: Vendor Portal (`admin.html`)

### Navigation
- Desktop: fixed right sidebar (240px), `showPage(name)` pattern
- Mobile: bottom nav (4 buttons)

### Pages
| Page | Content |
|------|---------|
| סקירה | KPI cards, recent clients, Claude API cost table |
| לקוחות | search input, CRUD table with monthly cost, add modal |
| התראות | alert settings card + monitoring info card |

---

## Shared Patterns (must be consistent across both surfaces)
- Sidebar: logo + role badge + nav items + logout footer
- Cards: white background, 18px radius, subtle shadow
- Tables: sticky header, hover row, right-aligned text
- Modals: overlay + centered box, header/body/footer zones
- Toasts: bottom-center, 2.5s auto-dismiss
- Buttons: primary (filled), ghost (outline), danger (red outline), sm variant
- Badges: status pills (active/trial/inactive, new/preparing/delivered...)

## Navigation Consistency Gap
`showTab()` (dashboard) vs `showPage()` (vendor) — different function names, same pattern. Not a user-facing problem but should be noted for future unification.

## Mobile Navigation Consistency Gap
Both surfaces have a bottom nav but with different button counts (5 vs 4) and different icon sizing. Tokens will unify the bottom nav component.
