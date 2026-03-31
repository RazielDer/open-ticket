# Slice 13: Login CSRF Recovery

## Objective

Recover stale login-page CSRF submissions by redirecting back to the login page with a fresh prompt instead of rendering a raw `Invalid CSRF token` response.

## Exact files

- `plugins/ot-dashboard/server/csrf.ts`
- `plugins/ot-dashboard/server/routes/pages.ts`
- `plugins/ot-dashboard/locales/english.json`
- `plugins/ot-dashboard/test/app.test.ts`

## Locked implementation decisions

- Keep login session, password verification, CSRF protection, and return-to sanitization intact for valid current-session requests.
- Only soften the stale-token behavior for unauthenticated `POST /login`.
- Keep strict 403 behavior for authenticated POST routes and API-style CSRF failures.

## Verification for this slice

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js
```

## Results

- Stale or missing login-form CSRF submissions now redirect back to `/login` with `flash=csrfExpired` and a preserved same-origin `returnTo`.
- The login page resolves that flash into a locale-backed message and renders a fresh CSRF token.
- Authenticated POST routes still return `403 Invalid CSRF token` when the token is missing.
