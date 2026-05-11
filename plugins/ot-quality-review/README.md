# OT Quality Review

`ot-quality-review` is an EoTFS-local plugin for quality-review adjudication,
raw-feedback custody, review notes, ownership, and dashboard queue support.

It is enabled in this checkout and depends on:

- `ot-feedback`
- `ot-telemetry`

## What It Does

- Captures completed feedback payloads into a durable quality-review case model.
- Mirrors raw feedback assets into `runtime/ot-quality-review/assets` with
  retention and byte limits.
- Exposes a plugin service under `ot-quality-review:service` for dashboard
  quality-review pages.
- Tracks review states: `unreviewed`, `in_review`, and `resolved`.
- Supports dashboard actions: state changes, owner assignment, owner clearing,
  note creation, resolution outcomes, note correction, and note redaction.
- Runs a background manager for raw-feedback expiry and optional notification
  scans.

## Config

Config lives at `plugins/ot-quality-review/config.json`.

Current keys:

- `rawFeedbackRetentionDays`
- `maxMirroredFileBytes`
- `maxMirroredSessionBytes`
- `notificationsEnabled`
- `deliveryChannelIds`
- `reminderCheckMinutes`
- `overdueReminderCooldownHours`
- `digestEnabled`
- `digestHourUtc`
- `digestMaxTickets`

Notifications are disabled by default. When enabled, delivery targets must be
valid Discord channel ids in the current guild and the bot must be able to view
and send to the target channel.

## Dashboard Pairing

The dashboard quality-review queue is reached through `ot-dashboard`. The
plugin builds queue links from dashboard config when available, otherwise it
falls back to `/admin/quality-review`.

The plugin consumes telemetry history from `ot-telemetry` to identify stale or
overdue review cases for reminders and daily digest messages.

## Data And Safety

- Raw feedback assets are local runtime custody artifacts, not wrapper docs.
- Notes are bounded and can be corrected or redacted; redaction keeps an
  adjustment record.
- Expired or missing raw assets should be shown as unavailable rather than
  guessed or reconstructed.
