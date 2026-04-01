import type { SelectMenuComponentOptionData } from "discord.js"

import type {
    OTFormsCapturedAnswer,
    OTForms_DropdownChoice,
    OTForms_ModalQuestion,
    OTForms_Question
} from "../types/configDefaults"

export function findSavedAnswer(
    answers: readonly OTFormsCapturedAnswer[],
    question: OTForms_Question
): string | null {
    const savedAnswer = answers.find((entry) => entry.question.position == question.position)?.answer ?? null
    if (typeof savedAnswer != "string") return null
    const normalized = savedAnswer.trim()
    return normalized.length > 0 ? normalized : null
}

export function hydrateModalQuestionsWithSavedAnswers(
    questions: readonly OTForms_ModalQuestion[],
    answers: readonly OTFormsCapturedAnswer[]
): OTForms_ModalQuestion[] {
    return questions.map((question) => ({
        ...question,
        value: findSavedAnswer(answers, question) ?? undefined
    }))
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
