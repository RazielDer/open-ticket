# Transcript Operations UI Refinement Planning

## Objective

Refine `/admin/transcripts` so it reads like one restrained transcript workspace instead of a stack of competing hero, alert, summary, filters, operations, and records surfaces.

## Repo-grounded findings

- The route currently layers `pageAlert`, shell `summaryCards`, `accessNotices`, a filter section, a filtered-summary section, an operations section, and a records section on one page.
- On the authenticated fixture at `http://127.0.0.1:3371/dash/admin/transcripts`, the mobile stacked layout currently lands the sections around:
  - intro at `560px`
  - filters at `2008px`
  - filtered summary at `3268px`
  - operations at `4461px`
  - records at `4786px`
- The current mobile filter form measures about `1129px` tall and becomes the dominant surface before the records area.
- The unavailable-state page repeats the same “runtime unavailable / operations unavailable” story across the page alert, top summary cards, operations section, and empty-state copy.
- The page already has a shared responsive disclosure primitive through `details[data-responsive-disclosure]`, which is a better fit for the filter and operations surfaces than another always-open full card stack.
- The transcript list route already preserves filter state, return-to links, bulk actions, and operational-query support through `buildTranscriptListModel`, so layout work can stay mostly in the route/template/model layer.

## Locked decisions

- Keep the transcripts work scoped to `/admin/transcripts`; do not broaden into transcript detail or viewer routes unless a narrow shared hook is required.
- Keep auth, CSRF, bulk actions, export, return-to handling, detail-page destructive actions, and transcript plugin/config reachability unchanged.
- Hide the shell hero and shell summary-card stack for the transcript list route once the page owns its own integrated workspace header.
- Use one integrated transcript workspace header with compact status/fact context instead of repeating the same runtime state in multiple top layers.
- Move the records surface ahead of the operations overview in the primary reading order.
- Make filters and operations secondary disclosures that stay open on desktop and collapse by default on stacked/mobile widths.
- Keep active filters visible outside the collapsed filter body so filtered state remains legible on mobile.
- Keep copy conservative: remove duplicated runtime/meta language without weakening warnings or operational reachability.

## Slice map

1. `40-transcript-operations-shell-and-filter-structure`
   - Build the integrated transcript workspace header, remove the redundant shell hero/summary stack on this page, and collapse filters responsively.
2. `41-transcript-records-and-summary-decluttering`
   - Tighten the filtered summary, records section, and operations placement so the page reaches the primary transcript list faster.
3. `42-final-transcript-operations-verification`
   - Run the full verification set, repeat desktop/mobile browser checks on `/dash/admin/transcripts`, and capture completion evidence.
