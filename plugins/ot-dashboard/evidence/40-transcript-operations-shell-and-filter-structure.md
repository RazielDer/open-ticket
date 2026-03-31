# Slice 40 Evidence: Transcript Operations Shell And Filter Structure

## What changed

- Removed the transcript list route's dependency on the generic shell hero and summary-card stack, replacing it with a page-owned transcript workspace header.
- Moved the transcript settings and transcript add-on links into that integrated workspace header so they are no longer repeated inside the filter slab.
- Converted the filter surface into the shared responsive disclosure pattern and kept the active-filter chip strip outside the collapsed body.
- Tightened the unavailable-state copy so the page leads with one workspace status banner instead of stacked alert, hero, and summary storytelling.

## Verification

- `npm run build`
  - Outcome: compile-only build succeeded with `OT: Compilation Succeeded!`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
  - Outcome: `11` tests passed, `0` failed.

## Notes

- On the authenticated `:3371` fixture route, the transcript page now starts with one workspace header, then filters, then records, instead of the older hero-plus-alert-plus-summary-card stack from planning.
