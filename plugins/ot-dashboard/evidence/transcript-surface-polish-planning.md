# Transcript Surface Polish Planning

## Objective

Refine `/admin/transcripts` again so the page stops feeling clustered or jumbled while staying matte, shadow-free, and visually aligned with `/login`.

## Repo-grounded findings

- The ready-state transcript route still read as boxes inside bigger boxes, especially once filters, records summary, bulk actions, and operations all stacked in sequence.
- The closed `More filters` row still felt like a raised subsection instead of a lighter advanced control.
- The records shell still inserted a filtered-summary slab and a bulk-tools slab ahead of the table, which kept the scan path feeling interrupted.
- The operations area still used its own inner card wall, so the lower page read heavier than the actual actions justified.
- On stacked/mobile layouts, the transcript header secondary facts were still spending too much height in single-column rows.
- The route behavior, filter contracts, return-to handling, and bulk routes were already correct, so the follow-up can stay structural and visual.

## Locked decisions

- Keep routes, query names, bulk-action endpoints, return-to behavior, and transcript-detail behavior unchanged.
- Flatten transcript subpanels into divider-based sections instead of adding more bordered mini-cards.
- Let the header use one primary metric with paired secondary facts rather than another same-weight card wall.
- Move active filters into the filter workspace instead of leaving them as a detached section.
- Keep records summary and bulk tools attached to the records workflow, and preserve select-all state sync.
- Use the equivalent authenticated transcript fixture when `127.0.0.1:3360` is unavailable to automation.

## Slice map

1. `46-transcript-shell-and-filter-streamlining`
2. `47-transcript-records-and-operations-density`
3. `48-final-transcript-surface-polish-verification`
