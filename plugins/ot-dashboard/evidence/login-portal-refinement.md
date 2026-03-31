# Login Portal Refinement

## Intent

Tighten the OT Dashboard sign-in page after the broader entry-surface simplification so it reads more like a polished portal login and less like a large internal admin slab.

## Locked direction

- Form-first composition
- Simpler, less internal copy
- Back-to-landing and health actions near the form
- Reduced dead space and lower visual competition
- Same restrained dark-mode direction

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Outcome

- The login page now uses simpler portal-style copy and removes the lower support block that previously competed with the form.
- The sign-in card is tighter, closer to the brand header, and more proportionate to the form it contains.
- `Back to landing` and `Health` now sit directly under the primary button as compact secondary actions.
- The login footer is quieter, with the large copy block removed on this page.

## Final verification

- PASS `npm run build`
- PASS `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`
- PASS browser preview capture from a disposable local dashboard instance
  - `output/playwright/login.png`
  - `output/playwright/landing.png`
