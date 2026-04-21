import type { OTFormsAnswerTarget, OTFormsCapturedAnswer, OTFormsDraftState } from "../types/configDefaults"

export const OT_FORMS_PLUGIN_SERVICE_ID = "ot-ticket-forms:service" as const
export const OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY = "ot-ticket-forms:completed-ticket-forms" as const
export const OT_FORMS_TICKET_DRAFT_CATEGORY = "ot-ticket-forms:ticket-drafts" as const

export interface OTFormsCompletedTicketFormAnswer {
    position: number
    question: string
    answer: string | null
}

export interface OTFormsCompletedTicketFormContext {
    ticketChannelId: string
    ticketChannelName: string
    ticketOptionId: string
    applicantDiscordUserId: string
}

export interface OTFormsCompletedTicketFormSnapshot extends OTFormsCompletedTicketFormContext {
    formId: string
    completedAt: string
    answers: OTFormsCompletedTicketFormAnswer[]
}

export interface OTFormsTicketDraftSnapshot extends OTFormsCompletedTicketFormContext {
    formId: string
    answerTarget: OTFormsAnswerTarget
    draftState: OTFormsDraftState
    formColor: string
    updatedAt: string
    completedAt: string | null
    startFormMessageId: string | null
    managedRecordMessageId: string | null
    answers: OTFormsCapturedAnswer[]
}

export function normalizeDiscordUserId(value: string | null | undefined): string | null {
    if (typeof value != "string") return null
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

export function resolveOriginalApplicantDiscordUserId(
    currentCreatorDiscordUserId: string | null | undefined,
    previousCreatorDiscordUserIds: readonly string[] | null | undefined
): string | null {
    for (const candidate of previousCreatorDiscordUserIds ?? []) {
        const normalized = normalizeDiscordUserId(candidate)
        if (normalized) return normalized
    }
    return normalizeDiscordUserId(currentCreatorDiscordUserId)
}

export function createCompletedTicketFormKey(ticketChannelId: string, formId: string): string {
    return `${ticketChannelId}:${formId}`
}

export function createTicketDraftKey(
    ticketChannelId: string,
    formId: string,
    applicantDiscordUserId: string
): string {
    return `${ticketChannelId}:${formId}:${applicantDiscordUserId}`
}

function normalizeAnswerTarget(value: OTFormsAnswerTarget): OTFormsAnswerTarget {
    if (value == "response_channel" || value == "ticket_managed_record") {
        return value
    }
    throw new Error("Ticket draft snapshot requires a supported answerTarget.")
}

function normalizeDraftState(value: OTFormsDraftState): OTFormsDraftState {
    if (value == "initial" || value == "partial" || value == "completed") {
        return value
    }
    throw new Error("Ticket draft snapshot requires a supported draftState.")
}

export function normalizeCompletedTicketFormSnapshot(snapshot: OTFormsCompletedTicketFormSnapshot): OTFormsCompletedTicketFormSnapshot {
    const applicantDiscordUserId = normalizeDiscordUserId(snapshot.applicantDiscordUserId)
    if (!applicantDiscordUserId) {
        throw new Error("Completed ticket form snapshot requires applicantDiscordUserId.")
    }
    return {
        ticketChannelId: snapshot.ticketChannelId,
        ticketChannelName: snapshot.ticketChannelName,
        ticketOptionId: snapshot.ticketOptionId,
        applicantDiscordUserId,
        formId: snapshot.formId,
        completedAt: snapshot.completedAt,
        answers: [...snapshot.answers].sort((left, right) => left.position - right.position).map((answer) => ({
            position: answer.position,
            question: answer.question,
            answer: answer.answer
        }))
    }
}

export function normalizeTicketDraftSnapshot(snapshot: OTFormsTicketDraftSnapshot): OTFormsTicketDraftSnapshot {
    const applicantDiscordUserId = normalizeDiscordUserId(snapshot.applicantDiscordUserId)
    if (!applicantDiscordUserId) {
        throw new Error("Ticket draft snapshot requires applicantDiscordUserId.")
    }
    const startFormMessageId = normalizeDiscordUserId(snapshot.startFormMessageId)
    const managedRecordMessageId = normalizeDiscordUserId(snapshot.managedRecordMessageId)
    return {
        ticketChannelId: snapshot.ticketChannelId,
        ticketChannelName: snapshot.ticketChannelName,
        ticketOptionId: snapshot.ticketOptionId,
        applicantDiscordUserId,
        formId: snapshot.formId,
        answerTarget: normalizeAnswerTarget(snapshot.answerTarget),
        draftState: normalizeDraftState(snapshot.draftState),
        formColor: String(snapshot.formColor ?? ""),
        updatedAt: snapshot.updatedAt,
        completedAt: snapshot.completedAt,
        startFormMessageId,
        managedRecordMessageId,
        answers: [...snapshot.answers]
            .sort((left, right) => left.question.position - right.question.position)
            .map((entry) => ({
                question: { ...entry.question },
                answer: entry.answer
            }))
    }
}

export class OTFormsCompletedTicketFormStore {
    private readonly completedForms = new Map<string, OTFormsCompletedTicketFormSnapshot>()

    restore(snapshots: OTFormsCompletedTicketFormSnapshot[]): void {
        this.completedForms.clear()
        for (const snapshot of snapshots) {
            this.upsert(snapshot)
        }
    }

    upsert(snapshot: OTFormsCompletedTicketFormSnapshot): OTFormsCompletedTicketFormSnapshot {
        const normalized = normalizeCompletedTicketFormSnapshot(snapshot)
        this.completedForms.set(createCompletedTicketFormKey(normalized.ticketChannelId, normalized.formId), normalized)
        return normalized
    }

    getCompletedTicketForm(ticketChannelId: string, formId: string): OTFormsCompletedTicketFormSnapshot | null {
        return this.completedForms.get(createCompletedTicketFormKey(ticketChannelId, formId)) ?? null
    }
}

export class OTFormsTicketDraftStore {
    private readonly drafts = new Map<string, OTFormsTicketDraftSnapshot>()

    restore(snapshots: OTFormsTicketDraftSnapshot[]): void {
        this.drafts.clear()
        for (const snapshot of snapshots) {
            this.upsert(snapshot)
        }
    }

    upsert(snapshot: OTFormsTicketDraftSnapshot): OTFormsTicketDraftSnapshot {
        const normalized = normalizeTicketDraftSnapshot(snapshot)
        this.drafts.set(
            createTicketDraftKey(
                normalized.ticketChannelId,
                normalized.formId,
                normalized.applicantDiscordUserId
            ),
            normalized
        )
        return normalized
    }

    getTicketDraft(
        ticketChannelId: string,
        formId: string,
        applicantDiscordUserId: string
    ): OTFormsTicketDraftSnapshot | null {
        return this.drafts.get(
            createTicketDraftKey(ticketChannelId, formId, applicantDiscordUserId)
        ) ?? null
    }

    listTicketDrafts(): OTFormsTicketDraftSnapshot[] {
        return [...this.drafts.values()]
    }
}
