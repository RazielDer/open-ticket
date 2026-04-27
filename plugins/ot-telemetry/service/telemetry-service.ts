import { randomUUID } from "crypto"

import { ODTICKET_PLATFORM_METADATA_IDS } from "../../../src/core/api/openticket/ticket-platform.js"

export const TICKET_TELEMETRY_LIFECYCLE_CATEGORY = "opendiscord:ticket-telemetry:lifecycle"
export const TICKET_TELEMETRY_FEEDBACK_CATEGORY = "opendiscord:ticket-telemetry:feedback"

export const TICKET_TELEMETRY_LIFECYCLE_EVENT_TYPES = [
    "created",
    "closed",
    "reopened",
    "claimed",
    "unclaimed",
    "moved",
    "transferred",
    "assigned",
    "unassigned",
    "escalated",
    "first_staff_response",
    "resolved",
    "close_request_requested",
    "close_request_canceled",
    "close_request_approved",
    "close_request_dismissed",
    "awaiting_user_set",
    "awaiting_user_reminded",
    "awaiting_user_cleared",
    "awaiting_user_timeout_closed",
    "deleted"
] as const

export type OTTelemetryLifecycleEventType = (typeof TICKET_TELEMETRY_LIFECYCLE_EVENT_TYPES)[number]
export type OTTelemetryFeedbackTriggerMode = "close" | "delete" | "first-close-only"
export type OTTelemetryFeedbackSessionStatus = "delivery_failed" | "completed" | "ignored"

export interface OTTelemetryTicketSnapshot {
    creatorUserId: string | null
    optionId: string | null
    transportMode: "channel_text" | "private_thread" | null
    assignedTeamId: string | null
    assignedStaffUserId: string | null
    assignmentStrategy: string | null
    integrationProfileId: string | null
    aiAssistProfileId: string | null
    closeRequestState: string | null
    awaitingUserState: string | null
    firstStaffResponseAt: number | null
    resolvedAt: number | null
    closed: boolean
}

export interface OTTelemetryLifecycleRecord {
    recordId: string
    ticketId: string
    eventType: OTTelemetryLifecycleEventType
    occurredAt: number
    actorUserId: string | null
    snapshot: OTTelemetryTicketSnapshot
    previousSnapshot: OTTelemetryTicketSnapshot | null
}

export interface OTTelemetryFeedbackQuestionSummary {
    position: number
    type: "text" | "rating" | "image" | "attachment" | "choice"
    label: string
    answered: boolean
    ratingValue: number | null
    choiceIndex: number | null
    choiceLabel: string | null
}

export interface OTTelemetryFeedbackSessionFacts {
    sessionId: string
    ticketId: string
    triggerMode: OTTelemetryFeedbackTriggerMode
    triggeredAt: number
    completedAt: number | null
    status: OTTelemetryFeedbackSessionStatus
    respondentUserId: string | null
    closeCountAtTrigger: number
}

export interface OTTelemetryFeedbackRecord extends OTTelemetryFeedbackSessionFacts {
    snapshot: OTTelemetryTicketSnapshot
    questionSummaries: OTTelemetryFeedbackQuestionSummary[]
}

export interface OTTelemetryFeedbackPayload<Response = unknown> {
    session: OTTelemetryFeedbackSessionFacts
    responses: Response[]
}

export interface OTTelemetryListFilters {
    ticketId?: string | null
    since?: number | null
    until?: number | null
    limit?: number | null
}

export type TelemetryDatabaseCategoryEntry = {
    key: string
    value: unknown
}

export interface TelemetryDatabase {
    set(category: string, key: string, value: any): boolean | Promise<boolean>
    getCategory(category: string): TelemetryDatabaseCategoryEntry[] | undefined | Promise<TelemetryDatabaseCategoryEntry[] | undefined>
}

export interface OTTelemetryServiceDependencies {
    database: TelemetryDatabase
    now?: () => number
    randomId?: () => string
}

export interface TelemetryTicketLike {
    id?: { value?: unknown } | string | null
    option?: { id?: { value?: unknown } | string | null } | null
    get?: (id: string) => { value?: unknown } | null
}

type FeedbackQuestionLike = {
    label?: unknown
    type?: unknown
    answer?: unknown
    choices?: unknown
}

const LIFECYCLE_EVENT_TYPE_SET = new Set<string>(TICKET_TELEMETRY_LIFECYCLE_EVENT_TYPES)

export class OTTelemetryService {
    private readonly database: TelemetryDatabase
    private readonly now: () => number
    private readonly randomId: () => string

    constructor(dependencies: OTTelemetryServiceDependencies) {
        this.database = dependencies.database
        this.now = dependencies.now ?? Date.now
        this.randomId = dependencies.randomId ?? randomUUID
    }

    async restore() {
        const lifecycle = await this.readCategory(TICKET_TELEMETRY_LIFECYCLE_CATEGORY)
        const feedback = await this.readCategory(TICKET_TELEMETRY_FEEDBACK_CATEGORY)
        return {
            lifecycleRecords: lifecycle.filter((entry) => isLifecycleRecord(entry.value)).length,
            feedbackRecords: feedback.filter((entry) => isFeedbackRecord(entry.value)).length
        }
    }

    createTicketSnapshot(ticket: TelemetryTicketLike | null | undefined): OTTelemetryTicketSnapshot {
        if (!ticket) return createEmptyTicketSnapshot()
        const metadata = ODTICKET_PLATFORM_METADATA_IDS
        return {
            creatorUserId: stringOrNull(ticketValue(ticket, "opendiscord:opened-by")),
            optionId: resolveTicketOptionId(ticket),
            transportMode: transportModeOrNull(ticketValue(ticket, metadata.transportMode)),
            assignedTeamId: stringOrNull(ticketValue(ticket, metadata.assignedTeamId)),
            assignedStaffUserId: stringOrNull(ticketValue(ticket, metadata.assignedStaffUserId)),
            assignmentStrategy: stringOrNull(ticketValue(ticket, metadata.assignmentStrategy)),
            integrationProfileId: stringOrNull(ticketValue(ticket, metadata.integrationProfileId)),
            aiAssistProfileId: stringOrNull(ticketValue(ticket, metadata.aiAssistProfileId)),
            closeRequestState: closeRequestStateOrNull(ticketValue(ticket, metadata.closeRequestState)),
            awaitingUserState: awaitingUserStateOrNull(ticketValue(ticket, metadata.awaitingUserState)),
            firstStaffResponseAt: numberOrNull(ticketValue(ticket, metadata.firstStaffResponseAt)),
            resolvedAt: numberOrNull(ticketValue(ticket, metadata.resolvedAt)),
            closed: Boolean(ticketValue(ticket, "opendiscord:closed"))
        }
    }

    async appendLifecycleEvent(input: {
        eventType: OTTelemetryLifecycleEventType
        ticket: TelemetryTicketLike
        actorUserId?: string | null
        occurredAt?: number
        previousSnapshot?: OTTelemetryTicketSnapshot | null
        snapshot?: OTTelemetryTicketSnapshot | null
    }): Promise<OTTelemetryLifecycleRecord> {
        if (!LIFECYCLE_EVENT_TYPE_SET.has(input.eventType)) {
            throw new Error(`Unsupported telemetry lifecycle event type: ${String(input.eventType)}`)
        }

        const ticketId = resolveTelemetryTicketId(input.ticket)
        if (!ticketId) throw new Error("Unable to append telemetry lifecycle event without a ticket id.")

        const record: OTTelemetryLifecycleRecord = {
            recordId: this.randomId(),
            ticketId,
            eventType: input.eventType,
            occurredAt: normalizeTimestamp(input.occurredAt, this.now()),
            actorUserId: stringOrNull(input.actorUserId),
            snapshot: input.snapshot ?? this.createTicketSnapshot(input.ticket),
            previousSnapshot: input.previousSnapshot ?? null
        }

        await this.database.set(TICKET_TELEMETRY_LIFECYCLE_CATEGORY, record.recordId, record)
        return record
    }

    async storeFeedbackSession<Response extends FeedbackQuestionLike>(
        payload: OTTelemetryFeedbackPayload<Response>,
        input: {
            ticket?: TelemetryTicketLike | null
            snapshot?: OTTelemetryTicketSnapshot | null
        } = {}
    ): Promise<OTTelemetryFeedbackRecord> {
        const session = payload.session
        if (!session?.sessionId) throw new Error("Unable to store telemetry feedback session without a session id.")

        const record: OTTelemetryFeedbackRecord = {
            sessionId: session.sessionId,
            ticketId: session.ticketId,
            triggerMode: session.triggerMode,
            triggeredAt: normalizeTimestamp(session.triggeredAt, this.now()),
            completedAt: session.completedAt === null ? null : normalizeTimestamp(session.completedAt, this.now()),
            status: session.status,
            respondentUserId: stringOrNull(session.respondentUserId),
            closeCountAtTrigger: normalizeNonNegativeInteger(session.closeCountAtTrigger),
            snapshot: input.snapshot ?? this.createTicketSnapshot(input.ticket),
            questionSummaries: projectFeedbackQuestionSummaries(payload.responses)
        }

        await this.database.set(TICKET_TELEMETRY_FEEDBACK_CATEGORY, record.sessionId, record)
        return record
    }

    async listLifecycleHistory(filters: OTTelemetryListFilters = {}): Promise<OTTelemetryLifecycleRecord[]> {
        return filterTelemetryRecords(
            (await this.readCategory(TICKET_TELEMETRY_LIFECYCLE_CATEGORY))
                .map((entry) => entry.value)
                .filter(isLifecycleRecord),
            filters,
            "occurredAt"
        )
    }

    async listFeedbackHistory(filters: OTTelemetryListFilters = {}): Promise<OTTelemetryFeedbackRecord[]> {
        return filterTelemetryRecords(
            (await this.readCategory(TICKET_TELEMETRY_FEEDBACK_CATEGORY))
                .map((entry) => entry.value)
                .filter(isFeedbackRecord),
            filters,
            "triggeredAt"
        )
    }

    private async readCategory(category: string) {
        return await this.database.getCategory(category) ?? []
    }
}

export function resolveTelemetryTicketId(ticket: TelemetryTicketLike | null | undefined): string | null {
    if (!ticket) return null
    return stringOrNull(typeof ticket.id == "string" ? ticket.id : ticket.id?.value)
}

export function createEmptyTicketSnapshot(): OTTelemetryTicketSnapshot {
    return {
        creatorUserId: null,
        optionId: null,
        transportMode: null,
        assignedTeamId: null,
        assignedStaffUserId: null,
        assignmentStrategy: null,
        integrationProfileId: null,
        aiAssistProfileId: null,
        closeRequestState: null,
        awaitingUserState: null,
        firstStaffResponseAt: null,
        resolvedAt: null,
        closed: false
    }
}

export function projectFeedbackQuestionSummaries<Response extends FeedbackQuestionLike>(
    responses: readonly Response[]
): OTTelemetryFeedbackQuestionSummary[] {
    return responses.map((response, index) => {
        const type = feedbackQuestionTypeOrText(response.type)
        const answer = response.answer
        const answered = answer !== null && answer !== undefined
        const choices = Array.isArray(response.choices) ? response.choices.map((choice) => String(choice)) : []
        const choiceLabel = type == "choice" && typeof answer == "string" ? answer : null
        const choiceIndex = choiceLabel == null ? null : choices.indexOf(choiceLabel)

        return {
            position: index + 1,
            type,
            label: typeof response.label == "string" ? response.label : "",
            answered,
            ratingValue: type == "rating" && typeof answer == "string" && Number.isFinite(Number(answer))
                ? Number(answer)
                : null,
            choiceIndex: choiceIndex == null || choiceIndex < 0 ? null : choiceIndex,
            choiceLabel
        }
    })
}

function filterTelemetryRecords<RecordType extends { ticketId: string }, TimeKey extends keyof RecordType>(
    records: RecordType[],
    filters: OTTelemetryListFilters,
    timeKey: TimeKey
): RecordType[] {
    const ticketId = stringOrNull(filters.ticketId)
    const since = numberOrNull(filters.since)
    const until = numberOrNull(filters.until)
    const limit = normalizeLimit(filters.limit)

    let result = records
        .filter((record) => !ticketId || record.ticketId == ticketId)
        .filter((record) => {
            const timestamp = typeof record[timeKey] == "number" ? record[timeKey] as number : null
            if (timestamp == null) return false
            if (since != null && timestamp < since) return false
            if (until != null && timestamp > until) return false
            return true
        })
        .sort((left, right) => {
            const leftTime = typeof left[timeKey] == "number" ? left[timeKey] as number : 0
            const rightTime = typeof right[timeKey] == "number" ? right[timeKey] as number : 0
            return leftTime - rightTime
        })

    if (limit != null) result = result.slice(0, limit)
    return result
}

function resolveTicketOptionId(ticket: TelemetryTicketLike): string | null {
    const raw = typeof ticket.option?.id == "string" ? ticket.option.id : ticket.option?.id?.value
    return stringOrNull(raw)
}

function ticketValue(ticket: TelemetryTicketLike, id: string) {
    try {
        return ticket.get?.(id)?.value
    } catch {
        return undefined
    }
}

function stringOrNull(value: unknown): string | null {
    if (typeof value != "string") return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function numberOrNull(value: unknown): number | null {
    if (typeof value == "number" && Number.isFinite(value)) return value
    return null
}

function normalizeTimestamp(value: unknown, fallback: number) {
    return numberOrNull(value) ?? fallback
}

function normalizeNonNegativeInteger(value: unknown) {
    if (typeof value == "number" && Number.isFinite(value) && value >= 0) return Math.floor(value)
    return 0
}

function normalizeLimit(value: unknown): number | null {
    if (typeof value != "number" || !Number.isFinite(value) || value < 1) return null
    return Math.floor(value)
}

function transportModeOrNull(value: unknown): OTTelemetryTicketSnapshot["transportMode"] {
    return value == "channel_text" || value == "private_thread" ? value as OTTelemetryTicketSnapshot["transportMode"] : null
}

function closeRequestStateOrNull(value: unknown): string | null {
    return value == "requested" ? "requested" : null
}

function awaitingUserStateOrNull(value: unknown): string | null {
    return value == "waiting" || value == "reminded" ? value as string : null
}

function feedbackQuestionTypeOrText(value: unknown): OTTelemetryFeedbackQuestionSummary["type"] {
    if (value == "text" || value == "rating" || value == "image" || value == "attachment" || value == "choice") return value as OTTelemetryFeedbackQuestionSummary["type"]
    return "text"
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value == "object" && !Array.isArray(value)
}

function isSnapshot(value: unknown): value is OTTelemetryTicketSnapshot {
    if (!isRecord(value)) return false
    return (
        ("creatorUserId" in value) &&
        ("optionId" in value) &&
        ("transportMode" in value) &&
        ("assignedTeamId" in value) &&
        ("assignedStaffUserId" in value) &&
        ("assignmentStrategy" in value) &&
        ("integrationProfileId" in value) &&
        ("aiAssistProfileId" in value) &&
        ("closeRequestState" in value) &&
        ("awaitingUserState" in value) &&
        ("firstStaffResponseAt" in value) &&
        ("resolvedAt" in value) &&
        typeof value.closed == "boolean"
    )
}

function isLifecycleRecord(value: unknown): value is OTTelemetryLifecycleRecord {
    if (!isRecord(value)) return false
    return (
        typeof value.recordId == "string" &&
        typeof value.ticketId == "string" &&
        typeof value.eventType == "string" &&
        LIFECYCLE_EVENT_TYPE_SET.has(value.eventType) &&
        typeof value.occurredAt == "number" &&
        isSnapshot(value.snapshot) &&
        (value.previousSnapshot === null || isSnapshot(value.previousSnapshot))
    )
}

function isFeedbackQuestionSummary(value: unknown): value is OTTelemetryFeedbackQuestionSummary {
    if (!isRecord(value)) return false
    return (
        typeof value.position == "number" &&
        feedbackQuestionTypeOrText(value.type) == value.type &&
        typeof value.label == "string" &&
        typeof value.answered == "boolean" &&
        (value.ratingValue === null || typeof value.ratingValue == "number") &&
        (value.choiceIndex === null || typeof value.choiceIndex == "number") &&
        (value.choiceLabel === null || typeof value.choiceLabel == "string")
    )
}

function isFeedbackRecord(value: unknown): value is OTTelemetryFeedbackRecord {
    if (!isRecord(value)) return false
    return (
        typeof value.sessionId == "string" &&
        typeof value.ticketId == "string" &&
        (value.triggerMode == "close" || value.triggerMode == "delete" || value.triggerMode == "first-close-only") &&
        typeof value.triggeredAt == "number" &&
        (value.completedAt === null || typeof value.completedAt == "number") &&
        (value.status == "delivery_failed" || value.status == "completed" || value.status == "ignored") &&
        (value.respondentUserId === null || typeof value.respondentUserId == "string") &&
        typeof value.closeCountAtTrigger == "number" &&
        isSnapshot(value.snapshot) &&
        Array.isArray(value.questionSummaries) &&
        value.questionSummaries.every(isFeedbackQuestionSummary)
    )
}
