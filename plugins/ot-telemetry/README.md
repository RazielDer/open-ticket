# OT Telemetry

`ot-telemetry` is an EoTFS-local plugin that records analytics-safe ticket
lifecycle and feedback facts in the Open Ticket global database.

It is enabled in this checkout and has no config file.

## What It Captures

The plugin exposes `ot-telemetry:service` and records lifecycle events for
ticket creation, close, reopen, claim, unclaim, move, transfer, assignment,
unassignment, escalation, first staff response, resolution, close-request
workflow events, awaiting-user workflow events, and delete.

Each lifecycle record stores:

- ticket id
- event type
- occurred-at timestamp
- actor user id when available
- an analytics-safe ticket snapshot
- previous snapshot when the workflow captured one

## Feedback Telemetry

When `ot-feedback` emits `ot-feedback:afterFeedback`, telemetry stores session
facts and question summaries without retaining raw freeform answer text or
attachment data.

The stored feedback shape is designed for review and analytics surfaces, not
for transcript or moderation evidence custody. Raw feedback custody belongs to
`ot-quality-review`.

## Data Categories

Telemetry stores records in the Open Ticket global database categories:

- `opendiscord:ticket-telemetry:lifecycle`
- `opendiscord:ticket-telemetry:feedback`

Consumers can list lifecycle or feedback history by ticket id, time bounds, and
limit.

## Boundaries

- This plugin does not use `opendiscord.stats`.
- It does not write production env files or runtime clones.
- It is a local EoTFS overlay and should not be treated as an upstream Open
  Ticket plugin.
