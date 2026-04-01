import test from "node:test"
import assert from "node:assert/strict"

import {
    deliverLiveContinuePrompt,
    deliverLiveQuestionPrompt,
    deliverPassiveAnsweredConfirmation,
    deliverStatusReply,
    type OTFormsSessionResponderInstance
} from "../service/session-message-runtime.js"

function buildMessage(content: string) {
    return {
        id: { value: content },
        ephemeral: true,
        message: { content }
    } as any
}

function createResponderStub() {
    const operations: { type: string, content: string }[] = []
    let followUpCount = 0
    let failingFollowUps = 0
    const interaction = {
        replied: false,
        deferred: false,
        async followUp(options: { content?: string }) {
            if (failingFollowUps > 0) {
                failingFollowUps--;
                throw new Error("follow-up failed")
            }
            followUpCount++;
            operations.push({ type: "followUp", content: options.content ?? "" })
            interaction.replied = true
            return { id: `follow-up-${followUpCount}` } as any
        }
    }

    const instance: OTFormsSessionResponderInstance = {
        didReply: false,
        interaction,
        async reply(message) {
            operations.push({ type: "reply", content: message.message.content ?? "" })
            interaction.replied = true
            this.didReply = true
            return { success: true, message: null }
        },
        async update(message) {
            operations.push({ type: "update", content: message.message.content ?? "" })
            interaction.replied = true
            this.didReply = true
            return { success: true, message: null }
        }
    }

    return {
        instance,
        operations,
        failNextFollowUp() {
            failingFollowUps++;
        }
    }
}

test("component prompts retire in place and continue via follow-up without a stored message reference", async () => {
    const { instance, operations } = createResponderStub()

    await deliverPassiveAnsweredConfirmation({
        transportKind: "button",
        instance,
        message: buildMessage("Section 1/4 answered!")
    })

    const continueResult = await deliverLiveContinuePrompt({
        transportKind: "button",
        instance,
        message: buildMessage("Continue Application"),
        deliveryMode: "follow_up"
    })

    assert.equal(continueResult.success, true)
    assert.deepEqual(operations, [
        { type: "update", content: "Section 1/4 answered!" },
        { type: "followUp", content: "Continue Application" }
    ])
})

test("modal responses send the passive confirmation first and then the continue prompt", async () => {
    const { instance, operations } = createResponderStub()

    await deliverPassiveAnsweredConfirmation({
        transportKind: "modal",
        instance,
        message: buildMessage("Progress saved.")
    })

    await deliverLiveContinuePrompt({
        transportKind: "modal",
        instance,
        message: buildMessage("Continue Application"),
        deliveryMode: "follow_up"
    })

    assert.deepEqual(operations, [
        { type: "update", content: "Progress saved." },
        { type: "followUp", content: "Continue Application" }
    ])
})

test("live component questions can replace an already-clicked continue prompt in place", async () => {
    const { instance, operations } = createResponderStub()

    await deliverLiveQuestionPrompt({
        transportKind: "button",
        instance,
        message: buildMessage("Question 7"),
        deliveryMode: "replace_active_prompt"
    })

    assert.deepEqual(operations, [
        { type: "update", content: "Question 7" }
    ])
})

test("auto-advance failures can fall back to a recovery continue prompt on the same saved interaction", async () => {
    const { instance, operations, failNextFollowUp } = createResponderStub()
    failNextFollowUp()

    const questionResult = await deliverLiveQuestionPrompt({
        transportKind: "button",
        instance,
        message: buildMessage("Question 8"),
        deliveryMode: "follow_up"
    })
    const recoveryResult = await deliverLiveContinuePrompt({
        transportKind: "button",
        instance,
        message: buildMessage("Continue Application"),
        deliveryMode: "follow_up"
    })

    assert.equal(questionResult.success, false)
    assert.equal(recoveryResult.success, true)
    assert.deepEqual(operations, [
        { type: "followUp", content: "Continue Application" }
    ])
})

test("fresh component questions can still start from a brand-new reply surface", async () => {
    const { instance, operations } = createResponderStub()

    await deliverLiveQuestionPrompt({
        transportKind: "button",
        instance,
        message: buildMessage("Question 1"),
        deliveryMode: "initial_reply"
    })

    assert.deepEqual(operations, [
        { type: "reply", content: "Question 1" }
    ])
})

test("neutral stale acknowledgements use a non-destructive reply surface", async () => {
    const { instance, operations } = createResponderStub()

    await deliverStatusReply({
        transportKind: "button",
        instance,
        message: buildMessage("Use Continue Application or the ticket card to resume.")
    })

    assert.deepEqual(operations, [
        { type: "reply", content: "Use Continue Application or the ticket card to resume." }
    ])
})
