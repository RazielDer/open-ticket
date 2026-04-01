# Slice 03: Ticket Card State And Managed-Record Status

## Objective

Make the persistent ticket card reflect draft and bridge state, make the ticket-managed record clearly show draft-vs-submitted status, and refresh the ticket card when bridge editability changes.

## Exact files

- `plugins/ot-ticket-forms/service/start-form-runtime.ts`
- `plugins/ot-ticket-forms/service/forms-service.ts`
- `plugins/ot-ticket-forms/index.ts`
- `plugins/ot-ticket-forms/builders/messageBuilders.ts`
- `plugins/ot-ticket-forms/builders/embedBuilders.ts`
- `plugins/ot-ticket-forms/builders/buttonBuilders.ts`
- `plugins/ot-ticket-forms/classes/AnswersManager.ts`
- `plugins/ot-ticket-forms/test/start-form-runtime.test.ts`
- `plugins/ot-ticket-forms/test/forms-service.test.ts`
- `plugins/ot-ticket-forms/test/ticket-managed-record.test.ts`
- `plugins/ot-ticket-forms/test/session-flow.test.ts`
- `plugins/ot-eotfs-bridge/index.ts`
- `plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.ts`

## Locked implementation decisions

- Replace the presence-only helper with an upsert-style ticket-card helper that can create or edit the existing applicant start-form message.
- Ticket-card state is fixed:
  - no draft or `initial` draft state -> enabled `Fill Out Application`
  - `partial` draft state -> enabled `Continue Application`
  - `completed` draft state while `canApplicantEdit(ticketChannelId)` is true -> enabled `Update Application`
  - bridge edit lock false -> disabled `Application Locked`
- The start-form message embed copy must match the button state so the ticket card explains whether the user is starting, resuming, editing, or locked out.
- The ticket-managed record embed description must distinguish:
  - partial draft saved
  - completed/submitted and still editable
- Preserve the existing start-form custom-id shape so bridge placement checks and repairs continue to work.
- `ot-eotfs-bridge` must trigger a ticket-card refresh whenever bridge status changes the editability outcome.

## Required changes

- Add ticket-card state resolution to the forms service/runtime so any code path with ticket channel plus form id can re-render the card from persisted draft state and bridge state.
- Update ticket bootstrap and restore paths to render the correct initial card label and copy.
- Update the managed-record status copy so staff and applicants can tell whether a draft is merely saved or fully submitted.
- Add bridge compatibility so status refreshes and action transitions that lock/unlock edits also refresh the applicant ticket card.
- Extend tests to prove:
  - the card relabels across `Fill Out`, `Continue`, `Update`, and `Locked`
  - the managed record shows draft/completed status copy
  - bridge repair/refresh logic remains compatible with the unchanged start-form custom-id

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-ticket-forms/test/forms-service.test.js dist/plugins/ot-ticket-forms/test/start-form-runtime.test.js dist/plugins/ot-ticket-forms/test/ticket-managed-record.test.js dist/plugins/ot-ticket-forms/test/session-flow.test.js dist/plugins/ot-eotfs-bridge/test/bridge-entrypoint.test.js
```
