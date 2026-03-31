# Slice 35 Evidence: Add-ons Card Hierarchy And Copy Refinement

## Summary

- Reworked the `/admin/plugins` inventory cards into denser workbench-launcher cards with compact fact blocks, surfaced JSON preview chips, capped tag runs, and cleaner action hierarchy.
- Reused existing inventory data from `buildPluginInventoryItems` by exposing limited `assetPreview` and `tagPreview` sets plus `+N more` counts instead of inventing new backend APIs.
- Extended route tests so the inventory now proves JSON previews are visible on the list view while excluded directories still stay hidden.

## Commands run

```bash
npm run build
node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js
```

## Meaningful outcomes

- `npm run build` succeeded with `OT: Compilation Succeeded!`.
- `node --test dist/plugins/ot-dashboard/test/app.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js` passed with `29` tests, `0` failures.
- Browser inspection on the authenticated fixture showed the first desktop inventory card dropped from roughly `646px` to `521px` after the hierarchy pass, and JSON previews are now visible directly on the inventory cards.
