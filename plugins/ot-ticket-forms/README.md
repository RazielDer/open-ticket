# OT Ticket Forms

Local EoTFS plugin for structured ticket forms. Supported question types are:

- `short`
- `paragraph`
- `dropdown`
- `button`

## Form Configuration

Each form entry in `config.json` is a JSON object with these form-level properties:

- `id`: unique form identifier
- `name`: operator-facing form name
- `description`: optional summary shown with the form
- `color`: hex color string used for embeds
- `answerTarget`: where answers are rendered
  - `response_channel`: post answer messages into `responseChannel`
  - `ticket_managed_record`: keep one managed answer record inside the ticket and update it in place
- `responseChannel`: channel id used only when `answerTarget` is `response_channel`
- `autoSendOptionIds`: OT option ids that auto-send the form on ticket creation

## Question Configuration

Each question entry supports these common properties:

- `position`: the ordered question number
- `question`: rendered prompt text
- `type`: `short`, `paragraph`, `dropdown`, or `button`

Text questions (`short`, `paragraph`) also support:

- `optional`: whether the field may be skipped
- `placeholder`: optional input hint
- `maxLength`: optional maximum answer length

Dropdown questions also support:

- `placeholder`
- `minAnswerChoices`
- `maxAnswerChoices`
- `choices`
  - `name`
  - `emoji`
  - `description`

Button questions also support:

- `choices`
  - `name`
  - `emoji`
  - `color` as `gray`, `red`, `green`, or `blue`

## EoTFS Whitelist Local Contract

The released `whitelist-review-form` uses the ticket-local draft path:

- `answerTarget` must stay `ticket_managed_record`
- `responseChannel` must stay blank
- one managed application record exists per applicant, ticket, and form
- normal ticket discussion remains available, but only the structured ticket-card application flow mutates saved whitelist answers
- the Discord name field at `Q1` remains an applicant-entered consistency check and must match the live ticket creator username or global name or nickname before OT handoff when aliases are available
- the `Alderon ID(s)` field at `Q2` must contain one or more AGIDs written as `123456789` or `123-456-789`; accepted values are canonicalized by the OT bridge to grouped `123-456-789`
- the ticket flow still does not perform live external Alderon-account existence verification
- the OT-side handoff contract lives in [`../ot-eotfs-bridge/README.md`](../ot-eotfs-bridge/README.md)

## Released Applicant Flow

The applicant ticket card is the durable recovery anchor for the whitelist application.

Released card states:

- `Fill Out Application`: no saved draft or only the implicit `initial` state exists
- `Continue Application`: a partial draft is saved and the next unanswered step needs a fresh click
- `Update Application`: a completed draft is still applicant-editable, including after staff reopen the same case with `Retry`
- `Submit for Review`: a companion ticket-card button that appears only when a completed draft is still applicant-editable
- `Submitted for Staff Review`: the applicant already used `Submit for Review`, so active `pending_review` stays locked until staff use `Retry`
- `Application Locked`: bridge review is no longer editable, so the applicant card disables further edits
- `Edit a saved answer`: a ticket-card select menu that appears only when saved answers exist and the applicant is still allowed to edit

Released continuation rules:

- the flow auto-sends the next prompt when the next unanswered section is button- or dropdown-based
- `Continue Application` appears only when the next unanswered section must open a modal or when saved progress needs a recovery click
- `Update Application` reopens a completed draft without staging a new review packet by itself
- `Submit for Review` is the only applicant action that stages or refreshes the OT-to-Discord review packet
- `Edit a saved answer` opens a one-question edit flow for an answered field and saves only that field without replaying later sections
- unanswered questions still belong to the normal `Continue Application` flow
- if a saved UI delivery fails after persistence, the draft remains authoritative and the ticket card plus any recovery `Continue Application` prompt are the supported resume path

Released ephemeral vs managed-record responsibilities:

- retained ephemerals are compact passive section confirmations only
- stale prompts must not remain the active recovery path
- stale-step recovery now points the applicant back to the ticket card, using state-aware wording for draft, saved-for-review, and locked cases
- the ticket-managed record inside the ticket remains the canonical answer transcript
- the managed record now distinguishes draft-saved vs submitted state so applicants and staff can tell whether progress is merely saved or fully submitted

Released whitelist stack order:

- before submit: opening whitelist embed, `whitelist-process`, `whitelist-expectations`, and the bottom-positioned applicant ticket card
- after submit: opening whitelist embed, `whitelist-process`, `whitelist-expectations`, submitted answers mirror, applicant ticket card, and bottom-positioned `Whitelist Staff Review`
- normal applicant-card and submitted-answer refreshes reuse stored message IDs and update in place; delete-or-recreate is reserved for one-time legacy normalization or true missing-message recovery

## Companion Docs

- [OT EoTFS Bridge](../ot-eotfs-bridge/README.md)
- [Discord Staff Operator Guide](../../../../EoTFS Discord Bot/docs/staff-operators/README.md)
- [Discord Host / Admin Guide](../../../../EoTFS Discord Bot/docs/host-admin/README.md)

## Example

```json
{
  "id": "example-form",
  "name": "Example Form",
  "description": "Example ticket-local form",
  "color": "#99dd99",
  "answerTarget": "ticket_managed_record",
  "responseChannel": "",
  "autoSendOptionIds": ["example-ticket"],
  "questions": [
    {
      "position": 1,
      "question": "Short answer example?",
      "type": "short",
      "optional": false,
      "placeholder": "Single-line response",
      "maxLength": 120
    },
    {
      "position": 2,
      "question": "Paragraph answer example?",
      "type": "paragraph",
      "optional": false,
      "placeholder": "Multi-line response",
      "maxLength": 500
    },
    {
      "position": 3,
      "question": "Choose one option",
      "type": "dropdown",
      "placeholder": "Select one",
      "minAnswerChoices": 1,
      "maxAnswerChoices": 1,
      "choices": [
        {
          "name": "Option one",
          "emoji": "",
          "description": "First option"
        },
        {
          "name": "Option two",
          "emoji": "",
          "description": "Second option"
        }
      ]
    }
  ]
}
```

## Notes

1. Each form must have a unique `id`.
2. Dropdown and button questions may contain up to 25 choices.
3. The form can be auto-sent from eligible ticket options through `autoSendOptionIds`.
4. You can also send a form manually with `/form send <form> <channel>`.
