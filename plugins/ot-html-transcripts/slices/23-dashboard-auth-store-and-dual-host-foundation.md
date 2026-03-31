# Slice 23: Dashboard Auth Store And Dual-Host Foundation

- Phase: `P14`
- Status: `active`
- Depends on: `22-dashboard-option-editor-routing-controls`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Establish the Cloudflare-ready foundation for the stricter auth wave by adding dual-host config, durable SQLite-backed auth state, separate admin/viewer session handling, and canonical host helpers before role-aware Discord auth is introduced.

## Deliverables

- additive dashboard config for admin-host and viewer-host canonical URLs
- additive `trustProxyHops` override and stronger external-host warnings
- a plugin-owned SQLite auth store at `runtime/ot-dashboard/auth.sqlite`
- durable admin/viewer sessions, OAuth state, and login throttling
- separate host-only admin and viewer cookie names
- runtime URL helpers for both admin and viewer hosts
- host classification and wrong-host canonicalization helpers
- tests proving restart-safe auth state and split-host URL/cookie behavior

## Target file plan

- `plugins/ot-dashboard/plugin.json`
- `plugins/ot-dashboard/server/dashboard-config.ts`
- `plugins/ot-dashboard/server/auth.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/server/dashboard-runtime-api.ts`
- `plugins/ot-dashboard/server/routes/viewer.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/server/routes/api.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`

## Locked policy

- `publicBaseUrl` is the admin-host canonical URL.
- `viewerPublicBaseUrl` is the viewer-host canonical URL. When empty, viewer URL generation may fall back to `publicBaseUrl` for single-host compatibility.
- Add `trustProxyHops` as an optional non-negative integer:
  - missing -> preserve current behavior by resolving to `1` for loopback bind and `0` otherwise
- The auth store path is locked to `runtime/ot-dashboard/auth.sqlite`.
- Session cookie names are locked to:
  - `otdash_admin`
  - `otdash_viewer`
- Cookies remain host-only, `httpOnly`, `sameSite=lax`, and `secure=auto`.
- OAuth state persistence is durable and expires after `10 minutes`.
- Durable login throttling must preserve the existing default policy of `8 attempts / 15 minutes` unless config overrides it.
- The app must expose additive helpers for:
  - `buildPublicUrl(routePath)` for admin-host URLs
  - `buildViewerPublicUrl(routePath)` for viewer-host URLs
- Wrong-host behavior is locked to:
  - `308` redirect for safe `GET` and `HEAD` canonical route mismatches
  - `404` for non-safe methods or non-canonical route families
- No slice 23 change may add Discord tier logic, portal pages, or security workspace UI. This slice is foundation only.

## Implementation tasks

1. Extend dashboard config parsing, normalization, readiness, and warning logic for:
   - `viewerPublicBaseUrl`
   - `trustProxyHops`
   - `auth.discord.*`
   - `auth.sqlitePath`
   - `auth.breakglass.enabled`
   - `auth.breakglass.passwordHash`
   - `rbac.*`
2. Add `sqlite3` to `plugins/ot-dashboard/plugin.json`.
3. Create a local auth store module under `plugins/ot-dashboard/server/` for:
   - sessions
   - OAuth state
   - login throttle counters
   - expired-row cleanup helpers
4. Replace MemoryStore-dependent session middleware with a durable SQLite-backed session path while preserving the current dashboard session semantics where possible.
5. Split admin and viewer cookies so they do not share host scope.
6. Add runtime host/url helpers and route-family classification helpers.
7. Wire canonical-host handling into admin, page, API, and viewer route registration without changing business logic yet.
8. Update startup/workbench warnings and readiness projections to reflect the new host/auth configuration.
9. Extend tests for durable auth config, cookie separation, and host canonicalization.

## Exit criteria

- Dashboard auth state survives restart and no longer depends on in-memory-only storage.
- Admin and viewer cookies are isolated by host.
- The runtime can build canonical admin-host and viewer-host URLs separately.
- Wrong-host handling is deterministic and covered by tests.
- No transcript authorization behavior changes yet; only foundation is added.

## Verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js`

## Required test scenarios

- config parsing accepts and normalizes `viewerPublicBaseUrl` and `trustProxyHops`
- durable auth state survives app restart for session and OAuth state
- login throttling persists across restart
- viewer and admin cookies use different names and do not bleed across host routing
- safe wrong-host requests redirect to the canonical host while unsafe requests fail closed
- viewer readiness uses viewer-host URL logic instead of the legacy single-URL assumption

## Promotion gate

- Slice `23` must pass before Discord admin auth or live RBAC is introduced.
- After verification, update kernel state and then promote slice `24`.

## Out of scope

- Discord admin OAuth
- live guild-role authorization
- `My Transcripts` UI
- security workspace UI
