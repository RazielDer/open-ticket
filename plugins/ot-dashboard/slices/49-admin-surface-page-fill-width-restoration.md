# Slice 49: Admin Surface Page Fill Width Restoration

## Objective

Restore the full admin-shell content track for `/admin/plugins` and `/admin/transcripts` so both pages fill the same wide-desktop lane that `Home` already uses.

## Exact files

- `plugins/ot-dashboard/public/global.css`

## Locked implementation decisions

- Keep the existing Express + EJS structure and route paths unchanged.
- Do not redesign the page internals; only remove the page-specific width caps that are shrinking these surfaces on wide viewports.
- Preserve the restrained matte dark aesthetic and existing mobile/standard-desktop behavior.

## Required changes

- Remove the dedicated `1220px` add-ons content cap.
- Remove the dedicated `1100px` transcript content cap.
- Let both page classes inherit the shell's full content width instead of centering a narrower lane.
- Keep the existing section cards, plugin rows, transcript shells, and disclosures intact.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```
