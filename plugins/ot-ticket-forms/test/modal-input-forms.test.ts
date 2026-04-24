import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import * as discord from "discord.js"

import {
    calculateOTFormsQuestionSections,
    captureOTFormsModalQuestionAnswer,
    cloneOTFormsCapturedAnswer,
    isOTFormsCompressedFileName,
    isOTFormsExecutableFileName
} from "../service/answer-runtime.js"
import { hydrateModalQuestionsWithSavedAnswers } from "../service/edit-mode-runtime.js"
import {
    mergeDraftAnswers,
    resolveDraftResumeQuestionIndex,
    resolveDraftStateFromAnswers
} from "../service/draft-runtime.js"

function createModalResponse(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        getTextField: (name: string) => overrides[`text:${name}`] as string | null ?? null,
        getStringSelectValues: (name: string) => overrides[`string:${name}`] as string[] | null ?? null,
        getSelectedUsers: (name: string) => overrides[`users:${name}`] as discord.Collection<string, any> | null ?? null,
        getSelectedRoles: (name: string) => overrides[`roles:${name}`] as discord.Collection<string, any> | null ?? null,
        getSelectedChannels: (name: string) => overrides[`channels:${name}`] as discord.Collection<string, any> | null ?? null,
        getSelectedMentionables: (name: string) => overrides[`mentionables:${name}`] as any ?? null,
        getUploadedFiles: (name: string) => overrides[`files:${name}`] as discord.Collection<string, any> | null ?? null
    }
}

test("modal-native form answer capture stores structured data and normalized display strings", () => {
    const stringAnswer = captureOTFormsModalQuestionAnswer({
        position: 1,
        question: "Preferred diet?",
        type: "string_select",
        optional: false,
        placeholder: "Choose diets",
        minAnswerChoices: 1,
        maxAnswerChoices: 2,
        choices: [
            { label: "Herbivore", value: "herb" },
            { label: "Carnivore", value: "carni" }
        ]
    }, createModalResponse({ "string:1": ["herb", "carni"] }))

    const userAnswer = captureOTFormsModalQuestionAnswer({
        position: 2,
        question: "Applicant user?",
        type: "user_select",
        optional: false,
        placeholder: "Choose user",
        minAnswerChoices: 1,
        maxAnswerChoices: 1
    }, createModalResponse({
        "users:2": new discord.Collection<string, any>([["111", { id: "111", username: "RazielDer" }]])
    }))

    const fileAnswer = captureOTFormsModalQuestionAnswer({
        position: 3,
        question: "Upload proof",
        type: "file_upload",
        optional: false,
        minFiles: 1,
        maxFiles: 2,
        allowExecutables: false,
        allowZipFiles: false
    }, createModalResponse({
        "files:3": new discord.Collection<string, any>([[
            "file-1",
            {
                id: "file-1",
                name: "proof.png",
                url: "https://cdn.discordapp.com/proof.png",
                contentType: "image/png",
                size: 1234
            }
        ]])
    }))

    assert.equal(stringAnswer.answer, "Herbivore, Carnivore")
    assert.deepEqual(stringAnswer.answerData, {
        kind: "string_select",
        selected: [
            { value: "herb", label: "Herbivore" },
            { value: "carni", label: "Carnivore" }
        ]
    })
    assert.equal(userAnswer.answer, "RazielDer")
    assert.deepEqual(userAnswer.answerData, {
        kind: "user_select",
        selected: [{ id: "111", label: "RazielDer", entityKind: "user" }]
    })
    assert.equal(fileAnswer.answer, "proof.png")
    assert.deepEqual(fileAnswer.answerData, {
        kind: "file_upload",
        files: [{
            attachmentId: "file-1",
            name: "proof.png",
            url: "https://cdn.discordapp.com/proof.png",
            contentType: "image/png",
            size: 1234
        }]
    })
})

test("modal edit hydration sets select defaults and shows current file names without prefilling uploads", () => {
    const hydrated = hydrateModalQuestionsWithSavedAnswers([
        {
            position: 1,
            question: "Preferred diet?",
            type: "string_select" as const,
            optional: false,
            placeholder: "Choose diets",
            minAnswerChoices: 1,
            maxAnswerChoices: 2,
            choices: [
                { label: "Herbivore", value: "herb" },
                { label: "Carnivore", value: "carni" }
            ]
        },
        {
            position: 2,
            question: "Applicant user?",
            type: "user_select" as const,
            optional: false,
            placeholder: "Choose user",
            minAnswerChoices: 1,
            maxAnswerChoices: 1
        },
        {
            position: 3,
            question: "Upload proof",
            type: "file_upload" as const,
            optional: true,
            minFiles: 0,
            maxFiles: 2,
            allowExecutables: false,
            allowZipFiles: false
        }
    ], [
        {
            question: { position: 1, question: "Preferred diet?", type: "string_select" },
            answer: "Carnivore",
            answerData: { kind: "string_select", selected: [{ value: "carni", label: "Carnivore" }] }
        },
        {
            question: { position: 2, question: "Applicant user?", type: "user_select" },
            answer: "RazielDer",
            answerData: { kind: "user_select", selected: [{ id: "111", label: "RazielDer", entityKind: "user" }] }
        },
        {
            question: { position: 3, question: "Upload proof", type: "file_upload" },
            answer: "proof.png",
            answerData: {
                kind: "file_upload",
                files: [{ attachmentId: "file-1", name: "proof.png", url: "https://cdn.discordapp.com/proof.png", contentType: "image/png", size: 1234 }]
            }
        }
    ])

    assert.deepEqual((hydrated[0] as any).choices.map((choice: any) => [choice.value, choice.default === true]), [
        ["herb", false],
        ["carni", true]
    ])
    assert.deepEqual((hydrated[1] as any).defaultUsers, ["111"])
    assert.deepEqual((hydrated[2] as any).currentFileNames, ["proof.png"])
    assert.equal("value" in hydrated[2], false)
})

test("modal-capable question families share form sections while legacy dropdown and button prompts stay isolated", () => {
    const sections = calculateOTFormsQuestionSections([
        { position: 1, question: "Discord username?", type: "short" },
        { position: 2, question: "Preferred diet?", type: "string_select" },
        { position: 3, question: "Applicant user?", type: "user_select" },
        { position: 4, question: "Upload proof", type: "file_upload" },
        { position: 5, question: "Legacy dropdown?", type: "dropdown" },
        { position: 6, question: "More context?", type: "paragraph" },
        { position: 7, question: "Legacy button?", type: "button" }
    ])

    assert.equal(sections.totalSections, 4)
    assert.deepEqual(sections.sectionNumbersByQuestionIndex, [1, 1, 1, 1, 2, 3, 4])
})

test("draft and clone helpers preserve answerData and treat empty optional modal submissions as incomplete", () => {
    const questions = [
        { position: 1, question: "Upload proof", type: "file_upload" as const },
        { position: 2, question: "Discord username?", type: "short" as const }
    ]
    const answers = mergeDraftAnswers([], [
        {
            question: questions[0],
            answer: null,
            answerData: { kind: "file_upload", files: [] }
        }
    ])
    const cloned = cloneOTFormsCapturedAnswer(answers[0])

    assert.deepEqual(cloned.answerData, { kind: "file_upload", files: [] })
    assert.notEqual(cloned, answers[0])
    assert.equal(resolveDraftStateFromAnswers(questions, answers), "partial")
    assert.equal(resolveDraftResumeQuestionIndex(questions, "partial", answers), 0)
})

test("file upload policy blocks executable and compressed files by default", () => {
    assert.equal(isOTFormsExecutableFileName("launcher.EXE"), true)
    assert.equal(isOTFormsCompressedFileName("evidence.zip"), true)

    assert.throws(() => captureOTFormsModalQuestionAnswer({
        position: 1,
        question: "Upload proof",
        type: "file_upload",
        optional: false,
        minFiles: 1,
        maxFiles: 1,
        allowExecutables: false,
        allowZipFiles: false
    }, createModalResponse({
        "files:1": new discord.Collection<string, any>([[
            "file-1",
            { id: "file-1", name: "payload.exe", url: "https://cdn.discordapp.com/payload.exe" }
        ]])
    })), /executable uploads are disabled/)
})

test("config checker explicitly declares supported and unsupported SLICE-007B question families", () => {
    const sourcePath = path.resolve(__dirname, "..", "..", "..", "..", "plugins", "ot-ticket-forms", "config", "checkerStructures.ts")
    const source = fs.readFileSync(sourcePath, "utf8")

    for (const questionType of ["string_select", "user_select", "role_select", "channel_select", "mentionable_select", "file_upload"]) {
        assert.equal(source.includes(`value:"${questionType}"`), true)
    }
    for (const questionType of ["radio_group", "checkbox_group", "checkbox"]) {
        assert.equal(source.includes(`unsupportedQuestionChecker("${questionType}")`), true)
    }
})
