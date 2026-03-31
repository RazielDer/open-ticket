# Slice 05: Admin Commands, Tests, and Cutover Proof

- Phase: `P05`
- Status: `ready`
- Depends on: `04-render-http-compiler`
- Allowed writes: `plugins/ot-html-transcripts/**` only

## Objective

Finish the operator surface, prove the compatibility claims, and leave the plugin ready for implementation signoff.

## Deliverables

- `transcript` slash and text command
- responder logic for `get`, `revoke`, `reissue`, and `delete`
- plugin-owned response builders if needed
- compiled tests matching the source spec's verification matrix

## Target file plan

- `commands/transcript-command.ts`
- `responses/embeds.ts`
- `responses/messages.ts`
- `test/commands.test.ts`
- `test/end-to-end.test.ts`
- `README.md`

## Implementation tasks

1. Register one slash command and one text command named `transcript`.
2. Use a single action argument with:
   - `get`
   - `revoke`
   - `reissue`
   - `delete`
3. Accept:
   - required string `target`
   - optional string `reason` for mutating actions
4. Gate command execution with `general.system.permissions.delete`.
5. Implement responder logic through `onCommandResponderLoad`.
6. Use the service class for all command operations:
   - `get` shows current status and URL when active
   - `revoke` disables the active link
   - `reissue` creates a new active slug and supersedes the old one
   - `delete` invalidates links, removes archive files, and marks transcript deleted
7. Add plugin-owned embeds/messages only when the base repo cannot already provide an acceptable admin reply shape.
8. Update the plugin `README.md` to document:
   - install and config steps
   - reverse proxy expectation
   - publicBaseUrl requirement
   - archive and sqlite locations
   - admin command usage
   - single-host limitation
9. Implement tests that cover the source-spec matrix:
   - plugin absent leaves upstream behavior unchanged
   - mode=text is unchanged
   - mode=html makes no external transcript call
   - transcripts include more than `2000` messages
   - delete queueing does not corrupt DB or archives
   - asset limits produce `partial`, not fatal failure
   - ready embeds and visit button still work
   - retry and continue flows still work
   - slug `404` and `410` behavior
   - stale `building` recovery on restart
   - command target resolution by transcript id, slug, ticket id, and channel id
   - restart preserves transcript availability
10. Run the repo-level verification commands and record any remaining gaps.

## Exit criteria

- Admin commands work through the service class without direct SQLite access.
- Existing transcript success and failure flows are preserved.
- The final verification commands pass.
- The plugin `README.md` is sufficient for an operator to deploy behind a reverse proxy.

## Final verification

- `npm run build`
- `node --test dist/plugins/ot-html-transcripts/test`

## Release gate

Do not call the plugin implementation complete unless all of the following are true:

- Local transcript URLs are generated and served.
- Full history is captured without the 2000-message cap.
- No external HTML transcript API call occurs while the plugin is active.
- Ready and failure paths still use the existing core UX contracts.
