# OT Dashboard

`ot-dashboard` is the operator-facing admin and viewer gateway for Open Ticket. It lives entirely under `plugins/ot-dashboard` and is the canonical browser surface for dashboard configuration work, transcript administration, and the Discord-gated private transcript viewer.

This README follows the live contract in [`server/dashboard-config.ts`](server/dashboard-config.ts). The checked-in [`config.json`](config.json) is only a local sample and does not show every field the live loader supports.

## What It Does

- Serves the admin host for setup, transcript operations, add-on visibility, config editors, runtime state, and evidence.
- Serves the viewer host for Discord-authenticated private transcript viewing and `My Transcripts`.
- Revalidates Discord membership and RBAC on authorized requests, with live checks first and short cache fallback.
- Keeps `Reviewer`, `Editor`, and `Admin` capability boundaries inside the dashboard instead of delegating all access decisions to a reverse proxy.
- Stores dashboard auth/session state in its own SQLite file, separate from transcript storage.
- Keeps the shared dashboard chrome text-only and footer-free; `/health` stays available as a direct route instead of a visible shortcut.

## Admin Host Vs Viewer Host

Admin host responsibilities:

- `/login`
- `/admin`
- `/admin/transcripts`
- `/admin/plugins`
- `/admin/advanced`
- `/admin/security`
- `/admin/runtime`
- `/admin/evidence`
- `/visual/general`
- `/visual/options`
- `/visual/panels`
- `/visual/questions`
- `/visual/transcripts`
- `/config/:id`

Viewer host responsibilities:

- `/transcripts/_auth/login`
- `/transcripts/_auth/discord`
- `/transcripts/_auth/discord/callback`
- `/me/transcripts`
- `/transcripts/:slug`

The viewer host is the active transcript browser surface when `ot-html-transcripts` is running in `private-discord` mode.

If `basePath` is not `/`, every route is served under that prefix.

## Login Methods And Breakglass Posture

- Normal admin access is Discord OAuth from the admin host login page.
- The admin-host sign-in page uses the admin-only `public/assets/eotfs-login-hero.png` art and one Discord CTA.
- Viewer access is Discord OAuth from the viewer host when private transcript viewing is enabled.
- The viewer-host sign-in page stays art-free and does not reuse shared header navigation or explainer cards.
- `auth.password` and `auth.passwordHash` still exist in the config loader for compatibility, but the live operator-facing login flow is Discord-first.
- Breakglass is an emergency recovery posture, not a normal access path.
- The Security workspace exposes the enable/disable toggle, but the actual breakglass hash remains config or env managed.
- Do not enable breakglass unless you have already set a real `auth.breakglass.passwordHash`.

## RBAC Model

- `Reviewer`: viewer-host access to transcript viewing and `My Transcripts`.
- `Editor`: admin-host access plus the visual editors for `options`, `panels`, and `questions`.
- `Admin`: full admin rail, transcript management, security, runtime, evidence, raw config review/apply, and plugin management views.
- `ownerUserIds`: direct bootstrap admins for the first trusted operator.

RBAC sources:

- `rbac.ownerUserIds`
- `rbac.roleIds.reviewer`, `rbac.roleIds.editor`, `rbac.roleIds.admin`
- `rbac.userIds.reviewer`, `rbac.userIds.editor`, `rbac.userIds.admin`

Bootstrap guidance:

- Seed at least one trusted Discord user id in `rbac.ownerUserIds` before exposing the admin host.
- Prefer role-based mappings for ongoing staff access.
- Use user-id mappings only for explicit exceptions.

## What To Fill Out

The live loader merges values in this order:

1. `OT_DASHBOARD_*` environment variables
2. `plugins/ot-dashboard/config.json`
3. defaults from `server/dashboard-config.ts`

File-backed fields such as `dashboardName` and `brand.*` currently come from `config.json`. Most network, auth, and RBAC fields support environment overrides.

### Required Before Exposure

Set these before you put the dashboard behind a public hostname:

- `publicBaseUrl`
- `auth.sessionSecret`
- Discord OAuth client id and secret
- at least one RBAC owner, admin role, or admin user mapping

Set these when you split admin and viewer traffic across different hostnames:

- `viewerPublicBaseUrl`
- `viewerAuth.discord.clientId` and `viewerAuth.discord.clientSecret` if you want viewer-specific OAuth credentials

If you keep one Discord application for both hosts, the viewer flow can reuse `auth.discord.clientId` and `auth.discord.clientSecret`.

### Core Config Keys

Network and routing:

- `host`
- `port`
- `basePath`
- `publicBaseUrl`
- `viewerPublicBaseUrl`
- `trustProxyHops`

Identity and branding:

- `dashboardName`
- `locale`
- `brand.title`
- `brand.faviconPath`
- `brand.primaryColor`
- `brand.accentColor`
- `brand.backgroundColor`
- `brand.surfaceColor`
- `brand.textColor`

Compatibility-loaded legacy brand keys:

- `brand.logoPath`
- `brand.creditName`
- `brand.creditUrl`

Those legacy keys are still loaded by the config layer, but the current shared dashboard UI does not render a shared in-page logo or footer vendor links.

Admin auth and session storage:

- `auth.sessionSecret`
- `auth.sqlitePath`
- `auth.maxAgeHours`
- `auth.loginRateLimit.windowMinutes`
- `auth.loginRateLimit.maxAttempts`
- `auth.discord.clientId`
- `auth.discord.clientSecret`
- `auth.breakglass.enabled`
- `auth.breakglass.passwordHash`

Compatibility auth fields still loaded by the config layer:

- `auth.password`
- `auth.passwordHash`

Viewer auth:

- `viewerAuth.discord.clientId`
- `viewerAuth.discord.clientSecret`

RBAC:

- `rbac.ownerUserIds`
- `rbac.roleIds.reviewer`
- `rbac.roleIds.editor`
- `rbac.roleIds.admin`
- `rbac.userIds.reviewer`
- `rbac.userIds.editor`
- `rbac.userIds.admin`

### Environment Override Names

Network and routing:

- `OT_DASHBOARD_HOST`
- `OT_DASHBOARD_PORT`
- `OT_DASHBOARD_BASE_PATH`
- `OT_DASHBOARD_PUBLIC_BASE_URL`
- `OT_DASHBOARD_VIEWER_PUBLIC_BASE_URL`
- `OT_DASHBOARD_TRUST_PROXY_HOPS`
- `OT_DASHBOARD_LOCALE`

Admin auth:

- `OT_DASHBOARD_PASSWORD`
- `OT_DASHBOARD_PASSWORD_HASH`
- `OT_DASHBOARD_SESSION_SECRET`
- `OT_DASHBOARD_AUTH_SQLITE_PATH`
- `OT_DASHBOARD_DISCORD_CLIENT_ID`
- `OT_DASHBOARD_DISCORD_CLIENT_SECRET`
- `OT_DASHBOARD_BREAKGLASS_ENABLED`
- `OT_DASHBOARD_BREAKGLASS_PASSWORD_HASH`
- `OT_DASHBOARD_MAX_AGE_HOURS`
- `OT_DASHBOARD_RATE_WINDOW_MINUTES`
- `OT_DASHBOARD_RATE_MAX_ATTEMPTS`

Viewer auth:

- `OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID`
- `OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET`

RBAC:

- `OT_DASHBOARD_RBAC_OWNER_USER_IDS`
- `OT_DASHBOARD_RBAC_REVIEWER_ROLE_IDS`
- `OT_DASHBOARD_RBAC_EDITOR_ROLE_IDS`
- `OT_DASHBOARD_RBAC_ADMIN_ROLE_IDS`
- `OT_DASHBOARD_RBAC_REVIEWER_USER_IDS`
- `OT_DASHBOARD_RBAC_EDITOR_USER_IDS`
- `OT_DASHBOARD_RBAC_ADMIN_USER_IDS`

`viewerPublicBaseUrl` falls back to `publicBaseUrl` when empty. That is valid for a single-host deployment, but separate viewer and admin hosts are easier to reason about in private transcript mode.

## Discord OAuth Requirements

Register callback URLs that match your chosen hostnames and `basePath`.

Examples when `basePath` is `/`:

- Admin callback: `https://dash.example.com/login/discord/callback`
- Viewer callback: `https://records.example.com/transcripts/_auth/discord/callback`

Examples when `basePath` is `/dash`:

- Admin callback: `https://dash.example.com/dash/login/discord/callback`
- Viewer callback: `https://records.example.com/dash/transcripts/_auth/discord/callback`

The dashboard can reuse one Discord application for both hosts if both callback URLs are registered.

## Page-By-Page Operator Guide

### Home

The home page is the setup and readiness landing page. Use it to confirm whether transcript integration, security posture, and configuration coverage are ready before you expose the dashboard.

### Transcripts

Use the global transcript workspace to:

- browse transcript inventory
- open transcript detail
- revoke, reissue, or delete transcript links
- export one transcript or a bulk selection
- inspect transcript integration state

### Add-ons / Plugins

The plugin workspace shows installed plugin entries, plugin detail, and plugin asset detail. Treat it as the dashboard's view of add-on state, not as a replacement for plugin README files.

### Advanced

Use the advanced and raw config surfaces when you need review/apply/export/restore flows rather than the simplified visual editors.

### Security

Use Security for:

- non-secret routing posture review
- RBAC editing
- breakglass enablement state
- secret-readiness indicators

The Security page does not reveal stored secret values.

### Runtime

Use Runtime when you need the current plugin/runtime bridge state, deployment warnings, and integration health signals.

### Evidence

Use Evidence to review config backups and restore points tied to dashboard-managed config changes.

### Visual Editors

Visual editors exist for:

- `general`
- `options`
- `panels`
- `questions`
- `transcripts`

Editors are faster for day-to-day operator edits. Raw config pages remain available when you need full JSON review.

## Transcript Viewer Behavior

With `ot-html-transcripts` in `links.access.mode = "private-discord"`:

- canonical transcript URLs move to the dashboard viewer host
- public transcript routes from `ot-html-transcripts` stop serving transcript documents
- `My Transcripts` becomes the only browser discovery surface for creators and non-admin staff

Locked viewer access rules:

- creators must still be current guild members
- staff viewers must be current guild members, hold live `Reviewer` or higher access, and have a stored participant role of `admin` on the transcript
- stored participant role `participant` does not grant browser access
- owner override can still open a transcript directly, but that does not populate `My Transcripts`

## Reverse Proxy And Exposure

Recommended deployment shape:

- bind the dashboard to loopback
- publish it through a trusted reverse proxy or tunnel
- set `trustProxyHops` to the exact hop count in front of the dashboard
- use HTTPS for externally visible URLs

The live warning system will complain when:

- `host` is not loopback-only
- `publicBaseUrl` is missing or invalid
- `viewerPublicBaseUrl` is invalid
- `auth.sessionSecret` is missing, short, or still placeholder
- Discord OAuth values are missing
- breakglass is enabled without a hash

## Optional Plugin Integrations

Other plugins can register dashboard extensions through:

```ts
globalThis[Symbol.for("open-ticket.ot-dashboard")]
```

Supported helpers include:

- `registerActionProvider(provider)`
- `registerPluginEntry(entry)`
- `buildPublicUrl(path)`
- `buildViewerPublicUrl(path)`

Plugins must soft-fail when the dashboard runtime API is unavailable.

## Verification

From the Open Ticket repo root:

```bash
npm --prefix plugins/ot-dashboard install
npm --prefix plugins/ot-dashboard run build:editor
npm run build
node --test dist/plugins/ot-dashboard/test
```
