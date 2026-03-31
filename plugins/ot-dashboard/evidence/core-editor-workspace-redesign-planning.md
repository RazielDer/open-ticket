# Core Editor Workspace Redesign Planning

## Intent

Turn `General`, `Options`, `Panels`, and `Questions` into the most user-friendly admin surfaces in OT Dashboard without breaking existing save contracts or losing advanced recovery/export workflows.

## Repo-grounded findings

- Dedicated visual routes already exist for all five managed configs under `/visual/*`.
- `Options`, `Panels`, and `Questions` still depend on modal-first editing and full-page reloads after save/delete.
- `/admin/configs/:id` currently owns backup, restore, export, and raw-review entry points, so those capabilities cannot be dropped during route cutover.
- Current array-save flows allow unsafe rename/delete behavior for referenced `options` and `questions`.
- Current array editors do not support reorder even though array order matters in practice.

## Locked redesign decisions

- First pass covers `General`, `Options`, `Panels`, and `Questions`; `Transcripts` stays on its current editor model.
- Raw JSON remains available only as an advanced escape hatch.
- Home-card direct entry does not happen until the new workspaces preserve advanced-tool parity.
- Reference-breaking rename/delete actions for `options` and `questions` are blocked with guidance.
- `Options`, `Panels`, and `Questions` gain explicit reorder controls backed by new reorder endpoints.
- The workspace visual system stays matte, flat-black, calm, and glow-free.

## Planned slice sequence

1. `21-shared-editor-workspace-foundation`
2. `22-general-workspace-redesign`
3. `23-array-editor-safety-and-reorder`
4. `24-options-workspace-redesign`
5. `25-panels-workspace-redesign`
6. `26-questions-workspace-redesign`
7. `27-home-card-cutover-and-legacy-route-redirects`

## Verification contract

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js
```

Implementation should also include browser/manual checks for desktop and mobile editor layouts before claiming final completion.
