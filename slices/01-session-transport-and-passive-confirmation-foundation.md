# Slice 01: Session Transport And Passive Confirmation Foundation

## Objective

Replace the current single-message ephemeral transport with a delivery model that can preserve passive section confirmations, retire stale controls, and stop depending on one mutable ephemeral message for the entire session.

## Exact files

- `plugins/ot-ticket-forms/classes/FormSession.ts`
- `plugins/ot-ticket-forms/builders/messageBuilders.ts`
- `plugins/ot-ticket-forms/builders/embedBuilders.ts`
- `plugins/ot-ticket-forms/builders/buttonBuilders.ts`
- `plugins/ot-ticket-forms/service/session-message-runtime.ts`
- `plugins/ot-ticket-forms/test/session-flow.test.ts`

## Locked implementation decisions

- Remove `sessionMessage` as the single transport carrier. Session progression must track state independently from any one Discord message object.
- Add a small `session-message-runtime` helper that centralizes:
  - live component prompt delivery
  - passive answered confirmation delivery
  - live continue-prompt delivery
  - stale prompt retirement for button/dropdown prompts
- Keep passive confirmations compact and section-level only.
- Rename the explicit continue action label to `Continue Application`.
- Button/dropdown prompts must retire in place after save by removing or disabling their controls before the next response is emitted.
- Modal prompts do not need in-place retirement because the modal submit is the durable acknowledgment; the retained history is the new passive confirmation emitted after save.

## Required changes

- Refactor `OTForms_FormSession` so `sendNextQuestion`, `sendContinueMessage`, and `finalize` route through explicit delivery helpers rather than `reply/update` against one stored message.
- Add a passive confirmation variant to the existing continue/question builders instead of inventing a second full transcript view in ephemerals.
- Make `Continue Application` the only explicit follow-up button label used by the section-flow UI.
- Add targeted session-flow tests that prove:
  - answered button/dropdown prompts are retired
  - new passive confirmations stay visible
  - the session does not require one mutable message reference to advance

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js
```
