import * as discord from "discord.js"

import type { ODTicketOption } from "../core/api/openticket/option"
import type { ODTicket } from "../core/api/openticket/ticket"
import { ODTICKET_PLATFORM_METADATA_DEFAULTS, ODTICKET_PLATFORM_METADATA_IDS } from "../core/api/openticket/ticket-platform"

export type ODTicketTransportMode = "channel_text" | "private_thread"

export const TICKET_OPTION_TRANSPORT_MODE_ID = "opendiscord:channel-transport-mode"
export const TICKET_OPTION_THREAD_PARENT_CHANNEL_ID = "opendiscord:channel-thread-parent"

export const PRIVATE_THREAD_ACCESS_WARNING = "Private-thread ticket action failed before Open Ticket state was changed. Private-thread access depends on parent-channel visibility plus the Manage Threads permission."

type DataSource = {
    get?: (id: string) => { value?: unknown } | null
    exists?: (id: string) => boolean
}

export function normalizeTicketTransportMode(value: unknown): ODTicketTransportMode {
    return value == "private_thread" ? "private_thread" : "channel_text"
}

export function getTicketOptionTransportMode(option: DataSource): ODTicketTransportMode {
    if (!option.exists?.(TICKET_OPTION_TRANSPORT_MODE_ID)) return "channel_text"
    return normalizeTicketTransportMode(option.get?.(TICKET_OPTION_TRANSPORT_MODE_ID)?.value)
}

export function getTicketOptionThreadParentChannel(option: DataSource): string {
    if (!option.exists?.(TICKET_OPTION_THREAD_PARENT_CHANNEL_ID)) return ""
    const value = option.get?.(TICKET_OPTION_THREAD_PARENT_CHANNEL_ID)?.value
    return typeof value == "string" ? value.trim() : ""
}

export function getTicketTransportMode(ticket: DataSource): ODTicketTransportMode {
    return normalizeTicketTransportMode(ticket.get?.(ODTICKET_PLATFORM_METADATA_IDS.transportMode)?.value)
}

export function getTicketTransportParentChannelId(ticket: DataSource): string | null {
    const value = ticket.get?.(ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId)?.value
    return typeof value == "string" && value.trim().length > 0 ? value.trim() : null
}

export function isPrivateThreadTicket(ticket: DataSource): boolean {
    return getTicketTransportMode(ticket) == "private_thread"
}

export function isPrivateThreadTicketChannel(ticket: DataSource, channel: discord.GuildTextBasedChannel): channel is discord.PrivateThreadChannel {
    return isPrivateThreadTicket(ticket) && channel.isThread() && channel.type == discord.ChannelType.PrivateThread
}

export function buildTicketTransportMetadata(option: ODTicketOption, parentChannelId: string | null) {
    const transportMode = getTicketOptionTransportMode(option)
    return {
        transportMode,
        transportParentChannelId: transportMode == "private_thread" ? parentChannelId : ODTICKET_PLATFORM_METADATA_DEFAULTS.transportParentChannelId,
        transportParentMessageId: ODTICKET_PLATFORM_METADATA_DEFAULTS.transportParentMessageId
    }
}

export function validatePrivateThreadOption(option: DataSource): { valid: true } | { valid: false; reason: string } {
    if (getTicketOptionTransportMode(option) != "private_thread") return { valid: true }

    const parentChannelId = getTicketOptionThreadParentChannel(option)
    if (parentChannelId.length < 1) {
        return {
            valid: false,
            reason: "Private-thread ticket options require channel.threadParentChannel to point at a guild text channel."
        }
    }

    return { valid: true }
}

export function validateTicketMoveTransport(ticket: ODTicket, targetOption: ODTicketOption): { valid: true } | { valid: false; reason: string } {
    const sourceMode = getTicketTransportMode(ticket)
    const targetMode = getTicketOptionTransportMode(targetOption)
    if (sourceMode != targetMode) {
        return {
            valid: false,
            reason: `Cannot move ticket across transport modes in this slice (${sourceMode} -> ${targetMode}).`
        }
    }

    if (sourceMode == "private_thread") {
        const sourceParent = getTicketTransportParentChannelId(ticket)
        const targetParent = getTicketOptionThreadParentChannel(targetOption) || null
        if (sourceParent != targetParent) {
            return {
                valid: false,
                reason: "Cannot move private-thread tickets to an option with a different threadParentChannel in this slice."
            }
        }
    }

    return { valid: true }
}

export function getTicketUserParticipantIds(ticket: ODTicket): string[] {
    const participants = ticket.get("opendiscord:participants").value
    const ids = new Set<string>()

    for (const participant of participants) {
        if (participant.type == "user" && participant.id) ids.add(participant.id)
    }

    const creator = ticket.get("opendiscord:opened-by").value
    if (creator) ids.add(creator)

    return [...ids]
}

export async function addPrivateThreadMembers(channel: discord.PrivateThreadChannel, userIds: string[]) {
    for (const userId of new Set(userIds)) {
        await channel.members.add(userId)
    }
}

export async function removePrivateThreadMembers(channel: discord.PrivateThreadChannel, userIds: string[]) {
    for (const userId of new Set(userIds)) {
        await channel.members.remove(userId).catch(() => null)
    }
}

export async function sendPrivateThreadAccessWarning(channel: discord.GuildTextBasedChannel, builder: () => Promise<{ message: discord.MessageCreateOptions }>) {
    await channel.send((await builder()).message).catch(() => null)
}
