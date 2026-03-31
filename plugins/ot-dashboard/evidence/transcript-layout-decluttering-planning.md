# Transcript Layout Decluttering Planning

## Objective

Refine `/admin/transcripts` again so the page stops feeling clustered and jumbled when transcript data is available, especially at the top of the page and ahead of the records table.

## Repo-grounded findings

- The transcript route already removed the older hero-plus-alert stack, but it still renders three transcript-specific summary slabs before the table: header facts, filtered summary, and bulk actions.
- On a ready-state fixture at `http://127.0.0.1:3372/admin/transcripts`, the desktop layout currently measures about:
  - workspace header: `324px`
  - filtered summary: `178px`
  - bulk actions: `294px`
  - first table row: `1517px`
- On the same fixture at `390x844`, the stacked layout currently measures about:
  - workspace header: `621px`
  - filtered summary: `802px`
  - bulk actions: `449px`
  - first table row: `3409px`
- `buildTranscriptSummaryCards`, `buildFilteredSummaryCards`, and the operations count models already carry transcript-specific meaning and badge tones, but the template currently renders most of them as near-identical summary cards, which flattens hierarchy instead of clarifying it.
- The records table and its actions already preserve filter state, bulk-action routing, pagination, return-to handling, and transcript-detail links, so the remaining problems are layout hierarchy and density rather than workflow mechanics.

## Locked decisions

- Keep `/admin/transcripts` scoped to the current route and preserve existing auth, CSRF, filter names, bulk actions, return-to behavior, detail links, and destructive-action isolation.
- Keep the matte dark login-aligned visual family and avoid glow, blur, glossy gradients, or raised chrome.
- Reduce the transcript header to a calmer summary surface instead of another card wall.
- Replace the filtered-summary card grid with a denser transcript-specific strip so the records table reaches the user sooner on desktop and mobile.
- Keep bulk actions close to the records table, but compress them into a toolbar-like surface instead of another tall subsection card.
- Keep operations available, but rebalance them so they read as secondary analysis beneath records rather than another competing workspace.

## Slice map

1. `43-transcript-summary-and-shell-compaction`
   - Compact the transcript header facts and filtered summary hierarchy so the top of the page stops reading like a same-weight summary wall.
2. `44-transcript-records-toolbar-and-operations-balance`
   - Compress bulk actions into a denser records toolbar and tighten operations layout so the records table becomes the clear primary workflow.
3. `45-final-transcript-layout-verification`
   - Run the full verification set, repeat desktop/mobile browser checks, and capture the concrete layout improvements.
