import * as discord from "discord.js"
import { withRicherMessageFlags } from "../../../src/core/api/openticket/richer-message"

type OTFormsMessageBuildResult = import("#opendiscord").api.ODMessageBuildResult
type OTFormsMessageBuildSentResult = import("#opendiscord").api.ODMessageBuildSentResult<boolean>

export type OTFormsSessionTransportKind = "button" | "dropdown" | "modal"
export type OTFormsSessionMessageDeliveryMode =
    | "initial_reply"
    | "replace_active_prompt"
    | "follow_up"

export const OT_FORMS_NEUTRAL_RECOVERY_MESSAGE =
    "This application step is no longer active. Use Continue Application or the ticket card to resume."
export const OT_FORMS_SAVE_FAILURE_MESSAGE =
    "We couldn't save that response. Nothing changed. Please try again."

export interface OTFormsSessionResponderInstance {
    didReply: boolean
    interaction: {
        deferred: boolean
        replied: boolean
        followUp(options: discord.InteractionReplyOptions): Promise<discord.Message<boolean>>
    }
    reply(message: OTFormsMessageBuildResult): Promise<OTFormsMessageBuildSentResult>
    update(message: OTFormsMessageBuildResult): Promise<OTFormsMessageBuildSentResult>
}

export function buildEphemeralStatusMessage(
    id: string,
    content: string
): OTFormsMessageBuildResult {
    const { api } = require("#opendiscord") as typeof import("#opendiscord")
    return {
        id: new api.ODId(id),
        ephemeral: true,
        message: { content }
    }
}

function toInteractionReplyOptions(
    message: OTFormsMessageBuildResult
): discord.InteractionReplyOptions {
    return withRicherMessageFlags(
        message.message as discord.MessageCreateOptions,
        message.ephemeral ? [discord.MessageFlags.Ephemeral] : []
    ) as discord.InteractionReplyOptions
}

async function sendFollowUp(
    instance: OTFormsSessionResponderInstance,
    message: OTFormsMessageBuildResult
): Promise<OTFormsMessageBuildSentResult> {
    try {
        const sent = await instance.interaction.followUp(toInteractionReplyOptions(message))
        instance.didReply = true
        return { success: true, message: sent }
    } catch {
        return { success: false, message: null }
    }
}

async function deliverLiveMessage(options: {
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
    deliveryMode: OTFormsSessionMessageDeliveryMode
}): Promise<OTFormsMessageBuildSentResult> {
    const { instance, message, deliveryMode } = options
    switch (deliveryMode) {
        case "replace_active_prompt":
            return instance.update(message)
        case "follow_up":
            return sendFollowUp(instance, message)
        case "initial_reply":
        default:
            return instance.reply(message)
    }
}

export async function retireStaleComponentPrompt(options: {
    transportKind: OTFormsSessionTransportKind
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
}): Promise<OTFormsMessageBuildSentResult> {
    const { transportKind, instance, message } = options
    if (transportKind == "modal") {
        return { success: false, message: null }
    }
    return instance.update(message)
}

export async function deliverPassiveAnsweredConfirmation(options: {
    transportKind: OTFormsSessionTransportKind
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
}): Promise<OTFormsMessageBuildSentResult> {
    const { transportKind, instance, message } = options
    if (transportKind == "modal") {
        return instance.update(message)
    }
    return retireStaleComponentPrompt({ transportKind, instance, message })
}

export async function deliverLiveQuestionPrompt(options: {
    transportKind: OTFormsSessionTransportKind
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
    deliveryMode: OTFormsSessionMessageDeliveryMode
}): Promise<OTFormsMessageBuildSentResult> {
    const { instance, message, deliveryMode } = options
    return deliverLiveMessage({ instance, message, deliveryMode })
}

export async function deliverLiveContinuePrompt(options: {
    transportKind: OTFormsSessionTransportKind
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
    deliveryMode: OTFormsSessionMessageDeliveryMode
}): Promise<OTFormsMessageBuildSentResult> {
    const { instance, message, deliveryMode } = options
    return deliverLiveMessage({ instance, message, deliveryMode })
}

export async function deliverStatusReply(options: {
    transportKind: OTFormsSessionTransportKind
    instance: OTFormsSessionResponderInstance
    message: OTFormsMessageBuildResult
}): Promise<OTFormsMessageBuildSentResult> {
    const { transportKind, instance, message } = options
    if (transportKind == "modal" && !instance.interaction.deferred && !instance.interaction.replied) {
        return instance.update(message)
    }
    return instance.reply(message)
}
