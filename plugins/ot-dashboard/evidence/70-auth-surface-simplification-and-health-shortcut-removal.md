# Slice 70 Evidence: Auth Surface Simplification And Health Shortcut Removal

## Implemented changes

- Generated `public/assets/eotfs-login-hero.png` from `Logo_dinosaur_ver_2.png` and rendered it only on the admin login.
- Rebuilt `public/views/login.ejs` into a centered single-purpose auth panel with one Discord CTA, preserved error and breakglass messaging, and no health button, inline health status, or redundant helper copy.
- Flattened `public/views/transcript-viewer-login.ejs` into a minimal viewer-auth panel with no hero art, no shared header navigation, no explainer cards, and no visible footer UI.
- Removed the now-unused `public/js/login.js` health helper and retired the locale strings that only existed for the removed login health and viewer explainer surfaces.
- Updated README guidance and the `app`, `home-setup`, and `viewer-routes` render tests to match the simplified admin and viewer auth pages without changing OAuth, `returnTo`, or transcript-access behavior.

## Verification

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js
```

Outcome:

- `OT: Compilation Succeeded!`
- `42` tests passed, `0` failed.
