import test from "node:test"
import assert from "node:assert/strict"

import {
    BridgeCompletedFormSnapshot,
    BridgeFormContractData,
    BridgeHandoffState,
    buildCaseCreatedPayload,
    createSignedBridgeHeaders,
    extractTranscriptUrl,
    isEligibleOptionId,
    parseCaseCreatedAck,
    validateCompletedFormForHandoff
} from "../bridge-core"
import {
    finalizeCaseCreatedEvent,
    prepareCaseCreatedEvent,
    prepareTranscriptAttachedEvent,
    shouldRecreateBridgeControlForPlacement
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
        { position: 2, question: "Alderon ID(s)?", answer: "123456789, 987-654-321" },
        { position: 3, question: "Alderon in-game name(s)?", answer: "Raziel, AltRaziel" },
        { position: 4, question: "Realism server experience?", answer: "A few whitelist servers." },
        { position: 5, question: "Do you understand your name in this server must match your Alderon name and ID and that you may not change it unless your Alderon name changes?", answer: "Yes" },
        { position: 6, question: "Do you understand you must submit a separate application to play Apex Carnivores?", answer: "Yes" },
        { position: 7, question: "Do you understand we use an illness system, that some illnesses are mandatory to act out and roll for, and that your dinosaur may die to illness?", answer: "Yes" },
        { position: 8, question: "Do you understand you must roll for high or low T dimorphism, mutations, and other required character traits for your dinosaur?", answer: "Yes" },
        { position: 9, question: "Do you understand you must be nested before you roll for mutations?", answer: "Yes" },
        { position: 10, question: "Why join EoTFS?", answer: "I want a realism-first server with active staff." },
        { position: 11, question: "What is realism RP to you?", answer: "Immersive play with consequences and consistency." },
        { position: 12, question: "Gameplay focus?", answer: "Hardcore realism RP" },
        { position: 13, question: "Favorite dino here?", answer: "Suchomimus, and yes I expect to play it here." },
        { position: 14, question: "How do you handle losses?", answer: "I take the loss, record evidence, and move on appropriately." },
        { position: 15, question: "Metagaming example?", answer: "Using outside voice chat information your dinosaur would not know." },
        { position: 16, question: "Combat logging?", answer: "Leaving to avoid consequences is combat logging and should not be allowed." },
        { position: 17, question: "Have you read the profiles and server rules, do you accept that staff will enforce them, and do you understand that gameplay may be recorded?", answer: "Yes" },
        { position: 18, question: "Do you understand rule updates may occur and that it is your responsibility to stay current?", answer: "Yes" },
        { position: 19, question: "Rules password?", answer: "Sunrise" },
        { position: 20, question: "Why are you a good fit?", answer: "I like long-form realism and consistent community expectations." }
    ]
}

const existingState: BridgeHandoffState = {
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
    controlMessageId: "222222222222222222",
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
}

test("eligible option gating stays locked to configured option ids", () => {
    assert.equal(isEligibleOptionId(["whitelist-application-ticket-81642e12"], "whitelist-application-ticket-81642e12"), true)
    assert.equal(isEligibleOptionId(["whitelist-application-ticket-81642e12"], "other-option"), false)
})

test("case_created payload shaping and HMAC signing stay deterministic", () => {
    const validation = validateCompletedFormForHandoff(completedFormSnapshot, formContract, ["Sunrise"])
    assert.equal(validation.ok, true)

    const payload = buildCaseCreatedPayload({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", validation.alderonIds)

    assert.deepEqual(payload.alderon_ids, ["123-456-789", "987-654-321"])
    assert.equal(payload.alderon_ids_csv, "123-456-789, 987-654-321")
    assert.equal(payload.applicant_ready, true)
    assert.equal(payload.target_selector.group_key, "community_mirror")

    const rawBody = JSON.stringify(payload)
    const headers = createSignedBridgeHeaders("shared-secret", "2026-03-29T00:00:00.000Z", "evt-1", rawBody)
    assert.equal(headers["X-Bridge-Signature"], "sha256=615d79a31a73059f4a043b4d4caee5571cd5d84997b14dc523892c01119bc6ca")
})

test("completed form applicant snapshot stays authoritative when the live ticket owner changed", () => {
    const validation = validateCompletedFormForHandoff(completedFormSnapshot, formContract, ["Sunrise"])
    assert.equal(validation.ok, true)

    const payload = buildCaseCreatedPayload({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "999999999999999999"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", validation.alderonIds)

    assert.equal(payload.source_creator_discord_user_id, "111111111111111111")

    const handoffState = finalizeCaseCreatedEvent(
        "123456789012345678",
        "community_mirror",
        "evt-created-2",
        "2026-03-29T00:00:10.000Z",
        { caseId: "bridge-case-2", ticketRef: "ot:123456789012345678", duplicate: false },
        payload.source_creator_discord_user_id,
        "999999999999999999"
    )

    assert.equal(handoffState.applicantDiscordUserId, "111111111111111111")
    assert.equal(handoffState.ticketCreatorDiscordUserId, "999999999999999999")
    assert.equal(handoffState.creatorTransferDetected, true)
})

test("missing completed form rejects handoff before transport", () => {
    const prepared = prepareCaseCreatedEvent({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, null, "222222222222222222", "community_mirror", formContract, ["Sunrise"], null)

    assert.equal(prepared.status, "missing-form")
    if (prepared.status == "missing-form") {
        assert.equal(prepared.message.includes("staff review"), true)
    }
})

test("case_created preparation blocks staff handoff when the typed Discord username does not match the live creator aliases", () => {
    const prepared = prepareCaseCreatedEvent({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", formContract, ["Sunrise"], null, {
        creatorIdentityAliases: ["Different User"]
    })

    assert.equal(prepared.status, "invalid-form")
    if (prepared.status == "invalid-form") {
        assert.equal(
            prepared.message.includes("Q1 must match the ticket creator's live Discord username, global name, or server nickname."),
            true
        )
    }
})

test("bridge control reorder only triggers when the staff card is older than the applicant start message", () => {
    assert.equal(shouldRecreateBridgeControlForPlacement(100, 200), true)
    assert.equal(shouldRecreateBridgeControlForPlacement(200, 100), false)
    assert.equal(shouldRecreateBridgeControlForPlacement(100, 100), false)
    assert.equal(shouldRecreateBridgeControlForPlacement(null, 200), false)
})

test("duplicate send remains blocked when a staged case already exists", () => {
    const prepared = prepareCaseCreatedEvent({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", formContract, ["Sunrise"], existingState)

    assert.equal(prepared.status, "already-bridged")
    if (prepared.status == "already-bridged") {
        assert.equal(prepared.state.bridgeCaseId, "bridge-case-1")
    }
})

test("transcript attach is ignored before case creation state exists", () => {
    const prepared = prepareTranscriptAttachedEvent("123456789012345678", "http://127.0.0.1:8456/transcripts/slug", null)
    assert.equal(prepared.status, "ignored")
    if (prepared.status == "ignored") {
        assert.equal(prepared.reason, "missing-state")
    }
})

test("transcript URL extraction and case_created ack parsing stay service-driven", () => {
    assert.equal(extractTranscriptUrl({ publicUrl: " http://127.0.0.1:8456/transcripts/slug " }), "http://127.0.0.1:8456/transcripts/slug")
    assert.equal(extractTranscriptUrl({ publicUrl: null }), null)

    const ack = parseCaseCreatedAck({
        case_id: "bridge-case-1",
        ticket_ref: "ot:123456789012345678",
        duplicate: true
    }, "ot:123456789012345678")

    assert.deepEqual(ack, {
        caseId: "bridge-case-1",
        ticketRef: "ot:123456789012345678",
        duplicate: true
    })
})
