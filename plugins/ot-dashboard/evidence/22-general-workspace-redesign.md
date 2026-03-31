# General Workspace Redesign

## Intent

Convert `/visual/general` into the shared workspace format with section navigation and collapsed advanced controls while keeping the existing General save contract untouched.

## Changes applied

- Rebuilt the General page onto the shared workspace shell with a navigation sidebar and sticky save region.
- Re-grouped the main form into connection and command mode, status, logs, limits, and advanced behavior sections.
- Moved rare controls into collapsed advanced disclosures for identity defaults, system flags, channel topic, permissions, and message delivery.
- Kept the exact `POST /api/config/general` field names and route unchanged.

## Verification completed

- `npm run build`
- `node --test dist/plugins/ot-dashboard/test/editor-layout.test.js dist/plugins/ot-dashboard/test/app.test.js`

## Behavior evidence

- `/dash/visual/general` now renders `Connection and command mode`, `Status`, `Logs`, `Limits`, and `Advanced behavior` in the new workspace order.
- The General page still submits successfully to `/dash/api/config/general` with the existing CSRF and field-name contract.
- Raw JSON review, export, backup, restore, and `/dash/config/general` remain reachable from the General workspace tray.
