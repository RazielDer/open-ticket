import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
    BRIDGE_BLOCK_STATE_NONE,
    BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
    BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
    BRIDGE_CASE_STATUS_LIMIT_LOCKED,
    BRIDGE_CASE_STATUS_PENDING_REVIEW,
    BRIDGE_CASE_STATUS_RETRY_DENIED,
    BridgeStatusResponse
} from "../bridge-core"
import {
    applyBridgeAction,
    applyBridgeStatus,
    beginBridgePolling,
    buildBridgeControlDescriptor,
    createInitialBridgeState,
    markBridgeDegraded,
    shouldPollBridgeState
} from "../bridge-runtime"

function buildStatus(overrides: Partial<BridgeStatusResponse> = {}): BridgeStatusResponse {
    return {
        bridge_case_id: "bridge-case-1",
        source_ticket_ref: "ot:123456789012345678",
        status: BRIDGE_CASE_STATUS_PENDING_REVIEW,
        render_version: 1,
        transcript_ready: false,
        ticket_log_link: null,
        duplicate_active_whitelist: false,
        current_block_state: BRIDGE_BLOCK_STATE_NONE,
        block_expires_at: null,
        policy: {
            max_retry_denials: 99,
            retry_cooldown_minutes: 5,
            limit_lockout_minutes: 43200,
            next_retry_outcome: "limit_locked",
            total_staged_attempts: 3,
            active_retry_denial_count: 2,
            lifetime_retry_denial_count: 5,
            lifetime_limit_lockout_count: 1,
            duplicate_rejection_count: 0,
            accept_count: 1,
            hard_deny_count: 0,
            current_block_state: BRIDGE_BLOCK_STATE_NONE,
            block_expires_at: null,
            historical_alderon_ids: ["alpha_1"],
            override_actor_user_id: null,
            override_reason: null,
            override_updated_at: null
        },
        action_availability: {
            accept: false,
            retry: true,
            duplicate: false,
            hard_deny: true,
            retry_apply: false,
            refresh_status: true,
            accept_disabled_reason: "Accept requires a transcript URL.",
            retry_warning: "Next Retry will trigger the long lockout."
        },
        apply_closeout_state: "ticket_open",
        player_visible_apply_summary: null,
        reviewed_hard_deny_targets: ["alpha_1", "beta_2"],
        ...overrides
    }
}

test("normal staged card shows adjudication actions and transfer warning", () => {
    let state = createInitialBridgeState(
        "123456789012345678",
        "community_mirror",
        "111111111111111111",
        "999999999999999999",
        "2026-03-31T00:00:00.000Z"
    )
    state = applyBridgeStatus(state, buildStatus(), "2026-03-31T00:00:01.000Z")
    state = {
        ...state,
        createdEventId: "evt-created"
    }

    const descriptor = buildBridgeControlDescriptor(state)

    assert.equal(descriptor.renderState, BRIDGE_CASE_STATUS_PENDING_REVIEW)
    assert.equal(descriptor.lines[0], "Whitelist Staff Review")
    assert.deepEqual(descriptor.buttons.map((button) => button.action), [
        "accept",
        "retry",
        "hard_deny_review",
        "refresh_status"
    ])
    assert.deepEqual(descriptor.buttons.map((button) => button.label), [
        "Accept",
        "Retry",
        "Permanent Denial",
        "Refresh Status"
    ])
    assert.equal(descriptor.lines.some((line) => line.includes("Waiting for staff review")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("pre-close transcript cutover")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Transcript: blocked for legacy staged case")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("manual transcript repair")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Attempt history stays pinned")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Next Retry will trigger the long lockout.")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("canonical Discord-side whitelist permissions")), true)
})

test("transcript-ready pending review copy becomes explicit without changing the adjudication button matrix", () => {
    let state = createInitialBridgeState(
        "723456789012345678",
        "community_mirror",
        "111111111111111111",
        "111111111111111111",
        "2026-03-31T00:00:00.000Z"
    )
    state = applyBridgeStatus(state, buildStatus({
        bridge_case_id: "bridge-case-ready",
        source_ticket_ref: "ot:723456789012345678",
        transcript_ready: true,
        ticket_log_link: "https://example.com/transcripts/ot-723456789012345678.html",
        action_availability: {
            accept: true,
            retry: true,
            duplicate: false,
            hard_deny: true,
            retry_apply: false,
            refresh_status: true,
            accept_disabled_reason: null,
            retry_warning: "Next Retry will trigger the long lockout."
        }
    }), "2026-03-31T00:00:01.000Z")

    const descriptor = buildBridgeControlDescriptor(state)

    assert.deepEqual(descriptor.buttons.map((button) => button.action), [
        "accept",
        "retry",
        "hard_deny_review",
        "refresh_status"
    ])
    assert.equal(descriptor.lines.some((line) => line.includes("without deleting the ticket")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Transcript: ready")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Transcript URL: https://example.com/transcripts/ot-723456789012345678.html")), true)
})

test("unstaged card removes staff staging controls entirely", () => {
    const descriptor = buildBridgeControlDescriptor(createInitialBridgeState(
        "423456789012345678",
        "community_mirror",
        "111111111111111111",
        "111111111111111111",
        "2026-03-31T00:00:00.000Z"
    ))

    assert.equal(descriptor.lines[0], "Whitelist Staff Review")
    assert.equal(
        descriptor.lines.includes("This card stays hidden until the applicant uses Submit for Review."),
        true
    )
    assert.deepEqual(descriptor.buttons, [])
})

test("retry denied, limit locked, duplicate override, and terminal states render the locked button matrix", () => {
    const retryDeniedState = applyBridgeStatus(
        createInitialBridgeState(
            "123456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            status: BRIDGE_CASE_STATUS_RETRY_DENIED,
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: true,
                retry_apply: false,
                refresh_status: true,
                accept_disabled_reason: null,
                retry_warning: null
            }
        }),
        "2026-03-31T00:00:01.000Z"
    )
    const limitLockedState = applyBridgeStatus(
        createInitialBridgeState(
            "223456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            bridge_case_id: "bridge-case-2",
            source_ticket_ref: "ot:223456789012345678",
            status: BRIDGE_CASE_STATUS_LIMIT_LOCKED,
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: true,
                retry_apply: false,
                refresh_status: true,
                accept_disabled_reason: "Accept requires a transcript URL.",
                retry_warning: null
            }
        }),
        "2026-03-31T00:00:02.000Z"
    )
    const duplicateState = applyBridgeStatus(
        createInitialBridgeState(
            "323456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            bridge_case_id: "bridge-case-3",
            source_ticket_ref: "ot:323456789012345678",
            status: BRIDGE_CASE_STATUS_LIMIT_LOCKED,
            duplicate_active_whitelist: true,
            action_availability: {
                accept: false,
                retry: false,
                duplicate: true,
                hard_deny: false,
                retry_apply: false,
                refresh_status: true,
                accept_disabled_reason: "Accept requires a transcript URL.",
                retry_warning: null
            }
        }),
        "2026-03-31T00:00:03.000Z"
    )
    const failedState = applyBridgeStatus(
        createInitialBridgeState(
            "423456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            bridge_case_id: "bridge-case-4",
            source_ticket_ref: "ot:423456789012345678",
            status: BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
            transcript_ready: true,
            ticket_log_link: "https://example.com/transcripts/ot-423456789012345678.html",
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: false,
                retry_apply: true,
                refresh_status: true,
                accept_disabled_reason: null,
                retry_warning: null
            },
            apply_closeout_state: "apply_failed",
            player_visible_apply_summary: "Your whitelist could not be completed automatically. Staff have been notified and will finish the repair."
        }),
        "2026-03-31T00:00:04.000Z"
    )
    const pendingApplyState = applyBridgeStatus(
        createInitialBridgeState(
            "463456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            bridge_case_id: "bridge-case-4b",
            source_ticket_ref: "ot:463456789012345678",
            status: "accepted_pending_apply",
            transcript_ready: true,
            ticket_log_link: "https://example.com/transcripts/ot-463456789012345678.html",
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: false,
                retry_apply: false,
                refresh_status: true,
                accept_disabled_reason: null,
                retry_warning: null
            },
            apply_closeout_state: "ticket_open",
            player_visible_apply_summary: "Your whitelist is being applied across the server group now. No action is required from you unless staff contacts you."
        }),
        "2026-03-31T00:00:04.500Z"
    )
    const appliedState = applyBridgeStatus(
        createInitialBridgeState(
            "523456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
            bridge_case_id: "bridge-case-5",
            source_ticket_ref: "ot:523456789012345678",
            status: BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
            transcript_ready: true,
            ticket_log_link: "https://example.com/transcripts/ot-523456789012345678.html",
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: false,
                retry_apply: false,
                refresh_status: true,
                accept_disabled_reason: null,
                retry_warning: null
            },
            apply_closeout_state: "close_ready"
        }),
        "2026-03-31T00:00:05.000Z"
    )

    assert.deepEqual(buildBridgeControlDescriptor(retryDeniedState).buttons.map((button) => button.action), [
        "hard_deny_review",
        "refresh_status"
    ])
    assert.deepEqual(buildBridgeControlDescriptor(limitLockedState).buttons.map((button) => button.action), [
        "accept",
        "hard_deny_review",
        "refresh_status"
    ])
    assert.equal(
        buildBridgeControlDescriptor(limitLockedState).lines.includes("Accept status: Accept requires a transcript URL."),
        true
    )
    assert.deepEqual(buildBridgeControlDescriptor(duplicateState).buttons.map((button) => button.action), [
        "duplicate",
        "refresh_status"
    ])
    assert.equal(
        buildBridgeControlDescriptor(duplicateState).lines.some((line) => line.includes("Use Close as Duplicate")),
        true
    )
    assert.equal(
        buildBridgeControlDescriptor(failedState).lines.includes(
            "Your whitelist could not be completed automatically. Staff have been notified and will finish the repair."
        ),
        true
    )
    assert.deepEqual(buildBridgeControlDescriptor(failedState).buttons.map((button) => button.action), [
        "retry_apply",
        "refresh_status"
    ])
    assert.equal(
        buildBridgeControlDescriptor(pendingApplyState).lines.includes(
            "Your whitelist is being applied across the server group now. No action is required from you unless staff contacts you."
        ),
        true
    )
    assert.deepEqual(buildBridgeControlDescriptor(pendingApplyState).buttons.map((button) => button.action), [
        "refresh_status"
    ])
    assert.deepEqual(buildBridgeControlDescriptor(appliedState).buttons.map((button) => button.action), [
        "refresh_status"
    ])
})

test("operator apply warnings persist on the staff card until apply reaches success", () => {
    const baseState = createInitialBridgeState(
        "623456789012345678",
        "community_mirror",
        "111111111111111111",
        "111111111111111111",
        "2026-03-31T00:00:00.000Z"
    )
    const warningState = applyBridgeAction(
        baseState,
        {
            ...buildStatus({
                bridge_case_id: "bridge-case-warning",
                source_ticket_ref: "ot:623456789012345678",
                status: "accepted_pending_apply",
                transcript_ready: true,
                ticket_log_link: "https://example.com/transcripts/ot-623456789012345678.html",
                action_availability: {
                    accept: false,
                    retry: false,
                    duplicate: false,
                    hard_deny: false,
                    retry_apply: false,
                    refresh_status: true,
                    accept_disabled_reason: null,
                    retry_warning: null
                },
                apply_closeout_state: "ticket_open",
                player_visible_apply_summary: "Your whitelist is being applied across the server group now."
            }),
            action_kind: "accept",
            close_ticket_ready: false,
            apply_request_id: "apply-623",
            approval_id: null,
            player_visible_critique: null,
            operator_warning: "Immediate whitelist apply did not complete inline after commit."
        },
        "2026-03-31T00:00:01.000Z"
    )
    const failedState = applyBridgeStatus(
        warningState,
        buildStatus({
            bridge_case_id: "bridge-case-warning",
            source_ticket_ref: "ot:623456789012345678",
            status: BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
            action_availability: {
                accept: false,
                retry: false,
                duplicate: false,
                hard_deny: false,
                retry_apply: true,
                refresh_status: true,
                accept_disabled_reason: null,
                retry_warning: null
            },
            apply_closeout_state: "apply_failed"
        }),
        "2026-03-31T00:00:02.000Z"
    )
    const appliedState = applyBridgeStatus(
        failedState,
        buildStatus({
            bridge_case_id: "bridge-case-warning",
            source_ticket_ref: "ot:623456789012345678",
            status: BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
            apply_closeout_state: "close_ready"
        }),
        "2026-03-31T00:00:03.000Z"
    )

    assert.equal(warningState.operatorWarning, "Immediate whitelist apply did not complete inline after commit.")
    assert.equal(
        buildBridgeControlDescriptor(warningState).lines.some((line) => line.includes("Staff warning: Immediate whitelist apply did not complete inline after commit.")),
        true
    )
    assert.equal(failedState.operatorWarning, "Immediate whitelist apply did not complete inline after commit.")
    assert.equal(appliedState.operatorWarning, null)
})

test("degraded unstaged controls stay disabled and polling gates on persisted metadata", () => {
    let state = createInitialBridgeState(
        "323456789012345678",
        "community_mirror",
        "111111111111111111",
        "111111111111111111",
        "2026-03-31T00:00:00.000Z"
    )
    state = beginBridgePolling(
        markBridgeDegraded(state, "Eligibility service is unavailable.", "2026-03-31T00:00:05.000Z"),
        "2026-03-31T00:00:05.000Z"
    )

    const descriptor = buildBridgeControlDescriptor(state)

    assert.equal(descriptor.renderState, "degraded")
    assert.equal(
        descriptor.lines.includes("This card stays hidden until the applicant uses Submit for Review."),
        true
    )
    assert.deepEqual(descriptor.buttons, [])
    assert.equal(
        shouldPollBridgeState(state, "2026-03-31T00:00:40.000Z"),
        true
    )
})

test("unauthorized bridge copy mentions configured bridge roles instead of only OT participants", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.equal(
        source.includes("Only OT ticket admins or OT-guild members with configured whitelist bridge roles can use these whitelist review controls."),
        true
    )
    assert.equal(
        source.includes("OT ticket admin or bridge-role access only exposes the review card; it does not authorize Accept or Retry Whitelist Apply."),
        true
    )
    assert.equal(source.includes("Send to Staff Review"), false)
    assert.equal(source.includes("Update Staff Review"), false)
    assert.equal(
        source.includes("This control is obsolete. The applicant must use Submit for Review to stage or resubmit the whitelist application."),
        true
    )
})

test("action success copy distinguishes immediate apply completion from retry-apply recovery", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-eotfs-bridge", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.equal(
        source.includes("Whitelist accept recorded. Whitelist apply completed immediately and the ticket can close."),
        true
    )
    assert.equal(
        source.includes("Whitelist apply retry completed immediately and the ticket can close."),
        true
    )
    assert.equal(
        source.includes("Whitelist apply retry started. The ticket stays open until apply reaches terminal success."),
        true
    )
    assert.equal(
        source.includes("Whitelist apply requeued. The ticket stays open until apply reaches terminal success."),
        false
    )
})
