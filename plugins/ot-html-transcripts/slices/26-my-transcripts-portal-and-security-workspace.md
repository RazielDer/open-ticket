# Slice 26: My Transcripts Portal And Security Workspace

- Phase: `P14`
- Status: `blocked-after-25`
- Depends on: `25-viewer-live-access-and-my-transcripts-service`
- Allowed writes: `plugins/ot-dashboard/**`, `plugins/ot-html-transcripts/**` only

## Objective

Build the two new user-facing surfaces for the stricter access model: a viewer-host `My Transcripts` portal and an Admin-only security workspace inside the existing dashboard shell.

## Deliverables

- `GET /me/transcripts` on the viewer host
- a read-only transcript portal using service-owned accessible-transcript results
- `GET /admin/security` plus save flow on the admin host
- Advanced-page entry into the security workspace without adding a new primary rail item
- UI for non-secret RBAC and host-routing configuration
- read-only secret readiness status for Discord/session/breakglass secrets
- tests proving page reachability, copy density, and tier boundaries

## Target file plan

- `plugins/ot-dashboard/server/routes/viewer.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/server/home-setup-models.ts`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/config-service.ts`
- `plugins/ot-dashboard/public/views/transcript-viewer-login.ejs`
- `plugins/ot-dashboard/public/views/admin-shell.ejs`
- `plugins/ot-dashboard/public/views/sections/advanced.ejs`
- `plugins/ot-dashboard/public/views/sections/transcripts.ejs` only if a small reuse extract is justified
- new viewer/admin section templates under `plugins/ot-dashboard/public/views/`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`

## Locked policy

- `My Transcripts` is read-only and viewer-host only.
- The portal lists only currently accessible transcripts. It is not a global search surface.
- Portal fields are intentionally compact:
  - transcript id
  - ticket/channel identifiers when available
  - created/updated labels
  - access classification label
  - open action
- The security workspace lives under the existing admin shell and Advanced flow. Do not add a new rail section.
- The security workspace may edit only:
  - `publicBaseUrl`
  - `viewerPublicBaseUrl`
  - `trustProxyHops`
  - `rbac.ownerUserIds`
  - `rbac.roleIds.reviewer|editor|admin`
  - `rbac.userIds.reviewer|editor|admin`
  - `auth.breakglass.enabled`
- The security workspace may not edit:
  - Discord client secret
  - session secret
  - breakglass password hash
  - low-level session lifetime or login rate-limit tuning
- Security saves must automatically create a backup snapshot and an audit record before applying the change.
- Styling is locked:
  - reuse the current public-entry, admin-shell, section-card, summary-card, item-card, and table patterns
  - no glow
  - no new gradients or marketing hero layout
  - no redundant instructional paragraphs
  - keep page intros short and operational

## Implementation tasks

1. Add the viewer-host `My Transcripts` route and page model.
2. Render the accessible-transcript list with compact cards/table patterns that match current transcript/admin styling.
3. Add the admin-host security route and page model under the existing Advanced flow.
4. Wire the security save flow through config-service with automatic backup creation and narrowed field persistence.
5. Surface secret readiness as read-only status pills or compact notices rather than editable fields.
6. Add localized copy for the portal and security workspace.
7. Extend tests for route reachability, tier boundaries, form persistence, and compact UI copy.

## Exit criteria

- Signed-in creators and assigned staff can browse only their currently accessible transcripts from the viewer host.
- Admins have an in-dashboard security workspace for RBAC and host-routing management without exposing secrets.
- The new pages visually match the current matte dark dashboard and viewer surfaces.
- No new global transcript inventory is introduced for non-admin users.

## Verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`

## Required test scenarios

- `My Transcripts` lists creator-owned accessible transcripts only
- recorded-admin staff sees only assigned accessible transcripts
- reviewer without transcript assignment sees an empty state rather than global records
- admin can open `/admin/security`
- editor and reviewer are denied from `/admin/security`
- security workspace writes only the allowed non-secret fields
- new pages stay compact and do not introduce glow or redundant copy

## Promotion gate

- Slice `25` must be implemented and verified first.
- After slice `26`, update kernel state and then promote slice `27`.

## Out of scope

- raw security JSON editor
- global non-admin transcript search
- browser-side ticket creation or ticket mutations
