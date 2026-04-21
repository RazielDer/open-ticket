import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

import {
    OTFormsCompletedTicketFormStore,
    OTFormsTicketDraftStore,
    OT_FORMS_PLUGIN_SERVICE_ID,
    createCompletedTicketFormKey,
    createTicketDraftKey,
    resolveOriginalApplicantDiscordUserId
} from "../service/forms-model.js"

test("whitelist review form config matches the locked twenty-question bridge contract", () => {
    const configPath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "config.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Array<{
        id: string
        answerTarget: string
        responseChannel: string
        autoSendOptionIds: string[]
        questions: Array<{ position: number; question: string }>
    }>
    const whitelistForm = config.find((form) => form.id === "whitelist-review-form")

    assert.ok(whitelistForm)
    assert.equal(whitelistForm?.answerTarget, "ticket_managed_record")
    assert.equal(whitelistForm?.responseChannel, "")
    assert.deepEqual(whitelistForm.autoSendOptionIds, ["whitelist-application-ticket-81642e12"])
    assert.deepEqual(whitelistForm.questions.map((question) => [question.position, question.question]), [
        [1, "Discord username?"],
        [2, "Alderon ID(s)?"],
        [3, "Alderon in-game name(s)?"],
        [4, "Realism server experience?"],
        [5, "Do you understand your name in this server must match your Alderon name and ID and that you may not change it unless your Alderon name changes?"],
        [6, "Do you understand you must submit a separate application to play Apex Carnivores?"],
        [7, "Do you understand we use an illness system, that some illnesses are mandatory to act out and roll for, and that your dinosaur may die to illness?"],
        [8, "Do you understand you must roll for high or low T dimorphism, mutations, and other required character traits for your dinosaur?"],
        [9, "Do you understand you must be nested before you roll for mutations?"],
        [10, "Why join EoTFS?"],
        [11, "What is realism RP to you?"],
        [12, "Gameplay focus?"],
        [13, "Favorite dino here?"],
        [14, "How do you handle losses?"],
        [15, "Metagaming example?"],
        [16, "Combat logging?"],
        [17, "Have you read the profiles and server rules, do you accept that staff will enforce them, and do you understand that gameplay may be recorded?"],
        [18, "Do you understand rule updates may occur and that it is your responsibility to stay current?"],
        [19, "Rules password?"],
        [20, "Why are you a good fit?"]
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
            { position: 3, question: "Alderon in-game name(s)?", answer: "Raziel, AltRaziel" },
            { position: 2, question: "Alderon ID(s)?", answer: "alderon-1, alderon-2" }
        ]
    }

    store.upsert(snapshot)

    assert.equal(createCompletedTicketFormKey(snapshot.ticketChannelId, snapshot.formId), "123456789012345678:whitelist-review-form")
    assert.deepEqual(store.getCompletedTicketForm("123456789012345678", "whitelist-review-form"), {
        ...snapshot,
        answers: [
            { position: 2, question: "Alderon ID(s)?", answer: "alderon-1, alderon-2" },
            { position: 3, question: "Alderon in-game name(s)?", answer: "Raziel, AltRaziel" }
        ]
    })
    assert.equal(store.getCompletedTicketForm("123456789012345678", "missing-form"), null)
})

test("ticket draft store persists managed-record snapshots by ticket, form, and applicant", () => {
    const store = new OTFormsTicketDraftStore()
    store.upsert({
        ticketChannelId: "123456789012345678",
        ticketChannelName: "whitelist-raziel",
        ticketOptionId: "whitelist-application-ticket-81642e12",
        applicantDiscordUserId: "111111111111111111",
        formId: "whitelist-review-form",
        answerTarget: "ticket_managed_record",
        draftState: "partial",
        formColor: "#2f855a",
        updatedAt: "2026-03-29T00:00:00.000Z",
        completedAt: null,
        startFormMessageId: "111111111111111111",
        managedRecordMessageId: "222222222222222222",
        answers: [
            {
                question: {
                    position: 3,
                    question: "Alderon in-game name(s)?",
                    type: "short"
                },
                answer: "Raziel, AltRaziel"
            },
            {
                question: {
                    position: 2,
                    question: "Alderon ID(s)?",
                    type: "short"
                },
                answer: "alderon-1, alderon-2"
            }
        ]
    })

    assert.equal(
        createTicketDraftKey("123456789012345678", "whitelist-review-form", "111111111111111111"),
        "123456789012345678:whitelist-review-form:111111111111111111"
    )
    const draft = store.getTicketDraft(
        "123456789012345678",
        "whitelist-review-form",
        "111111111111111111"
    )
    assert.ok(draft)
    assert.equal(draft?.startFormMessageId, "111111111111111111")
    assert.equal(draft?.managedRecordMessageId, "222222222222222222")
    assert.equal(draft?.draftState, "partial")
    assert.deepEqual(
        draft?.answers.map((entry) => entry.question.position),
        [2, 3]
    )
})

test("ticket forms service id stays aligned with the bridge contract", () => {
    assert.equal(OT_FORMS_PLUGIN_SERVICE_ID, "ot-ticket-forms:service")
})

test("ticket forms source wires the start-form repair helper into restore and ticket creation", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "index.ts")
    const source = fs.readFileSync(sourcePath, "utf8")
    const helperUses = [...source.matchAll(/refreshTicketStartFormMessage\(/g)]

    assert.equal(helperUses.length >= 2, true)
})

test("forms service source refreshes the applicant ticket card from persisted draft state", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "service", "forms-service.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.equal(source.includes("async refreshTicketStartFormMessage("), true)
    assert.equal(source.includes("resolveStartFormRenderState("), true)
    assert.equal(source.includes("await ensureStartFormMessage("), true)
    assert.equal(source.includes("startFormMessageId"), true)
    assert.equal(source.includes("buildInitialTicketDraftSnapshot("), true)
    assert.equal(source.includes("placementRepairAfterMessageTimestamp"), true)
    assert.equal(source.includes("refreshStartFormMessage: false"), true)
    assert.equal(source.includes("await this.refreshTicketStartFormMessage(normalized.ticketChannelId, normalized.formId)"), true)
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
