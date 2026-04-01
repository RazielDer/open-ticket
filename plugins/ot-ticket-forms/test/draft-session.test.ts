import test from "node:test"
import assert from "node:assert/strict"

import {
    applyDraftResponses,
    OTFormsActiveSessionRegistry,
    OTFormsInteractionGate,
    resolveNextSessionAction,
    resolveDraftResumeQuestionIndex
} from "../service/draft-runtime.js"

test("draft response application awaits persistence before advancing the session", async () => {
    const events: string[] = []

    const result = await applyDraftResponses({
        currentQuestionIndex: 1,
        existingAnswers: [
            {
                question: {
                    position: 1,
                    question: "Discord username?",
                    type: "short"
                },
                answer: "RazielDer"
            }
        ],
        incomingAnswers: [
            {
                question: {
                    position: 2,
                    question: "Alderon ID(s)?",
                    type: "short"
                },
                answer: "alderon-1"
            }
        ],
        updateDraft: async (answers) => {
            void answers
            events.push("update")
        },
        continueSession: async () => {
            events.push("continue")
            return true
        }
    })

    assert.deepEqual(events, ["update", "continue"])
    assert.equal(result.currentQuestionIndex, 2)
    assert.deepEqual(result.answers.map((entry) => entry.question.position), [1, 2])
})

test("interaction gate suppresses duplicate modal-submit retries for the same session", () => {
    const gate = new OTFormsInteractionGate()

    assert.equal(gate.begin("interaction-1"), true)
    assert.equal(gate.begin("interaction-2"), false)
    gate.finish("interaction-1")
    assert.equal(gate.begin("interaction-1"), false)
    assert.equal(gate.begin("interaction-2"), true)
})

test("next session action auto-advances component prompts, pauses for modal boundaries, and finalizes at the end", () => {
    assert.equal(
        resolveNextSessionAction([
            {
                position: 1,
                question: "Pick a faction",
                type: "button"
            }
        ], 0),
        "auto_advance_question"
    )
    assert.equal(
        resolveNextSessionAction([
            {
                position: 2,
                question: "Discord username?",
                type: "short"
            }
        ], 0),
        "continue_prompt"
    )
    assert.equal(
        resolveNextSessionAction([
            {
                position: 3,
                question: "Why join EoTFS?",
                type: "paragraph"
            }
        ], 1),
        "finalize"
    )
})

test("saved-after-persist UI failures preserve merged answers and report recovery is required", async () => {
    const events: string[] = []

    const result = await applyDraftResponses({
        currentQuestionIndex: 0,
        existingAnswers: [],
        incomingAnswers: [
            {
                question: {
                    position: 1,
                    question: "Preferred diet?",
                    type: "dropdown"
                },
                answer: "Herbivore"
            }
        ],
        updateDraft: async () => {
            events.push("update")
        },
        continueSession: async () => {
            events.push("continue")
            return false
        }
    })

    assert.deepEqual(events, ["update", "continue"])
    assert.equal(result.draftPersisted, true)
    assert.equal(result.uiDeliverySucceeded, false)
    assert.equal(result.currentQuestionIndex, 1)
    assert.deepEqual(result.answers.map((entry) => entry.answer), ["Herbivore"])
})

test("unsaved failures do not attempt to continue the session", async () => {
    const events: string[] = []

    await assert.rejects(async () => applyDraftResponses({
        currentQuestionIndex: 2,
        existingAnswers: [],
        incomingAnswers: [
            {
                question: {
                    position: 3,
                    question: "Alderon ID(s)?",
                    type: "short"
                },
                answer: "alderon-7"
            }
        ],
        updateDraft: async () => {
            events.push("update")
            throw new Error("draft save failed")
        },
        continueSession: async () => {
            events.push("continue")
            return true
        }
    }))

    assert.deepEqual(events, ["update"])
})

test("active session registry keeps one session binding per applicant until cleared", () => {
    const registry = new OTFormsActiveSessionRegistry()

    assert.equal(registry.get("111111111111111111"), null)
    registry.set("111111111111111111", "s0")
    assert.equal(registry.get("111111111111111111"), "s0")

    registry.set("111111111111111111", "s1")
    assert.equal(registry.get("111111111111111111"), "s1")

    registry.clear("111111111111111111")
    assert.equal(registry.get("111111111111111111"), null)
})

test("draft resume picks the first unanswered whitelist question and completed drafts restart at the beginning", () => {
    const questions = [
        {
            position: 1,
            question: "Discord username?",
            type: "short" as const
        },
        {
            position: 2,
            question: "Alderon ID(s)?",
            type: "short" as const
        },
        {
            position: 3,
            question: "Why join EoTFS?",
            type: "paragraph" as const
        }
    ]

    assert.equal(
        resolveDraftResumeQuestionIndex(questions, "partial", [
            { question: questions[0], answer: "RazielDer" },
            { question: questions[2], answer: "Community" }
        ]),
        1
    )
    assert.equal(
        resolveDraftResumeQuestionIndex(questions, "completed", [
            { question: questions[0], answer: "RazielDer" }
        ]),
        0
    )
})
