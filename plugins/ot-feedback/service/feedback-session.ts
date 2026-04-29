import { randomUUID } from "crypto"

export type OTFeedbackTriggerMode = "close" | "delete" | "first-close-only"
export type OTFeedbackSessionStatus = "delivery_failed" | "completed" | "ignored"

export interface OTFeedbackSession {
    sessionId: string
    ticketId: string
    triggerMode: OTFeedbackTriggerMode
    triggeredAt: number
    completedAt: number | null
    status: OTFeedbackSessionStatus
    respondentUserId: string | null
    closeCountAtTrigger: number
}

export interface OTFeedbackAfterFeedbackPayload<Response> {
    session: OTFeedbackSession
    responses: Response[]
}

export interface CreateFeedbackSessionInput {
    ticketId: string
    triggerMode: OTFeedbackTriggerMode
    closeCountAtTrigger: number
    now?: () => number
    randomId?: () => string
}

type FeedbackResponseLike = {
    answer?: unknown
}

export function createFeedbackSession(input: CreateFeedbackSessionInput): OTFeedbackSession {
    const now = input.now ?? Date.now
    const randomId = input.randomId ?? randomUUID
    return {
        sessionId: randomId(),
        ticketId: input.ticketId,
        triggerMode: input.triggerMode,
        triggeredAt: now(),
        completedAt: null,
        status: "delivery_failed",
        respondentUserId: null,
        closeCountAtTrigger: input.closeCountAtTrigger
    }
}

export function completeFeedbackSession<Response extends FeedbackResponseLike>(
    session: OTFeedbackSession,
    responses: readonly Response[],
    respondentUserId: string,
    completedAt = Date.now()
): OTFeedbackSession {
    return {
        ...session,
        completedAt,
        status: feedbackResponsesContainAnswer(responses) ? "completed" : "ignored",
        respondentUserId
    }
}

export function createDeliveryFailedFeedbackSession(session: OTFeedbackSession): OTFeedbackSession {
    return {
        ...session,
        completedAt: null,
        status: "delivery_failed",
        respondentUserId: null
    }
}

export function feedbackResponsesContainAnswer(responses: readonly FeedbackResponseLike[]) {
    return responses.some((response) => response.answer !== null && response.answer !== undefined)
}
