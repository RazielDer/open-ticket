# Slice 27: Audit Logging And Security Hardening

- Phase: `P14`
- Status: `blocked-after-26`
- Depends on: `26-my-transcripts-portal-and-security-workspace`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Add durable auth/security auditability and tighten response hardening so the new Discord-based access surfaces are production-ready rather than merely functional.

## Deliverables

- durable audit table(s) in the dashboard auth store
- auth/security event logging keyed to Discord user id
- session invalidation logging when membership or tier access is lost
- additive transcript access-path classification for successful viewer opens
- stricter admin/viewer response headers and cache behavior
- tests proving audit persistence and hardening headers

## Target file plan

- `plugins/ot-dashboard/server/auth.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/routes/viewer.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-html-transcripts/test/http.test.ts`

## Locked policy

- Auth/security audit records live in the dashboard auth store, not in transcript SQLite tables.
- Successful transcript document opens continue to write transcript-side `viewer-accessed` events, now with `accessPath` locked to one of:
  - `creator-current-guild`
  - `recorded-admin-current-staff`
  - `owner-override`
- Log at least:
  - admin login success
  - admin login failure
  - viewer login success
  - viewer login failure
  - session invalidation due to lost membership or tier
  - security workspace save
  - visual config save by Discord identity
  - transcript destructive action by Discord identity
- Additive response hardening on admin and viewer HTML routes is locked to:
  - `Cache-Control: no-store, private`
  - `Pragma: no-cache`
  - `Referrer-Policy: no-referrer`
  - `X-Robots-Tag: noindex, nofollow, noarchive`
- Hardening must stay additive and must not break transcript document rendering or asset delivery for authorized viewers.

## Implementation tasks

1. Add audit schema and write helpers to the dashboard auth store.
2. Emit auth/security audit records from login, logout, invalidation, security-save, and config-save paths.
3. Extend transcript viewer success events with the locked `accessPath` field.
4. Add the locked response headers to admin/viewer HTML and auth routes.
5. Extend tests for audit rows, access-path classification, and response headers.

## Exit criteria

- Durable auth/security audit records exist for the new login and config flows.
- Successful viewer transcript opens record the locked `accessPath`.
- Admin and viewer routes send the locked no-store and privacy headers.
- No unauthorized or failed asset/document request creates a false-positive successful transcript access event.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js`

## Required test scenarios

- admin login failure and success both create audit records
- viewer login failure and success both create audit records
- lost guild membership invalidates session and writes an audit record
- successful viewer document opens emit the correct `accessPath`
- unauthorized or gone transcript requests do not emit successful access events
- admin and viewer HTML routes return the locked hardening headers

## Promotion gate

- Slice `26` must be implemented and verified first.
- After slice `27`, update kernel state and then promote slice `28`.

## Out of scope

- external SIEM export
- Cloudflare-side cache rules automation
- browser-side ticket workflows
