# Slice 12: Dashboard Private Access Mode

- Phase: `P08`
- Status: `ready-after-11`
- Depends on: `11-link-policy-and-expiry`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**` only

## Objective

Add an optional dashboard-hosted private transcript mode that replaces anonymous public slug access with a dedicated Discord OAuth viewer gate, while preserving the existing public mode when private access is disabled.

## Deliverables

- transcript-plugin access-mode config additions, checker updates, and README coverage
- dashboard config additions for `publicBaseUrl` and Discord viewer OAuth settings plus runtime API URL building
- dedicated dashboard viewer routes, login page, and Discord OAuth flow separate from admin auth
- additive transcript service methods for access-policy reporting and participant-authorized viewer HTML and asset access
- transcript-plugin HTTP behavior that disables plugin-owned public transcript routes in private mode
- service, HTTP, dashboard, and auth tests covering public-mode compatibility and private-mode behavior

## Target file plan

- `plugins/ot-html-transcripts/config/defaults.ts`
- `plugins/ot-html-transcripts/config/register-checker.ts`
- `plugins/ot-html-transcripts/contracts/constants.ts`
- `plugins/ot-html-transcripts/contracts/types.ts`
- `plugins/ot-html-transcripts/service/transcript-service-core.ts`
- `plugins/ot-html-transcripts/service/transcript-service.ts`
- `plugins/ot-html-transcripts/http/server.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`
- `plugins/ot-html-transcripts/test/service.test.ts`
- `plugins/ot-html-transcripts/test/http.test.ts`
- `plugins/ot-dashboard/start.ts`
- `plugins/ot-dashboard/server/dashboard-config.ts`
- `plugins/ot-dashboard/server/dashboard-runtime-api.ts`
- `plugins/ot-dashboard/server/auth.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/server/routes/viewer.ts`
- `plugins/ot-dashboard/server/transcript-service-bridge.ts`
- `plugins/ot-dashboard/server/transcript-control-center.ts`
- `plugins/ot-dashboard/public/views/transcript-viewer-login.ejs`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs`
- `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/transcript-service-bridge.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`

## Locked policy

- Extend `ot-html-transcripts` access policy with `links.access.mode = "public" | "private-discord"`. Default remains `public`.
- Keep current random-slug public sharing unchanged when `links.access.mode = "public"`.
- In `private-discord` mode, the canonical transcript URL becomes a dashboard viewer URL at `GET <basePath>/transcripts/:slug`, built from an explicit dashboard `publicBaseUrl`.
- Keep slug identity, transcript rows, link lifecycle, and slice `11` expiry behavior intact. Private mode changes the route owner and auth gate, not the underlying slug model.
- Viewer auth must be separate from dashboard admin auth:
  - admin auth remains local password auth on `/admin`
  - viewer auth uses Discord OAuth under `/transcripts/_auth/*`
  - a viewer session must not unlock `/admin`
  - an admin session alone must not satisfy the viewer route guard
- Use the existing `express-session` middleware and a separate viewer session field. Do not add Passport or a generic OAuth framework in this slice.
- Discord OAuth scope is `identify` only. Do not query live guild membership, roles, or additional Discord scopes in this slice.
- Participant authorization is transcript-owned and static:
  - authorize when the authenticated Discord user id matches `transcript.creatorId`
  - or when it matches any stored transcript participant row, regardless of participant role
  - do not query live Open Ticket or Discord runtime state to authorize viewer access
- Collapse “slug not found” and “authenticated but not authorized” into the same `404` result to avoid existence leaks.
- Keep slice `11` lifecycle semantics:
  - active private links render normally for authorized viewers
  - expired, revoked, or deleted links return `410 Gone` after viewer auth
  - link expiry never deletes archive bytes or changes transcript status by itself
- Keep the transcript-plugin HTTP server for `/health`, but in `private-discord` mode its `/transcripts/:slug` and `/transcripts/:slug/assets/:assetName` routes return `404`.
- Keep dashboard viewer routes disabled in public mode. When `links.access.mode = "public"`, dashboard `/transcripts/:slug` and `/transcripts/:slug/assets/:assetName` return `404`.
- Keep URL-bearing service flows fail-closed in private mode:
  - `compileHtmlTranscript()` and `reissueTranscript()` must refuse to issue a link when the dashboard runtime API is unavailable or cannot build a public viewer URL
  - transcript list/detail hydration must not throw in that state; they may surface `publicUrl = null` plus access-policy warning state instead
- Make `ot-html-transcripts.server.publicBaseUrl` conditional:
  - still required in public mode
  - allowed to be empty in private mode because the canonical URL owner is `ot-dashboard`
- Make dashboard viewer readiness explicit:
  - `publicBaseUrl` must be a non-empty absolute `http` or `https` URL
  - Discord viewer client id and client secret must be non-empty
  - if a private viewer route is hit while dashboard viewer config is not ready, return `503` with a plain not-ready message instead of falling back to anonymous access
- Keep the dashboard transcript workspace as an admin surface only. This slice may add private-mode status/copy there, but it must not replace the existing admin transcript pages.
- Do not combine this slice with transcript styling/editor work, signed URLs, or wider auth redesign.

## Contract additions

1. In `plugins/ot-html-transcripts/contracts/constants.ts` add `TRANSCRIPT_ACCESS_MODES = ["public", "private-discord"] as const`.
2. In `plugins/ot-html-transcripts/contracts/types.ts` add:
   - `TranscriptAccessMode`
   - `TranscriptAccessPolicy`
   - `TranscriptViewerDocumentResult`
   - `TranscriptViewerAssetResult`
3. Extend `OTHtmlTranscriptsConfigData.links` with:
   - `access.mode`
4. Lock `TranscriptAccessPolicy` to:
   - `mode`
   - `viewerReady`
   - `message`
5. Lock `TranscriptViewerDocumentResult` to:
   - `status`
   - `message`
   - `html`
   - `contentSecurityPolicy`
6. Lock `TranscriptViewerAssetResult` to:
   - `status`
   - `message`
   - `filePath`
   - `contentType`
   - `cacheControl`
7. Extend `OTHtmlTranscriptService` and `TranscriptServiceCore` with additive methods:
   - `getAccessPolicy(): Promise<TranscriptAccessPolicy>`
   - `renderViewerTranscript(slug: string, viewerUserId: string, assetBasePath: string): Promise<TranscriptViewerDocumentResult>`
   - `resolveViewerTranscriptAsset(slug: string, assetName: string, viewerUserId: string): Promise<TranscriptViewerAssetResult>`
8. In `plugins/ot-dashboard/server/dashboard-config.ts` extend `DashboardConfig` with:
   - `publicBaseUrl`
   - `viewerAuth.discord.clientId`
   - `viewerAuth.discord.clientSecret`
9. Lock dashboard env override names to:
   - `OT_DASHBOARD_PUBLIC_BASE_URL`
   - `OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID`
   - `OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET`
10. In `plugins/ot-dashboard/server/dashboard-runtime-api.ts` extend `DashboardRuntimeApi` with:
    - `buildPublicUrl(path: string): string | null`
11. Lock `buildPublicUrl(path)` semantics to:
    - accept a leading-slash path relative to the dashboard root without the configured `basePath`
    - return `publicBaseUrl + joinBasePath(basePath, trimmedPath)`
    - return `null` when `publicBaseUrl` is missing or invalid
12. Mirror the additive access-policy and viewer result contracts into `plugins/ot-dashboard/server/transcript-service-bridge.ts` with `Dashboard`-prefixed equivalents and matching service method names.

## Implementation tasks

1. In `plugins/ot-html-transcripts/config/defaults.ts` add `links.access.mode = "public"`.
2. In `plugins/ot-html-transcripts/config/register-checker.ts`:
   - replace the unconditional non-empty `server.publicBaseUrl` rule with a cross-field validation
   - require absolute `http` or `https` `server.publicBaseUrl` only when `links.access.mode = "public"`
   - accept an empty `server.publicBaseUrl` when `links.access.mode = "private-discord"`
   - validate `links.access.mode` against the new access-mode enum
3. In `plugins/ot-html-transcripts/service/transcript-service-core.ts` centralize canonical URL generation behind one helper that:
   - returns plugin-owned public transcript URLs in `public` mode
   - asks `globalThis[Symbol.for("open-ticket.ot-dashboard")]?.buildPublicUrl("/transcripts/<slug>")` for the canonical viewer URL in `private-discord` mode
   - returns `null` instead of throwing for read-only hydration surfaces when private viewer URL building is unavailable
   - throws a clear not-ready error for compile/reissue flows that must issue a usable URL
4. Add `getAccessPolicy()` to `TranscriptServiceCore` and the service wrapper so admin consumers can see:
   - current access mode
   - whether private viewer URL generation is ready
   - the operator-facing reason when it is not ready
5. Keep `compileHtmlTranscript()` and `reissueTranscript()` additive:
   - in `public` mode they keep current plugin-hosted URLs
   - in `private-discord` mode they issue dashboard viewer URLs only
   - when private viewer readiness is false, they fail closed instead of silently falling back to public links
6. In `TranscriptServiceCore` add a participant-authorization helper that grants viewer access when `viewerUserId` matches:
   - `transcript.creatorId`
   - or any stored transcript participant `userId`
7. Add `renderViewerTranscript()` to `TranscriptServiceCore` and the service wrapper:
   - return `status = "not-found"` when the plugin is in public mode
   - resolve the link by slug without treating authorized private access as anonymous public access
   - return `status = "not-found"` when the slug is missing or the viewer is not authorized
   - return `status = "gone"` for expired, revoked, or deleted links after authorization
   - return `status = "gone"` when the transcript row is `revoked` or `deleted`
   - return `status = "not-found"` when the transcript archive or `index.html` is missing
   - return `status = "ok"` with rendered HTML and CSP when the viewer is authorized and the transcript archive is ready
   - replace the existing asset-base placeholder with the dashboard viewer asset base path, not the plugin HTTP asset path
8. Add `resolveViewerTranscriptAsset()` to `TranscriptServiceCore` and the service wrapper:
   - return `status = "not-found"` in public mode
   - return `status = "not-found"` for missing slug or unauthorized viewer
   - return `status = "gone"` for expired, revoked, or deleted links after authorization
   - return `status = "not-found"` for missing asset metadata or missing mirrored asset files
   - return `status = "ok"` with a safe archive file path, MIME type, and cache-control when authorized
9. In `plugins/ot-html-transcripts/http/server.ts` keep `/health` unchanged, but short-circuit transcript and asset routes to `404` when `links.access.mode = "private-discord"`.
10. In `plugins/ot-dashboard/server/dashboard-config.ts`:
    - add `publicBaseUrl` with default `""`
    - add `viewerAuth.discord.clientId` and `viewerAuth.discord.clientSecret` with default `""`
    - normalize `publicBaseUrl` by trimming whitespace and trailing slashes
    - treat only absolute `http` or `https` values as valid for `buildPublicUrl`
11. In `plugins/ot-dashboard/start.ts` pass the loaded dashboard config into `installDashboardRuntimeApi(...)` so the runtime API can build canonical dashboard URLs.
12. In `plugins/ot-dashboard/server/dashboard-runtime-api.ts` implement `buildPublicUrl(path)` from the loaded config and existing `joinBasePath(...)`.
13. In `plugins/ot-dashboard/server/auth.ts` add dedicated viewer-auth helpers:
    - a viewer-session shape stored separately from `session.authed`
    - a viewer OAuth state payload that stores random state plus sanitized `returnTo`
    - `sanitizeViewerReturnTo(basePath, candidate, fallback)` that accepts only dashboard transcript viewer paths
14. Lock viewer-session storage to:
    - keep only Discord identity data needed for authorization and display
    - store `userId`, `username`, `globalName`, `avatarUrl`, and `authenticatedAt`
    - discard the OAuth access token after fetching `/users/@me`
15. Add `plugins/ot-dashboard/server/routes/viewer.ts` and register it from `createDashboardApp(...)`.
16. Lock viewer route shapes to:
    - `GET /transcripts/_auth/login`
    - `GET /transcripts/_auth/discord`
    - `GET /transcripts/_auth/discord/callback`
    - `GET /transcripts/:slug`
    - `GET /transcripts/:slug/assets/:assetName`
17. Lock viewer login flow to:
    - redirect unauthenticated viewer requests to `/transcripts/_auth/login?returnTo=<viewer-path>`
    - show a dedicated viewer login page with one Discord sign-in action and no admin shell
    - when the viewer is already authenticated and `returnTo` is valid, redirect directly to `returnTo`
18. Lock Discord OAuth flow to:
    - generate a random `state`
    - store `state` plus sanitized `returnTo` in the session
    - redirect to Discord authorize using scope `identify`
    - exchange the callback `code` for a token using direct HTTP calls
    - fetch the current user from Discord `/users/@me`
    - persist viewer identity in the session and redirect to stored `returnTo`
    - reject missing or mismatched `state` with a redirect back to the viewer login page and an error message
19. Keep viewer-session and admin-session capability boundaries explicit:
    - viewer-authenticated requests do not satisfy `requireAuth`
    - admin-authenticated requests without viewer identity still redirect through the viewer login flow for private transcript routes
20. In the dashboard viewer transcript route:
    - if private mode is not active, return `404`
    - if dashboard viewer config is not ready, return `503`
    - if the viewer is unauthenticated, redirect to the viewer login route without checking transcript existence first
    - if the viewer is authenticated, call `renderViewerTranscript(...)` and map `ok` to `200`, `gone` to `410`, and `not-found` to `404`
21. In the dashboard viewer asset route:
    - use the same private-mode, not-ready, and viewer-auth gates as the document route
    - call `resolveViewerTranscriptAsset(...)`
    - stream the safe file path on `ok`
    - map `gone` to `410` and `not-found` to `404`
22. In `plugins/ot-dashboard/server/transcript-service-bridge.ts`:
    - extend the dashboard transcript service contract with `getAccessPolicy()`
    - extend the bridge with the new viewer route result types and methods
    - keep the existing base transcript integration checks intact
23. In `plugins/ot-dashboard/server/transcript-control-center.ts`:
    - include access-policy state in the transcript list and detail view models
    - add admin-facing private-mode and viewer-readiness notices
    - keep all existing revoke, reissue, delete, and export controls unchanged
24. In `plugins/ot-dashboard/public/views/sections/transcripts.ejs` and `plugins/ot-dashboard/public/views/sections/transcript-detail.ejs`:
    - render a notice when private mode is enabled
    - render a warning when private mode is enabled but viewer readiness is false
    - do not add new access-policy mutation forms in this slice
25. In `plugins/ot-dashboard/locales/english.json` add viewer-login copy, private-mode notices, viewer-not-ready warnings, and callback error messages.
26. Update both plugin READMEs so operators know:
    - public mode remains the default
    - private mode requires `ot-dashboard`
    - dashboard `publicBaseUrl` and Discord OAuth credentials are required before private links can be issued
    - plugin public transcript routes intentionally return `404` in private mode

## Service-consumer behavior requirements

- The dashboard transcript workspace must remain an admin surface. Private viewer routes must not render the admin shell or expose admin navigation.
- The dashboard must consume transcript access policy from the service rather than reading transcript-plugin config files directly.
- When private-mode viewer readiness is false, admin transcript list/detail pages must still load and show why new canonical URLs cannot be issued.
- The dashboard must not infer authorization from current ticket runtime state, live guild membership, or dashboard admin auth.
- Private transcript viewer routes must not reveal whether a slug exists before the viewer authenticates.

## Exit criteria

- `links.access.mode = "private-discord"` enables dashboard-hosted canonical transcript URLs without changing public-mode behavior when disabled.
- Authorized transcript participants can open private transcript HTML and assets through dashboard viewer routes after Discord sign-in.
- Unauthenticated private transcript requests redirect into the dedicated viewer gate.
- Authenticated non-participants get `404`, while expired/revoked/deleted private links still return `410`.
- Plugin-owned public transcript routes return `404` in private mode and remain unchanged in public mode.
- Admin transcript list/detail pages show private-mode state and viewer-readiness warnings without introducing new access-management forms.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/service.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/http.test.js`
- `node --test dist/plugins/ot-dashboard/test/auth.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-service-bridge.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
- `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js`

## Required test scenarios

- transcript-plugin config defaults include `links.access.mode = "public"`
- transcript-plugin checker still requires `server.publicBaseUrl` in public mode and accepts an empty one in private mode
- dashboard config loading and env overrides support `publicBaseUrl`, `viewerAuth.discord.clientId`, and `viewerAuth.discord.clientSecret`
- dashboard runtime API `buildPublicUrl(path)` joins `publicBaseUrl`, `basePath`, and the requested viewer path correctly and returns `null` when config is not ready
- private-mode compile and reissue issue dashboard viewer URLs and fail closed when the dashboard runtime API cannot build them
- transcript list/detail hydration stays readable when private mode is enabled but viewer readiness is false, with `publicUrl = null` instead of a crash
- plugin HTTP transcript and asset routes return `404` in private mode while `/health` still works
- dashboard viewer routes return `404` in public mode
- unauthenticated private transcript requests redirect to the viewer login page without disclosing whether the slug exists
- OAuth callback rejects missing or mismatched `state` and succeeds with a valid `code`
- viewer session stores Discord identity without granting `/admin` access
- admin session alone does not satisfy the private viewer route guard
- authorized participants can load transcript HTML and mirrored assets through the dashboard viewer routes
- authenticated non-participants receive `404`
- expired, revoked, and deleted links still return `410` for authorized viewers
- admin transcript list/detail pages render private-mode and viewer-not-ready messaging cleanly

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, and `11` must be implemented and verified first.
- After slice `11`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- live guild-membership or Discord role checks
- signed URLs, query tokens, or other non-OAuth private-link schemes
- generic OAuth frameworks or dashboard admin SSO replacement
- per-transcript access lists, manual participant overrides, or viewer-management controls
- transcript styling/editor work, alternate transcript chrome, or a viewer-side dashboard shell
