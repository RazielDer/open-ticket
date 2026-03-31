# Slice 12: Login Masthead Wrap Normalization

## Objective

Stop the dashboard name from wrapping prematurely in the login masthead, and center the title cleanly when wrapping is unavoidable.

## Exact files

- `plugins/ot-dashboard/public/global.css`

## Locked implementation decisions

- Keep routing, auth, markup, and health-utility behavior unchanged.
- Solve the current wrap issue primarily through CSS.
- Prefer preventing the wrap first; if wrapping still occurs on narrow widths, center and balance it.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Results

- Reduced forced wrap pressure by widening the usable title measure and lowering the masthead font size slightly.
- Centered the masthead container and applied balanced text wrapping so long names no longer produce awkward left-aligned stacks.
- Kept routing, auth, markup, and health-utility behavior unchanged.

## Browser proof

- Disposable preview server: `http://127.0.0.1:3375`
- Screenshot:
  - `output/playwright/login-masthead-balanced.png`
