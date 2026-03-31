# Global Admin Roles JSON Repair Planning

## Objective

Repair the `Global admins` save path in `/visual/general` so invalid JSON can no longer corrupt `general.json`, existing legacy-corrupted values can be recovered safely, and the dashboard copy matches the runtime contract that this field stores Discord role IDs.

## Repo-grounded findings

- `public/views/config-general.ejs` currently renders `globalAdmins` as a pretty JSON textarea with `JSON.stringify(config.globalAdmins || [], null, 2)`.
- `server/config-service.ts` currently saves `globalAdmins` through the shared `parseStringArray` helper, whose fallback splits invalid string input by newline.
- That fallback reproduces the exact broken value reported in production when the textarea contains a trailing-comma JSON array, for example `["[","\"103...\",",... ,"]"]`.
- `locales/english.json` currently tells operators to store Discord user IDs, but the runtime and checker contracts use `globalAdmins` as role IDs.
- `src/data/framework/checkerLoader.ts` defines `globalAdmins` as `ODCheckerCustomStructure_DiscordIdArray(..., "role", ...)` with the display name `Global Admin Roles`.
- `src/data/framework/permissionLoader.ts` and the ticket action handlers treat each `globalAdmins` entry as a Discord role ID when building permission grants and channel overwrites.
- `plugins/ot-local-runtime-config/index.ts` filters `general.globalAdmins` down to valid snowflake strings only, so a corrupted saved array effectively drops global-admin behavior at runtime.
- `public/js/config-general.js` only tracks dirty state and submit shortcuts; it is not the source of the corruption.
- The compiled dashboard test path already proves the valid JSON round-trip for the General save route, so the bug is the invalid-input fallback path rather than the happy path.
- Other dashboard list editors do not share this exact failure mode:
  - Security uses newline/comma-separated text inputs intentionally.
  - Options uses `DashboardUI.parseList()` client-side before posting JSON to the save API.
- The dashboard runtime executes compiled server code from `dist/plugins/ot-dashboard/server/**`, so this chain must rebuild and verify `dist`, not only the TypeScript source.

## Locked decisions

- Keep the fix scoped to `plugins/ot-dashboard/**`; do not widen into `src/**`, `config/**`, or runtime schema changes.
- Keep the existing Express + EJS architecture, the `/visual/general` route, and the `globalAdmins` submitted field name unchanged.
- Do not change the shared `parseStringArray` helper because Security and other existing flows still rely on its current loose behavior.
- Add a dedicated `globalAdmins` parser/normalizer that applies only to the General save path.
- Treat `globalAdmins` as a JSON array of quoted Discord role IDs.
- Accept whitespace-only textarea input as `[]` so operators can clear the field without typing literal JSON brackets.
- Reject JSON numbers for IDs instead of coercing them, because Discord snowflakes can lose precision when parsed as JavaScript numbers.
- Trim entries, reject empty strings, validate the repo’s existing 17-20 digit snowflake shape, and deduplicate in first-seen order.
- Add targeted legacy recovery only for the known line-split corruption signature already observed in the wild.
- Recovery is display-and-save scoped:
  - recover the value for rendering
  - warn the operator that the stored value was recovered
  - do not silently rewrite the file until the next successful save
- If a saved `globalAdmins` value is invalid but not safely recoverable, show the raw JSON text with a warning instead of guessing.
- Preserve all other General form edits on validation failure by building a dedicated route-level view model instead of passing raw `req.body` into the template.
- Return `400` with an inline error re-render on invalid `globalAdmins`; do not redirect, do not write `general.json`, and do not record a success audit event.
- Correct the field copy to role-based wording in `locales/english.json`.
- Keep Security and Options list handling unchanged, but cover them in regression verification.

## Slice map

1. `72-global-admin-roles-json-repair-and-legacy-recovery`
2. `73-final-global-admin-roles-json-repair-verification`

## Verification plan

- Slice 72:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- Slice 73:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
  - Browser/manual checks on `/dash/visual/general` at `1440x900` and `390x844`, or the equivalent local fixture route when the live dashboard is unavailable
  - Manual behavior checks for valid role-ID JSON save, invalid trailing-comma JSON rejection with inline error and preserved form state, legacy broken saved value rendering as repaired JSON with a warning, and unchanged Security plus Options list-editor behavior
