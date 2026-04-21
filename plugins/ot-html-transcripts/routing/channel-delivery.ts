import { TRANSCRIPT_PLUGIN_ID } from "../contracts/constants"
import { isDiscordChannelId, normalizeTranscriptChannelIds, resolveEffectiveTranscriptChannelTargets, type TicketOptionTranscriptRoutingTargets } from "./option-routing"

export interface MessageBuildResultLike {
    id?: { value?: string }
    message: unknown
    ephemeral?: boolean
}

export interface TranscriptReadyMessagesLike {
    channelMessage?: MessageBuildResultLike
    creatorDmMessage?: MessageBuildResultLike
    participantDmMessage?: MessageBuildResultLike
    activeAdminDmMessage?: MessageBuildResultLike
    everyAdminDmMessage?: MessageBuildResultLike
}

export interface TranscriptCompileResultLike {
    ticket: unknown
    channel: {
        guild: unknown
    }
}

export interface TranscriptChannelDeliveryWarning {
    code: string
    optionId: string | null
    destinationId: string | null
    detail: string
}

export interface TranscriptChannelDeliveryDependencies {
    resolveTargets?: (optionId: string) => TicketOptionTranscriptRoutingTargets | null | Promise<TicketOptionTranscriptRoutingTargets | null>
    fetchChannel?: (guild: unknown, targetId: string) => Promise<unknown>
    sendMessage?: (channel: unknown, message: MessageBuildResultLike) => Promise<void>
    logWarning?: (warning: TranscriptChannelDeliveryWarning) => void
}

export interface TranscriptChannelDeliveryResult {
    deliveredTargetIds: string[]
    skippedTargetIds: string[]
}

export interface TranscriptResolvedTarget {
    targetId: string
    channel: unknown
}

export interface TranscriptChannelTargetResolutionResult {
    resolvedTargets: TranscriptResolvedTarget[]
    skippedTargetIds: string[]
    warnings: TranscriptChannelDeliveryWarning[]
}

function getRuntime() {
    return require("#opendiscord") as typeof import("#opendiscord")
}

function getTicketOptionId(ticket: unknown): string | null {
    const optionId = (ticket as { option?: { id?: { value?: unknown } } } | null)?.option?.id?.value
    return typeof optionId == "string" && optionId.length > 0 ? optionId : null
}

function stripChannelMessage(readyResult: TranscriptReadyMessagesLike): TranscriptReadyMessagesLike {
    return {
        creatorDmMessage: readyResult.creatorDmMessage,
        participantDmMessage: readyResult.participantDmMessage,
        activeAdminDmMessage: readyResult.activeAdminDmMessage,
        everyAdminDmMessage: readyResult.everyAdminDmMessage
    }
}

function getGuildId(value: unknown): string | null {
    const guildId = (value as { id?: unknown } | null)?.id
    return typeof guildId == "string" && guildId.trim().length > 0 ? guildId.trim() : null
}

function isGuildTextChannel(channel: unknown): channel is { send(message: unknown): Promise<unknown> } & { isTextBased(): boolean; isDMBased?: () => boolean } {
    if (!channel || typeof channel != "object") {
        return false
    }

    const candidate = channel as { isTextBased?: () => boolean; isDMBased?: () => boolean; send?: (message: unknown) => Promise<unknown> }
    if (typeof candidate.isTextBased != "function" || !candidate.isTextBased()) {
        return false
    }

    if (typeof candidate.isDMBased == "function" && candidate.isDMBased()) {
        return false
    }

    return typeof candidate.send == "function"
}

function defaultLogWarning(warning: TranscriptChannelDeliveryWarning) {
    const { opendiscord } = getRuntime()
    opendiscord.log(`OT HTML Transcripts transcript channel delivery warning: ${warning.detail}`, "warning", [
        { key: "plugin", value: TRANSCRIPT_PLUGIN_ID },
        { key: "warning", value: warning.code },
        { key: "option", value: warning.optionId ?? "unknown" },
        { key: "destination", value: warning.destinationId ?? "unknown" }
    ])
}

async function defaultFetchChannel(guild: unknown, targetId: string): Promise<unknown> {
    const candidateGuild = guild as {
        channels?: { fetch?: (id: string) => Promise<unknown> }
        client?: { channels?: { fetch?: (id: string) => Promise<unknown> } }
    }
    const channelManager = candidateGuild?.channels
    if (channelManager && typeof channelManager.fetch == "function") {
        try {
            return await channelManager.fetch(targetId)
        } catch {
            // Fall through to the client fetch path when the guild channel manager is stale or otherwise rejects.
        }
    }

    const clientChannelManager = candidateGuild?.client?.channels
    if (!clientChannelManager || typeof clientChannelManager.fetch != "function") {
        return null
    }

    return await clientChannelManager.fetch(targetId)
}

async function defaultSendMessage(channel: unknown, message: MessageBuildResultLike): Promise<void> {
    await (channel as { send(message: unknown): Promise<unknown> }).send(message.message)
}

export async function resolveTranscriptTargetChannels(
    {
        guild,
        targetIds,
        optionId
    }: {
        guild: unknown
        targetIds: unknown
        optionId: string | null
    },
    dependencies: TranscriptChannelDeliveryDependencies = {}
): Promise<TranscriptChannelTargetResolutionResult> {
    const resolvedTargets: TranscriptResolvedTarget[] = []
    const skippedTargetIds: string[] = []
    const warnings: TranscriptChannelDeliveryWarning[] = []

    const fetchChannel = dependencies.fetchChannel ?? defaultFetchChannel
    const logWarning = dependencies.logWarning ?? defaultLogWarning
    const sourceGuildId = getGuildId(guild)

    for (const targetId of normalizeTranscriptChannelIds(targetIds)) {
        if (!isDiscordChannelId(targetId)) {
            const warning = {
                code: "invalid-id",
                optionId,
                destinationId: targetId,
                detail: "Skipped an invalid transcript channel target id."
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(targetId)
            warnings.push(warning)
            logWarning(warning)
            continue
        }

        let channel: unknown = null
        try {
            channel = await fetchChannel(guild, targetId)
        } catch (error) {
            const detailSuffix = error instanceof Error && error.message.trim().length > 0
                ? ` (${error.message.trim()})`
                : ""
            const warning = {
                code: "fetch-failed",
                optionId,
                destinationId: targetId,
                detail: `Failed to fetch a transcript channel target.${detailSuffix}`
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(targetId)
            warnings.push(warning)
            logWarning(warning)
            continue
        }

        if (!channel) {
            const warning = {
                code: "missing-channel",
                optionId,
                destinationId: targetId,
                detail: "Skipped a missing or deleted transcript channel target."
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(targetId)
            warnings.push(warning)
            logWarning(warning)
            continue
        }

        if (!isGuildTextChannel(channel)) {
            const warning = {
                code: "non-text-channel",
                optionId,
                destinationId: targetId,
                detail: "Skipped a non-text transcript channel target."
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(targetId)
            warnings.push(warning)
            logWarning(warning)
            continue
        }

        const targetGuildId = getGuildId((channel as { guild?: unknown }).guild ?? null)
        if (sourceGuildId && targetGuildId && targetGuildId != sourceGuildId) {
            const warning = {
                code: "wrong-guild",
                optionId,
                destinationId: targetId,
                detail: "Skipped a transcript channel target that belongs to a different guild."
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(targetId)
            warnings.push(warning)
            logWarning(warning)
            continue
        }

        resolvedTargets.push({ targetId, channel })
    }

    return { resolvedTargets, skippedTargetIds, warnings }
}

export async function deliverMessageToTranscriptTargets(
    {
        guild,
        targetIds,
        channelMessage,
        optionId
    }: {
        guild: unknown
        targetIds: unknown
        channelMessage?: MessageBuildResultLike
        optionId: string | null
    },
    dependencies: TranscriptChannelDeliveryDependencies = {}
): Promise<TranscriptChannelDeliveryResult> {
    const deliveredTargetIds: string[] = []
    const skippedTargetIds: string[] = []

    if (!channelMessage) {
        return { deliveredTargetIds, skippedTargetIds }
    }

    const sendMessage = dependencies.sendMessage ?? defaultSendMessage
    const logWarning = dependencies.logWarning ?? defaultLogWarning
    const resolution = await resolveTranscriptTargetChannels({ guild, targetIds, optionId }, dependencies)
    skippedTargetIds.push(...resolution.skippedTargetIds)

    for (const target of resolution.resolvedTargets) {
        try {
            await sendMessage(target.channel, channelMessage)
            deliveredTargetIds.push(target.targetId)
        } catch {
            const warning = {
                code: "send-failed",
                optionId,
                destinationId: target.targetId,
                detail: "Failed to deliver the transcript ready message to a target channel."
            } satisfies TranscriptChannelDeliveryWarning
            skippedTargetIds.push(target.targetId)
            logWarning(warning)
        }
    }

    return { deliveredTargetIds, skippedTargetIds }
}

export async function routeTranscriptReadyMessages(
    result: TranscriptCompileResultLike,
    readyResult: TranscriptReadyMessagesLike,
    dependencies: TranscriptChannelDeliveryDependencies = {}
): Promise<TranscriptReadyMessagesLike> {
    if (!readyResult.channelMessage) {
        return readyResult
    }

    const optionId = getTicketOptionId(result.ticket)
    if (!optionId) {
        return readyResult
    }

    const logWarning = dependencies.logWarning ?? defaultLogWarning
    const resolveTargets = dependencies.resolveTargets ?? resolveEffectiveTranscriptChannelTargets

    let routing: TicketOptionTranscriptRoutingTargets | null = null
    try {
        routing = await Promise.resolve(resolveTargets(optionId))
    } catch {
        logWarning({
            code: "resolve-failed",
            optionId,
            destinationId: null,
            detail: "Failed to resolve effective transcript channel targets."
        })
        return readyResult
    }

    if (!routing) {
        return readyResult
    }

    if (routing.targets.length > 0) {
        await deliverMessageToTranscriptTargets({
            guild: result.channel.guild,
            targetIds: routing.targets,
            channelMessage: readyResult.channelMessage,
            optionId
        }, dependencies)
    }

    return stripChannelMessage(readyResult)
}
