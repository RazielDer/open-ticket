# Planning Basis

## Repo-grounded audit

- `plugins/ot-dashboard/public/global.css` is the root visual problem. It defines a dark token block at the top, then redefines `:root` later with pale cream and white surfaces. That split source of truth is why the UI reads as washed out and indecisive.
- `plugins/ot-dashboard/public/views/partials/head.ejs` only loads `Public Sans`, but `public/global.css` still references `Space Grotesk` in headings and metrics. Typography discipline is currently broken at the source.
- `plugins/ot-dashboard/public/views/admin-shell.ejs` centralizes the rail, status strip, page intro, summary row, and shell-level action cards. This is the correct shell intervention point.
- `plugins/ot-dashboard/server/control-center.ts` owns `buildAdminNav()`, `buildStatusStrip()`, `buildActionCards()`, and `buildAdminShell()`. Any shell contract change must happen there rather than inside one route.
- `plugins/ot-dashboard/server/routes/admin.ts` still treats summary cards as a generic shape and relies on the shell to render large, empty top-of-page treatments. The route layer needs a stricter page-intro and metric contract.
- `plugins/ot-dashboard/server/home-setup-models.ts` already computes next-step and setup-state logic. That logic should be preserved while the visual hierarchy around it changes.
- `plugins/ot-dashboard/public/views/sections/overview.ejs`, `configs.ejs`, `plugins.ejs`, `advanced.ejs`, `runtime.ejs`, `tickets.ejs`, `transcripts.ejs`, `transcript-detail.ejs`, `evidence.ejs`, and `plugin-detail.ejs` currently overuse the same `config-card` / `item-card` / `summary-card` grammar for different jobs.
- `plugins/ot-dashboard/public/views/config-general.ejs`, `config-options.ejs`, `config-panels.ejs`, `config-questions.ejs`, and `config-transcripts.ejs` are the five visual editors that must keep current POST targets and field names while moving to common-vs-advanced disclosure.
- `plugins/ot-dashboard/locales/english.json` already backs much of the copy. New or changed shell/page copy must be consolidated there instead of being reintroduced in route handlers.
- `/admin/transcripts` and `/admin/plugins/:id` already have working expert capabilities. The refactor must change framing and hierarchy, not capability.

## Locked visual system

- Font:
  - `Public Sans` only.
  - Remove all `Space Grotesk` references.
- Dark graphite neutrals:
  - app background: `#141518`
  - shell surface: `#1b1d21`
  - card surface: `#202329`
  - raised surface: `#272b31`
  - inset surface: `#111316`
  - border subtle: `rgba(255, 255, 255, 0.08)`
  - border strong: `rgba(255, 255, 255, 0.14)`
  - text primary: `#f3efe7`
  - text secondary: `#c9bfae`
  - text tertiary: `#978d80`
- Status tones:
  - success: `#6ea57b`
  - warning: `#d19a53`
  - danger: `#cf6f63`
  - muted/info: `#8c96a7`
- Accent behavior:
  - keep warm accent behavior from `brand.primaryColor` and `brand.accentColor`
  - use accent only for primary actions, active nav, and high-priority highlights
  - do not tint whole surfaces with accent gradients
- Radii:
  - shell and major panels: `16px`
  - interior cards: `12px`
  - controls: `10px`
  - badges/chips: fully rounded only when semantically justified
- Spacing:
  - use a simple scale of `4, 8, 12, 16, 24, 32, 40`
  - top-of-page sections should generally be `24px` apart
  - avoid empty prestige space in the first viewport
- Shadows:
  - one restrained ambient shadow only
  - rely on surface contrast and borders before adding depth
- Motion:
  - 120-180ms transitions
  - no glass, giant blur, or float-heavy hover behavior

## Locked component rules

- Sidebar / rail:
  - desktop width: `272px`
  - sticky on desktop
  - separate brand, primary nav, and utility actions into visually distinct groups
  - utility actions must not read like peer navigation
- Status ribbon:
  - compact single-row strip above page content
  - render health label, updated time, and concise system summary
  - it must read as operational state, not a ghost notification
- Page intro:
  - replace the oversized hero with a compact intro block
  - title, one short body paragraph, and at most two actions
  - no large empty headline slab
- Metric cards:
  - split status-oriented metrics from numeric metrics
  - value dominates when numeric; label and detail stay secondary
- Setup cards:
  - header: file/meta + state chip
  - body: what this area controls + why it matters now
  - footer: primary guided action first, then visual/raw tools where appropriate
- Daily operation cards:
  - must not look identical to setup cards
  - emphasize ongoing work and entry points rather than readiness state
- Buttons:
  - `primary`: warm filled action
  - `secondary`: dark raised surface with strong text
  - `subtle`: low-emphasis border action
  - `danger`: explicit destructive treatment
- Badges:
  - sentence case, not all caps
  - readable even without color
  - no candy-dot pastel look
- Tables:
  - denser rows, stronger headers, clearer row separation
  - row actions should not dominate data columns

## Locked interface changes

- `buildStatusStrip()` in `server/control-center.ts` should return a richer payload:
  - `tone`
  - `label`
  - `updatedLabel`
  - `detail`
  - `attentionLabel`
- `buildAdminShell()` should stop rendering a shell-wide automation-tools slab by default.
- `buildAdminShell()` should support a compact page-intro contract and typed summary cards:
  - `summaryCards[].kind` is either `status` or `metric`
  - `summaryCards[].tone` is optional and only used when a card carries state
- `buildHomeWorkspaceModel()` should expose:
  - `recommendedAction`
  - setup cards with stable anatomy fields
  - daily operations with a semantic `kind`
- `buildAdvancedWorkspaceModel()` should group destinations as:
  - diagnostics
  - backups and restore
  - raw JSON editors
  - plugin workbenches
  - maintenance links

## Locked responsive and accessibility rules

- Breakpoints:
  - `1100px`: shell rail collapses above content
  - `900px`: side rails / split workspaces collapse to one column
  - `720px`: summary, card, and list grids collapse to one column
- Focus states:
  - every interactive element gets a visible `2px` ring with offset
- Disabled states:
  - disabled actions remain legible
  - if an action is disabled for a semantic reason, the reason must remain discoverable in adjacent helper copy or existing reason text
- Contrast:
  - all primary text, section headings, form labels, and badges must meet a visibly readable dark-theme baseline

## Required verification

Per-slice verification must happen before advancing the active slice pointer. Final cutover still requires:

```powershell
npm --prefix plugins/ot-dashboard run build:editor
npm run build
node --test dist/plugins/ot-dashboard/test
node --test dist/plugins/ot-html-transcripts/test
```
