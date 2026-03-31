# Array Editor Safety And Reorder

## Intent

Add the backend safety and ordering primitives required before `Options`, `Panels`, and `Questions` move off their modal-first flows.

## Changes applied

- Added dependency-graph helpers so the visual array workspaces can receive question-to-option and option-to-panel relationship context.
- Added duplicate-ID guards for `options`, `panels`, and `questions` on both create and update flows.
- Added reference-safe rename and delete blocking for `options` used by panels and `questions` used by options.
- Added reorder service methods and authenticated reorder API routes for `options`, `panels`, and `questions`.
- Returned structured JSON error payloads with `code`, `guidance`, and `references` for blocked rename/delete operations.
- Added app coverage for dependency payloads, duplicate guards, reorder persistence, and structured guard responses.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/api/options/reorder`, `/dash/api/panels/reorder`, and `/dash/api/questions/reorder` now accept full ordered ID lists and persist array order.
- Blocked rename/delete operations now return `409` JSON payloads such as `QUESTION_RENAME_BLOCKED` and `OPTION_DELETE_BLOCKED` with follow-up guidance and referencing items.
- `/dash/visual/options` now includes dependency graph payloads alongside available-question data so the workspace UI can explain assigned-question and referencing-panel context.
