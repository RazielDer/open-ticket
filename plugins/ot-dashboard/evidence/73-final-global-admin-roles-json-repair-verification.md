# Slice 73 Evidence: Final Global Admin Roles JSON Repair Verification

## Final verification commands

```bash
npm run build
```

Outcome:

- `OT: Compilation Succeeded!`

```bash
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js
```

Outcome:

- `75` tests passed, `0` failed.

## Browser/manual verification

- Equivalent authenticated local fixture route used for browser/manual verification:
  - `http://127.0.0.1:3379/dash/login`
  - `http://127.0.0.1:3379/dash/visual/general`
  - `http://127.0.0.1:3379/dash/admin/security`
  - `http://127.0.0.1:3379/dash/visual/options`
- The fixture uses the compiled dashboard runtime from `dist/plugins/ot-dashboard/**` plus the same local fake-Discord callback pattern used by the dashboard route tests, which keeps the check equivalent to the live dashboard flow without depending on an external OAuth round-trip.

- General page at `1440x900`
  - Logged in through the fixture admin host and landed on `/dash/visual/general`.
  - A valid quoted role-ID JSON save redirected to `/dash/visual/general?saved=1`, showed `Saved successfully.`, and left no warning or error alert on the page.
  - The fixture `config/general.json` persisted `globalAdmins` as the clean string array `["123456789012345678","234567890123456789"]`.
- Invalid trailing-comma General save
  - Submitting `[\n  "123456789012345678",\n]` returned the inline field error `Enter valid JSON for this field. Use a JSON array of quoted Discord role IDs.` on `/dash/api/config/general`.
  - The unsaved `serverId` draft `guild-invalid-browser` stayed in the form after the failed save, and the `globalAdmins` textarea preserved the exact invalid draft text.
  - The fixture `config/general.json` stayed unchanged with `serverId: "guild-1"` and the prior clean `globalAdmins` array, proving no file write on invalid save.
- Legacy-corrupted saved value
  - After writing the known broken signature `["[","\"123456789012345678\",","\"234567890123456789\",","]"]` into the fixture `config/general.json`, `/dash/visual/general` showed the repaired JSON draft plus the warning `The saved value matched the known legacy line-split corruption pattern. Review the repaired role-ID JSON below, then save to rewrite it cleanly.`
  - Reloading the page did not rewrite the file; the broken stored array stayed on disk until a save occurred.
  - Clicking `Save` from the repaired page redirected to `/dash/visual/general?saved=1`, removed the warning, and rewrote the file to the clean string array `["123456789012345678","234567890123456789"]`.
- General page at `390x844`
  - The saved General page still exposed the `Save` button, the advanced disclosure summary, and the corrected `Global admin roles` label in the mobile viewport.
- Regression pass
  - `/dash/admin/security` still rendered multiline textarea inputs for `rbac.ownerUserIds`, `rbac.roleIds.*`, and `rbac.userIds.*`, confirming the Security list inputs remained newline-oriented rather than shifting to JSON-only behavior.
  - `/dash/visual/options` still rendered the transcript channel IDs textarea with the unchanged helper copy `comma-separated, newline-separated, or JSON-array channel IDs`, kept the field disabled/readonly while `Use global transcript default` was active, and still exposed the reorder controls (`Move up` / `Move down`) for the options list editor.
