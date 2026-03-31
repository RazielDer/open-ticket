import { api, opendiscord, utilities } from "#opendiscord"
import * as crypto from "crypto"
import * as discord from "discord.js"

import {
    BRIDGE_ACTION_ACCEPT,
    BRIDGE_ACTION_DUPLICATE,
    BRIDGE_ACTION_HARD_DENY,
    BRIDGE_ACTION_REFRESH_STATUS,
    BRIDGE_ACTION_RETRY,
    BRIDGE_ACTION_RETRY_APPLY,
    BRIDGE_CASE_CREATED_EVENT,
    BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
    BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY,
    BRIDGE_MAX_POLL_ATTEMPTS,
    BRIDGE_OPERATION_ACTION,
    BRIDGE_OPERATION_ELIGIBILITY,
    BRIDGE_OPERATION_STATUS,
    BRIDGE_POLL_INTERVAL_MS,
    BRIDGE_TRANSCRIPT_ATTACHED_EVENT,
    BridgeActionKind,
    BridgeActionResponse,
    BridgeConfigData,
    BridgeControlButtonDescriptor,
    BridgeEligibilityResponse,
    BridgeHandoffState,
    BridgeOpenTicketSnapshot,
    BridgeOptionLimitSnapshot,
    BridgeStatusResponse,
    createBridgeStateKey,
    createSignedBridgeHeaders,
    extractTranscriptUrl,
    isEligibleOptionId,
    normalizeEndpointBaseUrl,
    parseCaseCreatedAck
} from "./bridge-core"
import {
    advanceBridgePolling,
    applyBridgeAction,
    applyBridgeStatus,
    beginBridgePolling,
    buildBridgeControlDescriptor,
    clearBridgeDegraded,
    createInitialBridgeState,
    evaluateCreateTicketDecision,
    finalizeCaseCreatedEvent,
    finalizeTranscriptAttachedEvent,
    findMisconfiguredEligibleOptionIds,
    markBridgeDegraded,
    markBridgeRendered,
    normalizeActionResponse,
    normalizeBridgeState,
    normalizeEligibilityResponse,
    normalizeStatusResponse,
    prepareCaseCreatedEvent,
    prepareTranscriptAttachedEvent,
    shouldPollBridgeState,
    stopBridgePolling,
    updateTicketCreatorSnapshot
} from "./bridge-runtime"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const BRIDGE_CONFIG_ID = "ot-eotfs-bridge:config"
const BRIDGE_STATE_CATEGORY = "ot-eotfs-bridge:ticket-bridge-state"
const BRIDGE_BUTTON_RESPONDER_ID = "ot-eotfs-bridge:button"
const BRIDGE_BUTTON_PREFIX = "ot-eotfs-bridge:btn:"
const BRIDGE_MODAL_RESPONDER_ID = "ot-eotfs-bridge:modal"
const BRIDGE_MODAL_PREFIX = "ot-eotfs-bridge:modal:"
const BRIDGE_HARD_DENY_CONFIRM_ACTION = "confirm_hard_deny"
const BRIDGE_POLL_LOOP_INTERVAL_MS = 10_000

class OTEotfsBridgeConfig extends api.ODJsonConfig {
    declare data: BridgeConfigData
}

class BridgeHttpError extends Error {
    readonly status: number
    readonly responseBody: unknown

    constructor(status: number, message: string, responseBody: unknown) {
        super(message)
        this.status = status
        this.responseBody = responseBody
    }
}

class BridgeTicketStateStore {
    private readonly states = new Map<string, BridgeHandoffState>()

    restore(entries: BridgeHandoffState[]) {
        this.states.clear()
        for (const entry of entries) {
            this.upsert(entry)
        }
    }

    upsert(state: BridgeHandoffState): BridgeHandoffState {
        const normalized = normalizeBridgeState(state)
        this.states.set(createBridgeStateKey(normalized.ticketChannelId), normalized)
        return normalized
    }

    get(ticketChannelId: string): BridgeHandoffState | null {
        return this.states.get(createBridgeStateKey(ticketChannelId)) ?? null
    }

    list(): BridgeHandoffState[] {
        return [...this.states.values()]
    }
}

const bridgeTicketStateStore = new BridgeTicketStateStore()
const createEligibilityOutageMap = new Map<string, string>()
let bridgePollLoop: NodeJS.Timeout | null = null

function buildOutageKey(optionId: string, applicantDiscordUserId: string): string {
    return `${optionId}:${applicantDiscordUserId}`
}

function buttonStyleForDescriptor(style: BridgeControlButtonDescriptor["style"]): discord.ButtonStyle {
    switch (style) {
        case "danger":
            return discord.ButtonStyle.Danger
        case "primary":
            return discord.ButtonStyle.Primary
        case "secondary":
            return discord.ButtonStyle.Secondary
        default:
            return discord.ButtonStyle.Success
    }
}

function createBridgeButtonCustomId(action: string, ticketChannelId: string): string {
    return `${BRIDGE_BUTTON_PREFIX}${action}:${ticketChannelId}`
}

function createBridgeModalCustomId(action: string, ticketChannelId: string): string {
    return `${BRIDGE_MODAL_PREFIX}${action}:${ticketChannelId}`
}

function parseBridgeButtonCustomId(customId: string): { action: string; ticketChannelId: string } | null {
    if (!customId.startsWith(BRIDGE_BUTTON_PREFIX)) return null
    const parts = customId.slice(BRIDGE_BUTTON_PREFIX.length).split(":")
    if (parts.length != 2) return null
    const [action, ticketChannelId] = parts
    if (!action || !ticketChannelId) return null
    return { action, ticketChannelId }
}

function parseBridgeModalCustomId(customId: string): { action: string; ticketChannelId: string } | null {
    if (!customId.startsWith(BRIDGE_MODAL_PREFIX)) return null
    const parts = customId.slice(BRIDGE_MODAL_PREFIX.length).split(":")
    if (parts.length != 2) return null
    const [action, ticketChannelId] = parts
    if (!action || !ticketChannelId) return null
    return { action, ticketChannelId }
}

function buildControlMessage(state: BridgeHandoffState): Pick<discord.MessageCreateOptions, "content" | "components"> {
    const descriptor = buildBridgeControlDescriptor(state)
    const row = new discord.ActionRowBuilder<discord.ButtonBuilder>()
    for (const button of descriptor.buttons) {
        row.addComponents(
            new discord.ButtonBuilder()
                .setCustomId(createBridgeButtonCustomId(button.action, state.ticketChannelId))
                .setLabel(button.label)
                .setStyle(buttonStyleForDescriptor(button.style))
                .setDisabled(button.disabled)
        )
    }
    return {
        content: descriptor.lines.join("\n"),
        components: descriptor.buttons.length > 0 ? [row] : []
    }
}

function buildRetryModal(ticketChannelId: string, retryWarning: string | null): discord.ModalBuilder {
    const input = new discord.TextInputBuilder()
        .setCustomId("critique")
        .setLabel(
            retryWarning
                ? "Player-visible critique (warning: next retry triggers long lockout)"
                : "Player-visible critique"
        )
        .setStyle(discord.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    return new discord.ModalBuilder()
        .setCustomId(createBridgeModalCustomId(BRIDGE_ACTION_RETRY, ticketChannelId))
        .setTitle("Whitelist Retry")
        .addComponents(new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(input))
}

function buildHardDenyModal(ticketChannelId: string): discord.ModalBuilder {
    const input = new discord.TextInputBuilder()
        .setCustomId("staff_reason")
        .setLabel("Staff-only hard deny rationale")
        .setStyle(discord.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    return new discord.ModalBuilder()
        .setCustomId(createBridgeModalCustomId(BRIDGE_ACTION_HARD_DENY, ticketChannelId))
        .setTitle("Whitelist Hard Deny")
        .addComponents(new discord.ActionRowBuilder<discord.TextInputBuilder>().addComponents(input))
}

function buildEphemeralReply(content: string): discord.InteractionReplyOptions {
    return {
        flags: [discord.MessageFlags.Ephemeral],
        content
    }
}

function buildDeferredReply(content: string): discord.InteractionEditReplyOptions {
    return { content }
}

function getBridgeConfig(): BridgeConfigData {
    const config = opendiscord.configs.get(BRIDGE_CONFIG_ID) as OTEotfsBridgeConfig | null
    if (!config) throw new Error("Whitelist bridge config is not loaded.")
    return config.data
}

async function restoreBridgeState() {
    const globalDatabase = opendiscord.databases.get("opendiscord:global")
    const storedEntries = await globalDatabase.getCategory(BRIDGE_STATE_CATEGORY) ?? []
    bridgeTicketStateStore.restore(storedEntries.map((entry) => entry.value as BridgeHandoffState))
}

async function persistBridgeState(state: BridgeHandoffState): Promise<BridgeHandoffState> {
    const normalized = bridgeTicketStateStore.upsert(state)
    await opendiscord.databases
        .get("opendiscord:global")
        .set(BRIDGE_STATE_CATEGORY, createBridgeStateKey(normalized.ticketChannelId), normalized)
    return normalized
}

function getTicketContext(ticket: api.ODTicket, channel: discord.GuildTextBasedChannel) {
    return {
        ticketChannelId: channel.id,
        ticketChannelName: channel.name,
        optionId: ticket.option.id.value,
        optionName: ticket.option.get("opendiscord:name").value,
        creatorDiscordUserId: getLiveTicketCreatorDiscordUserId(ticket)
    }
}

function getLiveTicketCreatorDiscordUserId(ticket: api.ODTicket): string | null {
    const creator = ticket.exists("opendiscord:opened-by") ? ticket.get("opendiscord:opened-by").value : null
    return typeof creator == "string" && creator.trim().length > 0 ? creator.trim() : null
}

async function isAuthorizedStaffParticipant(ticket: api.ODTicket, userId: string): Promise<boolean> {
    const participants = await opendiscord.tickets.getAllTicketParticipants(ticket)
    return participants?.some((participant) => participant.user.id == userId && participant.role == "admin") ?? false
}

async function getCompletedFormSnapshot(ticketChannelId: string, formId: string) {
    const service = opendiscord.plugins.classes.get("ot-ticket-forms:service") as {
        getCompletedTicketForm(ticketChannelId: string, formId: string): Promise<BridgeHandoffState | null>
    }
    return await service.getCompletedTicketForm(ticketChannelId, formId)
}

async function resolveTranscriptUrl(ticketChannelId: string): Promise<string | null> {
    const service = opendiscord.plugins.classes.get("ot-html-transcripts:service") as {
        resolveAdminTarget(target: string): Promise<{ publicUrl: string | null } | null>
    }
    return extractTranscriptUrl(await service.resolveAdminTarget(ticketChannelId))
}

function buildOperationEndpoint(config: BridgeConfigData, operation?: string): string {
    const basePath = `${normalizeEndpointBaseUrl(config.endpointBaseUrl)}/ticket-bridge/intake/whitelist/${encodeURIComponent(config.integrationId)}`
    return operation ? `${basePath}/${operation}` : basePath
}

async function postBridgeJson(
    config: BridgeConfigData,
    operation: string | null,
    payload: unknown
): Promise<unknown> {
    const endpoint = buildOperationEndpoint(config, operation ?? undefined)
    const rawBody = JSON.stringify(payload)
    const eventId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    const headers = createSignedBridgeHeaders(config.sharedSecret, timestamp, eventId, rawBody)
    const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: rawBody
    })

    let responseBody: unknown = null
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType.toLowerCase().includes("application/json")) {
        responseBody = await response.json()
    } else {
        const text = await response.text()
        responseBody = text.length > 0 ? { message: text } : null
    }

    if (!response.ok) {
        const body = responseBody && typeof responseBody == "object" ? responseBody as Record<string, unknown> : {}
        const message = typeof body.message == "string" && body.message.trim().length > 0
            ? body.message.trim()
            : `Whitelist bridge request failed with status ${response.status}.`
        throw new BridgeHttpError(response.status, message, responseBody)
    }

    return responseBody
}

async function fetchBridgeEligibility(config: BridgeConfigData, applicantDiscordUserId: string): Promise<BridgeEligibilityResponse> {
    const responseBody = await postBridgeJson(config, BRIDGE_OPERATION_ELIGIBILITY, {
        applicant_discord_user_id: Number(applicantDiscordUserId)
    })
    return normalizeEligibilityResponse(responseBody, applicantDiscordUserId)
}

async function fetchBridgeStatus(config: BridgeConfigData, sourceTicketRef: string): Promise<BridgeStatusResponse> {
    const responseBody = await postBridgeJson(config, BRIDGE_OPERATION_STATUS, {
        source_ticket_ref: sourceTicketRef
    })
    return normalizeStatusResponse(responseBody)
}

async function sendBridgeAction(
    config: BridgeConfigData,
    state: BridgeHandoffState,
    actionKind: BridgeActionKind,
    actorUserId: string,
    actorRoleIds: string[],
    sourceGuildId: string,
    critique?: string | null,
    staffReason?: string | null
): Promise<BridgeActionResponse> {
    const responseBody = await postBridgeJson(config, BRIDGE_OPERATION_ACTION, {
        action: actionKind,
        source_ticket_ref: state.sourceTicketRef,
        actor_user_id: Number(actorUserId),
        actor_role_ids: actorRoleIds.map((roleId) => Number(roleId)),
        source_guild_id: Number(sourceGuildId),
        source_lane: "staff",
        critique: critique ?? undefined,
        staff_reason: staffReason ?? undefined
    })
    return normalizeActionResponse(responseBody)
}

async function getActorRoleIds(instance: { guild: discord.Guild | null; user: discord.User; member: discord.GuildMember | null }): Promise<string[]> {
    if (instance.member) return [...instance.member.roles.cache.keys()]
    if (!instance.guild) return []
    const member = await opendiscord.client.fetchGuildMember(instance.guild, instance.user.id)
    return member ? [...member.roles.cache.keys()] : []
}

async function ensureControlMessage(
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    currentMessage: discord.Message | null = null
): Promise<discord.Message> {
    const messagePayload = buildControlMessage(state)
    if (currentMessage && currentMessage.editable) {
        await currentMessage.edit(messagePayload)
        return currentMessage
    }
    if (state.controlMessageId) {
        const existingMessage = await channel.messages.fetch(state.controlMessageId).catch(() => null)
        if (existingMessage && existingMessage.editable) {
            await existingMessage.edit(messagePayload)
            return existingMessage
        }
    }
    return await channel.send(messagePayload)
}

async function rerenderBridgeControl(
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    currentMessage: discord.Message | null = null
): Promise<BridgeHandoffState> {
    const descriptor = buildBridgeControlDescriptor(state)
    const message = await ensureControlMessage(channel, state, currentMessage)
    return await persistBridgeState(
        markBridgeRendered(state, message.id, descriptor.renderState, new Date().toISOString())
    )
}

async function closeTicketAfterSuccess(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    reason: string
): Promise<void> {
    if (ticket.get("opendiscord:closed").value) return
    await opendiscord.actions.get("opendiscord:close-ticket").run("other", {
        guild: channel.guild,
        channel,
        user: opendiscord.client.client.user,
        ticket,
        reason,
        sendMessage: true
    })
}

async function refreshBridgeStatusAndRender(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    currentMessage: discord.Message | null = null
): Promise<BridgeHandoffState> {
    const config = getBridgeConfig()
    const now = new Date().toISOString()
    let nextState = updateTicketCreatorSnapshot(state, getLiveTicketCreatorDiscordUserId(ticket), now)
    try {
        const status = await fetchBridgeStatus(config, nextState.sourceTicketRef)
        nextState = applyBridgeStatus(nextState, status, now)
        nextState = clearBridgeDegraded(nextState, now)
        if (status.status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY) nextState = beginBridgePolling(nextState, now)
        else nextState = stopBridgePolling(nextState, now)
        nextState = await rerenderBridgeControl(channel, nextState, currentMessage)
        if (status.status == BRIDGE_CASE_STATUS_ACCEPTED_APPLIED || status.apply_closeout_state == "close_ready") {
            await closeTicketAfterSuccess(ticket, channel, "Whitelist applied successfully.")
        }
        return nextState
    } catch (error) {
        const message = error instanceof Error ? error.message : "Whitelist bridge status refresh failed."
        nextState = advanceBridgePolling(markBridgeDegraded(nextState, message, now), now, message)
        return await rerenderBridgeControl(channel, nextState, currentMessage)
    }
}

async function recoverUnstagedBridgeControl(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState
): Promise<BridgeHandoffState> {
    const config = getBridgeConfig()
    const now = new Date().toISOString()
    let nextState = updateTicketCreatorSnapshot(state, getLiveTicketCreatorDiscordUserId(ticket), now)
    try {
        await fetchBridgeEligibility(config, nextState.applicantDiscordUserId)
        nextState = stopBridgePolling(clearBridgeDegraded(nextState, now), now)
    } catch (error) {
        const message = error instanceof Error ? error.message : "Whitelist bridge eligibility recovery failed."
        nextState = advanceBridgePolling(markBridgeDegraded(nextState, message, now), now, message)
    }
    return await rerenderBridgeControl(channel, nextState)
}

async function handleBridgeActionSuccess(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    currentState: BridgeHandoffState,
    actionKind: BridgeActionKind,
    result: BridgeActionResponse,
    currentMessage: discord.Message | null = null
): Promise<BridgeHandoffState> {
    const now = new Date().toISOString()
    let nextState = applyBridgeAction(
        updateTicketCreatorSnapshot(currentState, getLiveTicketCreatorDiscordUserId(ticket), now),
        result,
        now
    )
    if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY) nextState = beginBridgePolling(nextState, now)
    else nextState = stopBridgePolling(nextState, now)
    nextState = await rerenderBridgeControl(channel, nextState, currentMessage)
    if (actionKind == BRIDGE_ACTION_DUPLICATE) {
        await closeTicketAfterSuccess(ticket, channel, "Duplicate whitelist ticket closed.")
    } else if (result.close_ticket_ready || result.status == BRIDGE_CASE_STATUS_ACCEPTED_APPLIED) {
        await closeTicketAfterSuccess(ticket, channel, "Whitelist applied successfully.")
    }
    return nextState
}

function describeActionSuccess(actionKind: BridgeActionKind, result: BridgeActionResponse): string {
    switch (actionKind) {
        case BRIDGE_ACTION_ACCEPT:
            return "Whitelist accept recorded. Apply is in progress; the ticket stays open until apply reaches terminal success."
        case BRIDGE_ACTION_RETRY:
            return result.player_visible_critique
                ? "Retry recorded. The critique is visible to the applicant."
                : "Retry recorded."
        case BRIDGE_ACTION_DUPLICATE:
            return "Duplicate close recorded. Closing the ticket."
        case BRIDGE_ACTION_HARD_DENY:
            return result.approval_id
                ? `Hard deny request submitted through whitelist.workflow.deny (${result.approval_id}).`
                : "Hard deny request submitted through whitelist.workflow.deny."
        case BRIDGE_ACTION_RETRY_APPLY:
            return "Whitelist apply requeued. The ticket stays open until apply reaches terminal success."
        default:
            return "Whitelist status refreshed."
    }
}

async function performBridgeAction(
    actionKind: BridgeActionKind,
    ticketChannelId: string,
    instance: {
        guild: discord.Guild | null
        user: discord.User
        member: discord.GuildMember | null
        interaction: discord.ButtonInteraction | discord.ModalSubmitInteraction
    },
    critique: string | null = null,
    staffReason: string | null = null,
    currentMessage: discord.Message | null = null
): Promise<string> {
    const ticket = opendiscord.tickets.get(ticketChannelId)
    if (!ticket || !instance.guild) {
        throw new Error("This bridge control is no longer attached to an active ticket.")
    }
    const channel = await opendiscord.tickets.getTicketChannel(ticket)
    if (!channel) {
        throw new Error("This bridge control is no longer attached to an active ticket channel.")
    }
    const currentState = bridgeTicketStateStore.get(ticketChannelId)
    if (!currentState) {
        throw new Error("Whitelist bridge state is missing for this ticket.")
    }
    const config = getBridgeConfig()
    const actorRoleIds = await getActorRoleIds(instance)
    const result = await sendBridgeAction(
        config,
        currentState,
        actionKind,
        instance.user.id,
        actorRoleIds,
        instance.guild.id,
        critique,
        staffReason
    )
    await handleBridgeActionSuccess(ticket, channel, currentState, actionKind, result, currentMessage)
    return describeActionSuccess(actionKind, result)
}

async function repairEligibleTicketControls(): Promise<void> {
    const config = getBridgeConfig()
    const now = new Date().toISOString()
    for (const ticket of opendiscord.tickets.getFiltered((entry) => {
        if (entry.get("opendiscord:closed").value) return false
        return isEligibleOptionId(config.eligibleOptionIds, entry.option.id.value)
    })) {
        const channel = await opendiscord.tickets.getTicketChannel(ticket)
        if (!channel) continue

        const currentCreatorDiscordUserId = getLiveTicketCreatorDiscordUserId(ticket)
        let state = bridgeTicketStateStore.get(channel.id)
        if (!state) {
            const completedForm = await getCompletedFormSnapshot(channel.id, config.formId)
            const applicantDiscordUserId = (
                completedForm && typeof completedForm.applicantDiscordUserId == "string" && completedForm.applicantDiscordUserId.trim().length > 0
                    ? completedForm.applicantDiscordUserId.trim()
                    : currentCreatorDiscordUserId ?? "unknown"
            )
            state = createInitialBridgeState(
                channel.id,
                config.targetGroupKey,
                applicantDiscordUserId,
                currentCreatorDiscordUserId,
                now
            )
        } else {
            state = updateTicketCreatorSnapshot(state, currentCreatorDiscordUserId, now)
        }

        if (state.bridgeCaseId) {
            state = await refreshBridgeStatusAndRender(ticket, channel, state)
        } else if (state.degradedReason) {
            state = await recoverUnstagedBridgeControl(ticket, channel, state)
        } else {
            state = await rerenderBridgeControl(channel, state)
        }
        await persistBridgeState(state)
    }
}

async function pollBridgeStates(): Promise<void> {
    const now = new Date().toISOString()
    for (const state of bridgeTicketStateStore.list()) {
        if (!shouldPollBridgeState(state, now, BRIDGE_MAX_POLL_ATTEMPTS)) continue
        const ticket = opendiscord.tickets.get(state.ticketChannelId)
        if (!ticket || ticket.get("opendiscord:closed").value) continue
        const channel = await opendiscord.tickets.getTicketChannel(ticket)
        if (!channel) continue
        if (state.bridgeCaseId) {
            await refreshBridgeStatusAndRender(ticket, channel, advanceBridgePolling(state, now, null))
        } else if (state.degradedReason) {
            await recoverUnstagedBridgeControl(ticket, channel, advanceBridgePolling(state, now, null))
        }
    }
}

function ensureBridgePollLoop() {
    if (bridgePollLoop) clearInterval(bridgePollLoop)
    bridgePollLoop = setInterval(() => {
        void pollBridgeStates()
    }, BRIDGE_POLL_LOOP_INTERVAL_MS)
}

function logMisconfiguredEligibleOptions(config: BridgeConfigData) {
    const snapshots: BridgeOptionLimitSnapshot[] = config.eligibleOptionIds.map((optionId) => {
        const option = opendiscord.options.get(optionId)
        return {
            optionId,
            limitsEnabled: option?.get("opendiscord:limits-enabled")?.value === true,
            userMaximum: option?.get("opendiscord:limits-maximum-user")?.value != null
                ? Number(option.get("opendiscord:limits-maximum-user")?.value ?? 0)
                : null
        }
    })
    const misconfigured = findMisconfiguredEligibleOptionIds(snapshots)
    if (misconfigured.length < 1) return
    opendiscord.log(
        "Whitelist bridge warning: eligible options should be configured with userMaximum=1. Fallback live-ticket enforcement remains active.",
        "plugin",
        misconfigured.map((optionId) => ({ key: "option", value: optionId }))
    )
}

async function replyInteraction(
    interaction: discord.ButtonInteraction | discord.ModalSubmitInteraction,
    content: string
): Promise<void> {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply(buildDeferredReply(content))
    } else {
        await interaction.reply(buildEphemeralReply(content))
    }
}

opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(new OTEotfsBridgeConfig(BRIDGE_CONFIG_ID, "config.json", "./plugins/ot-eotfs-bridge/"))
})

opendiscord.events.get("onCheckerLoad").listen((checkers) => {
    const config = opendiscord.configs.get(BRIDGE_CONFIG_ID)
    if (!config) return
    const structure = new api.ODCheckerObjectStructure("ot-eotfs-bridge:config", {
        children: [
            { key: "integrationId", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:integration-id", { minLength: 1, maxLength: 128 }) },
            { key: "endpointBaseUrl", optional: false, priority: 0, checker: new api.ODCheckerCustomStructure_UrlString("ot-eotfs-bridge:config:endpoint-base-url", false, { allowHttp: true }) },
            { key: "sharedSecret", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:shared-secret", { minLength: 1, maxLength: 512 }) },
            {
                key: "eligibleOptionIds",
                optional: false,
                priority: 0,
                checker: new api.ODCheckerArrayStructure("ot-eotfs-bridge:config:eligible-option-ids", {
                    minLength: 1,
                    allowedTypes: ["string"],
                    propertyChecker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:eligible-option-id", { minLength: 1, maxLength: 128 })
                })
            },
            { key: "formId", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:form-id", { minLength: 1, maxLength: 128 }) },
            { key: "targetGroupKey", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:target-group-key", { minLength: 1, maxLength: 128 }) }
        ]
    })

    checkers.add(new api.ODChecker("ot-eotfs-bridge:config", checkers.storage, 0, config, structure))
})

opendiscord.events.get("afterActionsLoaded").listen((actions) => {
    actions.get("opendiscord:create-ticket-permissions").workers.add([
        new api.ODWorker("ot-eotfs-bridge:create-ticket-eligibility", 6, async (instance, params, source, cancel) => {
            void source
            const config = getBridgeConfig()
            const optionId = params.option.id.value
            const applicantDiscordUserId = params.user.id
            if (!isEligibleOptionId(config.eligibleOptionIds, optionId)) return

            const openTickets: BridgeOpenTicketSnapshot[] = opendiscord.tickets.getFiltered((ticket) => {
                if (ticket.get("opendiscord:closed").value) return false
                return isEligibleOptionId(config.eligibleOptionIds, ticket.option.id.value)
            }).map((ticket) => ({
                ticketChannelId: ticket.id.value,
                optionId: ticket.option.id.value,
                creatorDiscordUserId: getLiveTicketCreatorDiscordUserId(ticket),
                closed: ticket.get("opendiscord:closed").value === true
            }))

            let eligibility: BridgeEligibilityResponse | null = null
            let degradedReason: string | null = null
            const outageKey = buildOutageKey(optionId, applicantDiscordUserId)
            try {
                eligibility = await fetchBridgeEligibility(config, applicantDiscordUserId)
                createEligibilityOutageMap.delete(outageKey)
            } catch (error) {
                degradedReason = error instanceof Error ? error.message : "Whitelist bridge eligibility is unavailable."
                createEligibilityOutageMap.set(outageKey, degradedReason)
                opendiscord.log("Whitelist bridge eligibility check failed open during ticket creation.", "plugin", [
                    { key: "option", value: optionId },
                    { key: "userid", value: applicantDiscordUserId, hidden: true },
                    { key: "error", value: degradedReason }
                ])
            }

            const decision = evaluateCreateTicketDecision(
                optionId,
                config.eligibleOptionIds,
                applicantDiscordUserId,
                openTickets,
                eligibility,
                degradedReason
            )
            if (!decision.allow) {
                instance.valid = false
                instance.reason = "custom"
                instance.customReason = decision.reason ?? "You cannot create this ticket right now."
                return cancel()
            }
        })
    ])
})

opendiscord.events.get("afterCodeExecuted").listen(async () => {
    await restoreBridgeState()
    ensureBridgePollLoop()
    const config = getBridgeConfig()
    logMisconfiguredEligibleOptions(config)
    await repairEligibleTicketControls()
    opendiscord.log("Plugin \"ot-eotfs-bridge\" restored adjudication bridge state.", "plugin")
})

opendiscord.events.get("afterTicketCreated").listen(async (ticket, creator, channel) => {
    const config = getBridgeConfig()
    if (!isEligibleOptionId(config.eligibleOptionIds, ticket.option.id.value)) return

    const now = new Date().toISOString()
    let state = createInitialBridgeState(channel.id, config.targetGroupKey, creator.id, creator.id, now)
    const outageKey = buildOutageKey(ticket.option.id.value, creator.id)
    const degradedReason = createEligibilityOutageMap.get(outageKey) ?? null
    createEligibilityOutageMap.delete(outageKey)
    if (degradedReason) {
        state = beginBridgePolling(markBridgeDegraded(state, degradedReason, now), now)
    }
    state = await rerenderBridgeControl(channel, state)

    opendiscord.log("Whitelist bridge control message posted.", "plugin", [
        { key: "channel", value: channel.name },
        { key: "channelid", value: channel.id, hidden: true },
        { key: "creatorid", value: creator.id, hidden: true },
        { key: "degraded", value: degradedReason ? "true" : "false" }
    ])
})

opendiscord.events.get("onButtonResponderLoad").listen((buttons) => {
    buttons.add(new api.ODButtonResponder(BRIDGE_BUTTON_RESPONDER_ID, /^ot-eotfs-bridge:btn:/))
    const responder = opendiscord.responders.buttons.get(BRIDGE_BUTTON_RESPONDER_ID)
    if (!responder) return
    responder.workers.add(new api.ODWorker(BRIDGE_BUTTON_RESPONDER_ID, 0, async (instance, params, source, cancel) => {
        void params
        void source
        const parsed = parseBridgeButtonCustomId(instance.interaction.customId)
        if (!parsed) return cancel()
        const { action, ticketChannelId } = parsed
        const ticket = opendiscord.tickets.get(ticketChannelId)
        if (!ticket || !instance.guild || !instance.channel.isTextBased()) {
            await replyInteraction(instance.interaction, "This bridge control is no longer attached to an active ticket.")
            instance.didReply = true
            return cancel()
        }

        if (!await isAuthorizedStaffParticipant(ticket, instance.user.id)) {
            await replyInteraction(instance.interaction, "Only OT staff/admin participants can use whitelist adjudication controls.")
            instance.didReply = true
            return cancel()
        }

        const config = getBridgeConfig()
        const channel = instance.channel as discord.GuildTextBasedChannel
        const currentState = bridgeTicketStateStore.get(ticketChannelId)

        if (action == "send") {
            await instance.defer("reply", true)
            const ticketContext = getTicketContext(ticket, channel)
            const completedForm = await getCompletedFormSnapshot(ticketChannelId, config.formId)
            const prepared = prepareCaseCreatedEvent(ticketContext, completedForm as never, instance.user.id, config.targetGroupKey, currentState)
            if (prepared.status == "already-bridged") {
                await refreshBridgeStatusAndRender(ticket, channel, prepared.state, instance.message)
                await instance.interaction.editReply(buildDeferredReply(`This ticket is already staged as \`${prepared.state.ticketRef}\` (case \`${prepared.state.bridgeCaseId}\`).`))
                return cancel()
            }
            if (prepared.status == "missing-form" || prepared.status == "invalid-form") {
                await instance.interaction.editReply(buildDeferredReply(prepared.message))
                return cancel()
            }

            try {
                const responseBody = await postBridgeJson(config, null, prepared.payload)
                const ack = parseCaseCreatedAck(responseBody, prepared.payload.source_ticket_ref)
                let nextState = finalizeCaseCreatedEvent(
                    ticketChannelId,
                    config.targetGroupKey,
                    crypto.randomUUID(),
                    new Date().toISOString(),
                    ack,
                    prepared.payload.source_creator_discord_user_id,
                    ticketContext.creatorDiscordUserId
                )
                if (currentState) {
                    nextState = {
                        ...nextState,
                        controlMessageId: currentState.controlMessageId,
                        renderVersion: currentState.renderVersion,
                        lastRenderedState: currentState.lastRenderedState,
                        transcriptEventId: currentState.transcriptEventId,
                        transcriptUrl: currentState.transcriptUrl,
                        transcriptStatus: currentState.transcriptStatus
                    }
                }
                nextState = await refreshBridgeStatusAndRender(ticket, channel, nextState, instance.message)
                await instance.interaction.editReply(buildDeferredReply(
                    ack.duplicate
                        ? `Whitelist review already exists as \`${nextState.ticketRef}\` (case \`${nextState.bridgeCaseId}\`).`
                        : `Sent to whitelist review as \`${nextState.ticketRef}\` (case \`${nextState.bridgeCaseId}\`).`
                ))
            } catch (error) {
                const message = error instanceof Error ? error.message : "Unable to send the whitelist bridge request."
                if (currentState) {
                    await rerenderBridgeControl(channel, markBridgeDegraded(currentState, message, new Date().toISOString()), instance.message)
                }
                await instance.interaction.editReply(buildDeferredReply(message))
            }
            return cancel()
        }

        if (!currentState) {
            await replyInteraction(instance.interaction, "Whitelist bridge state is missing for this ticket.")
            instance.didReply = true
            return cancel()
        }

        if (action == "retry") {
            const status = currentState.lastStatus ?? await fetchBridgeStatus(config, currentState.sourceTicketRef)
            const modal = buildRetryModal(ticketChannelId, status.action_availability.retry_warning)
            await instance.interaction.showModal(modal)
            instance.didReply = true
            return cancel()
        }

        if (action == "hard_deny_review") {
            try {
                const status = await fetchBridgeStatus(config, currentState.sourceTicketRef)
                await rerenderBridgeControl(channel, applyBridgeStatus(currentState, status, new Date().toISOString()), instance.message)
                const targetLines = status.reviewed_hard_deny_targets.length > 0
                    ? status.reviewed_hard_deny_targets.map((target) => `- \`${target}\``)
                    : ["- `(none returned)`"]
                const reviewRow = new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
                    new discord.ButtonBuilder()
                        .setCustomId(createBridgeButtonCustomId(BRIDGE_HARD_DENY_CONFIRM_ACTION, ticketChannelId))
                        .setLabel("Confirm Hard Deny")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setDisabled(status.action_availability.hard_deny !== true)
                )
                await instance.interaction.reply({
                    flags: [discord.MessageFlags.Ephemeral],
                    content: [
                        "Review the server-computed hard deny target list before submitting the staff-only rationale:",
                        ...targetLines
                    ].join("\n"),
                    components: [reviewRow]
                })
                instance.didReply = true
            } catch (error) {
                await replyInteraction(instance.interaction, error instanceof Error ? error.message : "Unable to review the hard deny target list.")
                instance.didReply = true
            }
            return cancel()
        }

        if (action == BRIDGE_HARD_DENY_CONFIRM_ACTION) {
            await instance.interaction.showModal(buildHardDenyModal(ticketChannelId))
            instance.didReply = true
            return cancel()
        }

        await instance.defer("reply", true)
        try {
            const actionKind = action as BridgeActionKind
            const successMessage = await performBridgeAction(actionKind, ticketChannelId, instance, null, null, instance.message)
            await instance.interaction.editReply(buildDeferredReply(successMessage))
        } catch (error) {
            if (error instanceof BridgeHttpError && error.status < 500) {
                await instance.interaction.editReply(buildDeferredReply(error.message))
            } else {
                await rerenderBridgeControl(channel, markBridgeDegraded(currentState, error instanceof Error ? error.message : "Whitelist bridge action failed.", new Date().toISOString()), instance.message)
                await instance.interaction.editReply(buildDeferredReply(error instanceof Error ? error.message : "Whitelist bridge action failed."))
            }
        }
    }))
})

opendiscord.events.get("onModalResponderLoad").listen((modals) => {
    modals.add(new api.ODModalResponder(BRIDGE_MODAL_RESPONDER_ID, /^ot-eotfs-bridge:modal:/))
    const responder = opendiscord.responders.modals.get(BRIDGE_MODAL_RESPONDER_ID)
    if (!responder) return
    responder.workers.add(new api.ODWorker(BRIDGE_MODAL_RESPONDER_ID, 0, async (instance, params, source, cancel) => {
        void params
        void source
        const parsed = parseBridgeModalCustomId(instance.interaction.customId)
        if (!parsed) return cancel()
        const { action, ticketChannelId } = parsed
        await instance.defer("reply", true)
        try {
            if (action == BRIDGE_ACTION_RETRY) {
                const critique = instance.values.getTextField("critique", true)
                const successMessage = await performBridgeAction(BRIDGE_ACTION_RETRY, ticketChannelId, instance, critique, null)
                await instance.interaction.editReply(buildDeferredReply(successMessage))
                return cancel()
            }
            if (action == BRIDGE_ACTION_HARD_DENY) {
                const staffReason = instance.values.getTextField("staff_reason", true)
                const successMessage = await performBridgeAction(BRIDGE_ACTION_HARD_DENY, ticketChannelId, instance, null, staffReason)
                await instance.interaction.editReply(buildDeferredReply(successMessage))
                return cancel()
            }
            await instance.interaction.editReply(buildDeferredReply("Unsupported whitelist bridge modal action."))
        } catch (error) {
            await instance.interaction.editReply(buildDeferredReply(error instanceof Error ? error.message : "Whitelist bridge modal action failed."))
        }
    }))
})

opendiscord.events.get("afterTranscriptReady").listen(async (transcripts, ticket, channel, user) => {
    void transcripts
    void user
    const config = getBridgeConfig()
    const existingState = bridgeTicketStateStore.get(channel.id)
    const transcriptUrl = await resolveTranscriptUrl(channel.id)
    const prepared = prepareTranscriptAttachedEvent(channel.id, transcriptUrl, existingState)

    if (prepared.status != "ready" || !existingState) {
        return
    }

    try {
        await postBridgeJson(config, null, prepared.payload)
        const nextState = finalizeTranscriptAttachedEvent(existingState, crypto.randomUUID(), prepared.payload.transcript_url, new Date().toISOString())
        await refreshBridgeStatusAndRender(ticket, channel, nextState)
        opendiscord.log("Whitelist bridge transcript_attached sent.", "plugin", [
            { key: "channelid", value: channel.id, hidden: true },
            { key: "ticket_ref", value: nextState.ticketRef },
            { key: "case_id", value: nextState.bridgeCaseId ?? "unknown" }
        ])
    } catch (error) {
        const degradedState = markBridgeDegraded(existingState, error instanceof Error ? error.message : "Transcript bridge update failed.", new Date().toISOString())
        await rerenderBridgeControl(channel, degradedState)
        opendiscord.log("Whitelist bridge transcript_attached failed.", "plugin", [
            { key: "channelid", value: channel.id, hidden: true },
            { key: "error", value: error instanceof Error ? error.message : "Unknown error" }
        ])
    }
})
