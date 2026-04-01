import test from "node:test"
import assert from "node:assert/strict"
import * as discord from "discord.js"

import {
    OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL,
    OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL,
    OT_FORMS_START_FORM_BUTTON_LABEL,
    OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL,
    buildStartFormDescription,
    createStartFormButtonCustomId,
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
    assert.equal(OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL, "Application Locked")
    assert.equal(
        createStartFormButtonCustomId("123456789012345678"),
        "ot-ticket-forms:sb_123456789012345678"
    )
})

test("start-form runtime resolves the locked card states and embed copy from draft plus bridge editability", () => {
    assert.equal(resolveStartFormCardState(null, true), "fill_out")
    assert.equal(resolveStartFormCardState("initial", true), "fill_out")
    assert.equal(resolveStartFormCardState("partial", true), "continue")
    assert.equal(resolveStartFormCardState("completed", true), "update")
    assert.equal(resolveStartFormCardState("completed", false), "locked")

    const partial = resolveStartFormRenderState("Whitelist application", "partial", true)
    const completed = resolveStartFormRenderState("Whitelist application", "completed", true)
    const locked = resolveStartFormRenderState("Whitelist application", "completed", false)

    assert.equal(partial.buttonLabel, OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL)
    assert.equal(completed.buttonLabel, OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL)
    assert.equal(locked.buttonLabel, OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL)
    assert.equal(locked.buttonEnabled, false)
    assert.equal(buildStartFormDescription("Whitelist application", "fill_out").includes("Fill Out Application"), true)
    assert.equal(partial.description.includes("saved draft"), true)
    assert.equal(completed.description.includes("submitted"), true)
    assert.equal(locked.description.includes("locked"), true)
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

    assert.deepEqual(result, { messageId: "message-1", created: false, updated: true })
    assert.equal(sendCount, 0)
    assert.equal(editCount, 1)
})

test("ensureStartFormMessage creates the applicant start-form message when the ticket is missing it", async () => {
    let sendCount = 0
    const channel = {
        messages: {
            fetch: async () => new Map()
        },
        send: async () => {
            sendCount += 1
            return { id: "created-message" }
        }
    } as unknown as discord.GuildTextBasedChannel

    const result = await ensureStartFormMessage(channel, { content: "applicant form" }, "123456789012345678")

    assert.deepEqual(result, { messageId: "created-message", created: true, updated: false })
    assert.equal(sendCount, 1)
})
