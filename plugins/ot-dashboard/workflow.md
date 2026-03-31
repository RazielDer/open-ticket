# `ot-dashboard` Admin Surface Workflow

## Goal

Keep OT Dashboard on the restrained flat-black UI system already established, then keep refining shared chrome, auth surfaces, and operator pages so they do not drift into vendor branding, redundant copy, oversized mobile stacks, oversized desktop chrome, or non-login-like proportions.

## Current status

Slices 09 through 73 are complete. The `globalAdmins` repair chain is closed: `/visual/general` now uses strict quoted role-ID JSON handling, invalid saves fail closed with preserved draft state and no success audit writes, known legacy line-split corruption displays a repaired warning instead of raw bracket-split noise, and unrecoverable saved values stay visible as raw JSON with operator guidance instead of heuristic guessing.

The final verification closeout is also complete: `dist/plugins/ot-dashboard/**` rebuilt successfully, the full dashboard node suite including `roundtrip` passed, and the desktop/mobile General-page checks covered valid save, invalid save, legacy recovery, and Security/Options regression confirmation on an authenticated local fixture route.

## Locked implementation model

- Scope is limited to `plugins/ot-dashboard/**`.
- Keep the existing Express + EJS architecture.
- Keep `/`, `/login`, `/health`, and `/admin` route paths unchanged.
- Keep the existing viewer-auth routes and callback paths unchanged.
- Preserve the current write routes and submitted field names for `general`, `options`, `panels`, and `questions` unless a slice explicitly adds a new endpoint.
- Keep raw JSON routes at `/config/:id` working.
- Keep transcript access rules, viewer routes, and archive behavior unchanged in this task unless a shared dashboard primitive needs a narrow compatibility adjustment.
- Locale-back all new or changed user-facing copy in `locales/english.json`.

## Locked visual and behavior direction

- The login and admin shell direction stays flat-black, matte, and glow-free.
- `General`, `Options`, `Panels`, and `Questions` should become full-page workspaces, not modal-first tools.
- Raw JSON stays available only as an advanced escape hatch.
- Backup, export, restore, and raw-review capabilities must remain reachable from the new workspaces before any legacy detail-route cutover.
- Home should become the single hub for opening those workspaces once the new pages are ready.
- Reference-breaking rename/delete actions for `options` and `questions` must be blocked with guidance.
- Array editors should gain explicit reorder controls.
- Use `/login` as the visual reference surface for the follow-up density pass.
- Collapse only the advanced-tools tray once the workspace stacks; the inventory stays visible.
- Keep the follow-up copy pass conservative: trim duplicated helper/meta language without changing warnings, advanced actions, or raw JSON reachability.
- Keep the new refinement pass focused on layout proportion, control sizing, and card hierarchy rather than new workflow features.
- Keep `/admin/plugins` in the current route family while tightening its intro, search, and card hierarchy until it feels like the same product family as `/login`.
- Keep `/admin/plugins` grouped around operational scan paths rather than creator buckets when the inventory needs more structure.
- Keep `/admin/transcripts` in the same matte admin family while collapsing repeated hero/alert/summary layers into one page-owned workspace.
- Keep transcript filters and operations available, but treat them as secondary surfaces once the page stacks on mobile.
- Keep the next transcript pass focused on compaction and hierarchy rather than new transcript-management features.
- Replace the remaining transcript summary-card walls with denser transcript-specific scan surfaces before adding any new grouping concept.
- Keep bulk actions close to the records table, but compress them into a calmer toolbar so they stop feeling like another standalone workspace card.
- Keep the next transcript polish pass focused on flattening nested subsection chrome and improving scan flow before the table rather than inventing new transcript groupings.
- Let wide admin content surfaces use the shell's available content track unless a page has a concrete functional reason to stay narrower.
- Retire admin surfaces that no longer add workflow value, but preserve safe redirects when historical bookmarks are likely.
- Replace the remaining E4 dashboard identity with EoTFS dinosaur branding: `Logo_dinosaur_herbivore_1.png` is the source for `public/assets/eotfs-dashboard-favicon.png`, while `Logo_dinosaur_ver_2.png` is reserved for `public/assets/eotfs-login-hero.png` on the admin login only.
- Keep the shared dashboard chrome text-only: no shared logo image, no duplicated dashboard-name kicker, no visible footer links, and no vendor credit copy.
- Remove every visible dashboard `Health` / `Check health` shortcut while keeping the `/health` route available for direct operational use.
- Keep the transcript viewer login more minimal than the admin login: no hero art, no shared header navigation, and no explanatory info-card stack.
- Preserve auth, host routing, and transcript-access behavior; this follow-up only changes shared shell markup, asset paths, copy, and tests.

## Slice order

1. [`slices/09-login-first-entry-consolidation.md`](./slices/09-login-first-entry-consolidation.md)
   - Redirect `/` into login, move branding into the card, remove redundant login copy/actions, and add inline health status.
2. [`slices/10-login-surface-hierarchy-refinement.md`](./slices/10-login-surface-hierarchy-refinement.md)
   - Tighten login placement, reduce dead space, soften the brand treatment, demote `Health`, and remove the empty inline-status regression.
3. [`slices/11-login-brand-normalization.md`](./slices/11-login-brand-normalization.md)
   - Remove the redundant admin eyebrow and normalize the dashboard-name size in the masthead.
4. [`slices/12-login-masthead-wrap-normalization.md`](./slices/12-login-masthead-wrap-normalization.md)
   - Reduce forced wrapping in the dashboard name and center the title when wrapping is unavoidable.
5. [`slices/13-login-csrf-recovery.md`](./slices/13-login-csrf-recovery.md)
   - Recover stale login-form CSRF submissions by redirecting back to `/login` with a fresh prompt while keeping strict CSRF enforcement on other POST routes.
6. [`slices/14-dark-theme-and-admin-home-simplification.md`](./slices/14-dark-theme-and-admin-home-simplification.md)
   - Flatten the shared visual theme into a matte dark presentation and simplify the `/admin` home flow and copy.
7. [`slices/15-flat-black-admin-shell-refinement.md`](./slices/15-flat-black-admin-shell-refinement.md)
   - Tighten the authenticated shell into a flatter black palette and reduce the remaining gray-box feeling without changing the page structure.
8. [`slices/16-admin-home-daily-work-removal.md`](./slices/16-admin-home-daily-work-removal.md)
   - Remove the redundant `Daily work` band from `/admin` and tighten the remaining home copy so the page says less and repeats less.
9. [`slices/17-admin-home-density-refinement.md`](./slices/17-admin-home-density-refinement.md)
   - Consolidate the home intro and metrics, reduce shell spacing, and tighten the footer/setup density on `/admin`.
10. [`slices/18-admin-home-overview-compaction.md`](./slices/18-admin-home-overview-compaction.md)
   - Move home status into the overview stage and stop the admin shell grid from stretching shallow bands across the viewport.
11. [`slices/19-setup-page-next-step-removal.md`](./slices/19-setup-page-next-step-removal.md)
   - Delete the redundant Setup-page `Next step` surface while keeping the Home-page guidance flow intact.
12. [`slices/20-setup-surface-removal.md`](./slices/20-setup-surface-removal.md)
   - Remove the Setup landing surface, redirect `/admin/configs` to Home, and remove the redundant Setup rail entry.
13. [`slices/21-shared-editor-workspace-foundation.md`](./slices/21-shared-editor-workspace-foundation.md)
   - Establish the shared workspace chrome, flat-black editor primitives, and advanced-tools parity contract before any direct-entry cutover.
14. [`slices/22-general-workspace-redesign.md`](./slices/22-general-workspace-redesign.md)
   - Convert `General` into the shared workspace format with section navigation and collapsed advanced controls.
15. [`slices/23-array-editor-safety-and-reorder.md`](./slices/23-array-editor-safety-and-reorder.md)
   - Add reorder endpoints and block reference-breaking option/question rename-delete actions.
16. [`slices/24-options-workspace-redesign.md`](./slices/24-options-workspace-redesign.md)
   - Rebuild `Options` into an inventory-plus-editor workspace with structured question assignment and dependency context.
17. [`slices/25-panels-workspace-redesign.md`](./slices/25-panels-workspace-redesign.md)
   - Rebuild `Panels` into an inventory-plus-editor workspace with structured option picking and in-page summary preview.
18. [`slices/26-questions-workspace-redesign.md`](./slices/26-questions-workspace-redesign.md)
   - Rebuild `Questions` into an inventory-plus-editor workspace with usage summaries and no modal-first editing.
19. [`slices/27-home-card-cutover-and-legacy-route-redirects.md`](./slices/27-home-card-cutover-and-legacy-route-redirects.md)
   - Cut Home over to direct workspace entry, redirect the legacy detail routes, and finish docs/tests.
20. [`slices/28-shared-workspace-density-and-responsive-advanced-tools.md`](./slices/28-shared-workspace-density-and-responsive-advanced-tools.md)
   - Remove duplicated shared-header chrome and make the advanced-tools tray collapse by default once the workspace stacks.
21. [`slices/29-workspace-copy-tightening-and-structural-trim.md`](./slices/29-workspace-copy-tightening-and-structural-trim.md)
   - Trim duplicated helper/meta copy across `General`, `Options`, `Panels`, and `Questions` without weakening warnings or advanced reachability.
22. [`slices/30-final-visual-alignment-and-density-verification.md`](./slices/30-final-visual-alignment-and-density-verification.md)
   - Finish the density follow-up with final polish, full verification, and updated evidence.
23. [`slices/31-shared-workspace-proportion-and-control-sizing.md`](./slices/31-shared-workspace-proportion-and-control-sizing.md)
   - Tighten the shared shell proportions, control sizing, save-bar structure, and stacked/mobile toolbar layout.
24. [`slices/32-editor-card-compaction-and-copy-tuning.md`](./slices/32-editor-card-compaction-and-copy-tuning.md)
   - Remove duplicate micro-headings and shorten the copy that is still inflating cards without adding new meaning.
25. [`slices/33-final-ui-refinement-verification.md`](./slices/33-final-ui-refinement-verification.md)
   - Finish the UI refinement pass with full verification and updated evidence.
26. [`slices/34-add-ons-inventory-shell-and-search-density.md`](./slices/34-add-ons-inventory-shell-and-search-density.md)
   - Tighten the `/admin/plugins` intro, content width, and search-toolbar structure so the inventory feels calmer and closer to `/login`.
27. [`slices/35-add-ons-card-hierarchy-and-copy-refinement.md`](./slices/35-add-ons-card-hierarchy-and-copy-refinement.md)
   - Refine the add-on cards around denser status, facts, JSON preview, and action hierarchy without changing the existing routes.
28. [`slices/36-final-add-ons-inventory-verification.md`](./slices/36-final-add-ons-inventory-verification.md)
   - Finish the add-ons inventory pass with targeted verification, browser checks, and updated evidence.
29. [`slices/37-add-ons-inventory-grouping-and-layout-decluttering.md`](./slices/37-add-ons-inventory-grouping-and-layout-decluttering.md)
   - Break the add-ons inventory out of the single mixed wall by grouping it around operational state and tightening the section scan path.
30. [`slices/38-add-ons-metadata-trim-and-row-compaction.md`](./slices/38-add-ons-metadata-trim-and-row-compaction.md)
   - Flatten the add-on rows, trim redundant visible metadata, and keep JSON/workbench reachability legible without nested clutter.
31. [`slices/39-final-add-ons-decluttering-verification.md`](./slices/39-final-add-ons-decluttering-verification.md)
   - Finish the decluttering follow-up with build, targeted tests, browser checks, and updated evidence.
32. [`slices/40-transcript-operations-shell-and-filter-structure.md`](./slices/40-transcript-operations-shell-and-filter-structure.md)
   - Build the integrated transcript workspace header and collapse the oversized filter surface responsively.
33. [`slices/41-transcript-records-and-summary-decluttering.md`](./slices/41-transcript-records-and-summary-decluttering.md)
   - Tighten summary and records flow so transcript records become the primary surface sooner.
34. [`slices/42-final-transcript-operations-verification.md`](./slices/42-final-transcript-operations-verification.md)
   - Finish the transcript-operations follow-up with final verification and evidence.
35. [`slices/43-transcript-summary-and-shell-compaction.md`](./slices/43-transcript-summary-and-shell-compaction.md)
   - Compact the transcript header facts and filtered summary so the page stops opening as another summary-card wall.
36. [`slices/44-transcript-records-toolbar-and-operations-balance.md`](./slices/44-transcript-records-toolbar-and-operations-balance.md)
   - Compress bulk actions into a denser records toolbar and rebalance the operations section so it reads as secondary analysis.
37. [`slices/45-final-transcript-layout-verification.md`](./slices/45-final-transcript-layout-verification.md)
   - Finish the transcript decluttering follow-up with full verification and updated evidence.
38. [`slices/46-transcript-shell-and-filter-streamlining.md`](./slices/46-transcript-shell-and-filter-streamlining.md)
   - Flatten the transcript shell and filter structure so the top of the page stops reading like stacked subsections.
39. [`slices/47-transcript-records-and-operations-density.md`](./slices/47-transcript-records-and-operations-density.md)
   - Fold summary and bulk tools into the records workflow and calm the operations hierarchy.
40. [`slices/48-final-transcript-surface-polish-verification.md`](./slices/48-final-transcript-surface-polish-verification.md)
   - Finish the transcript surface-polish follow-up with final verification and updated evidence.
41. [`slices/49-admin-surface-page-fill-width-restoration.md`](./slices/49-admin-surface-page-fill-width-restoration.md)
   - Remove the route-specific content caps from add-ons and transcripts so both pages use the full admin-shell lane on wide desktop widths.
42. [`slices/50-final-admin-surface-page-fill-verification.md`](./slices/50-final-admin-surface-page-fill-verification.md)
   - Verify the page-fill restoration on wide desktop, standard desktop, and mobile, then close the workflow state.
43. [`slices/51-tickets-surface-retirement-and-safe-redirect.md`](./slices/51-tickets-surface-retirement-and-safe-redirect.md)
   - Remove the obsolete Tickets admin surface while preserving a safe redirect for historical links.
44. [`slices/52-final-tickets-surface-retirement-verification.md`](./slices/52-final-tickets-surface-retirement-verification.md)
   - Verify the route retirement, rail cleanup, and safe redirect behavior, then close the workflow state.
45. [`slices/53-general-workspace-structure-and-density-rebalance.md`](./slices/53-general-workspace-structure-and-density-rebalance.md)
   - Rebalance `/visual/general` around calmer section grouping, denser mobile nav, and a non-overlapping save surface.
46. [`slices/54-final-general-workspace-layout-verification.md`](./slices/54-final-general-workspace-layout-verification.md)
   - Verify the General-specific refinement with the full test set and authenticated browser checks.
47. [`slices/55-options-workspace-structure-and-visibility-fix.md`](./slices/55-options-workspace-structure-and-visibility-fix.md)
   - Rebalance `/visual/options` around a calmer top stage, correct type-section visibility, and clearer ticket-editor subsections.
48. [`slices/56-final-options-workspace-layout-verification.md`](./slices/56-final-options-workspace-layout-verification.md)
   - Verify the Options-specific refinement with the full test set and authenticated browser checks.
49. [`slices/57-panels-workspace-structure-and-flow-rebalance.md`](./slices/57-panels-workspace-structure-and-flow-rebalance.md)
   - Rebalance `/visual/panels` around paired builder lanes, a calmer top stage, and a final save row.
50. [`slices/58-final-panels-workspace-layout-verification.md`](./slices/58-final-panels-workspace-layout-verification.md)
   - Verify the Panels-specific refinement with the full test set and authenticated browser checks.
51. [`slices/59-questions-workspace-structure-and-flow-rebalance.md`](./slices/59-questions-workspace-structure-and-flow-rebalance.md)
   - Rebalance `/visual/questions` around a paired usage/identity layout, a calmer top stage, and a final save row.
52. [`slices/60-final-questions-workspace-layout-verification.md`](./slices/60-final-questions-workspace-layout-verification.md)
   - Verify the Questions-specific refinement with the full test set and authenticated browser checks.
53. [`slices/61-general-workspace-space-and-copy-trim.md`](./slices/61-general-workspace-space-and-copy-trim.md)
   - Trim redundant copy and wasted space in `/visual/general` while keeping the same editor behavior and advanced reachability.
54. [`slices/62-final-general-workspace-space-and-copy-trim-verification.md`](./slices/62-final-general-workspace-space-and-copy-trim-verification.md)
   - Verify the final General trim pass with the full test set and authenticated browser checks.
55. [`slices/63-options-workspace-space-and-copy-trim.md`](./slices/63-options-workspace-space-and-copy-trim.md)
   - Trim redundant copy and wasted space in `/visual/options` while keeping the same editor behavior and advanced reachability.
56. [`slices/64-final-options-workspace-space-and-copy-trim-verification.md`](./slices/64-final-options-workspace-space-and-copy-trim-verification.md)
   - Verify the final Options trim pass with the full test set and authenticated browser checks.
57. [`slices/65-panels-workspace-space-and-copy-trim.md`](./slices/65-panels-workspace-space-and-copy-trim.md)
   - Trim redundant copy and wasted space in `/visual/panels` while keeping the same editor behavior and advanced reachability.
58. [`slices/66-final-panels-workspace-space-and-copy-trim-verification.md`](./slices/66-final-panels-workspace-space-and-copy-trim-verification.md)
   - Verify the final Panels trim pass with the full test set and authenticated browser checks.
59. [`slices/67-questions-workspace-space-and-copy-trim.md`](./slices/67-questions-workspace-space-and-copy-trim.md)
   - Trim redundant copy and wasted space in `/visual/questions` while keeping the same editor behavior and advanced reachability.
60. [`slices/68-final-questions-workspace-space-and-copy-trim-verification.md`](./slices/68-final-questions-workspace-space-and-copy-trim-verification.md)
   - Verify the final Questions trim pass with the full test set and authenticated browser checks.
61. [`slices/69-shared-brand-favicon-and-footer-cleanup.md`](./slices/69-shared-brand-favicon-and-footer-cleanup.md)
   - Replace the shared E4/favicon pipeline, remove visible footer UI, and clear visible non-auth health shortcuts while keeping the shared dialog payload intact.
62. [`slices/70-auth-surface-simplification-and-health-shortcut-removal.md`](./slices/70-auth-surface-simplification-and-health-shortcut-removal.md)
   - Add the centered EoTFS hero art to `/login`, remove health UI and redundant auth copy, and flatten the viewer login into a minimal single-panel surface.
63. [`slices/71-final-brand-and-auth-surface-cleanup-verification.md`](./slices/71-final-brand-and-auth-surface-cleanup-verification.md)
   - Verify the full brand/auth cleanup with the node test suite plus browser checks on admin login, viewer login, and shared dashboard chrome.
64. [`slices/72-global-admin-roles-json-repair-and-legacy-recovery.md`](./slices/72-global-admin-roles-json-repair-and-legacy-recovery.md)
   - Replace the loose `globalAdmins` save path with strict role-ID JSON handling, recover the known legacy corruption shape, and preserve General form state on invalid saves.
65. [`slices/73-final-global-admin-roles-json-repair-verification.md`](./slices/73-final-global-admin-roles-json-repair-verification.md)
   - Verify the `globalAdmins` repair chain with build, full node verification, and desktop/mobile General-page behavior checks.

## Latest planning evidence

- [`evidence/core-editor-workspace-redesign-planning.md`](./evidence/core-editor-workspace-redesign-planning.md)
  - Locks the repo-grounded rationale, thematic constraints, route/API decisions, safety rules, and slice sequence for the new editor-workspace redesign.
- [`evidence/editor-workspace-density-alignment-planning.md`](./evidence/editor-workspace-density-alignment-planning.md)
  - Locks the follow-up density findings, login-surface reference, responsive advanced-tools decision, and slice map for the next implementation pass.
- [`evidence/editor-workspace-ui-refinement-planning.md`](./evidence/editor-workspace-ui-refinement-planning.md)
  - Locks the post-density browser findings, shared-shell proportion targets, and slice map for the next refinement pass.
- [`evidence/add-ons-inventory-ui-refinement-planning.md`](./evidence/add-ons-inventory-ui-refinement-planning.md)
  - Locks the `/admin/plugins` browser findings, login-reference comparison, and slice map for the add-ons inventory follow-up.
- [`evidence/add-ons-inventory-decluttering-planning.md`](./evidence/add-ons-inventory-decluttering-planning.md)
  - Locks the clustered-wall findings, grouping decision, metadata-trim rules, and verification map for the add-ons decluttering follow-up.
- [`evidence/transcript-operations-ui-refinement-planning.md`](./evidence/transcript-operations-ui-refinement-planning.md)
  - Locks the `/admin/transcripts` duplication findings, responsive disclosure plan, and slice map for the transcript-operations follow-up.
- [`evidence/transcript-layout-decluttering-planning.md`](./evidence/transcript-layout-decluttering-planning.md)
  - Locks the remaining clustered-layout findings, hierarchy decisions, and slice map for the transcript decluttering follow-up.
- [`evidence/transcript-surface-polish-planning.md`](./evidence/transcript-surface-polish-planning.md)
  - Locks the remaining subsection-chrome findings, transcript shell decisions, and slice map for the surface-polish follow-up.
- [`evidence/admin-surface-page-fill-planning.md`](./evidence/admin-surface-page-fill-planning.md)
  - Locks the wide-desktop content-cap findings and slice map for the add-ons/transcripts page-fill follow-up.
- [`evidence/tickets-surface-retirement-planning.md`](./evidence/tickets-surface-retirement-planning.md)
  - Locks the obsolete-page findings, safe-redirect decision, and slice map for the Tickets-surface retirement follow-up.
- [`evidence/general-workspace-layout-refinement-planning.md`](./evidence/general-workspace-layout-refinement-planning.md)
  - Locks the remaining `/visual/general` clustering findings, the structural layout decisions, and the slice map for the General follow-up.
- [`evidence/general-workspace-space-and-copy-trim-planning.md`](./evidence/general-workspace-space-and-copy-trim-planning.md)
  - Locks the remaining redundant-copy and wasted-space findings, the General-specific trim decisions, and the slice map for the follow-up.
- [`evidence/options-workspace-layout-refinement-planning.md`](./evidence/options-workspace-layout-refinement-planning.md)
  - Locks the remaining `/visual/options` clustering findings, the section-visibility fix, and the slice map for the Options follow-up.
- [`evidence/options-workspace-space-and-copy-trim-planning.md`](./evidence/options-workspace-space-and-copy-trim-planning.md)
  - Locks the remaining redundant-copy, warning-placement, and inventory-noise findings for the Options trim follow-up.
- [`evidence/panels-workspace-space-and-copy-trim-planning.md`](./evidence/panels-workspace-space-and-copy-trim-planning.md)
  - Locks the remaining redundant-copy, summary-compaction, and preview-density findings for the Panels trim follow-up.
- [`evidence/panels-workspace-layout-refinement-planning.md`](./evidence/panels-workspace-layout-refinement-planning.md)
  - Locks the remaining `/visual/panels` long-form layout findings, the builder-lane decisions, and the slice map for the Panels follow-up.
- [`evidence/questions-workspace-layout-refinement-planning.md`](./evidence/questions-workspace-layout-refinement-planning.md)
  - Locks the remaining `/visual/questions` long-form layout findings, the usage/identity lane decisions, and the slice map for the Questions follow-up.
- [`evidence/questions-workspace-space-and-copy-trim-planning.md`](./evidence/questions-workspace-space-and-copy-trim-planning.md)
  - Locks the remaining redundant-copy, label-compaction, and wasted-space findings for the Questions trim follow-up.
- [`evidence/brand-and-auth-surface-cleanup-planning.md`](./evidence/brand-and-auth-surface-cleanup-planning.md)
  - Locks the footer-payload dependency, dual favicon-delivery path, dinosaur-asset roles, health-shortcut removal scope, and the final three-slice execution map for the dashboard brand/auth cleanup.
- [`evidence/global-admin-roles-json-repair-planning.md`](./evidence/global-admin-roles-json-repair-planning.md)
  - Locks the General-page `globalAdmins` failure analysis, role-ID contract correction, legacy recovery rules, and the final two-slice execution map for the repair follow-up.

## Prior editor completion evidence

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js`
- Browser/manual verification completed on `/dash/admin/plugins` at `1440x900` and `390x844`, including filtered-empty-state validation
- Final proof captured in:
  - `plugins/ot-dashboard/evidence/34-add-ons-inventory-shell-and-search-density.md`
  - `plugins/ot-dashboard/evidence/35-add-ons-card-hierarchy-and-copy-refinement.md`
  - `plugins/ot-dashboard/evidence/36-final-add-ons-inventory-verification.md`

## Latest completion evidence

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/auth.test.js dist/plugins/ot-dashboard/test/home-setup.test.js dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/viewer-routes.test.js dist/plugins/ot-dashboard/test/transcript-workspace.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js`
- Equivalent authenticated fixture-browser checks on `/dash/visual/general`, `/dash/admin/security`, and `/dash/visual/options` at desktop/mobile widths confirmed valid save, invalid save, legacy recovery, and unchanged list-editor behavior.
- Slice 73 verification confirmed the full `globalAdmins` repair chain stayed within `plugins/ot-dashboard/**`, rebuilt the compiled dashboard output cleanly, and preserved the existing Security plus Options list workflows while closing the General-page bug.
- Final proof captured in:
  - `plugins/ot-dashboard/evidence/72-global-admin-roles-json-repair-and-legacy-recovery.md`
  - `plugins/ot-dashboard/evidence/73-final-global-admin-roles-json-repair-verification.md`

## Latest follow-up

- Active follow-up: `none`
- Completed slice chain:
  - `72-global-admin-roles-json-repair-and-legacy-recovery`
  - `73-final-global-admin-roles-json-repair-verification`
- Final packet:
  - `plugins/ot-dashboard/evidence/global-admin-roles-json-repair-planning.md`
  - `plugins/ot-dashboard/evidence/72-global-admin-roles-json-repair-and-legacy-recovery.md`
  - `plugins/ot-dashboard/evidence/73-final-global-admin-roles-json-repair-verification.md`
  - `plugins/ot-dashboard/slices/72-global-admin-roles-json-repair-and-legacy-recovery.md`
  - `plugins/ot-dashboard/slices/73-final-global-admin-roles-json-repair-verification.md`
