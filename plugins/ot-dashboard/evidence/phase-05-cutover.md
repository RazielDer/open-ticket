# Phase 05 Cutover Evidence

Date: 2026-03-25

## Scope outcome

- Slices 01 through 05 for the `ot-dashboard` beginner-first redesign were implemented inside `plugins/ot-dashboard/**`.
- Final regression coverage now includes route, nav, setup-state, operational-page, editor, transcript-workspace, and locale-boundary checks.
- No writes were made outside `plugins/ot-dashboard/**`.

## Final verification

- PASS `npm --prefix plugins/ot-dashboard run build:editor`
- PASS `npm run build`
- PASS `node --test dist/plugins/ot-dashboard/test`
  - Result: 47 tests passed, 0 failed.
- PASS `node --test dist/plugins/ot-html-transcripts/test`
  - Result: 24 tests passed, 0 failed.

## Resolution note

- The transcript plugin contract test now validates the shipped `publicBaseUrl` value instead of forcing the empty default constant onto `config.json`.
- The transcript plugin implementation-domain scan now walks stable source files only and skips the volatile `.test-runtime` tree, avoiding transient `ENOENT` failures during concurrent test activity.
- With that follow-up fix in place, the original `ot-dashboard` redesign cutover verification now passes in full.
