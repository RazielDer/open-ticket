import * as discord from "discord.js"
import type { OTFormsDraftState } from "../types/configDefaults"

export const OT_FORMS_START_FORM_BUTTON_LABEL = "Fill Out Application" as const
export const OT_FORMS_CONTINUE_APPLICATION_BUTTON_LABEL = "Continue Application" as const
export const OT_FORMS_UPDATE_APPLICATION_BUTTON_LABEL = "Update Application" as const
export const OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL = "Application Locked" as const

const OT_FORMS_START_FORM_BUTTON_PREFIX = "ot-ticket-forms:sb_" as const

export type OTFormsStartFormCardState = "fill_out" | "continue" | "update" | "locked"
export type OTFormsStartFormRenderState = {
    cardState: OTFormsStartFormCardState
    buttonLabel: string
    buttonEnabled: boolean
    description: string
}

type StartFormButtonMessage = {
    id: string
    components: readonly unknown[]
}

export function createStartFormButtonCustomId(formInstanceId: string): string {
    return `${OT_FORMS_START_FORM_BUTTON_PREFIX}${formInstanceId}`
}

export function resolveStartFormCardState(
    draftState: OTFormsDraftState | null,
    canApplicantEdit: boolean
): OTFormsStartFormCardState {
    if (!canApplicantEdit) return "locked"
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
        case "locked":
            return OT_FORMS_DISABLED_START_FORM_BUTTON_LABEL
        case "fill_out":
        default:
            return OT_FORMS_START_FORM_BUTTON_LABEL
    }
}

export function buildStartFormDescription(
    baseDescription: string,
    state: OTFormsStartFormCardState
): string {
    const normalizedBase = baseDescription.trim()
    const stateCopy = (() => {
        switch (state) {
            case "continue":
                return "A saved draft was found. Use Continue Application to resume where you left off."
            case "update":
                return "Your application is submitted. Use Update Application while staff review remains editable."
            case "locked":
                return "Your application is locked because staff review is no longer editable."
            case "fill_out":
            default:
                return "Use Fill Out Application to start the whitelist application."
        }
    })()

    return normalizedBase.length > 0
        ? `${normalizedBase}\n\n${stateCopy}`
        : stateCopy
}

export function resolveStartFormRenderState(
    baseDescription: string,
    draftState: OTFormsDraftState | null,
    canApplicantEdit: boolean
): OTFormsStartFormRenderState {
    const cardState = resolveStartFormCardState(draftState, canApplicantEdit)
    return {
        cardState,
        buttonLabel: resolveStartFormButtonLabel(cardState),
        buttonEnabled: cardState != "locked",
        description: buildStartFormDescription(baseDescription, cardState)
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

export async function ensureStartFormMessage(
    channel: discord.GuildTextBasedChannel,
    messagePayload: discord.MessageCreateOptions,
    formInstanceId: string
): Promise<{ messageId: string, created: boolean, updated: boolean }> {
    const existingMessages = await channel.messages.fetch({ limit: 50 })
    const existingMessageId = findStartFormMessageId(existingMessages.values(), formInstanceId)
    if (existingMessageId) {
        const existingMessage = await channel.messages.fetch(existingMessageId).catch(() => null)
        if (existingMessage && existingMessage.editable) {
            await existingMessage.edit(messagePayload as discord.MessageEditOptions)
            return {
                messageId: existingMessageId,
                created: false,
                updated: true
            }
        }
    }

    const createdMessage = await channel.send(messagePayload)
    return {
        messageId: createdMessage.id,
        created: true,
        updated: false
    }
}
