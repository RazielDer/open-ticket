import test from "node:test"
import assert from "node:assert/strict"

import { BridgeCompletedFormSnapshot, BridgeFormContractData, validateCompletedFormForHandoff } from "../bridge-core"
import { prepareCaseCreatedEvent } from "../bridge-runtime"

const formContract: BridgeFormContractData = {
    discordUsernamePosition: 1,
    alderonIdsPosition: 2,
    rulesPasswordPosition: 19,
    requiredAcknowledgementPositions: [5, 6, 7, 8, 9, 17, 18]
}

function buildCompletedForm(overrides: Partial<BridgeCompletedFormSnapshot> = {}): BridgeCompletedFormSnapshot {
    return {
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        ticketOptionId: "whitelist-application-ticket-81642e12",
        applicantDiscordUserId: "111111111111111111",
        formId: "whitelist-review-form",
        completedAt: "2026-03-29T00:00:00.000Z",
        answers: [
            { position: 1, question: "Discord username?", answer: "RazielDer" },
            { position: 2, question: "Alderon ID(s)?", answer: "123456789, 987-654-321" },
            { position: 3, question: "Alderon in-game name(s)?", answer: "Raziel, AltRaziel" },
            { position: 4, question: "Realism server experience?", answer: "None yet." },
            { position: 5, question: "Do you understand your name in this server must match your Alderon name and ID and that you may not change it unless your Alderon name changes?", answer: "Yes" },
            { position: 6, question: "Do you understand you must submit a separate application to play Apex Carnivores?", answer: "Yes" },
            { position: 7, question: "Do you understand we use an illness system, that some illnesses are mandatory to act out and roll for, and that your dinosaur may die to illness?", answer: "Yes" },
            { position: 8, question: "Do you understand you must roll for high or low T dimorphism, mutations, and other required character traits for your dinosaur?", answer: "Yes" },
            { position: 9, question: "Do you understand you must be nested before you roll for mutations?", answer: "Yes" },
            { position: 10, question: "Why join EoTFS?", answer: "I want a realism server with active staff." },
            { position: 11, question: "What is realism RP to you?", answer: "Consistency, immersion, and accepting consequences." },
            { position: 12, question: "Gameplay focus?", answer: "Hardcore realism RP" },
            { position: 13, question: "Favorite dino here?", answer: "Suchomimus, and yes I expect to play it here." },
            { position: 14, question: "How do you handle losses?", answer: "I accept the loss and report rule breaks correctly." },
            { position: 15, question: "Metagaming example?", answer: "Using information from stream chat in character." },
            { position: 16, question: "Combat logging?", answer: "Leaving combat to avoid consequences is not allowed." },
            { position: 17, question: "Have you read the profiles and server rules, do you accept that staff will enforce them, and do you understand that gameplay may be recorded?", answer: "Yes" },
            { position: 18, question: "Do you understand rule updates may occur and that it is your responsibility to stay current?", answer: "Yes" },
            { position: 19, question: "Rules password?", answer: "Sunrise" },
            { position: 20, question: "Why are you a good fit?", answer: "I want a long-term realism community." }
        ],
        ...overrides
    }
}

test("form validation accepts mixed plain and grouped AGIDs and canonicalizes them", () => {
    const validation = validateCompletedFormForHandoff(buildCompletedForm(), formContract, ["Sunrise", "Sunset"])

    assert.equal(validation.ok, true)
    assert.deepEqual(validation.alderonIds, ["123-456-789", "987-654-321"])
    assert.deepEqual(validation.errors, [])
})

test("form validation accepts plain AGIDs and rewrites them into canonical grouped form", () => {
    const validation = validateCompletedFormForHandoff(
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 2 ? { ...answer, answer: "123456789, 987654321" } : answer
            )
        }),
        formContract,
        ["Sunrise"]
    )

    assert.equal(validation.ok, true)
    assert.deepEqual(validation.alderonIds, ["123-456-789", "987-654-321"])
})

test("form validation accepts grouped AGIDs without changing their canonical format", () => {
    const validation = validateCompletedFormForHandoff(
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 2 ? { ...answer, answer: "123-456-789, 987-654-321" } : answer
            )
        }),
        formContract,
        ["Sunrise"]
    )

    assert.equal(validation.ok, true)
    assert.deepEqual(validation.alderonIds, ["123-456-789", "987-654-321"])
})

test("form validation rejects duplicate AGIDs after normalization", () => {
    const validation = validateCompletedFormForHandoff(
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 2 ? { ...answer, answer: "123456789, 123-456-789" } : answer
            )
        }),
        formContract,
        ["Sunrise"]
    )

    assert.equal(validation.ok, false)
    assert.deepEqual(validation.alderonIds, ["123-456-789"])
    assert.equal(validation.errors.includes("Q2 duplicate AGIDs are not allowed."), true)
})

test("form validation rejects malformed AGIDs", () => {
    const validation = validateCompletedFormForHandoff(
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 2 ? { ...answer, answer: "123456789, not-an-agid" } : answer
            )
        }),
        formContract,
        ["Sunrise"]
    )

    assert.equal(validation.ok, false)
    assert.equal(validation.errors.includes("Q2 each AGID must be `123456789` or `123-456-789`."), true)
})

test("form validation enforces the live Discord identity alias check when aliases are available", () => {
    const matched = validateCompletedFormForHandoff(
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 1 ? { ...answer, answer: "Raziel   Der" } : answer
            )
        }),
        formContract,
        ["Sunrise"],
        ["raziel der", "Different Alias"]
    )

    assert.equal(matched.ok, true)

    const mismatched = validateCompletedFormForHandoff(
        buildCompletedForm(),
        formContract,
        ["Sunrise"],
        ["Different Alias"]
    )

    assert.equal(mismatched.ok, false)
    assert.equal(
        mismatched.errors.includes("Q1 must match the ticket creator's live Discord username, global name, or server nickname."),
        true
    )
})

test("form validation rejects a rules password mismatch", () => {
    const prepared = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "111111111111111111"
        },
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 19 ? { ...answer, answer: "WrongPassword" } : answer
            )
        }),
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        null
    )

    assert.equal(prepared.status, "invalid-form")
    if (prepared.status == "invalid-form") {
        assert.equal(prepared.message.includes("Q19 rules password did not match an accepted value."), true)
    }
})

test("form validation rejects acknowledgement answers that are not Yes", () => {
    const prepared = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "111111111111111111"
        },
        buildCompletedForm({
            answers: buildCompletedForm().answers.map((answer) =>
                answer.position == 5 ? { ...answer, answer: "No" } : answer
            )
        }),
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        null
    )

    assert.equal(prepared.status, "invalid-form")
    if (prepared.status == "invalid-form") {
        assert.equal(prepared.message.includes("Q5 must be answered Yes"), true)
    }
})

test("form validation fails closed when no accepted rules password env values are configured", () => {
    const prepared = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "111111111111111111"
        },
        buildCompletedForm(),
        "222222222222222222",
        "community_mirror",
        formContract,
        [],
        null
    )

    assert.equal(prepared.status, "invalid-form")
    if (prepared.status == "invalid-form") {
        assert.equal(prepared.message.includes("EOTFS_OT_WHITELIST_RULES_PASSWORDS"), true)
    }
})

test("refresh review packet preparation stays available only while the case remains pending_review", () => {
    const refreshReady = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "111111111111111111"
        },
        buildCompletedForm(),
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        {
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
            controlMessageId: "control-message",
            lastRenderedState: "pending_review",
            renderVersion: 1,
            lastPolicySnapshot: null,
            lastStatus: {
                bridge_case_id: "bridge-case-1",
                source_ticket_ref: "ot:123456789012345678",
                status: "pending_review",
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
                reviewed_hard_deny_targets: []
            },
            pollAttemptCount: 0,
            lastPolledAt: null,
            nextPollAt: null,
            lastPollError: null,
            degradedReason: null,
            updatedAt: "2026-03-29T00:00:00.000Z"
        },
        { allowRefresh: true }
    )

    assert.equal(refreshReady.status, "ready")
    if (refreshReady.status == "ready") {
        assert.equal(refreshReady.mode, "refresh")
        assert.equal(refreshReady.payload.applicant_ready, true)
    }

    const refreshBlocked = prepareCaseCreatedEvent(
        {
            ticketChannelId: "123456789012345678",
            ticketChannelName: "whitelist-raziel",
            optionId: "whitelist-application-ticket-81642e12",
            optionName: "Whitelist Application",
            creatorDiscordUserId: "111111111111111111"
        },
        buildCompletedForm(),
        "222222222222222222",
        "community_mirror",
        formContract,
        ["Sunrise"],
        {
            ticketChannelId: "123456789012345678",
            sourceTicketRef: "ot:123456789012345678",
            bridgeCaseId: "bridge-case-2",
            ticketRef: "ot:123456789012345678",
            targetGroupKey: "community_mirror",
            applicantDiscordUserId: "111111111111111111",
            ticketCreatorDiscordUserId: "111111111111111111",
            creatorTransferDetected: false,
            createdEventId: "evt-created",
            transcriptEventId: null,
            transcriptUrl: null,
            transcriptStatus: null,
            controlMessageId: "control-message",
            lastRenderedState: "accepted_applied",
            renderVersion: 1,
            lastPolicySnapshot: null,
            lastStatus: {
                bridge_case_id: "bridge-case-2",
                source_ticket_ref: "ot:123456789012345678",
                status: "accepted_applied",
                render_version: 1,
                transcript_ready: true,
                ticket_log_link: "https://example.com/transcripts/ot-12345.html",
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
                apply_closeout_state: "close_ready",
                reviewed_hard_deny_targets: []
            },
            pollAttemptCount: 0,
            lastPolledAt: null,
            nextPollAt: null,
            lastPollError: null,
            degradedReason: null,
            updatedAt: "2026-03-29T00:00:00.000Z"
        },
        { allowRefresh: true }
    )

    assert.equal(refreshBlocked.status, "refresh-blocked")
    if (refreshBlocked.status == "refresh-blocked") {
        assert.equal(refreshBlocked.message.includes("pending_review"), true)
    }
})
