# Slice 02: Smart Continuation And Saved-State Recovery

## Objective

Implement the locked smart-continuation rules, distinguish saved-vs-unsaved failures, and make duplicate or stale interactions recoverable without red internal-error UX.

## Exact files

- `plugins/ot-ticket-forms/classes/FormSession.ts`
- `plugins/ot-ticket-forms/service/draft-runtime.ts`
- `plugins/ot-ticket-forms/service/session-message-runtime.ts`
- `plugins/ot-ticket-forms/test/draft-session.test.ts`
- `plugins/ot-ticket-forms/test/session-flow.test.ts`

## Locked implementation decisions

- Smart continuation rules are fixed:
  - if the next unanswered section is button/dropdown based, auto-send that next prompt
  - if the next unanswered section begins a short/paragraph modal batch, emit a `Continue Application` prompt instead of trying to auto-open a modal
  - if there are no more unanswered sections, emit the completed passive confirmation and finalize the session
- Saved-vs-unsaved failure handling is fixed:
  - if `updateDraft` fails, keep the session on the current unanswered section and do not report progress as saved
  - if `updateDraft` succeeds and UI delivery fails, preserve the saved state and expose a recovery path through a fresh `Continue Application` prompt or the ticket card
- Duplicate/stale interaction acknowledgements must use neutral recovery copy and must not surface as the generic red internal-error card.
- The implementation must not roll back saved answers just because the next UI delivery failed.

## Required changes

- Change the `FormSession.handleResponse` path so it can tell whether persistence completed before the UI-delivery step failed.
- Keep `currentQuestionNumber` and resumed state aligned with the merged saved answers after a post-persist delivery failure.
- Add explicit fallback handling when a saved section cannot deliver the next UI prompt on the same interaction.
- Update duplicate-interaction handling so stale clicks receive a non-fatal acknowledgement and the session does not double-advance.
- Extend tests to prove:
  - auto-advance for component prompts
  - explicit continue for modal boundaries
  - saved-after-persist failures preserve progress
  - unsaved failures do not advance
  - duplicate interactions do not create double saves or timeout UX

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js
```
