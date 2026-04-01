# Slice 04: Final Verification And Doc Sync

## Objective

Close the implementation with full compiled verification, operator-doc updates for the shipped application-flow contract, and final evidence that records both automated and any available live/manual checks.

## Exact files

- `plugins/ot-ticket-forms/README.md`
- `plugins/ot-eotfs-bridge/README.md`
- `evidence/whitelist-application-ux-reliability-verification.md`
- root workflow kernel files required to close the task

## Locked implementation decisions

- The docs sync is limited to operator-facing behavior that changed:
  - smart continuation
  - passive section confirmation history
  - ticket-card labels and recovery behavior
  - bridge-driven `Application Locked` behavior
- Do not widen this slice into unrelated docs cleanup.
- Final evidence must state exactly which automated commands passed and whether live/manual Discord verification was completed or blocked.

## Required changes

- Update the `ot-ticket-forms` README so the applicant workflow describes:
  - the ticket card as the resume anchor
  - `Continue Application` only when a fresh click is required
  - passive confirmation history vs managed-record transcript responsibilities
- Update the `ot-eotfs-bridge` README only where the user-facing application/edit-lock flow changed.
- Record final evidence in `evidence/whitelist-application-ux-reliability-verification.md`.
- Update `workflow.yaml`, `workflow-ledger.yaml`, `runtime/controller-state.yaml`, and `active/active-slice.md` to mark the task complete after verification passes.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/forms-service.test.js dist/plugins/ot-ticket-forms/test/start-form-runtime.test.js dist/plugins/ot-ticket-forms/test/ticket-managed-record.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js dist/plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.js
```

## Required live/manual checks when environment permits

- Start a fresh whitelist application from the ticket card.
- Progress through at least one modal section and one component section without responder timeout.
- Confirm previous answered sections remain visible only as passive ephemerals.
- Dismiss old ephemerals and resume from the ticket card.
- Complete the application and verify `Update Application`.
- Move the bridge state to a non-reviewable status and verify `Application Locked`.
