# Active Slice

> Historical record: this active-slice pointer belongs to a completed nested
> `ot-dashboard` controller-era program. New EoTFS work starts from the wrapper
> `AGENTS.md` plus the current `tasks/<slug>.md`.

- Active slice: `none`
- Last completed slice: `73-final-global-admin-roles-json-repair-verification`
- Phase: `P65`
- Status: `completed`
- Implementation mode: `single-agent`, sequential

## Outcome

Phase `P65` is complete. The General workspace now enforces strict role-ID JSON input for `globalAdmins`, invalid saves fail closed with preserved operator state, legacy line-split corruption is recoverable without silent file rewrites, and the final verification sweep passed with browser checks covering the required General, Security, and Options behaviors.

## Completed outputs

- `/visual/general` now uses dedicated strict JSON role-ID handling for `globalAdmins` instead of the loose shared fallback parser.
- Known legacy `globalAdmins` corruption now renders as a repaired draft with warning, while unrecoverable saved values show raw JSON guidance instead of guessing.
- Invalid `globalAdmins` saves now preserve full General form state, return inline feedback, do not write `config/general.json`, and do not record a success audit event.
- The field’s label/help/error copy now aligns to role IDs, and the final verification evidence is recorded in `evidence/72-global-admin-roles-json-repair-and-legacy-recovery.md` plus `evidence/73-final-global-admin-roles-json-repair-verification.md`.

## Final verification

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- Equivalent authenticated fixture-browser checks on:
  - `http://127.0.0.1:3379/dash/visual/general`
  - `http://127.0.0.1:3379/dash/admin/security`
  - `http://127.0.0.1:3379/dash/visual/options`

## Kernel state

- The nested historical workflow files mark `P65` complete.
- No prepared next slice remains in this historical program.

## Resume note

Resume from:

1. `workflow.md`
2. `active/active-slice.md`
3. `evidence/72-global-admin-roles-json-repair-and-legacy-recovery.md`
4. `evidence/73-final-global-admin-roles-json-repair-verification.md`

For new work, start from the wrapper `AGENTS.md` and the active AGENTS-first
task file instead.

Prepared next slice:

- `none`
