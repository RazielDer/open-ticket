import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import * as discord from "discord.js"
import {
    buildManagedRecordFields,
    buildTicketManagedRecordMessagePayload,
    rebindManagedRecordSnapshot,
    splitManagedRecordFields
} from "../service/ticket-managed-record-runtime.js"

function buildManagedAnswers(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        question: {
            position: index + 1,
            question: `Question ${index + 1}`,
            type: "paragraph" as const,
            optional: false,
            placeholder: "Response",
            maxLength: 1023
        },
        answer: `Answer ${index + 1}`
    }))
}

test("ticket-managed records paginate draft fields and collapse them into one ticket message payload", () => {
    const fields = buildManagedRecordFields(buildManagedAnswers(30))
    const pages = splitManagedRecordFields(fields)
    const embeds = pages.map((page, index) =>
        new discord.EmbedBuilder()
            .setTitle(`Draft Page ${index + 1}`)
            .addFields(...page)
    )
    const payload = buildTicketManagedRecordMessagePayload(
        embeds
    )

    assert.equal(pages.length, 2)
    assert.equal(pages[0].length, 25)
    assert.equal(pages[1].length, 5)
    assert.equal((payload.components ?? []).length, 0)
    assert.equal((payload.embeds ?? []).length, 2)
    assert.equal(payload.embeds?.[0], embeds[0])
})

test("managed-record fields truncate long question labels and preserve unanswered placeholders", () => {
    const [firstField, secondField] = buildManagedRecordFields([
        {
            question: {
                position: 1,
                question: "Q".repeat(300),
                type: "paragraph"
            },
            answer: null
        },
        {
            question: {
                position: 2,
                question: "Why join EoTFS?",
                type: "paragraph"
            },
            answer: "Community"
        }
    ])

    assert.equal(firstField.name.length, 255)
    assert.match(firstField.name, /\.\.\.$/)
    assert.equal(firstField.value, "```Unanswered question.```")
    assert.equal(secondField.value, "```Community```")
})

test("managed-record snapshot rebinding updates message linkage and answer state without mutating the source snapshot", () => {
    const original = {
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        ticketOptionId: "whitelist-application-ticket-81642e12",
        applicantDiscordUserId: "111111111111111111",
        formId: "whitelist-review-form",
        answerTarget: "ticket_managed_record" as const,
        draftState: "partial" as const,
        formColor: "#2f855a",
        updatedAt: "2026-03-29T00:00:00.000Z",
        completedAt: null,
        managedRecordMessageId: "managed-message-1",
        answers: buildManagedAnswers(2)
    }

    const rebound = rebindManagedRecordSnapshot(original, {
        managedRecordMessageId: "managed-message-2",
        draftState: "completed",
        updatedAt: "2026-03-29T01:00:00.000Z",
        completedAt: "2026-03-29T01:00:00.000Z",
        answers: buildManagedAnswers(3)
    })

    assert.equal(rebound.managedRecordMessageId, "managed-message-2")
    assert.equal(rebound.draftState, "completed")
    assert.equal(rebound.answers.length, 3)
    assert.equal(original.managedRecordMessageId, "managed-message-1")
    assert.equal(original.answers.length, 2)
})

test("answers embed copy distinguishes saved drafts from submitted applications", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "builders", "embedBuilders.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.equal(source.includes("Draft saved. Use the ${OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL} button in this ticket to resume."), true)
    assert.equal(source.includes("Application submitted. Use the ${OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL} button while staff review remains editable."), true)
})
