# Slice 24: Admin Discord Auth, Live RBAC, And Route Guards

- Phase: `P14`
- Status: `ready-after-23`
- Depends on: `23-dashboard-auth-store-and-dual-host-foundation`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Replace primary admin login with Discord OAuth, resolve live tier/capability state from the running bot on every authorized request, and enforce the tighter Reviewer/Editor/Admin scope across all admin routes, APIs, and visible navigation.

## Deliverables

- Discord admin login/logout and callback routes on the admin host
- seeded owner bootstrap from config/env
- live guild-member and role revalidation on every authorized admin request
- a locked capability matrix for Reviewer, Editor, and Admin
- route guards and nav/action hiding that respect the capability matrix
- Editor-only visual editor access without raw JSON or transcript/runtime escape hatches
- tests proving admin-host access shrinks correctly by tier

## Target file plan

- `plugins/ot-dashboard/server/auth.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/server/dashboard-config.ts`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/server/routes/api.ts`
- `plugins/ot-dashboard/server/runtime-bridge.ts`
- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/partials/editor-advanced-tools.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/auth.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- Admin login routes are:
  - `GET /login`
  - `GET /login/discord`
  - `GET /login/discord/callback`
  - `POST /logout`
- `auth.discord.*` is the primary OAuth config source. `viewerAuth.discord.*` may remain as a fallback alias for compatibility.
- Session payload stores identity only:
  - Discord user id
  - username
  - global/display name
  - avatar URL
  - authenticated timestamp
- Authoritative admin tier is never stored in session. It is resolved live on every authorized request.
- Live member cache freshness is capped at `60s`. If the cache is stale and refresh fails, deny access.
- Current guild membership is required even for seeded owners. `ownerUserIds` only bypass missing role mappings, not guild membership.
- Capability matrix is locked to:
  - `viewer.portal`: `Reviewer`, `Editor`, `Admin`
  - `config.write.visual`: `Editor`, `Admin`
  - `admin.shell`: `Editor`, `Admin`
  - `transcript.view.global`: `Admin`
  - `transcript.manage`: `Admin`
  - `config.write.general`: `Admin`
  - `config.write.security`: `Admin`
  - `runtime.view`: `Admin`
  - `plugin.manage`: `Admin`
- `Reviewer` may not access any `/admin/**` route.
- `Editor` may access only the visual `Options`, `Panels`, and `Questions` pages plus their save/reorder/delete APIs.
- `Editor` may not access:
  - `General`
  - `Transcripts`
  - raw JSON editors
  - review/apply/export/restore tools
  - runtime
  - evidence
  - plugin management
  - backups
  - transcript destructive actions
- The `login.ejs` refresh must preserve the existing public-entry structure and styling. Replace the password-first flow with a Discord CTA, not a new visual concept.
- If breakglass is ever enabled, it must stay visually secondary and admin-host only.

## Implementation tasks

1. Extend config normalization for owner ids, role mappings, and user overrides.
2. Add an admin Discord OAuth client and callback flow using the same Discord application config family.
3. Add live guild-member resolution through the running bot and map live Discord state to the locked capability matrix.
4. Add middleware for:
   - authenticated identity
   - live authorization refresh
   - capability enforcement
5. Apply capability guards to all admin GET, POST, and API routes.
6. Trim rail navigation, hero actions, advanced cards, and editor advanced tools based on capability.
7. Rework visual editor pages so Editors keep only visual tools and lose raw/review/restore affordances.
8. Extend tests for Reviewer denial, Editor narrowing, Admin full access, and owner bootstrap behavior.

## Exit criteria

- Admin login uses Discord OAuth rather than the current local password flow.
- Reviewer is denied from admin routes.
- Editor reaches only the locked visual editor scope.
- Admin retains current admin capabilities.
- Session fixation is prevented by regeneration on successful login and logout.
- The refreshed admin login and editor pages still match the current matte dark dashboard language.

## Verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`

## Required test scenarios

- Discord admin login success and callback failure paths
- seeded owner can bootstrap admin access while a non-mapped member cannot
- reviewer is denied from `/admin`
- editor can open and save `Options`, `Panels`, and `Questions`
- editor is denied from `General`, `Transcripts`, runtime, plugin, evidence, backups, and raw editors
- admin nav and hero actions still surface the full current admin toolset
- login page stays compact and does not introduce glow or redundant explanatory copy

## Promotion gate

- Slice `23` must be implemented and verified first.
- After slice `24`, update kernel state and then promote slice `25`.

## Out of scope

- viewer-host `My Transcripts` list UI
- security workspace UI
- transcript viewer access policy changes inside `ot-html-transcripts`
