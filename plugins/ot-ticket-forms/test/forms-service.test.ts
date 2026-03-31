import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
    OTFormsCompletedTicketFormStore,
    OT_FORMS_PLUGIN_SERVICE_ID,
    createCompletedTicketFormKey,
    resolveOriginalApplicantDiscordUserId
} from "../service/forms-model.js"

test("whitelist review form config matches the locked six-question bridge contract", () => {
    const configPath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Array<{
        id: string
        autoSendOptionIds: string[]
        questions: Array<{ position: number; question: string }>
    }>
    const whitelistForm = config.find((form) => form.id === "whitelist-review-form")

    assert.ok(whitelistForm)
    assert.deepEqual(whitelistForm.autoSendOptionIds, ["whitelist-application-ticket-81642e12"])
    assert.deepEqual(whitelistForm.questions.map((question) => [question.position, question.question]), [
        [1, "Discord username and in-game name?"],
        [2, "Alderon ID(s)? Use commas if more than one."],
        [3, "Why do you want to join this community?"],
        [4, "What character or role do you plan to play?"],
        [5, "How familiar are you with the server rules and setting?"],
        [6, "Have you read the whitelist requirements and are you ready for staff review?"]
    ])
})

test("completed ticket form store persists and looks up snapshots by ticket channel id and form id", () => {
    const store = new OTFormsCompletedTicketFormStore()
    const snapshot = {
        ticketChannelId: "123456789012345678",
        ticketChannelName: "ticket-whitelist-app",
        ticketOptionId: "whitelist-application-ticket-81642e12",
        applicantDiscordUserId: "111111111111111111",
        formId: "whitelist-review-form",
        completedAt: "2026-03-29T00:00:00.000Z",
        answers: [
            { position: 3, question: "Why do you want to join this community?", answer: "I want to RP." },
            { position: 2, question: "Alderon ID(s)? Use commas if more than one.", answer: "alderon-1, alderon-2" }
        ]
    }

    store.upsert(snapshot)

    assert.equal(createCompletedTicketFormKey(snapshot.ticketChannelId, snapshot.formId), "123456789012345678:whitelist-review-form")
    assert.deepEqual(store.getCompletedTicketForm("123456789012345678", "whitelist-review-form"), {
        ...snapshot,
        answers: [
            { position: 2, question: "Alderon ID(s)? Use commas if more than one.", answer: "alderon-1, alderon-2" },
            { position: 3, question: "Why do you want to join this community?", answer: "I want to RP." }
        ]
    })
    assert.equal(store.getCompletedTicketForm("123456789012345678", "missing-form"), null)
})

test("ticket forms service id stays aligned with the bridge contract", () => {
    assert.equal(OT_FORMS_PLUGIN_SERVICE_ID, "ot-ticket-forms:service")
})

test("original applicant resolution prefers the earliest previous creator before the live owner", () => {
    assert.equal(
        resolveOriginalApplicantDiscordUserId("333333333333333333", ["111111111111111111", "222222222222222222"]),
        "111111111111111111"
    )
    assert.equal(
        resolveOriginalApplicantDiscordUserId("333333333333333333", []),
        "333333333333333333"
    )
})
