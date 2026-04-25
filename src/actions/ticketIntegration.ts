///////////////////////////////////////
//TICKET INTEGRATION SYSTEM
///////////////////////////////////////
import {opendiscord, api} from "../index"
import * as discord from "discord.js"

export const TICKET_INTEGRATION_SERVICE_ID = "opendiscord:ticket-integration-service"
export const TICKET_OPTION_INTEGRATION_PROFILE_ID = "opendiscord:integration-profile"

const LEGACY_BRIDGE_PROVIDER_ID = "ot-eotfs-bridge"
const LEGACY_BRIDGE_PROFILE_ID = "ot-eotfs-bridge:legacy"
const STOCK_ACTION_IDS = new Set<string>(api.TICKET_PLATFORM_STOCK_ACTION_IDS)
const ALL_STOCK_ACTION_IDS = [...api.TICKET_PLATFORM_STOCK_ACTION_IDS]
const PROVIDER_UNAVAILABLE_REASON = "Ticket integration provider is unavailable."

type TicketIntegrationSummaryState = "ready" | "degraded" | "locked" | "unavailable"

export interface TicketIntegrationSummary {
    profileId: string
    providerId: string
    label: string
    state: TicketIntegrationSummaryState
    summary: string | null
    degradedReason: string | null
    lockedTicketActions: string[]
}

export interface TicketIntegrationActionLockResult {
    locked: boolean
    reason: string | null
    summary: TicketIntegrationSummary | null
}

function normalizeString(value: unknown): string {
    return typeof value == "string" ? value.trim() : ""
}

function normalizeSettings(value: unknown): Record<string, unknown> {
    return value && typeof value == "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeProfile(raw: unknown): api.TicketIntegrationProfile | null {
    if (!raw || typeof raw != "object" || Array.isArray(raw)) return null
    const profile = raw as Record<string, unknown>
    const id = normalizeString(profile.id)
    const providerId = normalizeString(profile.providerId)
    if (!id || !providerId) return null
    return {
        id,
        providerId,
        label: normalizeString(profile.label) || id,
        enabled: profile.enabled === true,
        settings: normalizeSettings(profile.settings)
    }
}

function getProfileConfigData(): api.TicketIntegrationProfile[] {
    const config = opendiscord.configs.get("opendiscord:integration-profiles") as { data?: unknown } | null
    const data = Array.isArray(config?.data) ? config.data : []
    return data.map(normalizeProfile).filter((profile): profile is api.TicketIntegrationProfile => Boolean(profile))
}

function getLegacyBridgeConfigData(): Record<string, unknown> | null {
    try {
        const config = opendiscord.configs.get("ot-eotfs-bridge:config") as { data?: Record<string, unknown> } | null
        return config?.data && typeof config.data == "object" ? config.data : null
    } catch {
        return null
    }
}

function isLegacyBridgeEligibleOption(optionId: string): boolean {
    const config = getLegacyBridgeConfigData()
    const eligibleOptionIds = Array.isArray(config?.eligibleOptionIds) ? config.eligibleOptionIds : []
    return eligibleOptionIds.some((id) => normalizeString(id) == optionId)
}

function buildLegacyBridgeProfile(optionId: string): api.TicketIntegrationProfile | null {
    const config = getLegacyBridgeConfigData()
    const provider = api.getTicketPlatformRuntimeApi()?.getIntegrationProvider(LEGACY_BRIDGE_PROVIDER_ID)
    if (!config || !provider || !isLegacyBridgeEligibleOption(optionId)) return null
    opendiscord.log("Using legacy whitelist bridge eligibleOptionIds fallback for ticket integration profile resolution. Configure integration-profiles.json before SLICE-015.", "warning", [
        {key:"option",value:optionId},
        {key:"provider",value:LEGACY_BRIDGE_PROVIDER_ID}
    ])
    return {
        id: LEGACY_BRIDGE_PROFILE_ID,
        providerId: LEGACY_BRIDGE_PROVIDER_ID,
        label: "Whitelist bridge legacy config",
        enabled: true,
        settings: {...config}
    }
}

function safeLogIntegrationFailure(message: string, error: unknown, profile?: api.TicketIntegrationProfile | null) {
    const reason = error instanceof Error ? error.message : String(error || "unknown")
    opendiscord.log(message, "warning", [
        {key:"profile",value:profile?.id ?? "/"},
        {key:"provider",value:profile?.providerId ?? "/"},
        {key:"error",value:reason}
    ])
    opendiscord.debugfile.writeErrorMessage(new api.ODError(error instanceof Error ? error : new Error(reason), "uncaughtException"))
}

export function getTicketOptionIntegrationProfileId(option: api.ODTicketOption | null | undefined): string {
    if (!option) return ""
    const data = option.get(TICKET_OPTION_INTEGRATION_PROFILE_ID)
    return normalizeString(data?.value)
}

export function getTicketIntegrationProfileId(ticket: api.ODTicket | null | undefined): string {
    if (!ticket) return ""
    const stored = normalizeString(ticket.get("opendiscord:integration-profile")?.value)
    return stored || getTicketOptionIntegrationProfileId(ticket.option)
}

export function setTicketIntegrationProfileIdFromOption(ticket: api.ODTicket, option: api.ODTicketOption = ticket.option) {
    const profileId = getTicketOptionIntegrationProfileId(option)
    ticket.get("opendiscord:integration-profile").value = profileId || null
    return profileId
}

function normalizeEligibilityResult(result: Partial<api.TicketIntegrationEligibilityResult> | null | undefined): api.TicketIntegrationEligibilityResult {
    return {
        allow: result?.allow !== false,
        reason: normalizeString(result?.reason) || null,
        degradedReason: normalizeString(result?.degradedReason) || null
    }
}

function normalizeActionResult(result: Partial<api.TicketIntegrationActionResult> | null | undefined): api.TicketIntegrationActionResult {
    return {
        ok: result?.ok === true,
        message: normalizeString(result?.message),
        degradedReason: normalizeString(result?.degradedReason) || null
    }
}

function normalizeStatusState(value: unknown): TicketIntegrationSummaryState {
    return (value == "ready" || value == "degraded" || value == "locked" || value == "unavailable") ? value as TicketIntegrationSummaryState : "ready"
}

function unavailableSummary(profile: api.TicketIntegrationProfile, reason = PROVIDER_UNAVAILABLE_REASON): TicketIntegrationSummary {
    return {
        profileId: profile.id,
        providerId: profile.providerId,
        label: profile.label,
        state: "unavailable",
        summary: reason,
        degradedReason: reason,
        lockedTicketActions: ALL_STOCK_ACTION_IDS
    }
}

function normalizeStatusResult(profile: api.TicketIntegrationProfile, result: Partial<api.TicketIntegrationStatusResult> | null | undefined): TicketIntegrationSummary {
    const lockedTicketActions = Array.isArray(result?.lockedTicketActions)
        ? result.lockedTicketActions.map((action) => normalizeString(action)).filter(Boolean)
        : []
    const invalidLockedAction = lockedTicketActions.find((action) => !STOCK_ACTION_IDS.has(action))
    if (invalidLockedAction) {
        return unavailableSummary(profile, `Ticket integration provider returned unknown locked action "${invalidLockedAction}".`)
    }

    return {
        profileId: profile.id,
        providerId: profile.providerId,
        label: profile.label,
        state: normalizeStatusState(result?.state),
        summary: normalizeString(result?.summary) || null,
        degradedReason: normalizeString(result?.degradedReason) || null,
        lockedTicketActions
    }
}

export class TicketIntegrationService extends api.ODManagerData {
    constructor(id: api.ODValidId = TICKET_INTEGRATION_SERVICE_ID) {
        super(id)
    }

    getProfiles(): api.TicketIntegrationProfile[] {
        return getProfileConfigData()
    }

    getProfile(profileId: string): api.TicketIntegrationProfile | null {
        const normalizedId = normalizeString(profileId)
        if (!normalizedId) return null
        return this.getProfiles().find((profile) => profile.id == normalizedId) ?? null
    }

    getProfileForOption(option: api.ODTicketOption | null | undefined): api.TicketIntegrationProfile | null {
        const optionId = option?.id?.value ?? ""
        const profileId = getTicketOptionIntegrationProfileId(option)
        if (profileId) return this.getProfile(profileId)
        return buildLegacyBridgeProfile(optionId)
    }

    getProfileForTicket(ticket: api.ODTicket | null | undefined): api.TicketIntegrationProfile | null {
        if (!ticket) return null
        const profileId = getTicketIntegrationProfileId(ticket)
        if (profileId) return this.getProfile(profileId)
        return buildLegacyBridgeProfile(ticket.option.id.value)
    }

    getProvider(profile: api.TicketIntegrationProfile): api.TicketPlatformIntegrationProvider | null {
        return api.getTicketPlatformRuntimeApi()?.getIntegrationProvider(profile.providerId) ?? null
    }

    async evaluateCreateTicketEligibility(input: {
        guild: discord.Guild
        user: discord.User
        option: api.ODTicketOption
        answers: unknown[]
    }): Promise<api.TicketIntegrationEligibilityResult> {
        const profile = this.getProfileForOption(input.option)
        if (!profile) return {allow:true, reason:null, degradedReason:null}
        if (!profile.enabled) return {allow:false, reason:"This ticket integration profile is disabled.", degradedReason:null}
        const provider = this.getProvider(profile)
        if (!provider) return {allow:false, reason:PROVIDER_UNAVAILABLE_REASON, degradedReason:PROVIDER_UNAVAILABLE_REASON}
        if (!provider.capabilities.includes("eligibility") || typeof provider.eligibility != "function") {
            return {allow:true, reason:null, degradedReason:null}
        }

        try {
            return normalizeEligibilityResult(await provider.eligibility({
                profile,
                settings: profile.settings,
                option: input.option,
                guild: input.guild,
                user: input.user,
                answers: input.answers
            }))
        } catch (error) {
            safeLogIntegrationFailure("Ticket integration eligibility failed closed.", error, profile)
            return {allow:false, reason:PROVIDER_UNAVAILABLE_REASON, degradedReason:PROVIDER_UNAVAILABLE_REASON}
        }
    }

    async getTicketIntegrationSummary(input: {
        ticket: api.ODTicket
        channel?: discord.GuildTextBasedChannel | null
        guild?: discord.Guild | null
    }): Promise<TicketIntegrationSummary | null> {
        const profile = this.getProfileForTicket(input.ticket)
        if (!profile) return null
        if (!profile.enabled) return unavailableSummary(profile, "Ticket integration profile is disabled.")
        const provider = this.getProvider(profile)
        if (!provider) return unavailableSummary(profile)
        if (!provider.capabilities.includes("status") || typeof provider.status != "function") {
            return {
                profileId: profile.id,
                providerId: profile.providerId,
                label: profile.label,
                state: "ready",
                summary: profile.label,
                degradedReason: null,
                lockedTicketActions: []
            }
        }

        try {
            return normalizeStatusResult(profile, await provider.status({
                profile,
                settings: profile.settings,
                ticket: input.ticket,
                channel: input.channel ?? null,
                guild: input.guild ?? null
            }))
        } catch (error) {
            safeLogIntegrationFailure("Ticket integration status is unavailable.", error, profile)
            return unavailableSummary(profile)
        }
    }

    async resolveStockActionLock(input: {
        ticket: api.ODTicket
        actionId: string
        channel?: discord.GuildTextBasedChannel | null
        guild?: discord.Guild | null
    }): Promise<TicketIntegrationActionLockResult> {
        const actionId = normalizeString(input.actionId)
        if (!STOCK_ACTION_IDS.has(actionId)) return {locked:false, reason:null, summary:null}
        const summary = await this.getTicketIntegrationSummary(input)
        if (!summary) return {locked:false, reason:null, summary:null}
        if (!summary.lockedTicketActions.includes(actionId)) return {locked:false, reason:null, summary}
        return {
            locked: true,
            reason: summary.degradedReason || summary.summary || "Ticket action is locked by its integration provider.",
            summary
        }
    }

    async runProviderAction(input: {
        ticket: api.ODTicket
        actionId: string
        user: discord.User
        reason?: string | null
        payload?: Record<string, unknown>
        channel?: discord.GuildTextBasedChannel | null
        guild?: discord.Guild | null
    }): Promise<api.TicketIntegrationActionResult | null> {
        const profile = this.getProfileForTicket(input.ticket)
        if (!profile || !profile.enabled) return null
        const provider = this.getProvider(profile)
        if (!provider || !provider.capabilities.includes("action") || typeof provider.action != "function") return null
        try {
            return normalizeActionResult(await provider.action({
                profile,
                settings: profile.settings,
                ticket: input.ticket,
                channel: input.channel ?? null,
                guild: input.guild ?? null,
                user: input.user,
                actionId: input.actionId,
                reason: input.reason ?? null,
                payload: input.payload ?? {}
            }))
        } catch (error) {
            safeLogIntegrationFailure("Ticket integration action failed.", error, profile)
            return {ok:false, message:PROVIDER_UNAVAILABLE_REASON, degradedReason:PROVIDER_UNAVAILABLE_REASON}
        }
    }
}

function getTicketIntegrationService(): TicketIntegrationService {
    const existing = opendiscord.plugins.classes.get(TICKET_INTEGRATION_SERVICE_ID)
    if (existing instanceof TicketIntegrationService) return existing
    const service = new TicketIntegrationService()
    opendiscord.plugins.classes.add(service)
    return service
}

export async function resolveTicketIntegrationActionLock(ticket: api.ODTicket, actionId: string, context: {
    channel?: discord.GuildTextBasedChannel | null
    guild?: discord.Guild | null
} = {}): Promise<TicketIntegrationActionLockResult> {
    return await getTicketIntegrationService().resolveStockActionLock({
        ticket,
        actionId,
        channel: context.channel ?? null,
        guild: context.guild ?? null
    })
}

async function sendLockedActionMessage(params: {
    guild: discord.Guild
    channel: discord.GuildTextBasedChannel
    user: discord.User
    reason: string | null
}) {
    const reason = params.reason || "Ticket action is locked by its integration provider."
    await params.channel.send((await opendiscord.builders.messages.getSafe("opendiscord:error").build("other",{
        guild:params.guild,
        channel:params.channel,
        user:params.user,
        error:reason,
        layout:"simple"
    })).message).catch(() => null)
}

const ACTION_TO_STOCK_ACTION: Record<string, string> = {
    "opendiscord:claim-ticket": "claim",
    "opendiscord:unclaim-ticket": "unclaim",
    "opendiscord:assign-ticket": "assign",
    "opendiscord:escalate-ticket": "escalate",
    "opendiscord:move-ticket": "move",
    "opendiscord:transfer-ticket": "transfer",
    "opendiscord:add-ticket-user": "add-participant",
    "opendiscord:remove-ticket-user": "remove-participant",
    "opendiscord:update-ticket-priority": "set-priority",
    "opendiscord:update-ticket-topic": "set-topic",
    "opendiscord:close-ticket": "close",
    "opendiscord:reopen-ticket": "reopen",
    "opendiscord:delete-ticket": "delete",
    "opendiscord:pin-ticket": "pin",
    "opendiscord:unpin-ticket": "unpin",
    "opendiscord:rename-ticket": "rename",
    "opendiscord:request-close": "request-close",
    "opendiscord:cancel-close-request": "cancel-close-request",
    "opendiscord:approve-close-request": "approve-close-request",
    "opendiscord:dismiss-close-request": "dismiss-close-request",
    "opendiscord:set-awaiting-user": "set-awaiting-user",
    "opendiscord:clear-awaiting-user": "clear-awaiting-user"
}

function addStockActionLockWorkers() {
    Object.entries(ACTION_TO_STOCK_ACTION).forEach(([actionId, stockActionId]) => {
        const action = opendiscord.actions.get(actionId as any) as any
        if (!action?.workers) return
        if (action.workers.exists?.("opendiscord:ticket-integration-lock")) return
        action.workers.add(new api.ODWorker("opendiscord:ticket-integration-lock",50,async (_instance:any,params:any,_source:any,cancel:any) => {
            const ticket = params.ticket as api.ODTicket | null
            if (!ticket) return
            const lock = await resolveTicketIntegrationActionLock(ticket, stockActionId, {
                guild: params.guild,
                channel: params.channel
            })
            if (!lock.locked) return
            if (params.guild && params.channel && params.user) {
                await sendLockedActionMessage({
                    guild: params.guild,
                    channel: params.channel,
                    user: params.user,
                    reason: lock.reason
                })
            }
            cancel()
        }))
    })
}

export const registerPluginClasses = async () => {
    if (!opendiscord.plugins.classes.exists(TICKET_INTEGRATION_SERVICE_ID)) {
        opendiscord.plugins.classes.add(new TicketIntegrationService())
    }
}

export const registerActions = async () => {
    const service = getTicketIntegrationService()
    opendiscord.actions.get("opendiscord:create-ticket-permissions").workers.add([
        new api.ODWorker("opendiscord:ticket-integration-eligibility",0.5,async (instance,params,source,cancel) => {
            void source
            const result = await service.evaluateCreateTicketEligibility({
                guild: params.guild,
                user: params.user,
                option: params.option,
                answers: Array.isArray(params.answers) ? params.answers : []
            })
            if (result.allow) return
            instance.valid = false
            instance.reason = "custom"
            instance.customReason = result.reason || result.degradedReason || "You cannot create this ticket right now."
            cancel()
        })
    ])
    addStockActionLockWorkers()
}
