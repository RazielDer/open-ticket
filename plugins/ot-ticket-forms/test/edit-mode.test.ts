import test from "node:test"
import assert from "node:assert/strict"

import {
    buildDropdownChoicesWithSavedSelections,
    findSavedAnswer,
    hydrateModalQuestionsWithSavedAnswers,
    resolveSavedSelectionValues
} from "../service/edit-mode-runtime.js"

test("modal edit mode hydrates saved answers into text questions without mutating unanswered fields", () => {
    const questions = [
        {
            position: 1,
            question: "Discord username?",
            type: "short" as const,
            optional: false,
            placeholder: "Discord username",
            maxLength: 80
        },
        {
            position: 2,
            question: "Why join EoTFS?",
            type: "paragraph" as const,
            optional: false,
            placeholder: "Application answer",
            maxLength: 1024
        }
    ]

    const hydrated = hydrateModalQuestionsWithSavedAnswers(questions, [
        {
            question: {
                position: 1,
                question: "Discord username?",
                type: "short"
            },
            answer: "RazielDer"
        }
    ])

    assert.equal(hydrated[0].value, "RazielDer")
    assert.equal(hydrated[1].value, undefined)
    assert.equal("value" in questions[0], false)
})

test("dropdown edit mode marks the saved selections as defaults", () => {
    const options = buildDropdownChoicesWithSavedSelections([
        {
            name: "Herbivore",
            emoji: "🌿",
            description: "Plant eater"
        },
        {
            name: "Carnivore",
            emoji: "🦴",
            description: "Meat eater"
        },
        {
            name: "Scavenger",
            emoji: "🪶",
            description: "Mixed feeder"
        }
    ], "Carnivore, scavenger")

    assert.deepEqual(
        options.map((option) => [option.value, option.default === true]),
        [
            ["Herbivore", false],
            ["Carnivore", true],
            ["Scavenger", true]
        ]
    )
})

test("saved answer helpers preserve trimmed values and split multi-select answers", () => {
    const question = {
        position: 12,
        question: "Gameplay focus?",
        type: "dropdown" as const
    }

    assert.equal(
        findSavedAnswer([
            {
                question,
                answer: "  Hardcore realism RP  "
            }
        ], question),
        "Hardcore realism RP"
    )
    assert.equal(findSavedAnswer([{ question, answer: null }], question), null)
    assert.deepEqual(resolveSavedSelectionValues(" Carnivore,  Scavenger , "), ["Carnivore", "Scavenger"])
})
