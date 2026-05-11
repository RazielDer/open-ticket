# Active Slice

> Historical record: this active-slice pointer belongs to a completed nested
> transcript/dashboard controller-era program. New EoTFS work starts from the
> wrapper `AGENTS.md` plus the current `tasks/<slug>.md`.

- Active slice: `none`
- Last completed slice: `28-final-auth-access-polish-and-verification`
- Phase: `P14`
- Status: `completed`
- Implementation mode: `single-agent`, sequential

## Outcome

Phase `P14` is complete. The shipped admin login, viewer login, `My Transcripts`, and security workspace remain aligned with the locked matte-dark dashboard language, the operator READMEs now match the split-host Discord auth model, and the full locked four-command verification sweep passed.

## Completed outcomes

- Final copy and layout polish landed on the admin Discord login, transcript viewer login, `My Transcripts`, and admin security workspace surfaces.
- Operator-facing documentation now covers split-host deployment, Discord OAuth callbacks, RBAC configuration, owner bootstrap, and breakglass behavior.
- Final verification evidence for the completed P14 wave is recorded in `evidence/phase-14-stricter-access-and-portal-basis.md`.

## Final verification

- `npm run build`
- `npm --prefix plugins/ot-dashboard run build:editor`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- `node --test dist/plugins/ot-html-transcripts/test/plugin-contract.test.js dist/plugins/ot-html-transcripts/test/service.test.js dist/plugins/ot-html-transcripts/test/http.test.js dist/plugins/ot-html-transcripts/test/end-to-end.test.js`

## Kernel state

- The nested historical workflow files mark `P14` complete.
- No prepared next slice remains in this historical program.
- A later whole-stack follow-on aligned to `SLICE-008A` is now reserved after `P14` for document-`2.0` richer-result transcript support with legacy `1.0` read compatibility.
- This completed plugin kernel is historical evidence only. Future whole-project work should follow the wrapper AGENTS-first task-file workflow instead of inheriting this kernel's old plugin-only write limits.

## Resume note

Resume from:

1. `workflow.md`
2. `active/active-slice.md`
3. `evidence/phase-14-stricter-access-and-portal-basis.md`

For new work, start from the wrapper `AGENTS.md` and the active AGENTS-first
task file instead.

Prepared next slice:

- `none`
