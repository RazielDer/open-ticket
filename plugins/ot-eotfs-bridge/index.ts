import { api, opendiscord, utilities } from "#opendiscord"
import * as crypto from "crypto"
import * as discord from "discord.js"
import type { OTFollowUpsMessageData } from "../ot-followups"

import {
    BRIDGE_ACTION_ACCEPT,
    BRIDGE_ACTION_DUPLICATE,
    BRIDGE_ACTION_HARD_DENY,
    BRIDGE_ACTION_REFRESH_REVIEW_PACKET,
    BRIDGE_ACTION_REFRESH_STATUS,
    BRIDGE_ACTION_RETRY,
    BRIDGE_ACTION_RETRY_APPLY,
    BRIDGE_CASE_CREATED_EVENT,
    BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
    BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
    BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY,
    BRIDGE_CASE_STATUS_PENDING_REVIEW,
    BRIDGE_CASE_STATUS_RETRY_DENIED,
    BRIDGE_MAX_POLL_ATTEMPTS,
    BRIDGE_OPERATION_ACTION,
    BRIDGE_OPERATION_ELIGIBILITY,
    BRIDGE_OPERATION_STATUS,
    BRIDGE_POLL_INTERVAL_MS,
    BRIDGE_TRANSCRIPT_ATTACHED_EVENT,
    BridgeActionKind,
    BridgeActionResponse,
    BridgeCompletedFormSnapshot,
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
    isBridgeActorAuthorized,
    isEligibleOptionId,
    normalizeAcceptedRulesPasswords,
    normalizeEndpointBaseUrl,
    parseCaseCreatedAck
} from "./bridge-core"
import { findUnresolvedBridgeAuthorizedRoleIds } from "../ot-local-runtime-config/service/bridge-role-config"
import {
    advanceBridgePolling,
    applyBridgeAction,
    applyBridgeStatus,
    buildBridgeControlEmbedPresentation,
    beginBridgePolling,
    buildBridgeControlDescriptor,
    clearBridgeDegraded,
    createInitialBridgeState,
    evaluateCreateTicketDecision,
    finalizeCaseCreatedEvent,
    finalizeTranscriptAttachedEvent,
    findMisconfiguredEligibleOptionIds,
    isReviewableBridgeStatus,
    markBridgeDegraded,
    markBridgeRendered,
    normalizeActionResponse,
    normalizeBridgeState,
    normalizeEligibilityResponse,
    normalizeStatusResponse,
    prepareCaseCreatedEvent,
    prepareTranscriptAttachedEvent,
    shouldRecreateBridgeControlForPlacement,
    shouldPollBridgeState,
    stopBridgePolling,
    updateTicketCreatorSnapshot
} from "./bridge-runtime"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const BRIDGE_CONFIG_ID = "ot-eotfs-bridge:config"
const BRIDGE_SERVICE_ID = "ot-eotfs-bridge:service"
const BRIDGE_PROVIDER_ID = "ot-eotfs-bridge"
const WHITELIST_INTEGRATION_PROFILE_ID = "eotfs-whitelist"
const BRIDGE_STATE_CATEGORY = "ot-eotfs-bridge:ticket-bridge-state"
const BRIDGE_BUTTON_RESPONDER_ID = "ot-eotfs-bridge:button"
const BRIDGE_BUTTON_PREFIX = "ot-eotfs-bridge:btn:"
const BRIDGE_MODAL_RESPONDER_ID = "ot-eotfs-bridge:modal"
const BRIDGE_MODAL_PREFIX = "ot-eotfs-bridge:modal:"
const BRIDGE_HARD_DENY_CONFIRM_ACTION = "confirm_hard_deny"
const BRIDGE_POLL_LOOP_INTERVAL_MS = 10_000
const APPLICANT_START_FORM_BUTTON_PREFIX = "ot-ticket-forms:sb_"
const WHITELIST_PRESENTATION_STACK_VERSION = 2
const DISCORD_SNOWFLAKE_RE = /^\d{17,20}$/
type BridgeDashboardLockedAction =
    "claim"|"unclaim"|"assign"|"escalate"|"move"|"transfer"|"add-participant"|"remove-participant"|"set-priority"|"set-topic"|"close"|"reopen"|"delete"|"pin"|"unpin"|"rename"|"refresh"|
    "request-close"|"cancel-close-request"|"approve-close-request"|"dismiss-close-request"|"set-awaiting-user"|"clear-awaiting-user"

class OTEotfsBridgeConfig extends api.ODJsonConfig {
    declare data: BridgeConfigData
}

class OTEotfsBridgeService extends api.ODManagerData {
    constructor(id: api.ODValidId = BRIDGE_SERVICE_ID) {
        super(id)
    }

    resolveApplicantLifecycleState(ticketChannelId: string): "unsubmitted" | "submitted" | "retry_reopened" | "locked" {
        return resolveBridgeApplicantLifecycleState(ticketChannelId)
    }

    canApplicantEdit(ticketChannelId: string): boolean {
        const lifecycleState = this.resolveApplicantLifecycleState(ticketChannelId)
        return lifecycleState == "unsubmitted" || lifecycleState == "retry_reopened"
    }

    async syncReviewableDraftUpdate(ticketChannelId: string): Promise<void> {
        await syncTicketPresentation(ticketChannelId)
    }

    async submitApplicantReview(ticketChannelId: string, applicantDiscordUserId: string): Promise<string> {
        return await submitApplicantReview(ticketChannelId, applicantDiscordUserId)
    }

    async syncTicketPresentation(ticketChannelId: string): Promise<void> {
        await syncTicketPresentation(ticketChannelId)
    }

    ownsTicketFollowups(optionId: string): boolean {
        const profileId = getRuntimeOptionIntegrationProfileId(optionId)
        if (profileId) return isBridgeIntegrationProfile(profileId)
        return isEligibleOptionId(getBridgeConfig().eligibleOptionIds, optionId)
    }

    async getDashboardTicketLockState(ticketId: string): Promise<{
        providerId: string
        title: string
        message: string
        lockedActions: BridgeDashboardLockedAction[]
    } | null> {
        const state = bridgeTicketStateStore.get(ticketId)
        if (!state || !state.bridgeCaseId) return null

        const lifecycleState = this.resolveApplicantLifecycleState(ticketId)
        const lockedActions: BridgeDashboardLockedAction[] = lifecycleState == "submitted" || lifecycleState == "locked"
            ? ["escalate","move","transfer","close","reopen","delete","request-close","cancel-close-request","approve-close-request","dismiss-close-request","set-awaiting-user","clear-awaiting-user"]
            : []
        if (lockedActions.length < 1) return null

        return {
            providerId: "ot-eotfs-bridge",
            title: "Whitelist bridge",
            message: "This ticket is owned by the whitelist bridge lifecycle. Bridge-owned terminal and route actions stay disabled in the dashboard.",
            lockedActions
        }
    }
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

function resolveBridgeApplicantLifecycleState(ticketChannelId: string): "unsubmitted" | "submitted" | "retry_reopened" | "locked" {
    const state = bridgeTicketStateStore.get(ticketChannelId)
    if (!state || !state.bridgeCaseId) return "unsubmitted"
    const status = state.lastStatus?.status ?? null
    if (status == BRIDGE_CASE_STATUS_RETRY_DENIED) return "retry_reopened"
    if (status == BRIDGE_CASE_STATUS_PENDING_REVIEW) return "submitted"
    return "locked"
}

function getRuntimeOptionIntegrationProfileId(optionId: string): string {
    const option = opendiscord.options.get(optionId)
    const value = option?.get?.("opendiscord:integration-profile")?.value
    return typeof value == "string" ? value.trim() : ""
}

function getIntegrationProfilesConfig(): api.TicketIntegrationProfile[] {
    const config = opendiscord.configs.get("opendiscord:integration-profiles") as { data?: unknown } | null
    const data = Array.isArray(config?.data) ? config.data : []
    return data
        .filter((profile): profile is Record<string, unknown> => Boolean(profile) && typeof profile == "object" && !Array.isArray(profile))
        .map((profile) => ({
            id: typeof profile.id == "string" ? profile.id.trim() : "",
            providerId: typeof profile.providerId == "string" ? profile.providerId.trim() : "",
            label: typeof profile.label == "string" ? profile.label.trim() : "",
            enabled: profile.enabled === true,
            settings: profile.settings && typeof profile.settings == "object" && !Array.isArray(profile.settings) ? profile.settings as Record<string, unknown> : {}
        }))
        .filter((profile) => profile.id.length > 0)
}

function isBridgeIntegrationProfile(profileId: string): boolean {
    if (profileId == WHITELIST_INTEGRATION_PROFILE_ID || profileId == "ot-eotfs-bridge:legacy") return true
    const profile = getIntegrationProfilesConfig().find((entry) => entry.id == profileId)
    return profile?.providerId == BRIDGE_PROVIDER_ID
}

function resolveBridgeProfileForOption(optionId: string): api.TicketIntegrationProfile | null {
    const profileId = getRuntimeOptionIntegrationProfileId(optionId)
    if (!profileId) return null
    const profile = getIntegrationProfilesConfig().find((entry) => entry.id == profileId) ?? null
    return profile?.providerId == BRIDGE_PROVIDER_ID ? profile : null
}

function parseStringArraySetting(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.map((entry) => typeof entry == "string" ? entry.trim() : "").filter(Boolean)
}

function parseNullableStringSetting(value: unknown): string | null {
    return typeof value == "string" && value.trim().length > 0 ? value.trim() : null
}

function parseNumberSetting(value: unknown, fallback: number): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeBridgeFormContractSetting(value: unknown, fallback: BridgeConfigData["formContract"]): BridgeConfigData["formContract"] {
    const input = value && typeof value == "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
    const acknowledgements = Array.isArray(input.requiredAcknowledgementPositions)
        ? input.requiredAcknowledgementPositions.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry) && entry > 0)
        : fallback.requiredAcknowledgementPositions
    return {
        discordUsernamePosition: parseNumberSetting(input.discordUsernamePosition, fallback.discordUsernamePosition),
        alderonIdsPosition: parseNumberSetting(input.alderonIdsPosition, fallback.alderonIdsPosition),
        rulesPasswordPosition: parseNumberSetting(input.rulesPasswordPosition, fallback.rulesPasswordPosition),
        requiredAcknowledgementPositions: acknowledgements
    }
}

function bridgeConfigFromSettings(settings: Record<string, unknown>, referencedOptionIds: string[] = []): BridgeConfigData {
    const fallback = getBridgeConfig()
    return {
        integrationId: typeof settings.integrationId == "string" && settings.integrationId.trim().length > 0 ? settings.integrationId.trim() : fallback.integrationId,
        endpointBaseUrl: normalizeEndpointBaseUrl(typeof settings.endpointBaseUrl == "string" ? settings.endpointBaseUrl : fallback.endpointBaseUrl),
        sharedSecret: typeof settings.sharedSecret == "string" && settings.sharedSecret.trim().length > 0 ? settings.sharedSecret.trim() : fallback.sharedSecret,
        eligibleOptionIds: parseStringArraySetting(settings.eligibleOptionIds).length > 0
            ? parseStringArraySetting(settings.eligibleOptionIds)
            : referencedOptionIds.length > 0 ? referencedOptionIds : fallback.eligibleOptionIds,
        formId: typeof settings.formId == "string" && settings.formId.trim().length > 0 ? settings.formId.trim() : fallback.formId,
        targetGroupKey: typeof settings.targetGroupKey == "string" && settings.targetGroupKey.trim().length > 0 ? settings.targetGroupKey.trim() : fallback.targetGroupKey,
        authorizedRoleIds: parseStringArraySetting(settings.authorizedRoleIds).length > 0 ? parseStringArraySetting(settings.authorizedRoleIds) : fallback.authorizedRoleIds,
        canonicalStaffGuildId: parseNullableStringSetting(settings.canonicalStaffGuildId) ?? fallback.canonicalStaffGuildId,
        formContract: normalizeBridgeFormContractSetting(settings.formContract, fallback.formContract)
    }
}

function resolveBridgeConfigForOption(optionId: string): BridgeConfigData | null {
    const profile = resolveBridgeProfileForOption(optionId)
    if (profile) return bridgeConfigFromSettings(profile.settings, [optionId])
    const legacy = getBridgeConfig()
    return isEligibleOptionId(legacy.eligibleOptionIds, optionId) ? legacy : null
}

function ticketHasCanonicalBridgeProfile(ticket: api.ODTicket): boolean {
    return Boolean(resolveBridgeProfileForOption(ticket.option.id.value))
}

function registerTicketPlatformProvider() {
    const runtimeApi = api.getTicketPlatformRuntimeApi()
    if (!runtimeApi) return
    runtimeApi.registerIntegrationProvider({
        id: BRIDGE_PROVIDER_ID,
        pluginId: "ot-eotfs-bridge",
        capabilities: ["eligibility","status","action","enrichment"],
        secretSettingKeys: ["sharedSecret"],
        validateProfileSettings({settings, referencedByOptionIds}) {
            const config = bridgeConfigFromSettings(settings, referencedByOptionIds)
            if (!config.endpointBaseUrl) throw new Error("Whitelist bridge integration profile requires endpointBaseUrl.")
            if (!config.sharedSecret) throw new Error("Whitelist bridge integration profile requires sharedSecret.")
            if (!config.formId) throw new Error("Whitelist bridge integration profile requires formId.")
            if (!config.targetGroupKey) throw new Error("Whitelist bridge integration profile requires targetGroupKey.")
        },
        async eligibility({settings, option, user}) {
            const optionId = (option as api.ODTicketOption | null)?.id?.value ?? ""
            const applicantDiscordUserId = (user as discord.User | null)?.id ?? ""
            if (!optionId || !applicantDiscordUserId) return {allow:false, reason:"Whitelist bridge eligibility context is incomplete.", degradedReason:null}

            const config = bridgeConfigFromSettings(settings, [optionId])
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
                opendiscord.log("Whitelist bridge provider eligibility check failed open during ticket creation.", "plugin", [
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
            return {
                allow: decision.allow,
                reason: decision.reason ?? null,
                degradedReason
            }
        },
        async status({ticket}) {
            const runtimeTicket = ticket as api.ODTicket | null
            if (!runtimeTicket) return {state:"unavailable", summary:"Whitelist bridge ticket context is missing.", lockedTicketActions:[...api.TICKET_PLATFORM_STOCK_ACTION_IDS], degradedReason:"Whitelist bridge ticket context is missing."}
            const state = bridgeTicketStateStore.get(runtimeTicket.id.value)
            if (!state || !state.bridgeCaseId) {
                return {state:"ready", summary:"Whitelist bridge intake is ready.", lockedTicketActions:[], degradedReason:null}
            }
            const lifecycleState = resolveBridgeApplicantLifecycleState(runtimeTicket.id.value)
            const lockedActions: BridgeDashboardLockedAction[] = lifecycleState == "submitted" || lifecycleState == "locked"
                ? ["escalate","move","transfer","close","reopen","delete","request-close","cancel-close-request","approve-close-request","dismiss-close-request","set-awaiting-user","clear-awaiting-user"]
                : []
            return {
                state: lockedActions.length > 0 ? "locked" : state.degradedReason ? "degraded" : "ready",
                summary: "Whitelist bridge lifecycle controls this ticket.",
                lockedTicketActions: lockedActions,
                degradedReason: state.degradedReason ?? null
            }
        },
        async action({actionId}) {
            return {ok:false, message:`Whitelist bridge does not expose generic action "${actionId}".`, degradedReason:null}
        },
        async enrichment({ticket}) {
            const runtimeTicket = ticket as api.ODTicket | null
            const state = runtimeTicket ? bridgeTicketStateStore.get(runtimeTicket.id.value) : null
            const details: Record<string,string> = state ? {
                lifecycle: resolveBridgeApplicantLifecycleState(state.ticketChannelId),
                sourceTicketRef: state.sourceTicketRef
            } : {}
            return {
                summary: state?.lastStatus?.status ?? null,
                details
            }
        }
    })
}

registerTicketPlatformProvider()

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

function createApplicantStartFormButtonCustomId(ticketChannelId: string): string {
    return `${APPLICANT_START_FORM_BUTTON_PREFIX}${ticketChannelId}`
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

function messageHasApplicantStartFormButton(
    message: discord.Message,
    ticketChannelId: string
): boolean {
    const customId = createApplicantStartFormButtonCustomId(ticketChannelId)
    return message.components.some((row) =>
        Array.isArray((row as { components?: readonly unknown[] }).components)
        && ((row as { components?: readonly unknown[] }).components ?? []).some((component) => {
            const typedComponent = component as { type?: number, customId?: string | null }
            return typedComponent.type == discord.ComponentType.Button && typedComponent.customId == customId
        })
    )
}

async function findApplicantStartFormMessage(
    channel: discord.GuildTextBasedChannel,
    ticketChannelId: string
): Promise<discord.Message | null> {
    let before: string | undefined
    let remaining = 500
    while (remaining > 0) {
        const fetchLimit = Math.min(remaining, 100)
        const messages = await channel.messages.fetch(before ? { limit: fetchLimit, before } : { limit: fetchLimit }).catch(() => null)
        if (!messages || messages.size < 1) return null
        const existingMessage = messages.find((message) => messageHasApplicantStartFormButton(message, ticketChannelId)) ?? null
        if (existingMessage) return existingMessage

        remaining -= messages.size
        const nextBefore = messages.lastKey()
        if (!nextBefore || messages.size < fetchLimit) return null
        before = nextBefore
    }
    return null
}

function buildControlMessage(state: BridgeHandoffState): Pick<discord.MessageCreateOptions, "content" | "embeds" | "components"> {
    const descriptor = buildBridgeControlDescriptor(state)
    const presentation = buildBridgeControlEmbedPresentation(state)
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
    const embed = new discord.EmbedBuilder()
        .setTitle(presentation.title)
        .setDescription(presentation.description)
        .setColor(presentation.color)

    if (presentation.fields.length > 0) {
        embed.addFields(...presentation.fields)
    }

    return {
        content: "",
        embeds: [embed],
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
        .setLabel("Staff-only denial reason")
        .setStyle(discord.TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
    return new discord.ModalBuilder()
        .setCustomId(createBridgeModalCustomId(BRIDGE_ACTION_HARD_DENY, ticketChannelId))
        .setTitle("Permanent Whitelist Denial")
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

function getAcceptedWhitelistRulesPasswords(): string[] {
    const rawValue = process.env.EOTFS_OT_WHITELIST_RULES_PASSWORDS ?? ""
    return normalizeAcceptedRulesPasswords(rawValue.split(","))
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

function pushCreatorIdentityAlias(
    aliases: string[],
    seen: Set<string>,
    candidate: string | null | undefined
): void {
    if (typeof candidate != "string") return
    const normalized = candidate.trim().replace(/\s+/g, " ")
    if (normalized.length < 1) return
    const dedupeKey = normalized.toLowerCase()
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    aliases.push(normalized)
}

async function resolveTicketCreatorIdentityAliases(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel
): Promise<string[] | null> {
    const creatorDiscordUserId = getLiveTicketCreatorDiscordUserId(ticket)
    if (!creatorDiscordUserId) return null

    const aliases: string[] = []
    const seen = new Set<string>()
    const lookupErrors: string[] = []

    try {
        const user = await opendiscord.client.client.users.fetch(creatorDiscordUserId)
        pushCreatorIdentityAlias(aliases, seen, user.username)
        pushCreatorIdentityAlias(aliases, seen, (user as discord.User & { globalName?: string | null }).globalName ?? null)
        pushCreatorIdentityAlias(aliases, seen, (user as discord.User & { displayName?: string | null }).displayName ?? null)
    } catch (error) {
        lookupErrors.push(`user lookup failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }

    try {
        const member = await opendiscord.client.fetchGuildMember(channel.guild, creatorDiscordUserId)
        if (member) {
            pushCreatorIdentityAlias(aliases, seen, member.user?.username)
            pushCreatorIdentityAlias(aliases, seen, (member.user as discord.User & { globalName?: string | null }).globalName ?? null)
            pushCreatorIdentityAlias(aliases, seen, member.nickname)
            pushCreatorIdentityAlias(aliases, seen, member.displayName)
        } else {
            lookupErrors.push("guild member lookup returned no member.")
        }
    } catch (error) {
        lookupErrors.push(`guild member lookup failed: ${error instanceof Error ? error.message : "unknown error"}`)
    }

    if (aliases.length > 0) return aliases

    opendiscord.log("Whitelist bridge creator identity lookup failed open during Discord username validation.", "plugin", [
        { key: "channelid", value: channel.id, hidden: true },
        { key: "creatorid", value: creatorDiscordUserId, hidden: true },
        {
            key: "error",
            value: lookupErrors.length > 0
                ? lookupErrors.join(" | ")
                : "No live Discord username aliases were available for the ticket creator."
        }
    ])
    return null
}

async function isAuthorizedAdminParticipant(ticket: api.ODTicket, userId: string): Promise<boolean> {
    const participants = await opendiscord.tickets.getAllTicketParticipants(ticket)
    return participants?.some((participant) => participant.user.id == userId && participant.role == "admin") ?? false
}

async function getLiveActorRoleIds(guild: discord.Guild, userId: string): Promise<string[]> {
    try {
        const member = await opendiscord.client.fetchGuildMember(guild, userId)
        return member ? [...member.roles.cache.keys()] : []
    } catch {
        return []
    }
}

async function getRequiredLiveActorRoleIds(guild: discord.Guild, userId: string): Promise<string[]> {
    try {
        const member = await opendiscord.client.fetchGuildMember(guild, userId)
        return member ? [...member.roles.cache.keys()] : []
    } catch {
        throw new Error("Unable to resolve canonical Discord-side whitelist permissions right now. Try again after the Discord member cache/API recovers.")
    }
}

async function getBridgeInteractionAuthorization(
    ticket: api.ODTicket,
    config: BridgeConfigData,
    guild: discord.Guild,
    userId: string
): Promise<{ authorized: boolean; actorRoleIds: string[] }> {
    const adminParticipant = await isAuthorizedAdminParticipant(ticket, userId)
    const actorRoleIds = await getLiveActorRoleIds(guild, userId)
    return {
        authorized: isBridgeActorAuthorized(adminParticipant, actorRoleIds, config.authorizedRoleIds),
        actorRoleIds
    }
}

function getBridgeAuthorizationDeniedMessage(): string {
    return "Only OT ticket admins or OT-guild members with configured whitelist bridge roles can use these whitelist review controls."
}

function isCanonicalWhitelistApplyAction(actionKind: BridgeActionKind): boolean {
    return actionKind == BRIDGE_ACTION_ACCEPT || actionKind == BRIDGE_ACTION_RETRY_APPLY
}

function getCanonicalWhitelistPermissionDeniedMessage(): string {
    return "This action requires canonical Discord-side whitelist permissions in the configured staff guild. OT ticket admin or bridge-role access only exposes the review card; it does not authorize Accept or Retry Whitelist Apply."
}

function getCanonicalStaffGuildId(config: BridgeConfigData, fallbackGuildId: string): string {
    const configured = typeof config.canonicalStaffGuildId == "string"
        ? config.canonicalStaffGuildId.trim()
        : ""
    if (configured.length < 1) return fallbackGuildId
    if (!DISCORD_SNOWFLAKE_RE.test(configured)) {
        throw new Error("Whitelist bridge canonical staff guild id is malformed. Fix canonicalStaffGuildId before using Accept or Retry Whitelist Apply.")
    }
    return configured
}

async function resolveGuildById(guildId: string): Promise<discord.Guild | null> {
    const cached = opendiscord.client.client.guilds.cache.get(guildId)
    if (cached) return cached
    return await opendiscord.client.client.guilds.fetch(guildId).catch(() => null)
}

async function resolveBridgeActionAuthorizationContext(
    actionKind: BridgeActionKind,
    config: BridgeConfigData,
    interactionGuild: discord.Guild,
    actorUserId: string,
    otActorRoleIds: string[]
): Promise<{ actorRoleIds: string[]; sourceGuildId: string }> {
    if (!isCanonicalWhitelistApplyAction(actionKind)) {
        return {
            actorRoleIds: otActorRoleIds,
            sourceGuildId: interactionGuild.id
        }
    }

    const canonicalStaffGuildId = getCanonicalStaffGuildId(config, interactionGuild.id)
    const canonicalStaffGuild = canonicalStaffGuildId == interactionGuild.id
        ? interactionGuild
        : await resolveGuildById(canonicalStaffGuildId)
    if (!canonicalStaffGuild) {
        throw new Error("Unable to resolve the configured canonical staff guild for Accept or Retry Whitelist Apply.")
    }

    return {
        actorRoleIds: await getRequiredLiveActorRoleIds(canonicalStaffGuild, actorUserId),
        sourceGuildId: canonicalStaffGuild.id
    }
}

type OTFormsBridgeSubmissionService = {
    buildSubmissionCandidate(
        ticketChannelId: string,
        formId: string,
        completedAt?: string
    ): Promise<BridgeCompletedFormSnapshot | null>
    getCompletedTicketForm(ticketChannelId: string, formId: string): Promise<BridgeCompletedFormSnapshot | null>
    hideSubmittedTicketFormMessage(ticketChannelId: string, formId: string): Promise<boolean>
    refreshTicketStartFormMessage(
        ticketChannelId: string,
        formId: string,
        options?: { forceRecreate?: boolean; placementRepairAfterMessageTimestamp?: number | null }
    ): Promise<{ messageId: string | null; createdTimestamp: number | null }>
    storeCompletedTicketForm(snapshot: BridgeCompletedFormSnapshot): Promise<BridgeCompletedFormSnapshot>
    syncSubmittedTicketFormMessage(
        ticketChannelId: string,
        formId: string,
        options?: { forceRecreate?: boolean; placementRepairAfterMessageTimestamp?: number | null }
    ): Promise<{ messageId: string | null; createdTimestamp: number | null }>
}

function getTicketFormsService(): OTFormsBridgeSubmissionService {
    return opendiscord.plugins.classes.get("ot-ticket-forms:service") as OTFormsBridgeSubmissionService
}

async function getCompletedFormSnapshot(ticketChannelId: string, formId: string) {
    const service = getTicketFormsService()
    return await service.getCompletedTicketForm(ticketChannelId, formId)
}

type OTHtmlTranscriptBridgeService = {
    resolveAdminTarget(target: string): Promise<{ publicUrl: string | null } | null>
    compileWhitelistBridgeTranscript(
        ticket: api.ODTicket,
        channel: discord.GuildTextBasedChannel,
        user: discord.User
    ): Promise<{
        success: boolean
        message: string
        transcriptUrl: string | null
    }>
}

function getTranscriptBridgeService(): OTHtmlTranscriptBridgeService {
    return opendiscord.plugins.classes.get("ot-html-transcripts:service") as OTHtmlTranscriptBridgeService
}

async function resolveTranscriptUrl(ticketChannelId: string): Promise<string | null> {
    const service = getTranscriptBridgeService()
    return extractTranscriptUrl(await service.resolveAdminTarget(ticketChannelId))
}

async function resolveTranscriptCompileActor(applicantDiscordUserId: string): Promise<discord.User> {
    const fetchedUser = await opendiscord.client.client.users.fetch(applicantDiscordUserId).catch(() => null)
    if (fetchedUser) return fetchedUser
    if (opendiscord.client.client.user) return opendiscord.client.client.user
    throw new Error("Whitelist review cannot start until the transcript actor can be resolved.")
}

function normalizeComparableMessageContent(value: string | null | undefined): string {
    return typeof value == "string" ? value.trim() : ""
}

function normalizeComparableEmbed(embed: unknown): Record<string, unknown> {
    const serialized = (
        embed
        && typeof embed == "object"
        && typeof (embed as { toJSON?: () => unknown }).toJSON == "function"
    )
        ? (embed as { toJSON: () => unknown }).toJSON()
        : embed
    const record = serialized && typeof serialized == "object"
        ? serialized as Record<string, unknown>
        : {}
    const author = record.author && typeof record.author == "object"
        ? record.author as Record<string, unknown>
        : {}
    const footer = record.footer && typeof record.footer == "object"
        ? record.footer as Record<string, unknown>
        : {}
    const image = record.image && typeof record.image == "object"
        ? record.image as Record<string, unknown>
        : {}
    const thumbnail = record.thumbnail && typeof record.thumbnail == "object"
        ? record.thumbnail as Record<string, unknown>
        : {}
    return {
        title: typeof record.title == "string" ? record.title : "",
        description: typeof record.description == "string" ? record.description : "",
        url: typeof record.url == "string" ? record.url : "",
        color: typeof record.color == "number" ? record.color : null,
        author: typeof author.name == "string" ? author.name : "",
        footer: typeof footer.text == "string" ? footer.text : "",
        image: typeof image.url == "string" ? image.url : "",
        thumbnail: typeof thumbnail.url == "string" ? thumbnail.url : "",
        fields: Array.isArray(record.fields)
            ? record.fields.map((field) => {
                const typedField = field && typeof field == "object"
                    ? field as Record<string, unknown>
                    : {}
                return {
                    name: typeof typedField.name == "string" ? typedField.name : "",
                    value: typeof typedField.value == "string" ? typedField.value : "",
                    inline: typedField.inline === true
                }
            })
            : []
    }
}

function buildComparableMessageSignature(payload: {
    content?: string | null
    embeds?: readonly unknown[] | null
}): string {
    return JSON.stringify({
        content: normalizeComparableMessageContent(payload.content),
        embeds: (payload.embeds ?? []).map((embed) => normalizeComparableEmbed(embed))
    })
}

type ConfiguredFollowupPayload = {
    id: string
    signature: string
    payload: discord.MessageCreateOptions
}

type FollowupSyncResult = {
    state: BridgeHandoffState
    anchorTimestamp: number | null
}

async function buildConfiguredFollowupPayloads(
    ticket: api.ODTicket
): Promise<ConfiguredFollowupPayload[]> {
    try {
        const config = opendiscord.configs.get("ot-followups:config") as {
            data: Array<{ optionId: string; messages: string[] }>
        }
        const followupManager = opendiscord.plugins.classes.get("ot-followups:manager") as {
            get(id: string): { data: unknown } | undefined
        }
        const configuredIds = config.data.find((entry) => entry.optionId == ticket.option.id.value)?.messages ?? []
        const payloads: ConfiguredFollowupPayload[] = []
        for (const messageId of configuredIds) {
            const followup = followupManager.get(messageId) as { data: unknown } | undefined
            if (!followup) continue
            const built = await opendiscord.builders.messages.getSafe("ot-followups:message").build("other", {
                message: followup.data as OTFollowUpsMessageData
            })
            payloads.push({
                id: messageId,
                payload: built.message,
                signature: buildComparableMessageSignature(built.message)
            })
        }
        return payloads
    } catch {
        return []
    }
}

function getStoredFollowupMessageId(state: BridgeHandoffState, followupId: string): string | null {
    switch (followupId) {
        case "whitelist-process":
            return state.whitelistProcessMessageId
        case "whitelist-expectations":
            return state.whitelistExpectationsMessageId
        default:
            return null
    }
}

function setStoredFollowupMessageId(
    state: BridgeHandoffState,
    followupId: string,
    messageId: string | null,
    updatedAt: string
): BridgeHandoffState {
    switch (followupId) {
        case "whitelist-process":
            return {
                ...state,
                whitelistProcessMessageId: messageId,
                updatedAt
            }
        case "whitelist-expectations":
            return {
                ...state,
                whitelistExpectationsMessageId: messageId,
                updatedAt
            }
        default:
            return state
    }
}

async function collectConfiguredFollowupMatches(
    channel: discord.GuildTextBasedChannel,
    configuredPayloads: readonly ConfiguredFollowupPayload[]
): Promise<Map<string, discord.Message[]>> {
    const signatureToFollowupId = new Map(configuredPayloads.map((payload) => [payload.signature, payload.id]))
    const matchesById = new Map<string, discord.Message[]>()
    let before: string | undefined
    let remaining = 500
    while (remaining > 0) {
        const fetchLimit = Math.min(remaining, 100)
        const recentMessages = await channel.messages.fetch(before ? { limit: fetchLimit, before } : { limit: fetchLimit }).catch(() => null)
        if (!recentMessages || recentMessages.size < 1) break

        for (const message of recentMessages.values()) {
            const followupId = signatureToFollowupId.get(
                buildComparableMessageSignature({
                    content: message.content,
                    embeds: message.embeds
                })
            )
            if (!followupId) continue
            const currentMatches = matchesById.get(followupId) ?? []
            currentMatches.push(message)
            matchesById.set(followupId, currentMatches)
        }

        remaining -= recentMessages.size
        const nextBefore = recentMessages.lastKey()
        if (!nextBefore || recentMessages.size < fetchLimit) break
        before = nextBefore
    }
    return matchesById
}

async function normalizeConfiguredFollowupMessages(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    afterMessageTimestamp: number | null
): Promise<FollowupSyncResult> {
    const configuredPayloads = await buildConfiguredFollowupPayloads(ticket)
    if (configuredPayloads.length < 1) {
        return { state, anchorTimestamp: afterMessageTimestamp }
    }

    let nextState = state
    let anchorTimestamp = afterMessageTimestamp
    const matchesById = await collectConfiguredFollowupMatches(channel, configuredPayloads)

    for (const payload of configuredPayloads) {
        const matches = (matchesById.get(payload.id) ?? [])
            .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
        const canAdoptExisting = matches.length == 1
            && matches[0].createdTimestamp > (anchorTimestamp ?? Number.NEGATIVE_INFINITY)

        if (!canAdoptExisting) {
            for (const message of matches) {
                await message.delete().catch(() => null)
            }
        }

        const persistedMessage = canAdoptExisting && matches[0]
            ? await matches[0].edit(payload.payload as discord.MessageEditOptions).then(() => matches[0])
            : await channel.send(payload.payload)
        nextState = setStoredFollowupMessageId(nextState, payload.id, persistedMessage.id, new Date().toISOString())
        anchorTimestamp = persistedMessage.createdTimestamp
    }

    return {
        state: {
            ...nextState,
            presentationStackVersion: WHITELIST_PRESENTATION_STACK_VERSION,
            updatedAt: new Date().toISOString()
        },
        anchorTimestamp
    }
}

async function syncConfiguredFollowupMessages(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    afterMessageTimestamp: number | null
): Promise<FollowupSyncResult> {
    const configuredPayloads = await buildConfiguredFollowupPayloads(ticket)
    if (configuredPayloads.length < 1) {
        return { state, anchorTimestamp: afterMessageTimestamp }
    }

    let nextState = state
    let anchorTimestamp = afterMessageTimestamp
    for (const payload of configuredPayloads) {
        const storedMessageId = getStoredFollowupMessageId(nextState, payload.id)
        let existingMessage = storedMessageId
            ? await channel.messages.fetch(storedMessageId).catch(() => null)
            : null

        const persistedMessage = existingMessage && existingMessage.editable
            ? await existingMessage.edit(payload.payload as discord.MessageEditOptions).then(() => existingMessage)
            : await channel.send(payload.payload)

        nextState = setStoredFollowupMessageId(nextState, payload.id, persistedMessage.id, new Date().toISOString())
        anchorTimestamp = persistedMessage.createdTimestamp
    }

    return {
        state: {
            ...nextState,
            presentationStackVersion: WHITELIST_PRESENTATION_STACK_VERSION,
            updatedAt: new Date().toISOString()
        },
        anchorTimestamp
    }
}

function shouldRenderBridgeControl(state: BridgeHandoffState): boolean {
    return typeof state.bridgeCaseId == "string" && state.bridgeCaseId.trim().length > 0
}

async function hideBridgeControlMessage(
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    currentMessage: discord.Message | null = null
): Promise<BridgeHandoffState> {
    const existingMessage = currentMessage
        ?? (
            state.controlMessageId
                ? await channel.messages.fetch(state.controlMessageId).catch(() => null)
                : null
        )
    if (existingMessage) {
        await existingMessage.delete().catch(() => null)
    }
    if (!state.controlMessageId && !existingMessage) return state

    const descriptor = buildBridgeControlDescriptor(state)
    return {
        ...state,
        controlMessageId: null,
        lastRenderedState: descriptor.renderState,
        renderVersion: state.renderVersion + 1,
        updatedAt: new Date().toISOString()
    }
}

async function syncTicketPresentationInternal(
    ticket: api.ODTicket,
    channel: discord.GuildTextBasedChannel,
    state: BridgeHandoffState,
    currentMessage: discord.Message | null = null
): Promise<BridgeHandoffState> {
    const config = getBridgeConfig()
    const formsService = getTicketFormsService()
    let nextState = updateTicketCreatorSnapshot(state, getLiveTicketCreatorDiscordUserId(ticket), new Date().toISOString())
    const needsPlacementRepair = nextState.presentationStackVersion < WHITELIST_PRESENTATION_STACK_VERSION

    let anchorTimestamp: number | null = null
    const followupSync = needsPlacementRepair
        ? await normalizeConfiguredFollowupMessages(ticket, channel, nextState, anchorTimestamp)
        : await syncConfiguredFollowupMessages(ticket, channel, nextState, anchorTimestamp)
    nextState = followupSync.state
    anchorTimestamp = followupSync.anchorTimestamp

    if (shouldRenderBridgeControl(nextState)) {
        const submittedMessage = await formsService.syncSubmittedTicketFormMessage(channel.id, config.formId, {
            placementRepairAfterMessageTimestamp: anchorTimestamp
        }).catch(() => ({ messageId: null, createdTimestamp: null }))
        anchorTimestamp = submittedMessage.createdTimestamp ?? anchorTimestamp
    } else {
        await formsService.hideSubmittedTicketFormMessage(channel.id, config.formId).catch(() => false)
    }

    try {
        const startFormMessage = await formsService.refreshTicketStartFormMessage(channel.id, config.formId, {
            placementRepairAfterMessageTimestamp: anchorTimestamp
        })
        anchorTimestamp = startFormMessage.createdTimestamp ?? anchorTimestamp
    } catch {
        const applicantStartMessage = await findApplicantStartFormMessage(channel, channel.id)
        anchorTimestamp = applicantStartMessage?.createdTimestamp ?? anchorTimestamp
    }

    if (!shouldRenderBridgeControl(nextState)) {
        nextState = await hideBridgeControlMessage(channel, nextState, currentMessage)
        return await persistBridgeState({
            ...nextState,
            presentationStackVersion: WHITELIST_PRESENTATION_STACK_VERSION,
            updatedAt: new Date().toISOString()
        })
    }

    let controlMessage = await ensureControlMessage(channel, nextState, currentMessage)
    if (shouldRecreateBridgeControlForPlacement(controlMessage.createdTimestamp, anchorTimestamp)) {
        await controlMessage.delete().catch(() => null)
        nextState = {
            ...nextState,
            controlMessageId: null
        }
        controlMessage = await ensureControlMessage(channel, nextState)
    }
    nextState = markBridgeRendered(
        nextState,
        controlMessage.id,
        buildBridgeControlDescriptor(nextState).renderState,
        new Date().toISOString()
    )
    nextState = {
        ...nextState,
        presentationStackVersion: WHITELIST_PRESENTATION_STACK_VERSION,
        updatedAt: new Date().toISOString()
    }
    return await persistBridgeState(nextState)
}

async function syncTicketPresentation(ticketChannelId: string): Promise<void> {
    const ticket = opendiscord.tickets.get(ticketChannelId)
    if (!ticket || ticket.get("opendiscord:closed").value) return

    const channel = await opendiscord.tickets.getTicketChannel(ticket)
    if (!channel) return

    const existingState = bridgeTicketStateStore.get(ticketChannelId)
        ?? createInitialBridgeState(
            channel.id,
            getBridgeConfig().targetGroupKey,
            getLiveTicketCreatorDiscordUserId(ticket) ?? "unknown",
            getLiveTicketCreatorDiscordUserId(ticket),
            new Date().toISOString()
        )
    await syncTicketPresentationInternal(ticket, channel, existingState)
}

async function submitApplicantReview(ticketChannelId: string, applicantDiscordUserId: string): Promise<string> {
    const ticket = opendiscord.tickets.get(ticketChannelId)
    if (!ticket || ticket.get("opendiscord:closed").value) {
        throw new Error("This whitelist application is no longer attached to an active ticket.")
    }

    const channel = await opendiscord.tickets.getTicketChannel(ticket)
    if (!channel) {
        throw new Error("This whitelist application is no longer attached to an active ticket channel.")
    }

    const config = getBridgeConfig()
    const formsService = getTicketFormsService()
    const ticketContext = getTicketContext(ticket, channel)
    const submittedAt = new Date().toISOString()
    let currentState = bridgeTicketStateStore.get(ticketChannelId)
        ?? createInitialBridgeState(
            ticketChannelId,
            config.targetGroupKey,
            applicantDiscordUserId,
            ticketContext.creatorDiscordUserId,
            submittedAt
        )
    currentState = updateTicketCreatorSnapshot(currentState, ticketContext.creatorDiscordUserId, submittedAt)

    if (currentState.bridgeCaseId && !currentState.lastStatus) {
        try {
            currentState = applyBridgeStatus(
                currentState,
                await fetchBridgeStatus(config, currentState.sourceTicketRef),
                submittedAt
            )
            currentState = await persistBridgeState(currentState)
        } catch {
            // Fall through and let the guarded submit path return the user-facing error below.
        }
    }

    const submissionCandidate = await formsService.buildSubmissionCandidate(ticketChannelId, config.formId, submittedAt)
    const creatorIdentityAliases = await resolveTicketCreatorIdentityAliases(ticket, channel)
    const prepared = prepareCaseCreatedEvent(
        ticketContext,
        submissionCandidate,
        applicantDiscordUserId,
        config.targetGroupKey,
        config.formContract,
        getAcceptedWhitelistRulesPasswords(),
        currentState,
        {
            allowRefresh: currentState.lastStatus?.status == BRIDGE_CASE_STATUS_RETRY_DENIED,
            creatorIdentityAliases
        }
    )

    if (prepared.status == "missing-form" || prepared.status == "invalid-form" || prepared.status == "refresh-blocked") {
        throw new Error(prepared.message)
    }
    if (prepared.status == "already-bridged") {
        throw new Error("This whitelist application is already submitted and is waiting on staff review.")
    }
    if (!submissionCandidate) {
        throw new Error("Complete the whitelist application before submitting it for staff review.")
    }

    try {
        const transcriptService = getTranscriptBridgeService()
        const transcriptCompileActor = await resolveTranscriptCompileActor(applicantDiscordUserId)
        const transcriptCompile = await transcriptService.compileWhitelistBridgeTranscript(
            ticket,
            channel,
            transcriptCompileActor
        )
        if (!transcriptCompile.success || !transcriptCompile.transcriptUrl) {
            throw new Error(transcriptCompile.message || "Whitelist review cannot start until transcript generation succeeds.")
        }
        prepared.payload.transcript_url = transcriptCompile.transcriptUrl

        const responseBody = await postBridgeJson(config, null, prepared.payload)
        const ack = parseCaseCreatedAck(responseBody, prepared.payload.source_ticket_ref)
        await formsService.storeCompletedTicketForm(submissionCandidate)

        let nextState = finalizeCaseCreatedEvent(
            ticketChannelId,
            config.targetGroupKey,
            crypto.randomUUID(),
            new Date().toISOString(),
            ack,
            submissionCandidate.applicantDiscordUserId,
            ticketContext.creatorDiscordUserId
        )
        nextState = {
            ...nextState,
            presentationStackVersion: currentState.presentationStackVersion,
            whitelistProcessMessageId: currentState.whitelistProcessMessageId,
            whitelistExpectationsMessageId: currentState.whitelistExpectationsMessageId,
            controlMessageId: currentState.controlMessageId,
            renderVersion: currentState.renderVersion,
            lastRenderedState: currentState.lastRenderedState,
            transcriptEventId: currentState.transcriptEventId,
            transcriptUrl: currentState.transcriptUrl,
            transcriptStatus: currentState.transcriptStatus
        }
        nextState = await refreshBridgeStatusAndRender(ticket, channel, nextState)
        return currentState.lastStatus?.status == BRIDGE_CASE_STATUS_RETRY_DENIED
            ? `Application resubmitted for staff review as \`${nextState.ticketRef}\` (case \`${nextState.bridgeCaseId}\`).`
            : `Application submitted for staff review as \`${nextState.ticketRef}\` (case \`${nextState.bridgeCaseId}\`).`
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to submit the whitelist application for staff review."
        currentState = await syncTicketPresentationInternal(
            ticket,
            channel,
            markBridgeDegraded(currentState, message, new Date().toISOString())
        )
        void currentState
        throw new Error(message)
    }
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
        applicant_discord_user_id: applicantDiscordUserId
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
        actor_user_id: actorUserId,
        actor_role_ids: actorRoleIds,
        source_guild_id: sourceGuildId,
        source_lane: "staff",
        critique: critique ?? undefined,
        staff_reason: staffReason ?? undefined
    })
    return normalizeActionResponse(responseBody)
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
    const ticket = opendiscord.tickets.get(channel.id)
    if (!ticket || ticket.get("opendiscord:closed").value) {
        return await persistBridgeState(state)
    }
    return await syncTicketPresentationInternal(ticket, channel, state, currentMessage)
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
    const withOperatorWarning = (message: string): string => result.operator_warning
        ? `${message} Staff warning: ${result.operator_warning}`
        : message
    switch (actionKind) {
        case BRIDGE_ACTION_ACCEPT:
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_APPLIED || result.close_ticket_ready) {
                return withOperatorWarning(
                    "Whitelist accept recorded. Whitelist apply completed immediately and the ticket can close."
                )
            }
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY) {
                return withOperatorWarning(
                    "Whitelist accept recorded. Whitelist apply is running now and the ticket stays open until it finishes."
                )
            }
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_FAILED) {
                return withOperatorWarning(result.player_visible_apply_summary
                    ? `Whitelist accept recorded. ${result.player_visible_apply_summary}`
                    : "Whitelist accept recorded, but downstream whitelist repair is still required before the ticket can close.")
            }
            return withOperatorWarning("Whitelist accept recorded.")
        case BRIDGE_ACTION_RETRY:
            return withOperatorWarning(result.player_visible_critique
                ? "Retry recorded. The critique is visible to the applicant."
                : "Retry recorded.")
        case BRIDGE_ACTION_DUPLICATE:
            return withOperatorWarning("Duplicate close recorded. Closing the ticket.")
        case BRIDGE_ACTION_HARD_DENY:
            return withOperatorWarning(result.approval_id
                ? `Permanent denial request submitted through whitelist.workflow.deny (${result.approval_id}).`
                : "Permanent denial request submitted through whitelist.workflow.deny.")
        case BRIDGE_ACTION_RETRY_APPLY:
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_APPLIED || result.close_ticket_ready) {
                return withOperatorWarning(
                    "Whitelist apply retry completed immediately and the ticket can close."
                )
            }
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY) {
                return withOperatorWarning(
                    "Whitelist apply retry started. The ticket stays open until apply reaches terminal success."
                )
            }
            if (result.status == BRIDGE_CASE_STATUS_ACCEPTED_FAILED) {
                return withOperatorWarning(result.player_visible_apply_summary
                    ? `Whitelist apply retry ran immediately. ${result.player_visible_apply_summary}`
                    : "Whitelist apply retry ran immediately, but downstream repair is still required.")
            }
            return withOperatorWarning("Whitelist apply retry recorded.")
        default:
            return withOperatorWarning("Whitelist status refreshed.")
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
    const authorization = await getBridgeInteractionAuthorization(ticket, config, instance.guild, instance.user.id)
    if (!authorization.authorized) {
        throw new Error(getBridgeAuthorizationDeniedMessage())
    }
    const actionAuthorization = await resolveBridgeActionAuthorizationContext(
        actionKind,
        config,
        instance.guild,
        instance.user.id,
        authorization.actorRoleIds
    )
    const result = await sendBridgeAction(
        config,
        currentState,
        actionKind,
        instance.user.id,
        actionAuthorization.actorRoleIds,
        actionAuthorization.sourceGuildId,
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
        return Boolean(resolveBridgeConfigForOption(entry.option.id.value))
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

function getConfiguredOpenTicketGuildId(): string | null {
    const generalConfig = opendiscord.configs.get("opendiscord:general") as { data?: { serverId?: unknown } } | null
    const serverId = generalConfig?.data?.serverId
    return typeof serverId == "string" && serverId.trim().length > 0 ? serverId.trim() : null
}

async function logUnresolvedAuthorizedRoles(config: BridgeConfigData): Promise<void> {
    if (config.authorizedRoleIds.length < 1) return
    const guildId = getConfiguredOpenTicketGuildId()
    if (!guildId) return

    const guild = await opendiscord.client.client.guilds.fetch(guildId).catch(() => null)
    if (!guild) {
        opendiscord.log(
            "Whitelist bridge warning: unable to resolve the OT guild while validating configured whitelist bridge role ids.",
            "plugin",
            [{ key: "guildid", value: guildId, hidden: true }]
        )
        return
    }

    const resolvedRoleIds: string[] = []
    for (const roleId of config.authorizedRoleIds) {
        const role = await guild.roles.fetch(roleId).catch(() => null)
        if (role) resolvedRoleIds.push(role.id)
    }

    const unresolvedRoleIds = findUnresolvedBridgeAuthorizedRoleIds(config.authorizedRoleIds, resolvedRoleIds)
    if (unresolvedRoleIds.length < 1) return

    opendiscord.log(
        "Whitelist bridge warning: configured whitelist bridge role ids were not found in the OT guild and will fail closed until corrected.",
        "plugin",
        unresolvedRoleIds.map((roleId) => ({ key: "role", value: roleId }))
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

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
    classes.add(new OTEotfsBridgeService(BRIDGE_SERVICE_ID))
})

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
            { key: "targetGroupKey", optional: false, priority: 0, checker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:target-group-key", { minLength: 1, maxLength: 128 }) },
            {
                key: "authorizedRoleIds",
                optional: false,
                priority: 0,
                checker: new api.ODCheckerArrayStructure("ot-eotfs-bridge:config:authorized-role-ids", {
                    minLength: 0,
                    maxLength: 32,
                    allowedTypes: ["string"],
                    propertyChecker: new api.ODCheckerStringStructure("ot-eotfs-bridge:config:authorized-role-id", {
                        minLength: 17,
                        maxLength: 20,
                        regex: /^\d{17,20}$/
                    })
                })
            },
            {
                key: "formContract",
                optional: false,
                priority: 0,
                checker: new api.ODCheckerObjectStructure("ot-eotfs-bridge:config:form-contract", {
                    children: [
                        { key: "discordUsernamePosition", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-eotfs-bridge:config:discord-username-position", { min: 1, max: 100, floatAllowed: false, negativeAllowed: false }) },
                        { key: "alderonIdsPosition", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-eotfs-bridge:config:alderon-position", { min: 1, max: 100, floatAllowed: false, negativeAllowed: false }) },
                        { key: "rulesPasswordPosition", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-eotfs-bridge:config:rules-password-position", { min: 1, max: 100, floatAllowed: false, negativeAllowed: false }) },
                        {
                            key: "requiredAcknowledgementPositions",
                            optional: false,
                            priority: 0,
                            checker: new api.ODCheckerArrayStructure("ot-eotfs-bridge:config:acknowledgement-positions", {
                                minLength: 1,
                                maxLength: 25,
                                allowedTypes: ["number"],
                                propertyChecker: new api.ODCheckerNumberStructure("ot-eotfs-bridge:config:acknowledgement-position", { min: 1, max: 100, floatAllowed: false, negativeAllowed: false })
                            })
                        }
                    ]
                })
            }
        ]
    })

    checkers.add(new api.ODChecker("ot-eotfs-bridge:config", checkers.storage, 0, config, structure))
})

opendiscord.events.get("afterActionsLoaded").listen((actions) => {
    actions.get("opendiscord:create-ticket-permissions").workers.add([
        new api.ODWorker("ot-eotfs-bridge:create-ticket-eligibility", 6, async (instance, params, source, cancel) => {
            void source
            if (opendiscord.plugins.classes.exists("opendiscord:ticket-integration-service")) return
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
    await logUnresolvedAuthorizedRoles(config)
    await repairEligibleTicketControls()
    opendiscord.log("Plugin \"ot-eotfs-bridge\" restored adjudication bridge state.", "plugin")
})

opendiscord.events.get("afterTicketCreated").listen(async (ticket, creator, channel) => {
    const config = resolveBridgeConfigForOption(ticket.option.id.value)
    if (!config) return

    const now = new Date().toISOString()
    let state = createInitialBridgeState(channel.id, config.targetGroupKey, creator.id, creator.id, now)
    const outageKey = buildOutageKey(ticket.option.id.value, creator.id)
    const degradedReason = createEligibilityOutageMap.get(outageKey) ?? null
    createEligibilityOutageMap.delete(outageKey)
    if (degradedReason) {
        state = beginBridgePolling(markBridgeDegraded(state, degradedReason, now), now)
    }
    state = await rerenderBridgeControl(channel, state)

    opendiscord.log("Whitelist bridge state initialized for the ticket lifecycle.", "plugin", [
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

        const config = getBridgeConfig()
        const authorization = await getBridgeInteractionAuthorization(ticket, config, instance.guild, instance.user.id)
        if (!authorization.authorized) {
            await replyInteraction(instance.interaction, getBridgeAuthorizationDeniedMessage())
            instance.didReply = true
            return cancel()
        }

        const channel = instance.channel as discord.GuildTextBasedChannel
        const currentState = bridgeTicketStateStore.get(ticketChannelId)

        if (action == "send" || action == BRIDGE_ACTION_REFRESH_REVIEW_PACKET) {
            await instance.defer("reply", true)
            try {
                if (currentState?.bridgeCaseId) {
                    await refreshBridgeStatusAndRender(ticket, channel, currentState, instance.message)
                } else {
                    await syncTicketPresentation(ticketChannelId)
                }
            } catch {
                if (currentState) {
                    await rerenderBridgeControl(channel, currentState, instance.message).catch(() => null)
                }
            }
            await instance.interaction.editReply(buildDeferredReply(
                "This control is obsolete. The applicant must use Submit for Review to stage or resubmit the whitelist application."
            ))
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
                        .setLabel("Confirm Permanent Denial")
                        .setStyle(discord.ButtonStyle.Danger)
                        .setDisabled(status.action_availability.hard_deny !== true)
                )
                await instance.interaction.reply({
                    flags: [discord.MessageFlags.Ephemeral],
                    content: [
                        "Review the server-generated permanent denial target list before submitting the staff-only reason:",
                        ...targetLines
                    ].join("\n"),
                    components: [reviewRow]
                })
                instance.didReply = true
            } catch (error) {
                await replyInteraction(instance.interaction, error instanceof Error ? error.message : "Unable to review the permanent denial target list.")
                instance.didReply = true
            }
            return cancel()
        }

        if (action == BRIDGE_HARD_DENY_CONFIRM_ACTION) {
            await instance.interaction.showModal(buildHardDenyModal(ticketChannelId))
            instance.didReply = true
            return cancel()
        }

        const actionKind = action as BridgeActionKind
        await instance.defer("reply", true)
        try {
            const successMessage = await performBridgeAction(actionKind, ticketChannelId, instance, null, null, instance.message)
            await instance.interaction.editReply(buildDeferredReply(successMessage))
        } catch (error) {
            if (error instanceof BridgeHttpError && error.status == 403 && isCanonicalWhitelistApplyAction(actionKind)) {
                await instance.interaction.editReply(buildDeferredReply(getCanonicalWhitelistPermissionDeniedMessage()))
            } else if (error instanceof BridgeHttpError && error.status < 500) {
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
