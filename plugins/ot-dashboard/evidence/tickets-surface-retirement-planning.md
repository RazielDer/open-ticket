# Tickets Surface Retirement Planning

## Objective

Retire the dedicated `/admin/tickets` page because it no longer adds useful workflow value, while preserving ticket summary signals that still matter elsewhere in the dashboard.

## Repo-grounded findings

- The dedicated Tickets surface was isolated to one admin route, one nav item, one template, one locale block, and a narrow set of route-render tests.
- The runtime ticket snapshot still matters on `Home` and in the shared status strip, so removing the page does not require removing ticket tracking from the dashboard runtime.
- The rail and landing copy still referenced `Tickets` because the old page remained on the authenticated nav, even though the primary ongoing work had already moved to `Home`, `Transcripts`, `Add-ons`, and `Advanced`.
- Keeping the route as a redirect is safer than dropping historical bookmarks onto a 404.

## Locked decisions

- Remove the Tickets page from the authenticated rail and delete its unused template/locales.
- Keep runtime ticket summary counts on `Home` and in shared shell health details.
- Preserve `/admin/tickets` as a safe authenticated redirect to `/admin` for historical bookmarks.
- Keep the change inside `plugins/ot-dashboard/**` and avoid touching unrelated runtime ticket registries or non-dashboard ticket behavior.

## Slice map

1. `51-tickets-surface-retirement-and-safe-redirect`
2. `52-final-tickets-surface-retirement-verification`
