# Slice 70: Auth Surface Simplification And Health Shortcut Removal

## Objective

Turn the admin and viewer login routes into restrained single-purpose auth surfaces, add the centered EoTFS hero art to the admin login only, and remove the remaining public auth-page clutter without changing OAuth behavior.

## Exact files

- `plugins/ot-dashboard/public/assets/**`
- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/views/transcript-viewer-login.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/public/js/login.js`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/README.md`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`
- `plugins/ot-dashboard/test/viewer-routes.test.ts`

## Locked implementation decisions

- Create `public/assets/eotfs-login-hero.png` from `C:\Users\Administrator\Desktop\PoT\Bot\EoTFS Ticket Bot\Logo_dinosaur_ver_2.png` and render it only on `/login`.
- The admin login hero art must be centered, constrained by a fixed max width, and scaled safely on mobile instead of being dropped into the page at raw size.
- The admin login keeps one Discord CTA, error alerts, and the breakglass notice when enabled, but removes the `Check health` button, inline health status region, and redundant helper copy.
- The viewer login keeps one Discord CTA and error alerts, but renders no hero art, no shared header/Home button, no `What happens next` section, and no helper paragraph.
- Remove `public/js/login.js` if it becomes unused after the health UI is removed.
- Keep page titles, OAuth endpoints, callback behavior, and `returnTo` handling unchanged.

## Required changes

- Add the new centered hero image to the admin login and tighten the surrounding text hierarchy so the page does not repeat the product name unnecessarily around the art.
- Remove the login health DOM, hidden status region, JSON payload, and script include from `/login`.
- Simplify the viewer login into a single-panel auth surface with no secondary cards or shared header navigation.
- Delete or retire locale strings that only existed for the removed login health UI, helper copy, and viewer explainer cards.
- Update README auth-surface documentation and route-render tests to match the simplified pages.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js
```
