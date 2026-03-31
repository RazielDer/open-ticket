import test from "node:test"
import assert from "node:assert/strict"

import {
    BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT
} from "../bridge-core"
import {
    evaluateCreateTicketDecision,
    findMisconfiguredEligibleOptionIds
} from "../bridge-runtime"

test("create-ticket decision blocks duplicate live whitelist tickets", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [
            {
                ticketChannelId: "123456789012345678",
                optionId: "whitelist-application-ticket-81642e12",
                creatorDiscordUserId: "111111111111111111",
                closed: false
            }
        ],
        null,
        null
    )

    assert.equal(decision.allow, false)
    assert.equal(decision.reason?.includes("already have an open whitelist ticket"), true)
})

test("create-ticket decision fails open when eligibility is degraded", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [],
        null,
        "Eligibility service unavailable."
    )

    assert.deepEqual(decision, {
        allow: true,
        reason: null,
        failOpen: true
    })
})

test("create-ticket decision blocks canonical bot-side lockout states", () => {
    const decision = evaluateCreateTicketDecision(
        "whitelist-application-ticket-81642e12",
        ["whitelist-application-ticket-81642e12"],
        "111111111111111111",
        [],
        {
            applicant_discord_user_id: "111111111111111111",
            eligible: false,
            current_block_state: BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT,
            block_expires_at: "2026-04-01T00:00:00.000Z",
            policy: {
                max_retry_denials: 99,
                retry_cooldown_minutes: 5,
                limit_lockout_minutes: 43200,
                next_retry_outcome: "limit_locked",
                total_staged_attempts: 3,
                active_retry_denial_count: 99,
                lifetime_retry_denial_count: 99,
                lifetime_limit_lockout_count: 1,
                duplicate_rejection_count: 0,
                accept_count: 0,
                hard_deny_count: 0,
                current_block_state: BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT,
                block_expires_at: "2026-04-01T00:00:00.000Z",
                historical_alderon_ids: [],
                override_actor_user_id: null,
                override_reason: null,
                override_updated_at: null
            }
        },
        null
    )

    assert.equal(decision.allow, false)
    assert.equal(decision.reason?.includes("limit lockout"), true)
})

test("misconfigured eligible options are reported when userMaximum drifts from one", () => {
    const misconfigured = findMisconfiguredEligibleOptionIds([
        {
            optionId: "eligible-good",
            limitsEnabled: true,
            userMaximum: 1
        },
        {
            optionId: "eligible-drifted",
            limitsEnabled: true,
            userMaximum: 3
        },
        {
            optionId: "eligible-disabled",
            limitsEnabled: false,
            userMaximum: 1
        }
    ])

    assert.deepEqual(misconfigured, ["eligible-drifted", "eligible-disabled"])
})
