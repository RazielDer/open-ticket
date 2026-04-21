import test from "node:test"
import assert from "node:assert/strict"
import * as discord from "discord.js"

import {
    OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL,
    OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL,
    OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER,
    OT_FORMS_START_FORM_BUTTON_LABEL,
    OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_LABEL,
    OT_FORMS_SUBMITTED_FOR_STAFF_REVIEW_BUTTON_LABEL,
    OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL,
    buildInactiveStepRecoveryMessage,
    buildStartFormEditAnswerOptions,
    buildStartFormDescription,
    createSubmitForReviewButtonCustomId,
    createStartFormButtonCustomId,
    createEditAnswerDropdownCustomId,
    ensureStartFormMessage,
    findStartFormMessageId,
    messageHasStartFormButton,
    resolveStartFormCardState,
    resolveStartFormRenderState
} from "../service/start-form-runtime.js"

test("start-form runtime keeps the locked applicant button label and custom id shape", () => {
    assert.equal(OT_FORMS_START_FORM_BUTTON_LABEL, "Fill Out Application")
    assert.equal(OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL, "Continue Application")
    assert.equal(OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL, "Update Application")
    assert.equal(OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_LABEL, "Submit for Review")
    assert.equal(OT_FORMS_SUBMITTED_FOR_STAFF_REVIEW_BUTTON_LABEL, "Submitted for Staff Review")
    assert.equal(OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL, "Application Locked")
    assert.equal(OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER, "Edit a saved answer")
    assert.equal(
        createStartFormButtonCustomId("123456789012345678"),
        "ot-ticket-forms:sb_123456789012345678"
    )
    assert.equal(
        createSubmitForReviewButtonCustomId("123456789012345678"),
        "ot-ticket-forms:srb_123456789012345678"
    )
    assert.equal(
        createEditAnswerDropdownCustomId("123456789012345678"),
        "ot-ticket-forms:ed_123456789012345678"
    )
})

test("start-form runtime resolves the locked card states, edit selector visibility, and recovery copy", () => {
    assert.equal(resolveStartFormCardState(null, "unsubmitted"), "fill_out")
    assert.equal(resolveStartFormCardState("initial", "unsubmitted"), "fill_out")
    assert.equal(resolveStartFormCardState("partial", "unsubmitted"), "continue")
    assert.equal(resolveStartFormCardState("completed", "unsubmitted"), "update")
    assert.equal(resolveStartFormCardState("completed", "submitted"), "submitted")
    assert.equal(resolveStartFormCardState("completed", "retry_reopened"), "update")
    assert.equal(resolveStartFormCardState("completed", "locked"), "locked")

    const editOptions = buildStartFormEditAnswerOptions([
        {
            position: 8,
            question: "Do you understand you must roll for high or low T dimorphism and required traits?",
            type: "button" as const
        }
    ], [
        {
            question: {
                position: 8,
                question: "Do you understand you must roll for high or low T dimorphism and required traits?",
                type: "button"
            },
            answer: "Yes"
        }
    ])

    const partial = resolveStartFormRenderState("Whitelist application", "partial", "unsubmitted", editOptions)
    const completed = resolveStartFormRenderState("Whitelist application", "completed", "unsubmitted", editOptions)
    const submitted = resolveStartFormRenderState("Whitelist application", "completed", "submitted", editOptions)
    const retryReopened = resolveStartFormRenderState("Whitelist application", "completed", "retry_reopened", editOptions)
    const locked = resolveStartFormRenderState("Whitelist application", "completed", "locked", editOptions)

    assert.equal(partial.buttonLabel, OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL)
    assert.equal(completed.buttonLabel, OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL)
    assert.equal(submitted.buttonLabel, OT_FORMS_SUBMITTED_FOR_STAFF_REVIEW_BUTTON_LABEL)
    assert.equal(locked.buttonLabel, OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL)
    assert.equal(completed.submitForReviewVisible, true)
    assert.equal(completed.submitForReviewEnabled, true)
    assert.equal(submitted.submitForReviewVisible, false)
    assert.equal(retryReopened.submitForReviewVisible, true)
    assert.equal(locked.buttonEnabled, false)
    assert.equal(partial.editAnswerVisible, true)
    assert.equal(completed.editAnswerVisible, true)
    assert.equal(submitted.editAnswerVisible, false)
    assert.equal(locked.editAnswerVisible, false)
    assert.equal(buildStartFormDescription("Whitelist application", "fill_out", "unsubmitted").includes("Fill Out Application"), true)
    assert.equal(partial.description.includes("Edit a saved answer"), true)
    assert.equal(completed.description.includes("Submit for Review"), true)
    assert.equal(submitted.description.includes("waiting on staff review"), true)
    assert.equal(retryReopened.description.includes("Submit for Review again"), true)
    assert.equal(locked.description.includes("locked"), true)
    assert.equal(buildInactiveStepRecoveryMessage("continue", true, "unsubmitted").includes("Edit a saved answer"), true)
    assert.equal(buildInactiveStepRecoveryMessage("update", true, "retry_reopened").includes("Submit for Review"), true)
    assert.equal(buildInactiveStepRecoveryMessage("submitted", true, "submitted").includes("already submitted"), true)
    assert.equal(buildInactiveStepRecoveryMessage("fill_out", false, "unsubmitted").includes("Fill Out Application"), true)
})

test("start-form runtime builds answered-question edit options with trimmed previews", () => {
    const options = buildStartFormEditAnswerOptions([
        {
            position: 8,
            question: "Do you understand you must roll for high or low T dimorphism, mutations, and other required traits for your dinosaur?",
            type: "button" as const
        },
        {
            position: 19,
            question: "Rules password?",
            type: "short" as const
        },
        {
            position: 20,
            question: "Why are you a good fit?",
            type: "paragraph" as const
        }
    ], [
        {
            question: {
                position: 20,
                question: "Why are you a good fit?",
                type: "paragraph"
            },
            answer: "  I like long-form realism and consistent community expectations.  "
        },
        {
            question: {
                position: 8,
                question: "Do you understand you must roll for high or low T dimorphism, mutations, and other required traits for your dinosaur?",
                type: "button"
            },
            answer: "Yes"
        }
    ])

    assert.deepEqual(options.map((option) => option.value), ["8", "20"])
    assert.equal(options[0].label.startsWith("Q8:"), true)
    assert.equal(options[0].description, "Saved: Yes")
    assert.equal(options[1].description?.includes("consistent community expectations"), true)
})

test("start-form runtime detects existing applicant start-form messages", () => {
    const message = {
        id: "message-1",
        components: [
            {
                components: [
                    {
                        type: discord.ComponentType.Button,
                        customId: createStartFormButtonCustomId("123456789012345678")
                    }
                ]
            }
        ]
    }

    assert.equal(messageHasStartFormButton(message, "123456789012345678"), true)
    assert.equal(findStartFormMessageId([message], "123456789012345678"), "message-1")
})

test("ensureStartFormMessage reuses the existing applicant start-form message without sending a duplicate", async () => {
    let sendCount = 0
    let editCount = 0
    const existingMessage = {
        id: "message-1",
        editable: true,
        createdTimestamp: 101,
        components: [
            {
                components: [
                    {
                        type: discord.ComponentType.Button,
                        customId: createStartFormButtonCustomId("123456789012345678")
                    }
                ]
            }
        ],
        edit: async () => {
            editCount += 1
            return existingMessage
        }
    }
    const channel = {
        messages: {
            fetch: async (input?: string | { limit: number }) => {
                if (typeof input == "string") return existingMessage
                return new Map([["message-1", existingMessage]])
            }
        },
        send: async () => {
            sendCount += 1
            return { id: "created-message" }
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(channel, { content: "applicant form" }, "123456789012345678")

    assert.deepEqual(result, { messageId: "message-1", created: false, updated: true, createdTimestamp: 101 })
    assert.equal(sendCount, 0)
    assert.equal(editCount, 1)
})

test("ensureStartFormMessage prefers the stored applicant message id before scanning ticket history", async () => {
    let pagedFetchCount = 0
    let editCount = 0
    const existingMessage = {
        id: "message-1",
        editable: true,
        createdTimestamp: 202,
        components: [
            {
                components: [
                    {
                        type: discord.ComponentType.Button,
                        customId: createStartFormButtonCustomId("123456789012345678")
                    }
                ]
            }
        ],
        edit: async () => {
            editCount += 1
            return existingMessage
        }
    }
    const channel = {
        messages: {
            fetch: async (input?: string | { limit: number }) => {
                if (typeof input == "string") return existingMessage
                pagedFetchCount += 1
                return new Map()
            }
        },
        send: async () => {
            throw new Error("send should not be called when the stored applicant card still exists")
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(
        channel,
        { content: "applicant form" },
        "123456789012345678",
        "message-1"
    )

    assert.deepEqual(result, { messageId: "message-1", created: false, updated: true, createdTimestamp: 202 })
    assert.equal(editCount, 1)
    assert.equal(pagedFetchCount, 0)
})

test("ensureStartFormMessage pages through longer ticket history before sending a replacement card", async () => {
    let sendCount = 0
    let editCount = 0
    const pagedMessage = {
        id: "message-2",
        editable: true,
        createdTimestamp: 303,
        components: [
            {
                components: [
                    {
                        type: discord.ComponentType.Button,
                        customId: createStartFormButtonCustomId("123456789012345678")
                    }
                ]
            }
        ],
        edit: async () => {
            editCount += 1
            return pagedMessage
        }
    }
    const createCollection = (
        entries: Array<[string, unknown]>
    ): { size: number; values(): IterableIterator<unknown>; lastKey(): string | undefined } => {
        const inner = new Map(entries)
        return {
            size: inner.size,
            values: () => inner.values(),
            lastKey: () => [...inner.keys()].at(-1)
        }
    }
    const channel = {
        messages: {
            fetch: async (input?: string | { limit: number; before?: string }) => {
                if (typeof input == "string") return pagedMessage
                if (!input?.before) {
                    return createCollection(
                        Array.from({ length: 100 }, (_, index) => [
                            `message-${index + 100}`,
                            { id: `message-${index + 100}`, components: [] }
                        ])
                    )
                }
                return createCollection([
                    ["message-2", pagedMessage]
                ])
            }
        },
        send: async () => {
            sendCount += 1
            return { id: "created-message", createdTimestamp: 404 }
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(channel, { content: "applicant form" }, "123456789012345678")

    assert.deepEqual(result, { messageId: "message-2", created: false, updated: true, createdTimestamp: 303 })
    assert.equal(editCount, 1)
    assert.equal(sendCount, 0)
})

test("ensureStartFormMessage creates the applicant start-form message when the ticket is missing it", async () => {
    let sendCount = 0
    const channel = {
        messages: {
            fetch: async () => new Map()
        },
        send: async () => {
            sendCount += 1
            return { id: "created-message", createdTimestamp: 404 }
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(channel, { content: "applicant form" }, "123456789012345678")

    assert.deepEqual(result, { messageId: "created-message", created: true, updated: false, createdTimestamp: 404 })
    assert.equal(sendCount, 1)
})

test("ensureStartFormMessage recreates the applicant card when followups moved below it", async () => {
    let sendCount = 0
    let deleteCount = 0
    let editCount = 0
    let deleted = false
    const existingMessage = {
        id: "message-1",
        editable: true,
        createdTimestamp: 101,
        components: [
            {
                components: [
                    {
                        type: discord.ComponentType.Button,
                        customId: createStartFormButtonCustomId("123456789012345678")
                    }
                ]
            }
        ],
        delete: async () => {
            deleteCount += 1
            deleted = true
        },
        edit: async () => {
            editCount += 1
            return existingMessage
        }
    }
    const channel = {
        messages: {
            fetch: async (input?: string | { limit: number }) => {
                if (deleted) return typeof input == "string" ? null : new Map()
                if (typeof input == "string") return existingMessage
                return new Map([["message-1", existingMessage]])
            }
        },
        send: async () => {
            sendCount += 1
            return { id: "created-message", createdTimestamp: 404 }
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(
        channel,
        { content: "applicant form" },
        "123456789012345678",
        "message-1",
        { placementRepairAfterMessageTimestamp: 202 }
    )

    assert.deepEqual(result, { messageId: "created-message", created: true, updated: false, createdTimestamp: 404 })
    assert.equal(deleteCount, 1)
    assert.equal(editCount, 0)
    assert.equal(sendCount, 1)
})
