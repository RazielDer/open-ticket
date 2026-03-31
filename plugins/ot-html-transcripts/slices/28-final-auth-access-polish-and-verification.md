# Slice 28: Final Auth Access Polish And Verification

- Phase: `P14`
- Status: `blocked-after-27`
- Depends on: `27-audit-logging-and-security-hardening`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Finish the stricter access wave by polishing the new admin and viewer surfaces, documenting the shipped auth/deployment model, and running the full locked verification sweep.

## Deliverables

- final copy and layout polish on:
  - admin Discord login
  - transcript viewer login
  - `My Transcripts`
  - admin security workspace
- operator-facing documentation for:
  - split-host deployment
  - Discord OAuth callbacks
  - RBAC configuration
  - owner bootstrap
  - breakglass behavior
- full final verification evidence for the P14 wave

## Target file plan

- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/views/transcript-viewer-login.ejs`
- new viewer/admin section templates added in slices 26 and 27
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md` if present
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-dashboard/test/*.ts` only where final coverage gaps remain
- `plugins/ot-html-transcripts/test/*.ts` only where final coverage gaps remain

## Locked policy

- Slice `28` may polish and document the shipped design, but it may not expand scope beyond the already locked P14 contract.
- Page polish is limited to density, clarity, and consistency:
  - no glow
  - no new visual system
  - no extra marketing copy
  - no redundant helper text
- Documentation must explain the final deployment/auth model without contradicting `workflow.yaml`.
- If slice `28` patches behavior, the full locked final verification sweep must be rerun afterward.

## Implementation tasks

1. Trim and align copy across the new auth and portal pages.
2. Ensure the new surfaces visually match the existing matte dark dashboard and viewer shells.
3. Update plugin docs for split-host deployment, Discord OAuth setup, RBAC mapping, and breakglass behavior.
4. Close any small test gaps discovered during the final sweep.
5. Run the full final verification sequence and record the result in the kernel.

## Exit criteria

- The new auth/access surfaces are visually aligned with the rest of the UI.
- Operator docs cover the final config and deployment model.
- The full program verification sweep passes after the completed P14 implementation.

## Verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

## Required test scenarios

- admin and viewer auth flows still work end to end after polish
- tier boundaries remain intact after final copy/layout changes
- `My Transcripts` remains scoped and read-only
- admin security workspace remains Admin-only and non-secret
- final docs match the shipped config keys and route behavior

## Promotion gate

- Slice `27` must be implemented and verified first.
- After slice `28`, update the kernel state, mark `P14` complete, and record the final verification evidence.

## Out of scope

- post-P14 feature work
- browser-side ticket creation
- analytics/reporting expansions
