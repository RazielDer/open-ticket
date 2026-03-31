# Editor Workspace Density Alignment Planning

## Intent

Prepare an implementation-ready follow-up pass for `General`, `Options`, `Panels`, and `Questions` that reduces redundant language, tightens stacked/mobile density, and aligns the editor shell more closely with the existing login page.

## Repo-grounded findings

- A Playwright audit of `/visual/general`, `/visual/options`, `/visual/panels`, and `/visual/questions` at `1440x900` and `390x844` showed the rendered editor surfaces are already shadow-free and gradient-free in the main workspace chrome.
- The current mobile density issue is structural, not palette-based: on `390x844`, the first main editor form starts around `2658-2727px` because the stacked layout renders the shared hero, the inventory card, and the fully expanded advanced-tools tray before the form.
- The shared workspace header currently duplicates the page title in both the eyebrow and heading, repeats the hero subtitle inside the first stat card, and repeats the advanced-tools tray purpose in a third stat card.
- The advanced-tools partial already contains a nested `Review JSON before apply` disclosure, so the outer collapse should reuse the same disclosure model rather than adding a second interaction pattern.
- The main copy issue is repeated helper/meta language in the hero stats, top editor cards, and save bars. Warning copy, dependency guidance, and advanced-tool labels do not need a broad rewrite.

## Locked decisions

- Use `/login` as the visual reference surface for the follow-up density pass while keeping the existing warm accent.
- Collapse only the advanced-tools tray by default once the workspace stacks; keep the inventory visible.
- Keep the copy pass conservative: remove duplicated helper/meta language without changing warnings, advanced actions, validation text, or raw JSON reachability.
- Keep the work inside `plugins/ot-dashboard/**` and do not change routes, save payloads, reorder behavior, or transcript behavior.

## Slice map

1. `28-shared-workspace-density-and-responsive-advanced-tools`
   - Shared header cleanup, responsive advanced-tools disclosure, and stacked/mobile density fix.
2. `29-workspace-copy-tightening-and-structural-trim`
   - Conservative copy trim across the four workspaces and removal of duplicated meta language.
3. `30-final-visual-alignment-and-density-verification`
   - Final shared-shell polish, full verification, and updated completion evidence.

## Verification contract

- Slice verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`
- Final verification:
  - `npm run build`
  - `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js`
  - Browser/manual checks on `/dash/visual/general`, `/dash/visual/options`, `/dash/visual/panels`, and `/dash/visual/questions` at `1440x900` and `390x844`
