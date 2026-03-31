# Setup Surface Removal

## Intent

Safely delete the redundant Setup landing surface so Home becomes the only setup hub without breaking config-detail workflows.

## Changes applied

- Removed the Setup rail item from the admin shell.
- Redirected `/admin/configs` to `/admin` instead of rendering a second setup hub.
- Deleted the unused Setup landing template and pruned the dead landing-only locale copy.
- Kept `/admin/configs/:id` detail, review, restore, and export routes working from Home setup cards.
- Updated the README route list so it matches the live surface area.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Behavior evidence

- Home no longer renders a `Setup` rail entry.
- `/dash/admin/configs` now returns `302` with `location: /dash/admin`.
- Home still exposes config-detail links such as `/dash/admin/configs/general`.
