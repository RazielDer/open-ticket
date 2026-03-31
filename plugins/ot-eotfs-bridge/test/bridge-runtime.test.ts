import test from "node:test"
import assert from "node:assert/strict"

import {
    BridgeCompletedFormSnapshot,
    BridgeHandoffState,
    buildCaseCreatedPayload,
    createSignedBridgeHeaders,
    extractTranscriptUrl,
    isEligibleOptionId,
    parseCaseCreatedAck
} from "../bridge-core"
import {
    finalizeCaseCreatedEvent,
    prepareCaseCreatedEvent,
    prepareTranscriptAttachedEvent
} from "../bridge-runtime"

const completedFormSnapshot: BridgeCompletedFormSnapshot = {
    ticketChannelId: "123456789012345678",
    ticketChannelName: "whitelist-raziel",
    ticketOptionId: "whitelist-application-ticket-81642e12",
    applicantDiscordUserId: "111111111111111111",
    formId: "whitelist-review-form",
    completedAt: "2026-03-29T00:00:00.000Z",
    answers: [
        { position: 1, question: "Discord username and in-game name?", answer: "RazielDer / Raziel" },
        { position: 2, question: "Alderon ID(s)? Use commas if more than one.", answer: "alderon-1, alderon-2, alderon-1" },
        { position: 3, question: "Why do you want to join this community?", answer: "For RP." },
        { position: 4, question: "What character or role do you plan to play?", answer: "Tracker" },
        { position: 5, question: "How familiar are you with the server rules and setting?", answer: "Comfortable with the rules" },
        { position: 6, question: "Have you read the whitelist requirements and are you ready for staff review?", answer: "Yes, I am ready" }
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
    lastStatus: null,
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
    const payload = buildCaseCreatedPayload({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror")

    assert.deepEqual(payload.alderon_ids, ["alderon-1", "alderon-2"])
    assert.equal(payload.alderon_ids_csv, "alderon-1, alderon-2")
    assert.equal(payload.applicant_ready, true)
    assert.equal(payload.target_selector.group_key, "community_mirror")

    const rawBody = JSON.stringify(payload)
    const headers = createSignedBridgeHeaders("shared-secret", "2026-03-29T00:00:00.000Z", "evt-1", rawBody)
    assert.equal(headers["X-Bridge-Signature"], "sha256=4e1c1c3fab6b49af6292c21cc9cf9d3589ec604958211ea5dedd0fa199e1f268")
})

test("completed form applicant snapshot stays authoritative when the live ticket owner changed", () => {
    const payload = buildCaseCreatedPayload({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "999999999999999999"
    }, completedFormSnapshot, "222222222222222222", "community_mirror")

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
    }, null, "222222222222222222", "community_mirror", null)

    assert.equal(prepared.status, "missing-form")
})

test("duplicate handoff is treated as success when state already exists", () => {
    const prepared = prepareCaseCreatedEvent({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", existingState)

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
