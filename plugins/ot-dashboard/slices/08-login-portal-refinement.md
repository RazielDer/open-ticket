# Slice 08: Login Portal Refinement

## Objective

Refine `/login` so it behaves like a premium portal sign-in screen: one focal form, compact nearby secondary actions, and less dead space.

## Exact files

- `plugins/ot-dashboard/public/views/login.ejs`
- `plugins/ot-dashboard/public/global.css`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`
- `plugins/ot-dashboard/test/home-setup.test.ts`

## Locked implementation decisions

- Keep the current sign-in route and form contract unchanged.
- Remove the lower support section as a peer content block.
- Keep one secondary escape path back to the landing page and one subdued health utility near the form.
- Keep the restrained dark-mode direction; do not reintroduce loud gradients or large accent slabs.

## Required changes

- Simplify the headline and supporting copy.
- Narrow and tighten the login card so the form fills it more naturally.
- Pull the login card closer to the brand header.
- Replace the lower support block with a compact support/action row near the primary submit button.
- Keep helper copy concise and low emphasis.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Done when

- The form is the focal point.
- The screen feels tighter and less empty.
- The page offers a clear way back plus a health utility without a second competing section.
