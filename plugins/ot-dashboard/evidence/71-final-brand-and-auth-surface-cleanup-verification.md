# Slice 71 Evidence: Final Brand And Auth Surface Cleanup Verification

## Final verification commands

```bash
npm run build
```

Outcome:

- `OT: Compilation Succeeded!`

```bash
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js
```

Outcome:

- `67` tests passed, `0` failed.

## Browser/manual verification

- Equivalent local fixture route used for browser checks because authenticated admin/viewer verification requires a controlled local OAuth callback flow:
  - `http://127.0.0.1:3378/dash/login`
  - `http://127.0.0.1:3378/dash/transcripts/_auth/login?returnTo=%2Fdash%2Fme%2Ftranscripts`
  - `http://127.0.0.1:3378/dash/admin`
  - `http://127.0.0.1:3378/dash/me/transcripts`
- Direct health-route verification used the live local dashboard:
  - `http://127.0.0.1:3360/health` returned `200` with `{"ok":true}`

- Admin login at `1440x900`
  - One centered hero image rendered with `heroCenteredDelta: 0`.
  - Exactly one Discord CTA rendered.
  - No visible header, footer, duplicate title stack, or visible health shortcut rendered.
  - The page icon link resolved to `/dash/assets/eotfs-dashboard-favicon.png`.
- Admin login at `390x844`
  - The centered hero image and single CTA remained intact.
  - The login panel stayed within the mobile viewport at about `350px` wide.
  - No visible footer or health shortcut rendered.
- Viewer login at `1440x900`
  - No hero image rendered.
  - Exactly one Discord CTA rendered.
  - No visible shared header, footer, Home link, helper paragraph, or explainer-card copy rendered.
  - The page icon link resolved to `/dash/assets/eotfs-dashboard-favicon.png`.
- Viewer login at `390x844`
  - The minimal single-panel layout held at about `350px` wide.
  - No hero image, visible header/footer, health shortcut, or explainer-card copy rendered.
- Authenticated admin-shell route
  - Equivalent local callback flow landed on `/dash/admin`.
  - The authenticated shell rendered with no visible footer, no visible health shortcut, no visible shared brand logo image, and the new favicon link.
- Authenticated viewer-portal route
  - Equivalent local callback flow landed on `/dash/me/transcripts`.
  - The viewer portal rendered with no visible footer or visible health shortcut while still showing the expected transcript listing (`tr-private`) and creator access labeling.
- Favicon refresh validation
  - A fresh page load plus reload kept the icon link on `/dash/assets/eotfs-dashboard-favicon.png`.
  - The page requested the new favicon asset and did not request any old E4 favicon path during the reload check.
