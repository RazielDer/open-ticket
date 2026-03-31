# Slice 72: Global Admin Roles JSON Repair And Legacy Recovery

## Objective

Replace the General workspace `globalAdmins` save path with dedicated strict role-ID JSON handling, recover the known legacy corruption signature, and preserve operator form state on invalid saves.

## Exact files

- `plugins/ot-dashboard/server/config-service.ts`
- `plugins/ot-dashboard/server/routes/api.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/public/views/config-general.ejs`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/editor-layout.test.ts`
- `plugins/ot-dashboard/test/operational-pages.test.ts`
- `plugins/ot-dashboard/test/roundtrip.test.ts`

## Locked implementation decisions

- Keep the `globalAdmins` field name and `/visual/general` route contract unchanged.
- Add a dedicated `globalAdmins` parser instead of changing shared `parseStringArray`.
- Treat the field as a JSON array of quoted Discord role IDs.
- Accept whitespace-only input as `[]`.
- Reject numeric JSON IDs to avoid snowflake precision loss.
- Reject invalid JSON, non-array JSON, empty-string entries, and non-snowflake values with inline localized feedback.
- Trim entries and deduplicate in first-seen order.
- Recover the known line-split legacy corruption signature only when the recovery is unambiguous.
- Do not silently rewrite `general.json` on page load; only repair the file on a successful save.
- Preserve all other General form edits on validation failure through a route-level draft view model.
- Keep Security and Options list behavior unchanged in this slice.

## Required changes

- Add dedicated parse, inspect, and recovery helpers for `globalAdmins`.
- Update the General GET render path so the textarea uses a route-supplied draft string instead of direct `JSON.stringify(config.globalAdmins || [], null, 2)`.
- Surface a warning when a saved `globalAdmins` value was legacy-recovered for display.
- Surface an error and return `400` when submitted `globalAdmins` is invalid, while keeping the full form populated with the submitted draft values.
- Prevent invalid saves from writing `config/general.json` or recording a success audit event.
- Update the field label and help copy to role-based wording and add localized guidance for the expected JSON format.
- Add parser, route, and regression coverage for valid saves, invalid saves, legacy recovery, and preserved non-`globalAdmins` form state.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js
```
