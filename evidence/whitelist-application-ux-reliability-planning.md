# Whitelist Application UX and Reliability Planning

## Objective

Fix the EoTFS whitelist application flow so the reported `Responder Timeout` path disappears, the user sees reliable saved-state feedback, the ticket itself becomes the resume anchor, and the interaction model is easier to follow than the current always-overwrite ephemeral flow.

## Repo-grounded findings

- `plugins/ot-ticket-forms/classes/FormSession.ts` currently reuses one `sessionMessage` across question prompts, continue prompts, and finalization.
- Modal responders use a different reply model from button/dropdown responders, which makes the current reuse pattern brittle and consistent with the timeout being reported after saved progress.
- `plugins/ot-ticket-forms/service/draft-runtime.ts` already persists merged answers before advancing the session.
- `plugins/ot-ticket-forms/builders/messageBuilders.ts` and `builders/embedBuilders.ts` currently generate compact `Section X/Y answered!` messages, which is a good base for passive history.
- `plugins/ot-ticket-forms/service/start-form-runtime.ts` only ensures the persistent ticket card exists; it does not yet own stateful relabeling.
- `plugins/ot-eotfs-bridge/index.ts` already owns applicant editability via `canApplicantEdit(ticketChannelId)` and must remain the authority on whether updates are allowed.

## Locked decisions

- Keep the ticket-managed record as the canonical answer transcript.
- Keep retained ephemerals compact. Do not echo full section answers there.
- Use the ticket card as the recovery anchor because ephemeral messages can be dismissed.
- Implement smart continuation:
  - auto-advance for next component prompts
  - require `Continue Application` for modal entry and saved-state recovery
- Make the ticket card state-aware:
  - `Fill Out Application`
  - `Continue Application`
  - `Update Application`
  - `Application Locked`
- Treat saved-after-persist delivery failures as recoverable state, not as fatal application errors.
- Do not leave stale interactive controls behind on old prompts.

## Slice map

1. `01-session-transport-and-passive-confirmation-foundation`
2. `02-smart-continuation-and-recovery`
3. `03-ticket-card-state-and-managed-record-status`
4. `04-final-verification-and-doc-sync`

## Verification plan

- Slice 01:

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js
```

- Slice 02:

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js
```

- Slice 03:

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/forms-service.test.js dist/plugins/ot-ticket-forms/test/start-form-runtime.test.js dist/plugins/ot-ticket-forms/test/ticket-managed-record.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js dist/plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.js
```

- Slice 04:

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/draft-session.test.js dist/plugins/ot-ticket-forms/test/edit-mode.test.js dist/plugins/ot-ticket-forms/test/forms-service.test.js dist/plugins/ot-ticket-forms/test/start-form-runtime.test.js dist/plugins/ot-ticket-forms/test/ticket-managed-record.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js dist/plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.js
```

- Final live/manual checks when a local bot/dev ticket environment is available:
  - start a blank application
  - traverse a modal section followed by a component section
  - verify prior answered confirmations remain visible but inert
  - dismiss old ephemerals and resume from the ticket card
  - complete the application and confirm `Update Application`
  - lock the review state and confirm `Application Locked`
