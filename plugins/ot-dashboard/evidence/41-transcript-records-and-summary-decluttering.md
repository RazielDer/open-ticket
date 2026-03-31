# Slice 41 Evidence: Transcript Records And Summary Decluttering

## What changed

- Kept transcript records ahead of operations in the primary reading order and hid the filtered-summary strip when it adds no value on empty states.
- Trimmed repeated unavailable-state copy so empty records and operations sections no longer restate the full runtime warning after the workspace banner already carries it.
- Compacted the records table into `Transcript`, `Status`, `Archive`, and `Access` columns, preserving bulk actions, detail links, public links, and return-to behavior while reducing table width and visual noise.
- Reduced the runtime-unavailable mobile header stack by dropping the redundant `Archive data` fact card and allowing transcript fact/summary cards to stay in two columns on narrow screens.

## Verification

- `npm run build`
  - Outcome: compile-only build succeeded with `OT: Compilation Succeeded!`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
  - Outcome: `11` tests passed, `0` failed.

## Notes

- On `390x844` against `http://127.0.0.1:3371/dash/admin/transcripts`, the workspace header dropped from about `898px` to `661px` and the records section moved up from about `1689px` to `1453px` after the slice 41 compaction.
