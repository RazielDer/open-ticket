# Slice 72 Evidence: Global Admin Roles JSON Repair And Legacy Recovery

## Implemented changes

- Replaced the loose `globalAdmins` save path in [`plugins/ot-dashboard/server/config-service.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/server/config-service.ts) with dedicated strict JSON parsing for quoted Discord role IDs, including whitespace-as-empty support, trim-and-deduplicate normalization, numeric-ID rejection, and narrow legacy line-split recovery for the known `["[","\"123\",",... ,"]"]` corruption signature.
- Added a General draft-normalization path plus route-owned render state in [`plugins/ot-dashboard/server/routes/api.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/server/routes/api.ts) and [`plugins/ot-dashboard/server/routes/pages.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/server/routes/pages.ts) so invalid `globalAdmins` saves return `400`, preserve the rest of the General form, skip config writes, and skip success audit events.
- Updated [`plugins/ot-dashboard/public/views/config-general.ejs`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/public/views/config-general.ejs) and [`plugins/ot-dashboard/locales/english.json`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/locales/english.json) to render route-supplied `globalAdmins` drafts, corrected role-ID field copy, and inline localized warning/error messaging for legacy recovery, unrecoverable saved values, and invalid submissions.
- Added targeted coverage in [`plugins/ot-dashboard/test/editor-layout.test.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/test/editor-layout.test.ts), [`plugins/ot-dashboard/test/operational-pages.test.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/test/operational-pages.test.ts), and [`plugins/ot-dashboard/test/roundtrip.test.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-dashboard/test/roundtrip.test.ts) for valid-save normalization, invalid-save fail-closed behavior, preserved draft state, legacy recovery display, and raw invalid-saved guidance.

## Verification

```bash
npm run build
```

Outcome:

- `OT: Compilation Failed!`
- The failure is outside the allowed slice scope: [`plugins/ot-eotfs-bridge/test/bridge-runtime.test.ts`](/c:/Users/Administrator/Desktop/PoT/Bot/EoTFS Ticket Bot/open-ticket/plugins/ot-eotfs-bridge/test/bridge-runtime.test.ts) still expects an older `BridgeHandoffState` shape and is missing `controlMessageId`, `lastRenderedState`, `renderVersion`, `lastPolicySnapshot`, and additional newer fields.
- The compile still refreshed `dist/plugins/ot-dashboard/**`, and the required slice-72 dashboard tests below ran against the updated compiled dashboard output.

```bash
node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/operational-pages.test.js dist/plugins/ot-dashboard/test/roundtrip.test.js
```

Outcome:

- `15` tests passed, `0` failed.
- The new coverage proved:
  - strict quoted role-ID JSON saves normalize and persist clean arrays
  - invalid trailing-comma JSON re-renders inline with preserved General-form state and no success audit write
  - legacy line-split corruption shows a repaired draft without silently rewriting the file on page load
  - unrecoverable saved values surface raw JSON guidance instead of heuristic guessing
