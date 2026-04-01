import test from "node:test"
import assert from "node:assert/strict"

import {
    BRIDGE_BLOCK_STATE_NONE,
    BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
    BRIDGE_CASE_STATUS_PENDING_REVIEW,
    BridgeStatusResponse
} from "../bridge-core"
import {
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

    const descriptor = buildBridgeControlDescriptor(state)

    assert.equal(descriptor.renderState, BRIDGE_CASE_STATUS_PENDING_REVIEW)
    assert.equal(descriptor.lines[0], "Staff whitelist review control.")
    assert.deepEqual(descriptor.buttons.map((button) => button.action), [
        "accept",
        "retry",
        "hard_deny_review",
        "refresh_review_packet"
    ])
    assert.equal(descriptor.lines.some((line) => line.includes("Attempt history stays pinned")), true)
    assert.equal(descriptor.lines.some((line) => line.includes("Next Retry will trigger the long lockout.")), true)
})

test("unstaged card uses the staff-facing handoff wording", () => {
    const descriptor = buildBridgeControlDescriptor(createInitialBridgeState(
        "423456789012345678",
        "community_mirror",
        "111111111111111111",
        "111111111111111111",
        "2026-03-31T00:00:00.000Z"
    ))

    assert.equal(descriptor.lines[0], "Staff whitelist review control.")
    assert.equal(
        descriptor.lines.includes("Complete the whitelist application form first, then send this ticket to staff review."),
        true
    )
    assert.deepEqual(
        descriptor.buttons.map((button) => [button.action, button.label, button.disabled]),
        [["send", "Send to Staff Review", false]]
    )
})

test("duplicate and accepted_failed states render contextual button rows", () => {
    const duplicateState = applyBridgeStatus(
        createInitialBridgeState(
            "123456789012345678",
            "community_mirror",
            "111111111111111111",
            "111111111111111111",
            "2026-03-31T00:00:00.000Z"
        ),
        buildStatus({
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
        "2026-03-31T00:00:01.000Z"
    )
    const failedState = applyBridgeStatus(
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
            status: BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
            transcript_ready: true,
            ticket_log_link: "https://example.com/transcripts/ot-223456789012345678.html",
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

    assert.deepEqual(buildBridgeControlDescriptor(duplicateState).buttons.map((button) => button.action), [
        "duplicate",
        "refresh_review_packet",
        "refresh_status"
    ])
    assert.deepEqual(buildBridgeControlDescriptor(failedState).buttons.map((button) => button.action), [
        "retry_apply",
        "refresh_status"
    ])
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
        descriptor.lines.includes("Complete the whitelist application form first, then send this ticket to staff review."),
        true
    )
    assert.deepEqual(
        descriptor.buttons.map((button) => [button.action, button.label, button.disabled]),
        [["send", "Send to Staff Review", true]]
    )
    assert.equal(
        shouldPollBridgeState(state, "2026-03-31T00:00:40.000Z"),
        true
    )
})
