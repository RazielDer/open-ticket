import test from "node:test"
import assert from "node:assert/strict"

import {
    BridgeCompletedFormSnapshot,
    BridgeFormContractData,
    BridgeHandoffState
} from "../bridge-core"
import {
    isReviewableBridgeStatus,
    normalizeActionResponse,
    prepareCaseCreatedEvent
} from "../bridge-runtime"

const formContract: BridgeFormContractData = {
    discordUsernamePosition: 1,
    alderonIdsPosition: 2,
    rulesPasswordPosition: 19,
    requiredAcknowledgementPositions: [5, 6, 7, 8, 9, 17, 18]
}

const completedFormSnapshot: BridgeCompletedFormSnapshot = {
    ticketChannelId: "123456789012345678",
    ticketChannelName: "whitelist-raziel",
    ticketOptionId: "whitelist-application-ticket-81642e12",
    applicantDiscordUserId: "111111111111111111",
    formId: "whitelist-review-form",
    completedAt: "2026-03-29T00:00:00.000Z",
    answers: [
        { position: 1, question: "Discord username?", answer: "RazielDer" },
        { position: 2, question: "Alderon ID(s)?", answer: "123456789" },
        { position: 5, question: "Ack 5", answer: "Yes" },
        { position: 6, question: "Ack 6", answer: "Yes" },
        { position: 7, question: "Ack 7", answer: "Yes" },
        { position: 8, question: "Ack 8", answer: "Yes" },
        { position: 9, question: "Ack 9", answer: "Yes" },
        { position: 17, question: "Ack 17", answer: "Yes" },
        { position: 18, question: "Ack 18", answer: "Yes" },
        { position: 19, question: "Rules password?", answer: "Sunrise" }
    ]
}

function buildExistingState(status: string): BridgeHandoffState {
    return {
        ticketChannelId: "123456789012345678",
        sourceTicketRef: "ot:123456789012345678",
        bridgeCaseId: "bridge-case-1",
        ticketRef: "ot:123456789012345678",
        targetGroupKey: "community_mirror",
        applicantDiscordUserId: "111111111111111111",
        ticketCreatorDiscordUserId: "111111111111111111",
        creatorTransferDetected: false,
        createdEventId: "evt-created",
        transcriptEventId: null,
        transcriptUrl: null,
        transcriptStatus: null,
        presentationStackVersion: 1,
        whitelistProcessMessageId: "333333333333333333",
        whitelistExpectationsMessageId: "444444444444444444",
        controlMessageId: "222222222222222222",
        lastRenderedState: status as BridgeHandoffState["lastRenderedState"],
        renderVersion: 1,
        lastPolicySnapshot: null,
        lastStatus: {
            bridge_case_id: "bridge-case-1",
            source_ticket_ref: "ot:123456789012345678",
            status,
            render_version: 1,
            transcript_ready: false,
            ticket_log_link: null,
            duplicate_active_whitelist: false,
            current_block_state: "none",
            block_expires_at: null,
            policy: {
                max_retry_denials: 99,
                retry_cooldown_minutes: 5,
                limit_lockout_minutes: 43200,
                next_retry_outcome: "retry_denied",
                total_staged_attempts: 1,
                active_retry_denial_count: 0,
                lifetime_retry_denial_count: 0,
                lifetime_limit_lockout_count: 0,
                duplicate_rejection_count: 0,
                accept_count: 0,
                hard_deny_count: 0,
                current_block_state: "none",
                block_expires_at: null,
                historical_alderon_ids: [],
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
                retry_warning: null
            },
            apply_closeout_state: "ticket_open",
            player_visible_apply_summary: null,
            reviewed_hard_deny_targets: []
        },
        pollAttemptCount: 0,
        lastPolledAt: null,
        nextPollAt: null,
        lastPollError: null,
        degradedReason: null,
        operatorWarning: null,
        updatedAt: "2026-03-29T00:00:00.000Z"
    }
}

test("reviewable bridge status helper stays limited to pending review, retry denied, and limit locked", () => {
    assert.equal(isReviewableBridgeStatus("pending_review"), true)
    assert.equal(isReviewableBridgeStatus("retry_denied"), true)
    assert.equal(isReviewableBridgeStatus("limit_locked"), true)
    assert.equal(isReviewableBridgeStatus("accepted_applied"), false)
    assert.equal(isReviewableBridgeStatus(null), false)
})

test("refresh review packet stays available while the staged case is retry denied", () => {
    const prepared = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "999999999999999999"
        },
        completedFormSnapshot,
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        buildExistingState("retry_denied"),
        { allowRefresh: true }
    )

    assert.equal(prepared.status, "ready")
})

test("refresh review packet blocks once the staged case is not retry denied", () => {
    for (const status of ["pending_review", "limit_locked", "accepted_applied"] as const) {
        const prepared = prepareCaseCreatedEvent(
            {
                ticketChannelId: "123456789012345678",
                ticketChannelName: "whitelist-raziel",
                optionId: "whitelist-application-ticket-81642e12",
                optionName: "Whitelist Application",
                creatorDiscordUserId: "999999999999999999"
            },
            completedFormSnapshot,
            "222222222222222222",
            "community_mirror",
            formContract,
            ["Sunrise"],
            buildExistingState(status),
            { allowRefresh: true }
        )

        assert.equal(prepared.status, "refresh-blocked")
        if (prepared.status == "refresh-blocked") {
            assert.match(prepared.message, /returns the application with Retry/)
        }
    }
})

test("refresh review packet rejects a Discord username mismatch when live creator aliases are available", () => {
    const prepared = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "999999999999999999"
        },
        completedFormSnapshot,
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        buildExistingState("retry_denied"),
        {
            allowRefresh: true,
            creatorIdentityAliases: ["Different User"]
        }
    )

    assert.equal(prepared.status, "invalid-form")
    if (prepared.status == "invalid-form") {
        assert.match(prepared.message, /The Discord name in the application must match the ticket owner's current Discord name/)
    }
})

test("action response normalization preserves operator warnings for staff followups", () => {
    const normalized = normalizeActionResponse({
        bridge_case_id: "bridge-case-1",
        source_ticket_ref: "ot:123456789012345678",
        status: "accepted_pending_apply",
        render_version: 2,
        transcript_ready: true,
        ticket_log_link: "https://example.test/transcript",
        duplicate_active_whitelist: false,
        current_block_state: "none",
        block_expires_at: null,
        policy: {
            max_retry_denials: 99,
            retry_cooldown_minutes: 5,
            limit_lockout_minutes: 43200,
            next_retry_outcome: "retry_denied",
            total_staged_attempts: 1,
            active_retry_denial_count: 0,
            lifetime_retry_denial_count: 0,
            lifetime_limit_lockout_count: 0,
            duplicate_rejection_count: 0,
            accept_count: 1,
            hard_deny_count: 0,
            current_block_state: "none",
            block_expires_at: null,
            historical_alderon_ids: [],
            override_actor_user_id: null,
            override_reason: null,
            override_updated_at: null
        },
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
        apply_closeout_state: "apply_in_progress",
        player_visible_apply_summary: "Your whitelist is being applied across the server group now.",
        reviewed_hard_deny_targets: [],
        action_kind: "accept",
        close_ticket_ready: false,
        apply_request_id: "apply-123",
        approval_id: null,
        player_visible_critique: null,
        operator_warning: "Immediate whitelist apply did not complete inline after commit."
    })

    assert.equal(
        normalized.operator_warning,
        "Immediate whitelist apply did not complete inline after commit."
    )
})
