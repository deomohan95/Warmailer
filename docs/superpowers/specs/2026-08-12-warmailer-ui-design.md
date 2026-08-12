# Warmailer UI Design

Companion to `2026-08-12-warmailer-design.md`. That document defines product behaviour; this one defines the visual system and the six owner-facing screens. Where the two disagree, the product design document wins.

## Scope

In scope: a token-based design system and the app shell, plus six screens — Dashboard, Leads, Campaigns, Inbox, Mailboxes, Settings.

Out of scope: authentication screens, billing, onboarding, marketing site, the warmup module, and the campaign email HTML template editor. Screens are built against typed mock data; wiring to live APIs happens per the build plan's integration gates.

## Locked Decisions

| Decision | Value |
|---|---|
| Visual direction | Warm Canvas — cream canvas, ivory cards, serif display headings, soft corners |
| Themes | Light and dark, both shipped, switched by an explicit toggle button |
| Palette | Claude warm palette: terracotta accent, warm cream/charcoal surfaces, warm-grey ink. No cold blue-greys. |
| Styling stack | Tailwind CSS v4 with CSS custom properties as the token layer |
| Fonts | System sans for UI; Georgia/serif stack for display headings. No external font loading in this pass. |

## Styling Stack

`apps/web/app/globals.css` is currently ~190 lines of hand-written CSS that reimplements a few Tailwind class names. It cannot carry this system and is replaced.

Tailwind v4 is configured CSS-first via `@theme`, with every color, radius, and shadow declared as a CSS custom property. Tokens are the single source of truth; components reference token names, never raw hex. This is what makes the theme toggle a pure color swap, and it keeps the door open to shadcn/ui later without a migration.

## Color Tokens

Semantic names only. Both themes define the same token set, so no component branches on theme.

**Light**

```
--canvas #F0EEE6   --surface #FAF9F5   --surface-raised #FFFFFF
--border #E6E3D9   --line #EFEDE4      --rail #F0EEE6   --rail-border #E0DDD2
--ink #23221E      --ink-2 #5F5B52     --ink-3 #8C8677
--accent #D97757   --accent-hover #C15F3C   --on-accent #FFFFFF   --nav-active #E4E0D3
--good #2F8F63     --warning #B08600   --critical #A33045
--shadow-card 0 1px 2px rgba(60,50,30,.045)
```

**Dark**

```
--canvas #191817   --surface #211F1D   --surface-raised #262421
--border #2E2C29   --line #262421      --rail #141312   --rail-border #2B2A27
--ink #EDEAE3      --ink-2 #938F86     --ink-3 #8B877E
--accent #E08A6B   --accent-hover #EFA184   --on-accent #1A1817   --nav-active #252320
--good #1F9E74     --warning #B08A10   --critical #DE5F76
--shadow-card none
```

Status colors are reserved for state and are never reused as chart series or decoration. Both status trios were checked with the dataviz validator and pass the lightness band, chroma floor, CVD separation, normal-vision floor, and contrast checks against their own surface.

## Typography, Space, Shape, Motion

- Display headings (page titles, card titles) use the serif stack at regular weight. UI text, numbers, labels, and tables use system sans.
- All numeric columns and KPI values use `font-variant-numeric: tabular-nums` so digits align.
- 4px spacing base. Card padding 14–16px, table row padding 7px.
- Radii: 12px cards, 7px controls, 20px pills.
- Motion: 120ms ease-out on hover/press, 180ms on panels and drawers. Everything inside `@media (prefers-reduced-motion: reduce)` collapses to no transition.

## Theme Switching

`<html>` carries `data-theme="light" | "dark"`. A toggle button in the topbar cycles the value, persists it to `localStorage`, and updates `aria-pressed`. Default is the system preference via `prefers-color-scheme`.

A small blocking inline script in `<head>` applies the stored theme before first paint. Without it the app flashes light before switching to dark, which is the single most visible way a theme toggle looks cheap.

## Component Inventory

Built in this order, each with its own test:

Button (primary, secondary, ghost, danger) · Input · Select · Checkbox · StatusPill · Card · Table (sticky header, sortable, row selection) · Tabs · Modal · Drawer · Toast · Tooltip · Meter · Avatar · Pagination · EmptyState · Skeleton · KpiTile · BarChart · SidebarNav · Topbar · PageHeader · ThemeToggle.

Each component takes typed props, holds no data-fetching logic, and renders from tokens only.

## Screens

**Dashboard** — four KPI tiles (emails sent, reply rate, positive replies, bounce rate), a daily-sends bar chart, a mailbox health panel with meters, and a campaign table. The open-rate metric is labelled **Estimated open rate** wherever it appears.

**Leads** — filter row (search, email status, import, industry), a bulk-action bar showing the live selection count, and a selectable table. Selection supports rows, page, and all-filtered, matching the `LeadSelection` contract. Email status renders as a StatusPill: Found, Processing, Not found, Queued, Not enriched.

**Campaigns** — list view with status pills, plus the six-step wizard shell (details, leads, mailboxes, sequence, schedule, review). The wizard is a stepper with per-step validation; the review step blocks launch when any variable is unresolved.

**Inbox** — filter tabs (All, Needs reply, Positive, Out of office, Bounces), a thread list with unread markers and classification pills, and a reading pane with the lead context panel, the reply composer, and an explicit notice when a detected reply has cancelled pending follow-ups. Message bodies render in a sandboxed, sanitized container with remote images blocked by default.

**Mailboxes** — per-mailbox cards showing connection health, daily/hourly usage against limits, sending window, and warmup state. App passwords are write-only: the field never renders an existing secret.

**Settings** — sectioned layout for workspace, team and roles, and preferences. Role-gated controls are hidden or disabled per `workspace_members`, never merely visually de-emphasised.

## Charts

- Single-series charts use the accent hue, carry no legend, and label only the peak.
- Multi-series charts require a validated categorical palette and a legend; hues are assigned in fixed order and never cycled.
- No dual-axis charts. Two measures of different scale become two charts.
- Bars are thin with 4px rounded data-ends anchored to the baseline and a 2px surface gap between adjacent fills. Grid and axes stay recessive.
- Every chart ships a hover tooltip and an accessible table view of the same data.

## Accessibility

- Visible focus ring on every interactive element, using `--accent` at 2px offset.
- Status is never communicated by color alone — every pill and meter carries a text label.
- Body text meets WCAG AA against its surface in both themes.
- Tables use real `<th>` with scope; the row-selection checkbox column has an accessible name.
- Dark mode is authored, not an inverted filter.

## Performance Constraint

The dashboard route group resolves session, profile, and workspace membership **once**, in the route-group layout, and passes the result down. Pages must not re-run auth or workspace lookups that the layout already performed. Repeating that chain across proxy, layout, and page is a known cause of 1–2s navigations on server-rendered authenticated routes.

## Acceptance Criteria

- Toggling the theme changes colors only — no layout shift, no component remount, no flash on reload.
- No component contains a hard-coded hex value; every color resolves from a token.
- All six screens render at 1280px and 1440px, and degrade to a usable single-column layout at 820px.
- Keyboard-only navigation reaches every interactive element with a visible focus state.
- `prefers-reduced-motion` removes all transitions.
- `npm run lint`, `npm run typecheck`, and `npm run test` pass.
