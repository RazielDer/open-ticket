import type { OTFormsCapturedAnswer, OTFormsDraftState, OTForms_Question } from "../types/configDefaults"
import {
    cloneOTFormsCapturedAnswer
} from "./answer-runtime"

export type OTFormsPostSaveAction = "auto_advance_question" | "continue_prompt" | "finalize"

export function mergeDraftAnswers(
    existing: readonly OTFormsCapturedAnswer[],
    incoming: readonly OTFormsCapturedAnswer[]
): OTFormsCapturedAnswer[] {
    const merged = new Map<number, OTFormsCapturedAnswer>()

    for (const entry of existing) {
        merged.set(entry.question.position, cloneOTFormsCapturedAnswer(entry))
    }

    for (const entry of incoming) {
        merged.set(entry.question.position, cloneOTFormsCapturedAnswer(entry))
    }

    return [...merged.values()].sort((left, right) => left.question.position - right.question.position)
}

export function resolveDraftResumeQuestionIndex(
    questions: readonly OTForms_Question[],
    draftState: OTFormsDraftState,
    answers: readonly OTFormsCapturedAnswer[]
): number {
    if (draftState == "completed") return 0

    const answeredPositions = new Set(
        answers
            .filter((entry) => typeof entry.answer == "string" && entry.answer.trim().length > 0)
            .map((entry) => entry.question.position)
    )
    for (let index = 0; index < questions.length; index++) {
        if (!answeredPositions.has(questions[index].position)) {
            return index
        }
    }
    return 0
}

export function resolveDraftStateFromAnswers(
    questions: readonly OTForms_Question[],
    answers: readonly OTFormsCapturedAnswer[]
): OTFormsDraftState {
    if (answers.length < 1) return "initial"

    const answeredPositions = new Set(
        answers
            .filter((entry) => typeof entry.answer == "string" && entry.answer.trim().length > 0)
            .map((entry) => entry.question.position)
    )
    const hasAnsweredAllQuestions = questions.every((question) => answeredPositions.has(question.position))
    return hasAnsweredAllQuestions ? "completed" : "partial"
}

export function resolveNextSessionAction(
    questions: readonly OTForms_Question[],
    currentQuestionIndex: number
): OTFormsPostSaveAction {
    if (currentQuestionIndex >= questions.length) return "finalize"
    const nextQuestion = questions[currentQuestionIndex]
    if (nextQuestion.type == "button" || nextQuestion.type == "dropdown") {
        return "auto_advance_question"
    }
    return "continue_prompt"
}

export async function applyDraftResponses(options: {
    currentQuestionIndex: number
    existingAnswers: readonly OTFormsCapturedAnswer[]
    incomingAnswers: readonly OTFormsCapturedAnswer[]
    updateDraft: (answers: OTFormsCapturedAnswer[]) => Promise<void>
    continueSession: () => Promise<boolean>
}): Promise<{
    currentQuestionIndex: number
    answers: OTFormsCapturedAnswer[]
    draftPersisted: true
    uiDeliverySucceeded: boolean
}> {
    const answers = mergeDraftAnswers(options.existingAnswers, options.incomingAnswers)
    const currentQuestionIndex = options.currentQuestionIndex + options.incomingAnswers.length

    await options.updateDraft(answers)
    const uiDeliverySucceeded = await options.continueSession()

    return {
        currentQuestionIndex,
        answers,
        draftPersisted: true,
        uiDeliverySucceeded
    }
}

export class OTFormsInteractionGate {
    private readonly active = new Set<string>()
    private readonly completed: string[] = []
    private readonly completedSet = new Set<string>()

    constructor(private readonly maxCompletedEntries: number = 32) {}

    begin(interactionId: string): boolean {
        if (this.active.size > 0 || this.completedSet.has(interactionId)) {
            return false
        }
        this.active.add(interactionId)
        return true
    }

    finish(interactionId: string): void {
        if (!this.active.delete(interactionId) || this.completedSet.has(interactionId)) {
            return
        }
        this.completed.push(interactionId)
        this.completedSet.add(interactionId)

        while (this.completed.length > this.maxCompletedEntries) {
            const removed = this.completed.shift()
            if (removed) this.completedSet.delete(removed)
        }
    }
}

export class OTFormsActiveSessionRegistry {
    private readonly sessionIdsByUserId = new Map<string, string>()

    get(userId: string): string | null {
        return this.sessionIdsByUserId.get(userId) ?? null
    }

    set(userId: string, sessionId: string): void {
        this.sessionIdsByUserId.set(userId, sessionId)
    }

    clear(userId: string): void {
        this.sessionIdsByUserId.delete(userId)
    }
}
