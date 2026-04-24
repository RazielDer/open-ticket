import test from "node:test"
import assert from "node:assert/strict"

import {
    buildCaseCreatedPayload,
    buildTranscriptAttachedPayload,
    type BridgeCompletedFormSnapshot
} from "../bridge-core"

const completedFormSnapshot: BridgeCompletedFormSnapshot = {
    ticketChannelId: "123456789012345678",
    ticketChannelName: "whitelist-raziel",
    ticketOptionId: "whitelist-application-ticket-81642e12",
    applicantDiscordUserId: "111111111111111111",
    formId: "whitelist-review-form",
    completedAt: "2026-03-29T00:00:00.000Z",
    answers: [
        { position: 1, question: "Discord username?", answer: "RazielDer" },
        { position: 2, question: "Alderon ID(s)?", answer: "123456789" }
    ]
}

test("case_created payload keeps source_ticket_id and source_ticket_ref bound to the current ticket resource id", () => {
    const payload = buildCaseCreatedPayload({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, completedFormSnapshot, "222222222222222222", "community_mirror", ["123-456-789"])

    assert.equal(payload.source_ticket_id, "123456789012345678")
    assert.equal(payload.source_ticket_ref, "ot:123456789012345678")
})

test("case_created payload accepts private-thread ticket resource ids without changing bridge identity", () => {
    const payload = buildCaseCreatedPayload({
        ticketChannelId: "987654321098765432",
        ticketChannelName: "whitelist-thread-raziel",
        optionId: "whitelist-application-ticket-81642e12",
        optionName: "Whitelist Application",
        creatorDiscordUserId: "111111111111111111"
    }, {
        ...completedFormSnapshot,
        ticketChannelId: "987654321098765432",
        ticketChannelName: "whitelist-thread-raziel"
    }, "222222222222222222", "community_mirror", ["123-456-789"])

    assert.equal(payload.source_ticket_id, "987654321098765432")
    assert.equal(payload.source_ticket_ref, "ot:987654321098765432")
})

test("transcript_attached payload keeps the released ot-prefixed ticket reference contract", () => {
    const payload = buildTranscriptAttachedPayload("123456789012345678", "https://example.com/transcripts/ot-123456789012345678.html")

    assert.equal(payload.source_ticket_id, "123456789012345678")
    assert.equal(payload.source_ticket_ref, "ot:123456789012345678")
    assert.equal(payload.transcript_url, "https://example.com/transcripts/ot-123456789012345678.html")
})
