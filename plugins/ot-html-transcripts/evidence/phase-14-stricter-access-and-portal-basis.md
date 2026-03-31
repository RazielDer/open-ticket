# Phase 14 Stricter Access And Portal Basis

## Goal

Turn the current private transcript viewer and dashboard into a Cloudflare-ready, Discord-identity-driven access model that is narrow enough for implementation and strict enough for production.

## Current observations

- `ot-dashboard` still uses local password admin auth, `express-session` default MemoryStore, and an in-memory IP rate limiter.
- The current viewer Discord OAuth flow uses only stored transcript creator/participant metadata for authorization and does not revalidate current guild membership or live staff role state.
- The current viewer callback sets viewer session state without regenerating the session.
- The current dashboard config has only one `publicBaseUrl`, so admin and viewer hosts cannot be modeled separately today.
- `/admin/transcripts` is a global admin inventory. It is not a safe discovery surface for ordinary staff if the desired rule is “only transcripts they are supposed to see.”
- The current dashboard already has stable style anchors:
  - `public/views/login.ejs`
  - `public/views/transcript-viewer-login.ejs`
  - `public/views/admin-shell.ejs`
  - `public/views/sections/advanced.ejs`
  - `public/views/sections/transcripts.ejs`

## Critique closed into the plan

- Fresh authorization is now explicit. The plan no longer trusts stored transcript metadata alone for staff access. Every authorized request must revalidate current guild membership and live role eligibility through the running bot, with cache freshness capped at `60s`.
- Non-admin staff discovery is now narrowed. The plan no longer widens `/admin/transcripts` to reviewers. It adds a viewer-host `My Transcripts` portal that lists only currently accessible transcripts.
- Auth durability is now explicit. MemoryStore and in-memory login throttling are replaced with a plugin-owned SQLite auth store at `runtime/ot-dashboard/auth.sqlite`.
- Session fixation is now addressed. Both admin and viewer flows must regenerate sessions on successful login and logout.
- Split-host routing is now explicit. The plan distinguishes the admin host and viewer host, defines canonical-host handling, isolates cookies by host, and adds proxy-trust configuration instead of relying on the current loopback-only heuristic.
- Editor scope is tightened. Editors no longer reach `General`, `Transcripts`, raw JSON editors, restore flows, plugin/runtime/evidence pages, or transcript actions.
- Secret handling is narrowed. The future security workspace may edit only non-secret RBAC and host-routing fields. OAuth client secret, session secret, and breakglass password hash remain env/config managed and read-only in the UI.
- Styling is now locked. New admin and viewer pages must reuse the current matte dark shell, compact cards, and dense copy style. No glow, no new hero slabs, and no redundant instructional text.

## Locked implementation decisions

- Split-host deployment is the target:
  - `dash.<domain>` for the admin host, expected to sit behind Cloudflare Access.
  - `records.<domain>` for the viewer host, public at the edge but gated by in-app Discord sign-in.
- The application must still enforce auth and authorization itself. Cloudflare Access may add an outer gate for the admin host, but the app must not trust Access headers as the sole authority.
- Access tiers are locked:
  - `Reviewer`: viewer-host only.
  - `Editor`: reviewer capabilities plus visual `Options`, `Panels`, and `Questions`.
  - `Admin`: full admin host plus transcript/security authority.
- `My Transcripts` is read-only and is the default discovery surface for creators and non-admin staff.
- Global transcript inventory remains Admin-only.
- Viewer access rules are locked:
  - creator access requires current guild membership
  - staff access requires current guild membership, live `Reviewer+` eligibility, and stored transcript participant role `admin`
  - stored transcript participant role `participant` never grants web viewer access by itself
  - owner overrides are treated as admin-tier direct access, not a second global list
- Durable auth storage is locked to SQLite inside `ot-dashboard`, not a dependency on transcript-plugin storage classes.
- Separate admin/viewer cookies are required and remain host-only.
- Viewer and admin sessions must store identity only. Authoritative tier/capability resolution is live per request.
- Breakglass local password auth remains disabled by default and restricted to the admin host only.
- Browser-side ticket creation and browser-side ticket actions remain out of scope for P14.

## Remaining non-blocking deployment inputs

- Final external hostnames for `publicBaseUrl` and `viewerPublicBaseUrl`
- Final Discord OAuth callback URLs registered in the Discord application
- Cloudflare Access policy details for `dash.<domain>`
- Final owner Discord user IDs and staff role ID mappings

These are deployment values, not planning blockers.

## Slice 23 Verification Evidence

Backfill note: the original sequential execution completed slice `23`, but this evidence section was missing from the phase-14 file when the final closeout audit ran. The commands below were rerun on `2026-03-29` against the completed P14 plugin state to repair the missing evidence trail without leaving the gap undocumented.

### Backfill rerun

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:52:43.0482332Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T21:52:56.3950007Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T21:53:03.0683628Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..49, pass 49, fail 0`

## Slice 24 Verification Evidence

### Attempt 1

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:20:24.2963720Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T20:20:34.7569305Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
   timestamp_utc: `2026-03-29T20:20:41.3791043Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `app.test.js plugin inventory/plugin asset/runtime workbench assertions failed because the test runtime bridge no longer surfaced plugin fixture detail, and operational-pages.test.js still used the live admin Discord client instead of a stub.`

### Attempt 2

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:22:05.2000842Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T20:22:16.0978320Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
   timestamp_utc: `2026-03-29T20:22:22.5503558Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..48, pass 48, fail 0`

## Slice 25 Verification Evidence

### Attempt 1

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:47:06.4647550Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `transcript-service-bridge.test.ts failed because the viewer fixture returned document and asset results without the new accessPath field.`

### Attempt 2

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:47:36.8519856Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
   timestamp_utc: `2026-03-29T20:47:50.1197512Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..55, pass 55, fail 0`

3. command: `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T20:48:01.0650498Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `viewer-routes.test.js cached a previously resolved member, so the fail-closed case still returned 200 instead of 404.`

### Attempt 3

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:48:29.1460871Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
   timestamp_utc: `2026-03-29T20:48:43.7340582Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..55, pass 55, fail 0`

3. command: `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T20:48:52.9359672Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `viewer-routes.test.js authorized-viewer fixture accidentally used the fail-closed identity and returned 404 instead of 200.`

### Attempt 4

1. command: `npm run build`
   timestamp_utc: `2026-03-29T20:49:23.7474787Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
   timestamp_utc: `2026-03-29T20:49:34.7383634Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..55, pass 55, fail 0`

3. command: `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T20:49:43.6633483Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..5, pass 5, fail 0`

## Slice 26 Verification Evidence

### Attempt 1

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:12:47.0000000Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `config-service.ts failed because the security form passed unknown values into normalizeDashboardPublicBaseUrl for publicBaseUrl and viewerPublicBaseUrl.`

### Attempt 2

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:13:55.8428537Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T21:14:09.4271625Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
   timestamp_utc: `2026-03-29T21:14:15.4301079Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..43, pass 43, fail 0`

## Slice 27 Verification Evidence

### Attempt 1

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:30:00.7269227Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T21:30:15.9774358Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `viewer-routes.test.js showed admin-session invalidation staying 200 because runtime-member cache was used before a fresh live lookup.`

### Attempt 2

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:30:49.4500608Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js`
   timestamp_utc: `2026-03-29T21:31:03.0637066Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..19, pass 19, fail 0`

3. command: `node --test dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js`
   timestamp_utc: `2026-03-29T21:31:13.0432773Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..48, pass 48, fail 0`

## Slice 28 Verification Evidence

### Attempt 1

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:37:06.2089828Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T21:37:19.6866838Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
   timestamp_utc: `2026-03-29T21:37:27.8021630Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `The final sweep exposed stale dashboard tests: app.test.js still asserted pre-P14 login copy and transcript-workspace.test.js still used the retired password login flow.`

### Attempt 2

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:42:13.6347723Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T21:42:26.9179440Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
   timestamp_utc: `2026-03-29T21:42:34.5019194Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..68, pass 68, fail 0`

4. command: `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
   timestamp_utc: `2026-03-29T21:44:41.5928700Z`
   exit_code: `1`
   classification: `fail`
   key_output_excerpt: `plugin-contract.test.js still expected the pre-viewerAccess README service signatures and the README was missing several locked operator-surface phrases.`

### Attempt 3

1. command: `npm run build`
   timestamp_utc: `2026-03-29T21:46:44.2226600Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `OT: Compilation Succeeded!`

2. command: `npm --prefix plugins/ot-dashboard run build:editor`
   timestamp_utc: `2026-03-29T21:47:00.5506860Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `public\\js\\vendor\\codemirror-json.js  823.3kb`

3. command: `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
   timestamp_utc: `2026-03-29T21:47:07.7947668Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..68, pass 68, fail 0`

4. command: `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`
   timestamp_utc: `2026-03-29T21:47:27.8374311Z`
   exit_code: `0`
   classification: `pass`
   key_output_excerpt: `1..78, pass 78, fail 0`
