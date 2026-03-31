# Slice 15: Dashboard Self-Registration and Workbench Refactor

- Phase: `P10`
- Status: `ready-after-14`
- Depends on: `14-transcript-editor-copy-and-localization`
- Allowed writes: `plugins/ot-html-transcripts/**`, `plugins/ot-dashboard/**`

## Objective

Remove the dashboard plugin-detail special-case for `ot-html-transcripts` by moving transcript workbench ownership into the existing plugin registration path, while keeping the current transcript workbench behavior and plugin detail UX intact.

## Deliverables

- plugin-owned dashboard registration path for transcript workbench behavior
- a generic provider-backed cohesive workbench section in the dashboard plugin registry
- removal of transcript-specific plugin-detail route and template special-casing in `ot-dashboard`
- regression coverage proving transcript workbench behavior, plugin action cards, and transcript workspace links still work

## Target file plan

- `plugins/ot-dashboard/server/dashboard-plugin-registry.ts`
- `plugins/ot-dashboard/server/dashboard-runtime-api.ts`
- `plugins/ot-dashboard/server/create-app.ts`
- `plugins/ot-dashboard/server/control-center.ts`
- `plugins/ot-dashboard/server/routes/admin.ts`
- `plugins/ot-dashboard/public/views/sections/plugin-detail.ejs`
- `plugins/ot-dashboard/test/plugin-dashboard-registry.test.ts`
- `plugins/ot-dashboard/test/self-containment.test.ts`
- `plugins/ot-dashboard/test/transcript-workspace.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-html-transcripts/index.ts`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`

## Locked policy

- Keep route paths and existing dashboard auth behavior intact:
  - `GET /admin/plugins/:id`
  - `GET /admin/transcripts`
  - `GET /admin/transcripts/:target`
  - `GET /visual/transcripts`
- Do not widen this slice into new transcript features. No new transcript service methods, dashboard routes, retention logic, integrity actions, export flows, access-control behavior, or editor behavior belong here.
- Preserve `ot-html-transcripts:service` as the only cross-plugin transcript data contract. `ot-dashboard` must not read transcript SQLite state directly and this slice must not introduce a dashboard-owned transcript summary cache.
- Remove the route-level `detail.id === "ot-html-transcripts"` branch in `ot-dashboard`. After this slice, transcript workbench rendering must come through the plugin registry path only.
- Remove the dedicated `detail.transcriptWorkspace` block from the plugin-detail template. After this slice, plugin workbench content must render through `detail.registrySections` only.
- Keep plugin-owned action cards separate from plugin-owned workbench content. The workbench section is for transcript workspace/status shortcuts; runtime automation actions remain in the existing plugin action card area.
- Extend the dashboard plugin registry, not the action-provider system, with a dynamic section builder:
  - add `DashboardPluginSectionResolverContext`
  - add optional `buildSections(context)` on `DashboardPluginDashboardEntry`
  - keep existing `assetHints` and static `sections` support intact
- Lock `DashboardPluginSectionResolverContext` to:
  - `basePath: string`
  - `buildPath: (...segments: string[]) => string`
- Do not expose dashboard config service, transcript-specific helpers, runtime snapshots, or plugin details through the resolver context. Plugin-owned builders must derive their own data from the Open Ticket runtime if they need it.
- Add one cohesive `workbench` section type to the registry. Lock its shape to:
  - `type: "workbench"`
  - `id: string`
  - `title: string`
  - optional `badge: { label: string; tone: "info" | "success" | "warning" | "danger" | "muted" }`
  - optional `body: string`
  - optional `summaryItems: Array<{ label: string; value: string; detail?: string }>`
  - optional `actions: Array<{ label: string; href: string; description?: string; confirmText?: string; method?: "get" | "post" }>`
- Keep `notice`, `summary`, `list`, and `actions` registry section types unchanged.
- Lock section resolution behavior to:
  - static `sections` render first
  - `buildSections(context)` output renders after static sections
  - if `buildSections(context)` throws, the dashboard degrades to one warning `notice` section for that plugin instead of breaking the whole plugin detail page
  - if `buildSections(context)` returns an invalid value, treat it as a provider failure and degrade the same way
- Keep the registry failure fallback generic and dashboard-owned. It must not mention transcripts specifically.
- Make plugin-detail registry section loading async end-to-end:
  - the registry bridge becomes async for `listSections(...)`
  - `buildPluginDetailModel(...)` becomes async
  - `admin/plugins/:id` awaits the resolved plugin-detail model
- Keep the dashboard runtime API method names unchanged. This slice widens the `registerPluginEntry(...)` entry shape; it does not add a second registration method.
- Register the transcript workbench from `ot-html-transcripts` through the existing runtime API during plugin bootstrap. Lock the bootstrap behavior to:
  - read `globalThis[Symbol.for("open-ticket.ot-dashboard")]`
  - soft-fail when the dashboard runtime API is absent
  - register at most once per process
  - avoid direct imports from dashboard server modules into `ot-html-transcripts`
- Let `ot-html-transcripts` derive its workbench content from runtime-owned sources only:
  - mode from `opendiscord.configs.get("opendiscord:transcripts").data.general.mode`
  - service from `opendiscord.plugins.classes.get("ot-html-transcripts:service")`
  - summary from `service.getSummary()` only when the service exists and `isHealthy()` is true
- Lock transcript workbench semantics to match the current dedicated panel:
  - title: `Transcript workspace`
  - body format: `Configured mode: {MODE}. {MESSAGE}`
  - actions:
    - `Open transcript workspace` -> `buildPath("admin", "transcripts")`
    - `Open transcript settings` -> `buildPath("visual", "transcripts")`
  - summary item slots remain:
    - `Integration`
    - `Archived transcripts`
    - `Failures`
    - `Archive size`
- Lock transcript workbench badge and message states to:
  - `Ready` / `success` when the service exists and `isHealthy()` returns true
  - `Unhealthy` / `danger` when the service exists but is not healthy
  - `Service missing` / `danger` when the plugin is running but the service class is unavailable
- Lock the healthy summary-item details to preserve current behavior:
  - `Archived transcripts`: total count, detail `{active} active, {partial} partial, {revoked} revoked`
  - `Failures`: failed count, detail `{deleted} deleted, {building} building`
  - `Archive size`: formatted total bytes, detail `{queueDepth} queued, {recoveredBuilds} recovered on startup`
- Lock the non-healthy summary state to preserve four card slots while making data unavailable:
  - `Integration`: current badge label and message
  - `Archived transcripts`: `Unavailable`
  - `Failures`: `Unavailable`
  - `Archive size`: `Unavailable`
  - non-integration details use `Summary data appears once the transcript service reports healthy.`
- The transcript workbench builder should catch `getSummary()` failures and return the non-healthy workbench shape instead of throwing. Registry-level fallback is reserved for unexpected builder failures.
- Keep this slice inside `plugins/ot-html-transcripts/**` and `plugins/ot-dashboard/**` only.

## Implementation tasks

1. In `dashboard-plugin-registry.ts`, add the new resolver context type, the `workbench` section type, and optional provider-backed `buildSections(context)` support on plugin entries.
2. Normalize provider-returned workbench sections the same way existing registry sections are normalized, including action method defaults and path-safe asset hints.
3. Make `listDashboardPluginSections(pluginId, context)` async so it can merge static sections and provider-built sections in order.
4. In `create-app.ts`, widen the plugin-registry bridge contract so plugin-detail model building can request sections with resolver context.
5. In `control-center.ts`, make `buildPluginDetailModel(...)` async and source `registrySections` from the async bridge. Remove the now-unused transcript workbench helper export.
6. In `routes/admin.ts`, delete the transcript-specific branch under `GET /admin/plugins/:id` and await the async plugin-detail model directly.
7. In `plugin-detail.ejs`, remove the dedicated transcript workbench block and add `workbench` rendering inside the existing `registrySections` loop.
8. Lock workbench rendering to preserve the current cohesive panel feel:
  - section heading with title and optional badge
  - optional body paragraph
  - summary grid using `summaryItems`
  - sticky action row using `actions`
9. Keep generic `actions` sections and plugin action cards rendering exactly as they do today.
10. In `ot-html-transcripts`, add a small bootstrap helper that registers the plugin entry via the dashboard runtime API when available.
11. Make that helper build one `workbench` section for `pluginId: "ot-html-transcripts"` and derive its state from runtime config and the service class, not from dashboard model helpers.
12. Keep the helper read-only and cheap:
  - no archive or SQLite reads
  - one `getSummary()` call at most when the service is healthy
  - no summary call when the service is missing or unhealthy
13. Keep transcript workbench strings plugin-owned and English in this slice, matching the existing workbench wording. Do not add new locale plumbing just for this cleanup slice.
14. Update dashboard registry tests to cover provider-backed sections and the new workbench section type while preserving static section behavior.
15. Update integration tests so the transcript plugin detail page still shows:
  - `Transcript workspace`
  - `Open transcript workspace`
  - `Open transcript settings`
  - the current configured-mode status message semantics
16. Add route- or source-level regression checks proving:
  - `routes/admin.ts` no longer checks `detail.id === "ot-html-transcripts"`
  - `plugin-detail.ejs` no longer references `detail.transcriptWorkspace`

## Exit criteria

- The dashboard plugin-detail route no longer special-cases `ot-html-transcripts`.
- The transcript plugin detail page still shows a cohesive transcript workbench with the same badge, message, summary-card semantics, and two navigation links.
- Plugin-owned automation action cards still render separately from the transcript workbench.
- Provider-backed plugin sections can be built dynamically at render time without breaking existing static plugin registry usage.
- If a plugin-owned section provider fails, the plugin detail page still renders and shows a generic warning notice instead of crashing.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**` or `plugins/ot-dashboard/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/plugin-dashboard-registry.test.js`
- `node --test dist/plugins/ot-dashboard/test/self-containment.test.js`
- `node --test dist/plugins/ot-dashboard/test/transcript-workspace.test.js`
- `node --test dist/plugins/ot-dashboard/test/operational-pages.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`

## Required test scenarios

- dashboard plugin registry stores static sections as before and also resolves provider-backed sections asynchronously
- registry provider failures degrade to a warning notice instead of throwing through the plugin detail page
- `admin/plugins/ot-html-transcripts` still renders the transcript workbench, its two navigation links, and the configured-mode message
- plugin action cards still render on the transcript plugin detail page after the workbench moves into registry sections
- transcript workspace list/detail pages remain unchanged by this cleanup slice
- runtime API registration still supports plugin-owned action providers and plugin entries after the registry shape widens
- transcript-plugin bootstrap soft-fails cleanly when the dashboard runtime API is absent
- source or integration checks confirm the dashboard no longer references `detail.transcriptWorkspace` or route-level `ot-html-transcripts` special-casing

## Promotion gate

- Slices `06`, `07`, `08`, `09`, `10`, `11`, `12`, `13`, and `14` must be implemented and verified first.
- After slice `14`, stop, compact state into the kernel, and promote this slice in a fresh planning pass before any implementation starts.

## Out of scope

- new transcript features, new dashboard pages, or new transcript service methods
- transcript workspace UX redesign beyond preserving the current workbench shortcuts in plugin-owned form
- localization overhaul for plugin-owned registry strings
- action-provider redesign or runtime automation changes
- transcript retention, integrity, export, access-policy, or editor behavior changes
