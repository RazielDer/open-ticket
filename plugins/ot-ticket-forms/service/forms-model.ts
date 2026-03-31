export const OT_FORMS_PLUGIN_SERVICE_ID = "ot-ticket-forms:service" as const
export const OT_FORMS_COMPLETED_TICKET_FORM_CATEGORY = "ot-ticket-forms:completed-ticket-forms" as const

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
