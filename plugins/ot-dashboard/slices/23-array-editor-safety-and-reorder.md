# Slice 23: Array Editor Safety And Reorder

## Objective

Add the backend safety and ordering primitives required by the `Options`, `Panels`, and `Questions` workspaces before rebuilding those pages.

## Exact files

- `plugins/ot-dashboard/server/config-service.ts`
- `plugins/ot-dashboard/server/routes/api.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Add reorder endpoints for `options`, `panels`, and `questions` using full ordered ID lists.
- Duplicate IDs must be rejected on update as well as create.
- Deleting or changing the ID of an `option` referenced by a panel is blocked.
- Deleting or changing the ID of a `question` referenced by an option is blocked.
- Server validation is authoritative; UI warnings are helpful but not sufficient.

## Required changes

- Add relationship-graph helpers so pages can render dependency guidance.
- Add reorder service methods and API routes.
- Return useful structured error responses for blocked rename/delete actions.
- Preserve all current save payloads for item creation and update.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js
```
