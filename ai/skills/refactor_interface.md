# Interface Refactor — Design System & Rationale

## Overview

Complete frontend rewrite of GuimFinancial. All data logic (Supabase queries, state,
hooks, event handlers) was preserved verbatim. Only the presentation layer changed.

---

## Design Principles

1. **Numbers are the hero.** Financial figures (balances, amounts, percentages) dominate
   visual weight. Surrounding chrome is intentionally quiet.
2. **Minimalist dark.** Background is nearly black. Cards introduce the first level of
   depth. No gradients on text. No heavy glass-morphism.
3. **Consistent component grammar.** Every interactive surface uses the same border,
   radius, and hover model. Nothing special-cased.
4. **Informative at a glance.** Data density is high but scannable — eyebrow labels,
   monospaced numbers, clear color coding for income/expense/investment.
5. **Optimised for touch and pointer.** Bottom bar on mobile, sidebar on desktop. FAB
   opens an action sheet. All hit targets ≥ 44 px.

---

## Color Tokens (`globals.css`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#080E18` | Page background |
| `--surface` | `#0D1525` | Default card / panel |
| `--surface-2` | `#131E30` | Elevated card, modals |
| `--surface-3` | `#1A2638` | Input backgrounds, hover |
| `--border` | `rgba(255,255,255,0.055)` | Default 1 px borders |
| `--border-bright` | `rgba(255,255,255,0.10)` | Focused / prominent borders |
| `--accent` | `#4F8EFF` | Primary action, links, active tab |
| `--accent-dim` | `rgba(79,142,255,0.12)` | Accent tint backgrounds |
| `--green` | `#34D399` | Income, positive delta |
| `--red` | `#F87171` | Expense, negative delta |
| `--amber` | `#FBBF24` | Warning, overdue |
| `--purple` | `#A78BFA` | Investments |
| `--text-1` | `#EDF3FC` | Primary text |
| `--text-2` | `#8BA3BE` | Secondary / labels |
| `--text-3` | `#4A6278` | Muted / metadata |

---

## Typography

- **Body:** Manrope (`--font-body`) — clean geometric sans
- **Display / large figures:** Sora (`--font-display`) — for balance numbers and headings
- **Numbers:** `tabular-nums` on all financial figures for vertical alignment
- **Eyebrow labels:** 10–11 px, uppercase, letter-spacing 0.16–0.22em, `--text-3`
- **Section headers:** 13 px semibold, `--text-2`
- **Large balance:** `clamp(2rem, 5vw, 3rem)`, Sora, `--text-1`

---

## Component Patterns

### Cards
```
border-radius: 16px (rounded-2xl)
border: 1px solid var(--border)
background: var(--surface)
padding: 20–24px
```
Elevated cards use `--surface-2`. Inner sub-cards use `--surface-3`.

### Inputs / Selects
```
border-radius: 10px (rounded-xl)
border: 1px solid var(--border-bright)
background: var(--surface-3)
color: var(--text-1)
focus: border-color var(--accent), ring rgba(79,142,255,0.18)
```

### Buttons
- **Primary:** `--accent` bg, white text, `rounded-full`
- **Secondary:** `--surface-3` bg, `--text-2` text, `--border-bright` border
- **Ghost:** transparent bg, `--text-2` text, hover `--surface-3`
- **Destructive:** `rgba(248,113,113,0.12)` bg, `--red` text

### Navigation
- **Mobile:** Fixed bottom bar — `--surface`, `--border-bright` top border, 60 px tall.
  Active tab: `--accent` icon + label, no background highlight. Inactive: `--text-3`.
  FAB: centered `--accent` circle, `+` icon.
- **Desktop (lg+):** Fixed left sidebar — 64 px wide collapsed. Contains icon nav + FAB at
  bottom. Expands to 200 px on hover with labels. Content has `pl-20 lg:pl-[72px]`.

### Modals
```
backdrop: rgba(4,8,16,0.72) + blur(12px)
panel: --surface-2, rounded-2xl, border --border-bright
```
Mobile: slides up from bottom as a sheet (max-h-[92dvh], rounded-t-2xl).
Desktop: centered dialog (max-w-lg).

---

## Screen-by-Screen Changes

### Home
- Balance hero with eye toggle — full width, prominent
- 3-col stat strip: Income / Expenses / Net
- Daily flow bar chart (Recharts ComposedChart) — same data, new palette
- Category pie — same Recharts Pie, accent color palette
- Account rows — bank badge + name + balance, cleaner row
- Card statement rows — status badge (open/closed/overdue), due date, amount

### Transactions
- Month selector as a horizontal scroll pill strip
- Filter tabs (All / Income / Expense) — pill style
- Transaction rows via `TransactionRow` component — redesigned
- Running net shown in header

### Investments
- Asset type filter as pill tabs
- Asset card: symbol + name + quantity + current value + gain/loss %
- Price history chart per asset (Recharts AreaChart)
- Add investment modal sheet

### Reports
- 4-stat summary row (Income / Expenses / Net / Savings rate)
- Category bar chart — horizontal bars for readability
- Month-over-month comparison bar chart
- Fixed vs variable donut

### More / Settings
- Section list with icon + label rows
- Toggle switches for reminders
- Language and currency selectors
- Destructive actions at the bottom, visually separated

### Profile
- Avatar + name + email hero
- Basic info card
- Edit modal sheet

---

## Files Changed

| File | Change |
|---|---|
| `src/app/globals.css` | Full rewrite — new tokens, base styles, component classes |
| `src/components/AppShell.tsx` | New navigation shell (sidebar + bottom bar) |
| `src/components/TopBar.tsx` | Simplified top bar component |
| `src/components/TransactionRow.tsx` | Redesigned transaction row UI |
| `src/components/screens/HomeScreen.tsx` | New dashboard UI (data logic preserved) |
| `src/components/screens/TransactionsScreen.tsx` | New list UI (data logic preserved) |
| `src/components/screens/InvestmentsScreen.tsx` | New investment UI (data logic preserved) |
| `src/components/screens/ReportsScreen.tsx` | New charts UI (data logic preserved) |
| `src/components/screens/MoreScreen.tsx` | New settings UI (data logic preserved) |
| `src/components/screens/ProfileScreen.tsx` | New profile UI (data logic preserved) |
| `src/components/screens/NewEntryScreen.tsx` | New entry form UI (data logic preserved) |

---

## What Was NOT Changed

- All Supabase queries and mutations
- All `useState` / `useEffect` / `useCallback` hooks
- All business logic (installment math, salary carryover, card statement timing, etc.)
- All translation strings (`t()` calls)
- All auth flow
- All route structure
- All data types and type definitions
- `src/lib/` — untouched
- `src/shared/` — untouched
- `src/app/layout.tsx` — untouched
- All route `page.tsx` files — untouched
