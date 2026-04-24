import type { SelectMenuComponentOptionData } from "discord.js"

import type {
    OTFormsAnswerData,
    OTFormsCapturedAnswer,
    OTForms_DropdownChoice,
    OTForms_ModalQuestion,
    OTForms_Question
} from "../types/configDefaults"
import { cloneOTFormsQuestion } from "./answer-runtime"

export function findSavedAnswer(
    answers: readonly OTFormsCapturedAnswer[],
    question: OTForms_Question
): string | null {
    const savedAnswer = answers.find((entry) => entry.question.position == question.position)?.answer ?? null
    if (typeof savedAnswer != "string") return null
    const normalized = savedAnswer.trim()
    return normalized.length > 0 ? normalized : null
}

export function findSavedAnswerData(
    answers: readonly OTFormsCapturedAnswer[],
    question: OTForms_Question
): OTFormsAnswerData | null {
    return answers.find((entry) => entry.question.position == question.position)?.answerData ?? null
}

function resolveSavedStringSelectValues(
    question: Extract<OTForms_ModalQuestion, { type: "string_select" }>,
    answerData: OTFormsAnswerData | null,
    savedAnswer: string | null
): Set<string> {
    const selectedValues = new Set<string>()
    const selectedLabels = new Set<string>()
    if (answerData?.kind == "string_select") {
        for (const entry of answerData.selected) {
            selectedValues.add(entry.value)
            selectedLabels.add(entry.label.trim().toLowerCase())
        }
    } else {
        for (const value of resolveSavedSelectionValues(savedAnswer)) {
            selectedLabels.add(value.toLowerCase())
        }
    }

    return new Set(question.choices
        .filter((choice) => selectedValues.has(choice.value) || selectedLabels.has(choice.label.trim().toLowerCase()))
        .map((choice) => choice.value))
}

function resolveSavedEntityIds(
    answerData: OTFormsAnswerData | null,
    expectedKind: "user_select" | "role_select" | "channel_select" | "mentionable_select",
    entityKind?: "user" | "role" | "channel"
): string[] {
    if (answerData?.kind != expectedKind) return []
    return answerData.selected
        .filter((entry) => !entityKind || entry.entityKind == entityKind)
        .map((entry) => entry.id)
}

export function hydrateModalQuestionsWithSavedAnswers(
    questions: readonly OTForms_ModalQuestion[],
    answers: readonly OTFormsCapturedAnswer[]
): OTForms_ModalQuestion[] {
    return questions.map((question) => {
        const savedAnswer = findSavedAnswer(answers, question)
        const answerData = findSavedAnswerData(answers, question)

        switch (question.type) {
            case "short":
            case "paragraph":
                return {
                    ...question,
                    value: savedAnswer ?? undefined
                }
            case "string_select": {
                const savedValues = resolveSavedStringSelectValues(question, answerData, savedAnswer)
                return {
                    ...question,
                    choices: question.choices.map((choice) => ({
                        ...choice,
                        default: savedValues.has(choice.value)
                    }))
                }
            }
            case "user_select":
                return {
                    ...question,
                    defaultUsers: resolveSavedEntityIds(answerData, "user_select", "user")
                }
            case "role_select":
                return {
                    ...question,
                    defaultRoles: resolveSavedEntityIds(answerData, "role_select", "role")
                }
            case "channel_select":
                return {
                    ...question,
                    channelTypes: question.channelTypes ? [...question.channelTypes] : undefined,
                    defaultChannels: resolveSavedEntityIds(answerData, "channel_select", "channel")
                }
            case "mentionable_select":
                return {
                    ...question,
                    defaultUsers: resolveSavedEntityIds(answerData, "mentionable_select", "user"),
                    defaultRoles: resolveSavedEntityIds(answerData, "mentionable_select", "role")
                }
            case "file_upload":
                return {
                    ...question,
                    currentFileNames: answerData?.kind == "file_upload"
                        ? answerData.files.map((file) => file.name)
                        : resolveSavedSelectionValues(savedAnswer)
                }
            default:
                return cloneOTFormsQuestion(question) as OTForms_ModalQuestion
        }
    })
}

export function resolveSavedSelectionValues(savedAnswer: string | null): string[] {
    if (!savedAnswer) return []
    return savedAnswer
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
}

export function buildDropdownChoicesWithSavedSelections(
    choices: readonly OTForms_DropdownChoice[],
    savedAnswer: string | null
): SelectMenuComponentOptionData[] {
    const savedSelections = new Set(
        resolveSavedSelectionValues(savedAnswer).map((value) => value.toLowerCase())
    )
    return choices.map((choice) => ({
        label: choice.name,
        value: choice.name,
        emoji: choice.emoji ? choice.emoji : undefined,
        description: choice.description ? choice.description : undefined,
        default: savedSelections.has(choice.name.trim().toLowerCase())
    }))
}
