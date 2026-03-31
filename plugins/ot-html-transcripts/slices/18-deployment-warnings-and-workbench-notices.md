# Slice 18: Deployment Warnings and Workbench Notices

- Phase: `P12`
- Status: `active`
- Depends on: `17-dashboard-advanced-transcript-filters-and-url-state`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Add additive transcript deployment warnings for unsafe public exposure and surface the same warning state in the plugin-owned dashboard workbench without changing transcript route behavior, checker fatality, or the html compiler contract.

## Deliverables

- additive deployment warning evaluation for transcript hosting posture
- startup warning logs emitted by the transcript plugin bootstrap
- plugin-detail workbench notice sections rendered by the plugin-owned workbench provider
- README and contract tests that lock the warning behavior

## Target file plan

- `plugins/ot-html-transcripts/index.ts`
- `plugins/ot-html-transcripts/config/deployment-warnings.ts`
- `plugins/ot-html-transcripts/dashboard-workbench.ts`
- `plugins/ot-html-transcripts/README.md`
- `plugins/ot-html-transcripts/test/plugin-contract.test.ts`

## Locked policy

- Keep this slice inside `plugins/ot-html-transcripts/**` only.
- Warning conditions are exactly:
  - `server.host` is not loopback.
  - `links.access.mode == "public"` and `server.publicBaseUrl` resolves to loopback or localhost.
  - `links.access.mode == "public"` and external `server.publicBaseUrl` uses `http:` instead of `https:`.
- Treat these values as loopback/local for the warning check:
  - `127.0.0.1`
  - `localhost`
  - `::1`
  - `::ffff:127.0.0.1`
- `private-discord` mode must not warn about an empty `server.publicBaseUrl`.
- Warnings are additive and non-fatal.
- Do not turn warning conditions into config-checker errors.
- Do not block plugin startup.
- Emit one startup warning log per detected warning code after the transcript service is initialized.
- The plugin-owned workbench must keep the existing transcript workbench section intact and append warning notice sections after it when warnings exist.
- Do not add new transcript service methods in this slice.
- Do not change transcript routes, public/private mode behavior, or the compile result contract.

## Locked warning copy

- `server-bind-public`
  - `Transcript HTTP server is not loopback-only. Bind it to 127.0.0.1 and publish it through Cloudflare or another trusted reverse proxy.`
- `public-url-loopback`
  - `Public transcript links point to a loopback URL. Replace server.publicBaseUrl with the external transcript URL before sharing links.`
- `public-url-http`
  - `Public transcript links use http. Put the transcript origin behind HTTPS at the edge before exposing it.`

## Implementation tasks

1. Add a dedicated helper in `config/deployment-warnings.ts` that computes transcript deployment warnings from the plugin config.
2. Reuse or add a small hostname helper so loopback/local detection is deterministic and testable.
3. In `index.ts`, evaluate deployment warnings after transcript-service initialization and emit one warning log per detected issue.
4. Keep startup success non-fatal even when warnings exist.
5. In `dashboard-workbench.ts`, append warning notice sections after the current transcript workbench when warnings exist.
6. Keep workbench generation plugin-owned; no `ot-dashboard` registry or route changes belong in this slice.
7. Update `README.md` so operators are told that the shipped public config is local/dev oriented and that exposed public transcript mode needs a real external HTTPS URL or `private-discord`.
8. Extend `test/plugin-contract.test.ts` to cover warning evaluation, bootstrap warning handling, and workbench notice rendering.

## Exit criteria

- Startup logs additive deployment warnings for unsafe transcript exposure.
- The transcript plugin detail page shows warning notices through the plugin-owned workbench when those conditions exist.
- Startup remains non-fatal.
- No route, checker, or compile contract behavior changes.
- No implementation in this slice requires edits outside `plugins/ot-html-transcripts/**`.

## Verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js`

## Required test scenarios

- non-loopback `server.host` emits `server-bind-public`
- public mode with loopback `server.publicBaseUrl` emits `public-url-loopback`
- public mode with external `http` `server.publicBaseUrl` emits `public-url-http`
- clean loopback-safe public config emits no warnings
- `private-discord` mode with empty `server.publicBaseUrl` does not emit a warning for that field
- bootstrap still wires transcript startup and warning evaluation together
- the plugin-owned workbench appends warning notice sections after the existing workbench when warnings exist

## Promotion gate

- Slices `06` through `17` must remain implemented and verified.
- After slice `18`, update the kernel state to mark this slice completed and promote slice `19`.
- Because the user explicitly approved sequential execution, slice `19` may start immediately after that promotion if slice `18` verification passes.

## Out of scope

- checker-fatal deployment validation
- route or status-code changes
- new transcript service methods
- `ot-dashboard` registry changes
- transcript access analytics or saved views
