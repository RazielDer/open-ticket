# Slice 29: Workspace Copy Tightening And Structural Trim

## Objective

Remove duplicated helper and meta language from `General`, `Options`, `Panels`, and `Questions` without weakening warnings, advanced actions, or raw JSON reachability.

## Exact files

- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Keep the copy pass conservative.
- Keep section titles, warning copy, validation copy, empty states, and advanced-tool labels intact unless a tiny wording cleanup is required for consistency.
- Remove the `Primary editor` kicker from the top editor card on `Options`, `Panels`, and `Questions`.
- Remove save-bar copy that only explains internal route or payload stability to end users.
- Remove repeated “raw JSON stays in advanced tools” guidance from top editor-card helper text when the tray already states it.
- Keep one primary descriptive sentence near the top of each page; do not restate the same instruction in the hero, the stats, and the first editor card.
- Convert meta/helper phrasing into direct operator language where copy remains.

## Required changes

- Tighten the shared and page-specific locale strings that currently duplicate hero/tray/editor guidance.
- Remove or shorten the top editor-card helper copy in `Options`, `Panels`, and `Questions` where it only repeats nearby context.
- Remove save-bar helper paragraphs that describe internal implementation contracts instead of user-facing behavior.
- Keep reference/dependency warnings, advanced-tools labels, and structured-picker explanations intact when they still add distinct meaning.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js
```
