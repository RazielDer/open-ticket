# Slice 05: Entry Pages, Visual Editors, and Documentation Alignment

## Objective

Bring `/`, `/login`, and the five visual editors into the same dark graphite system while preserving every existing form contract.

## Exact files

- `plugins/ot-dashboard/public/views/index.ejs`
- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/views/admin.ejs` if the legacy admin index still needs alignment
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/public/views/config-options.ejs`
- `plugins/ot-dashboard/public/views/config-panels.ejs`
- `plugins/ot-dashboard/public/views/config-questions.ejs`
- `plugins/ot-dashboard/public/views/config-transcripts.ejs`
- `plugins/ot-dashboard/public/js/config-*.js` only when editor disclosure behavior requires it
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md`

## Locked implementation decisions

- `/` is an entry page, not a marketing landing page.
- `/login` remains a single-purpose form.
- Visual editors keep the current route targets and submitted field names unchanged.
- The common-vs-advanced boundaries from the previous editor plan stay locked and should not be renegotiated during implementation.

## Required changes

- In `index.ejs` and `login.ejs`:
  - move them onto the same dark graphite token system
  - keep the copy direct and operational
  - avoid prestige gradients or feature-marketing language
- In each visual editor:
  - render common settings first
  - move advanced settings into a visibly secondary section or disclosure
  - keep raw JSON paths available elsewhere; do not remove them
- Locked editor boundaries:
  - General common: token/token-from-env, server ID, language, prefix, slash/text command toggles, status, logs, limits
  - General advanced: global admins JSON, system flags, channel-topic flags, permissions matrix, message delivery matrix
  - Options common: type, id, name, description, button basics, channel basics, cooldown, autoclose, autodelete, limits
  - Options advanced: admin arrays, claimed-category mappings, nested DM/ticket JSON, slow mode, role-mode extras
  - Panels common: id, name, dropdown toggle, option IDs, text, embed enabled/title/description/color, dropdown placeholder
  - Panels advanced: embed URL, image, thumbnail, footer, timestamp, max-ticket warnings, description layout
  - Questions common: id, name, type, required, placeholder
  - Questions advanced: length limits
  - Transcripts common: enabled, delivery toggles, channel, mode, text layout, text file mode
  - Transcripts advanced: embed styling, HTML background/header/stats customization, favicon customization, remote asset URL fields
- In `README.md`:
  - remove outdated light-shell or control-center framing
  - describe the dashboard as a server-rendered admin dashboard with guided and advanced surfaces

## Verification for this slice

```bash
npm --prefix plugins/ot-dashboard run build:editor
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js dist/plugins/ot-dashboard/test/auth.test.js
```

## Done when

- Entry pages feel like part of the same product.
- Editors are easier to scan without dropping any saved data.
- README matches the shipped UI direction.
