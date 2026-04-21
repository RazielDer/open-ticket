# OT Whitelist Application UX and Reliability Redesign

## Summary

This kernel locks the implementation plan for the EoTFS whitelist application flow inside `open-ticket`. The work is intentionally scoped to `plugins/ot-ticket-forms/**`, the narrow compatibility surface in `plugins/ot-eotfs-bridge/**`, and the controller-kernel files at repo root.

This kernel is now a historical record for that completed task. Its plugin-scoped write boundaries applied only to that whitelist UX redesign and do not constrain later consolidated whole-project work, which should follow the workspace-root whole-stack kernel instead.

The overall consolidated project is still active and incomplete under the workspace-root parity kernel. Only this historical sub-kernel is complete.

The product target is:

- fewer clicks
- no responder-timeout path in the normal application flow
- visible saved-state feedback after each section
- a ticket-local recovery anchor that does not depend on old ephemeral messages still existing

## Repo-grounded findings

- `OTForms_FormSession` currently stores one mutable `sessionMessage` and drives `question`, `continue`, and `finalize` output through that single carrier.
- Button and dropdown responders can update the originating interaction message, but modal responders reply differently and cannot safely own the previous ephemeral message in the same way.
- `applyDraftResponses` already persists merged answers before `continueSession` runs, which makes saved-vs-unsaved failure handling possible without changing the persistence contract.
- `ensureStartFormMessage` currently guarantees that the applicant card exists but does not refresh its label or embed copy as draft/review state changes.
- `AnswersManager` already owns ticket-managed draft persistence and bridge sync for completed drafts, so managed-record status clarity can be layered there.
- Existing tests do not cover end-to-end session transport, prompt retirement, or saved-after-persist UI failures.

## Locked implementation decisions

- The ticket-local application card is the durable recovery anchor.
- Ephemeral history is section-level and passive:
  - compact saved confirmations stay visible
  - stale prompts do not remain interactive
  - full answer text stays in the ticket-managed record, not in retained ephemerals
- Smart continuation is required:
  - auto-send the next prompt when the next step can be rendered as a fresh component message
  - require `Continue Application` only when a new click is needed to open a modal or recover after a UI-delivery failure
- The persistent ticket button must become state-aware:
  - `Fill Out Application`
  - `Continue Application`
  - `Update Application`
  - `Application Locked`
- Saved-vs-unsaved failures must diverge:
  - saved: preserve progress and point the user to the recovery anchor
  - unsaved: do not advance
- `ot-eotfs-bridge` remains authoritative for edit locks and must refresh the ticket card when editability changes.

## Slice map

1. `01-session-transport-and-passive-confirmation-foundation`
   - remove the single mutable ephemeral carrier
   - retire stale controls
   - keep passive confirmation history
2. `02-smart-continuation-and-recovery`
   - implement auto-advance vs explicit continue rules
   - handle saved-after-persist UI failures cleanly
   - remove red internal-error UX from duplicate/stale interactions
3. `03-ticket-card-state-and-managed-record-status`
   - relabel the persistent ticket card by draft/review state
   - clarify draft/completed status in the managed record
   - refresh the card when bridge editability changes
4. `04-final-verification-and-doc-sync`
   - run the full compiled verification sweep
   - update operator docs for the shipped flow
   - record final evidence and close the kernel

## Verification program

- Every slice must run `npm run build`.
- Slices 01 through 03 must run the narrowest compiled `node --test` commands listed in their slice docs.
- Slice 04 must run the full compiled targeted sweep:

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/forms-service.test.js dist/plugins/ot-ticket-forms/test/start-form-runtime.test.js dist/plugins/ot-ticket-forms/test/ticket-managed-record.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js dist/plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.js
```

- Final evidence must also include these live/manual scenarios when a local bot/dev ticket environment is available:
  - blank ticket -> `Fill Out Application` -> progress through at least one modal section and one component section
  - confirm saved sections remain visible as passive ephemeral history
  - dismiss old ephemerals and resume from the ticket card
  - complete the application and confirm `Update Application`
  - move the bridge state to a non-reviewable status and confirm `Application Locked`

## Resume order

1. `workflow.yaml`
2. `active/active-slice.md`
3. `workflow.md`
4. `evidence/whitelist-application-ux-reliability-planning.md`
5. `runtime/controller-state.yaml`
