import * as discord from "discord.js"

import type { OTFormsCapturedAnswer, OTFormsDraftState } from "../types/configDefaults"
import type { OTFormsTicketDraftSnapshot } from "./forms-model"
import { cloneOTFormsCapturedAnswers } from "./answer-runtime"

const MAX_EMBED_SIZE = 6000
const MAX_EMBED_FIELDS = 25

export interface OTFormsManagedRecordField {
    name: string
    value: string
    inline: boolean
}

function estimateFieldGroupSize(fields: readonly OTFormsManagedRecordField[]): number {
    return JSON.stringify({ fields }).length
}

export function buildManagedRecordFields(
    answers: readonly OTFormsCapturedAnswer[]
): OTFormsManagedRecordField[] {
    return answers.map((answer) => ({
        name: answer.question.question.length > 256
            ? answer.question.question.slice(0, 252) + "..."
            : answer.question.question,
        value: `\`\`\`${answer.answer || "Unanswered question."}\`\`\``,
        inline: false
    }))
}

export function splitManagedRecordFields(
    fields: readonly OTFormsManagedRecordField[]
): OTFormsManagedRecordField[][] {
    const pages: OTFormsManagedRecordField[][] = []
    let currentPage: OTFormsManagedRecordField[] = []

    for (const field of fields) {
        const nextPage = [...currentPage, field]
        if (
            nextPage.length > MAX_EMBED_FIELDS
            || estimateFieldGroupSize(nextPage) > MAX_EMBED_SIZE
        ) {
            if (currentPage.length > 0) pages.push(currentPage)
            currentPage = [field]
            continue
        }
        currentPage = nextPage
    }

    if (currentPage.length > 0) {
        pages.push(currentPage)
    }

    return pages
}

export function buildTicketManagedRecordMessagePayload(
    embeds: readonly discord.EmbedBuilder[]
): Pick<discord.MessageCreateOptions, "embeds" | "components"> {
    return {
        embeds: [...embeds],
        components: []
    }
}

export function rebindManagedRecordSnapshot(
    snapshot: OTFormsTicketDraftSnapshot,
    options: {
        managedRecordMessageId: string | null
        draftState: OTFormsDraftState
        updatedAt: string
        completedAt: string | null
        answers: OTFormsCapturedAnswer[]
    }
): OTFormsTicketDraftSnapshot {
    return {
        ...snapshot,
        draftState: options.draftState,
        updatedAt: options.updatedAt,
        completedAt: options.completedAt,
        managedRecordMessageId: options.managedRecordMessageId,
        answers: cloneOTFormsCapturedAnswers(options.answers)
    }
}
