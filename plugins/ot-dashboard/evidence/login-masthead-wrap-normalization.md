# Login Masthead Wrap Normalization

## Intent

Keep the dashboard name readable and clean in the login masthead by avoiding premature wrapping and centering any multi-line fallback state.

## Locked direction

- Do not reopen route or auth work
- Reduce forced wrapping pressure
- Center any unavoidable title wrapping

## Verification target

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`

## Results

- Passed `npm run build`.
- Passed `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js`.
- Verified the dashboard name no longer breaks into a premature two-line left-aligned stack on the standard login card width.
- Verified the masthead centers the title cleanly when multiple lines are still required.

## Browser proof

- Disposable preview server: `http://127.0.0.1:3375`
- Reason: the long-running `http://127.0.0.1:3360` instance may still be serving an older build during verification.
- Screenshot:
  - `output/playwright/login-masthead-balanced.png`
