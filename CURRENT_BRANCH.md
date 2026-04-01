# Open Ticket Current Branch

This file captures working-tree-only behavior in the canonical Open Ticket repo at `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\open-ticket`.

Do not treat these notes as released EoTFS behavior until they are promoted into the stable READMEs and the Discord-side workflow kernel.

For released behavior, use:

- [`README.md`](README.md)
- [`plugins/ot-ticket-forms/README.md`](plugins/ot-ticket-forms/README.md)
- [`plugins/ot-eotfs-bridge/README.md`](plugins/ot-eotfs-bridge/README.md)
- [`plugins/ot-dashboard/README.md`](plugins/ot-dashboard/README.md)
- [`plugins/ot-html-transcripts/README.md`](plugins/ot-html-transcripts/README.md)

## Working-Tree Deltas

### `ot-ticket-forms`: persistent ticket drafts and true edit mode

- `ticket_managed_record` forms now persist draft snapshots in the global category `ot-ticket-forms:ticket-drafts`.
- Draft snapshots carry `initial`, `partial`, or `completed` state, the applicant Discord user id, the managed-record message id, and the captured answers ordered by question position.
- New sessions can hydrate saved answers back into modal, dropdown, and button questions instead of always starting from a blank form.
- The working tree also restores managed-record messages after restart and re-adopts persisted ticket-local draft state where possible.

### Applicant start-button and mutation gating

- The forms plugin now treats the ticket applicant as the only authorized editor for `ticket_managed_record` whitelist forms.
- The OT bridge exposes a local service boundary so forms can ask whether the applicant is still allowed to edit the application while the staged Discord review remains open.
- Start-form message placement and repair now keep the applicant entry button present in eligible tickets even after drift or restart.

### `ot-eotfs-bridge`: stricter handoff validation

- Handoff now validates the configured `formContract` rather than a single “ready for review” answer.
- `Send to Staff Review` now requires:
  - at least one Alderon ID in the configured machine-readable position
  - a rules-password match against `EOTFS_OT_WHITELIST_RULES_PASSWORDS`
  - every configured acknowledgement position answered `Yes`
- Invalid applications stay in OT with exact correction reasons instead of posting a malformed `case_created` payload.

### Review-packet refresh behavior

- A new `Refresh Review Packet` control exists in the working tree.
- The bridge can repost a signed `case_created` payload from the latest completed form snapshot only while the Discord-side case status remains `pending_review`, `retry_denied`, or `limit_locked`.
- If the Discord-side case is no longer reviewable, the refresh attempt is blocked instead of silently mutating a closed or terminal case.

### Control-card placement and repair

- The bridge now tracks both the staff control card and the applicant start-form surface.
- When repair runs, the control card can be recreated or repositioned if it drifted above the applicant entry message.
- The working tree keeps one canonical control-card record per eligible ticket and uses that record for rerender and repair decisions.

## Promotion Rule

When any item here becomes release-baselined:

1. move it into the matching stable plugin README or root README
2. remove or shrink the matching note here in the same pass
3. keep the Discord-side workflow kernel and stable cross-repo docs aligned to the promoted behavior
