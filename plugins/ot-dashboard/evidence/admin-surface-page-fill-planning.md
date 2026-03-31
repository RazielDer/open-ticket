# Admin Surface Page Fill Planning

## Objective

Make `/admin/plugins` and `/admin/transcripts` use the admin shell's available content width on wide desktop viewports instead of sitting in visibly narrower capped lanes.

## Repo-grounded findings

- A live authenticated fixture audit at `1920x1080` showed `Home` using about `1604px` of the admin shell content track while `/admin/plugins` was capped at about `1220px` and `/admin/transcripts` at about `1100px`.
- The unused width came from page-specific `.control-content` caps in `public/global.css`, not from the shared admin shell or from route-level rendering differences.
- At `1440x900` and `390x844`, both pages were already functionally stable, so the follow-up should remove the unnecessary caps rather than redesign the pages.
- The desired result is a fuller page track that still preserves the existing matte dark shell, spacing rhythm, and scan flow.

## Locked decisions

- Keep the existing admin shell, route paths, page copy, plugin grouping, transcript filters, transcript disclosures, and transcript bulk behavior unchanged.
- Fix the page-fill problem through the shared admin CSS in `plugins/ot-dashboard/public/global.css`.
- Do not introduce new chrome, glow, gradients, blur, or extra card framing.
- Validate on a wide desktop viewport in addition to the normal desktop and mobile checks.
- Use the equivalent authenticated fixture route when `127.0.0.1:3360` is unavailable to automation.

## Slice map

1. `49-admin-surface-page-fill-width-restoration`
2. `50-final-admin-surface-page-fill-verification`
