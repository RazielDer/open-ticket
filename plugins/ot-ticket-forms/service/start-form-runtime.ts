import * as discord from "discord.js"
import { toRicherMessageEditPayload } from "../../../src/core/api/openticket/richer-message"
import type {
    OTFormsCapturedAnswer,
    OTFormsDraftState,
    OTForms_Question
} from "../types/configDefaults"

export const OT_FORMS_START_FORM_BUTTON_LABEL = "Fill Out Application" as const
export const OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL = "Continue Application" as const
export const OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL = "Update Application" as const
export const OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_LABEL = "Submit for Review" as const
export const OT_FORMS_SUBMITTED_FOR_STAFF_REVIEW_BUTTON_LABEL = "Submitted for Staff Review" as const
export const OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL = "Application Locked" as const
export const OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER = "Edit a saved answer" as const

const OT_FORMS_START_FORM_BUTTON_PREFIX = "ot-ticket-forms:sb_" as const
const OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_PREFIX = "ot-ticket-forms:srb_" as const
const OT_FORMS_EDIT_ANSWER_DROPDOWN_PREFIX = "ot-ticket-forms:ed_" as const
const OT_FORMS_START_FORM_OPTION_LIMIT = 25
const OT_FORMS_START_FORM_LABEL_LIMIT = 100
const OT_FORMS_START_FORM_DESCRIPTION_LIMIT = 100

export type OTFormsApplicantLifecycleState =
    | "unsubmitted"
    | "submitted"
    | "retry_reopened"
    | "locked"

export type OTFormsStartFormCardState = "fill_out" | "continue" | "update" | "submitted" | "locked"
export type OTFormsStartFormEditAnswerOption = discord.SelectMenuComponentOptionData
export type OTFormsStartFormRenderState = {
    cardState: OTFormsStartFormCardState
    buttonLabel: string
    buttonEnabled: boolean
    description: string
    editAnswerVisible: boolean
    editAnswerEnabled: boolean
    editAnswerPlaceholder: string
    editAnswerOptions: OTFormsStartFormEditAnswerOption[]
    submitForReviewVisible: boolean
    submitForReviewEnabled: boolean
    submitForReviewLabel: string
}

type StartFormButtonMessage = {
    id: string
    editable?: boolean
    createdTimestamp?: number
    components: readonly unknown[]
}

export function createStartFormButtonCustomId(formInstanceId: string): string {
    return `${OT_FORMS_START_FORM_BUTTON_PREFIX}${formInstanceId}`
}

export function createSubmitForReviewButtonCustomId(formInstanceId: string): string {
    return `${OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_PREFIX}${formInstanceId}`
}

export function createEditAnswerDropdownCustomId(formInstanceId: string): string {
    return `${OT_FORMS_EDIT_ANSWER_DROPDOWN_PREFIX}${formInstanceId}`
}

export function resolveStartFormCardState(
    draftState: OTFormsDraftState | null,
    lifecycleState: OTFormsApplicantLifecycleState
): OTFormsStartFormCardState {
    if (lifecycleState == "submitted") return "submitted"
    if (lifecycleState == "locked") return "locked"
    if (draftState == "completed") return "update"
    if (draftState == "partial") return "continue"
    return "fill_out"
}

export function resolveStartFormButtonLabel(state: OTFormsStartFormCardState): string {
    switch (state) {
        case "continue":
            return OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL
        case "update":
            return OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL
        case "submitted":
            return OT_FORMS_SUBMITTED_FOR_STAFF_REVIEW_BUTTON_LABEL
        case "locked":
            return OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL
        case "fill_out":
        default:
            return OT_FORMS_START_FORM_BUTTON_LABEL
    }
}

export function buildStartFormDescription(
    baseDescription: string,
    state: OTFormsStartFormCardState,
    lifecycleState: OTFormsApplicantLifecycleState,
    hasSavedAnswers: boolean = false
): string {
    const normalizedBase = baseDescription.trim()
    const stateCopy = (() => {
        switch (state) {
            case "continue":
                return hasSavedAnswers
                    ? "A saved draft was found. Use Continue Application to finish unanswered sections, or Edit a saved answer to change one response."
                    : "A saved draft was found. Use Continue Application to resume where you left off."
            case "update":
                if (lifecycleState == "retry_reopened") {
                    return hasSavedAnswers
                        ? "Staff sent this application back for corrections. Use Update Application or Edit a saved answer to revise it, then choose Submit for Review again when you are ready."
                        : "Staff sent this application back for corrections. Use Update Application, then choose Submit for Review again when you are ready."
                }
                return hasSavedAnswers
                    ? "Your draft is complete. Use Update Application or Edit a saved answer to review it, then choose Submit for Review when you are ready."
                    : "Your draft is complete. Use Update Application to review it, then choose Submit for Review when you are ready."
            case "submitted":
                return "Your application has already been submitted and is waiting on staff review. Editing stays locked until staff sends it back with Retry."
            case "locked":
                return "Your application is locked and can no longer be edited from this ticket card."
            case "fill_out":
            default:
                return "Use Fill Out Application to start the whitelist application."
        }
    })()

    return normalizedBase.length > 0
        ? `${normalizedBase}\n\n${stateCopy}`
        : stateCopy
}

export function buildInactiveStepRecoveryMessage(
    state: OTFormsStartFormCardState,
    hasSavedAnswers: boolean,
    lifecycleState: OTFormsApplicantLifecycleState
): string {
    switch (state) {
        case "continue":
            return hasSavedAnswers
                ? "This step is no longer active. Use Continue Application or Edit a saved answer on the ticket card to keep working."
                : "This step is no longer active. Use Continue Application on the ticket card to keep working."
        case "update":
            if (lifecycleState == "retry_reopened") {
                return hasSavedAnswers
                    ? "This step is no longer active. Use Update Application, Edit a saved answer, or Submit for Review on the ticket card to correct and resubmit your application."
                    : "This step is no longer active. Use Update Application or Submit for Review on the ticket card to correct and resubmit your application."
            }
            return hasSavedAnswers
                ? "This step is no longer active. Use Update Application, Edit a saved answer, or Submit for Review on the ticket card to keep your application current."
                : "This step is no longer active. Use Update Application or Submit for Review on the ticket card to keep your application current."
        case "submitted":
            return "This step is no longer active. The application is already submitted and waiting on staff review."
        case "locked":
            return "This step is no longer active. The whitelist application is locked and can no longer be edited."
        case "fill_out":
        default:
            return "This step is no longer active. Use Fill Out Application on the ticket card to start the whitelist application."
    }
}

function normalizeStartFormOptionText(value: string | null | undefined): string | null {
    if (typeof value != "string") return null
    const normalized = value.replace(/\s+/g, " ").trim()
    return normalized.length > 0 ? normalized : null
}

function truncateStartFormOptionText(value: string, limit: number): string {
    if (value.length <= limit) return value
    return `${value.slice(0, Math.max(limit - 3, 1)).trimEnd()}...`
}

export function buildStartFormEditAnswerOptions(
    questions: readonly OTForms_Question[],
    answers: readonly OTFormsCapturedAnswer[]
): OTFormsStartFormEditAnswerOption[] {
    const savedAnswers = new Map<number, string>()
    for (const answer of answers) {
        const normalized = normalizeStartFormOptionText(answer.answer)
        if (normalized) {
            savedAnswers.set(answer.question.position, normalized)
        }
    }

    const options: OTFormsStartFormEditAnswerOption[] = []
    for (const question of [...questions].sort((left, right) => left.position - right.position)) {
        const savedAnswer = savedAnswers.get(question.position)
        if (!savedAnswer) continue
        options.push({
            label: truncateStartFormOptionText(
                `Q${question.position}: ${normalizeStartFormOptionText(question.question) ?? "Saved answer"}`,
                OT_FORMS_START_FORM_LABEL_LIMIT
            ),
            value: String(question.position),
            description: truncateStartFormOptionText(
                `Saved: ${savedAnswer}`,
                OT_FORMS_START_FORM_DESCRIPTION_LIMIT
            )
        })
        if (options.length >= OT_FORMS_START_FORM_OPTION_LIMIT) break
    }

    return options
}

export function resolveStartFormRenderState(
    baseDescription: string,
    draftState: OTFormsDraftState | null,
    lifecycleState: OTFormsApplicantLifecycleState,
    editAnswerOptions: readonly OTFormsStartFormEditAnswerOption[] = []
): OTFormsStartFormRenderState {
    const cardState = resolveStartFormCardState(draftState, lifecycleState)
    const hasSavedAnswers = editAnswerOptions.length > 0
    const editAllowed = lifecycleState == "unsubmitted" || lifecycleState == "retry_reopened"
    const submitAllowed = draftState == "completed" && editAllowed
    const editAnswerVisible = editAllowed && hasSavedAnswers && cardState != "fill_out"
    return {
        cardState,
        buttonLabel: resolveStartFormButtonLabel(cardState),
        buttonEnabled: cardState != "locked" && cardState != "submitted",
        description: buildStartFormDescription(baseDescription, cardState, lifecycleState, hasSavedAnswers),
        editAnswerVisible,
        editAnswerEnabled: editAnswerVisible,
        editAnswerPlaceholder: OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER,
        editAnswerOptions: editAnswerVisible ? [...editAnswerOptions] : [],
        submitForReviewVisible: submitAllowed,
        submitForReviewEnabled: submitAllowed,
        submitForReviewLabel: OT_FORMS_SUBMIT_FOR_REVIEW_BUTTON_LABEL
    }
}

export function messageHasStartFormButton(message: StartFormButtonMessage, formInstanceId: string): boolean {
    const customId = createStartFormButtonCustomId(formInstanceId)
    return message.components.some((row) =>
        Array.isArray((row as { components?: readonly unknown[] }).components)
        && ((row as { components?: readonly unknown[] }).components ?? []).some((component) => {
            const typedComponent = component as { type?: number, customId?: string | null }
            return typedComponent.type == discord.ComponentType.Button && typedComponent.customId == customId
        })
    )
}

export function findStartFormMessageId(
    messages: Iterable<StartFormButtonMessage>,
    formInstanceId: string
): string | null {
    for (const message of messages) {
        if (messageHasStartFormButton(message, formInstanceId)) {
            return message.id
        }
    }
    return null
}

async function findExistingStartFormMessage(
    channel: discord.GuildTextBasedChannel,
    formInstanceId: string,
    searchLimit: number = 500
): Promise<discord.Message | null> {
    let before: string | undefined
    let remaining = Math.max(searchLimit, 1)
    while (remaining > 0) {
        const fetchLimit = Math.min(remaining, 100)
        const messages = await channel.messages.fetch(before ? { limit: fetchLimit, before } : { limit: fetchLimit })
        if (messages.size < 1) return null

        const existingMessageId = findStartFormMessageId(messages.values(), formInstanceId)
        if (existingMessageId) {
            return await channel.messages.fetch(existingMessageId).catch(() => null)
        }

        remaining -= messages.size
        const nextBefore = messages.lastKey()
        if (!nextBefore || messages.size < fetchLimit) return null
        before = nextBefore
    }

    return null
}

export async function ensureStartFormMessage(
    channel: discord.GuildTextBasedChannel,
    messagePayload: discord.MessageCreateOptions,
    formInstanceId: string,
    preferredMessageId: string | null = null,
    options: {
        forceRecreate?: boolean
        placementRepairAfterMessageTimestamp?: number | null
    } = {}
): Promise<{ messageId: string, created: boolean, updated: boolean, createdTimestamp: number }> {
    if (preferredMessageId) {
        const preferredMessage = await channel.messages.fetch(preferredMessageId).catch(() => null)
        const mustRecreatePreferred = preferredMessage != null
            && (
                options.forceRecreate === true
                || (
                    options.placementRepairAfterMessageTimestamp != null
                    && Number.isFinite(options.placementRepairAfterMessageTimestamp)
                    && preferredMessage.createdTimestamp <= Number(options.placementRepairAfterMessageTimestamp)
                )
            )
        if (mustRecreatePreferred && preferredMessage) {
            await preferredMessage.delete().catch(() => null)
        } else if (preferredMessage && preferredMessage.editable) {
            await preferredMessage.edit(toRicherMessageEditPayload(messagePayload))
            return {
                messageId: preferredMessage.id,
                created: false,
                updated: true,
                createdTimestamp: preferredMessage.createdTimestamp
            }
        }
    }

    let existingMessage = await findExistingStartFormMessage(channel, formInstanceId)
    const mustRecreateExisting = existingMessage != null
        && (
            options.forceRecreate === true
            || (
                options.placementRepairAfterMessageTimestamp != null
                && Number.isFinite(options.placementRepairAfterMessageTimestamp)
                && existingMessage.createdTimestamp <= Number(options.placementRepairAfterMessageTimestamp)
            )
        )
    if (mustRecreateExisting && existingMessage) {
        await existingMessage.delete().catch(() => null)
        existingMessage = null
    }
    if (existingMessage && existingMessage.editable) {
        await existingMessage.edit(toRicherMessageEditPayload(messagePayload))
        return {
            messageId: existingMessage.id,
            created: false,
            updated: true,
            createdTimestamp: existingMessage.createdTimestamp
        }
    }

    const createdMessage = await channel.send(messagePayload)
    return {
        messageId: createdMessage.id,
        created: true,
        updated: false,
        createdTimestamp: createdMessage.createdTimestamp
    }
}
