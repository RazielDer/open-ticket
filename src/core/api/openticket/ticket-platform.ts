import type { ODValidJsonType } from "../modules/base"

import { ODTicketData } from "./ticket"

export interface ODTicketPlatformMetadata {
    transportMode: "channel_text" | "private_thread"
    transportParentChannelId: string | null
    transportParentMessageId: string | null
    assignedTeamId: string | null
    assignedStaffUserId: string | null
    assignmentStrategy: string | null
    firstStaffResponseAt: number | null
    resolvedAt: number | null
    awaitingUserState: string | null
    awaitingUserSince: number | null
    closeRequestState: string | null
    closeRequestBy: string | null
    closeRequestAt: number | null
    integrationProfileId: string | null
    aiAssistProfileId: string | null
}

type TicketPlatformMetadataKey = keyof ODTicketPlatformMetadata
type TicketPlatformMetadataField = {
    key: TicketPlatformMetadataKey
    id: string
    defaultValue: ODTicketPlatformMetadata[TicketPlatformMetadataKey]
}

const TICKET_PLATFORM_METADATA_FIELDS: readonly TicketPlatformMetadataField[] = [
    { key: "transportMode", id: "opendiscord:transport-mode", defaultValue: "channel_text" },
    { key: "transportParentChannelId", id: "opendiscord:transport-parent-channel", defaultValue: null },
    { key: "transportParentMessageId", id: "opendiscord:transport-parent-message", defaultValue: null },
    { key: "assignedTeamId", id: "opendiscord:assigned-team", defaultValue: null },
    { key: "assignedStaffUserId", id: "opendiscord:assigned-staff", defaultValue: null },
    { key: "assignmentStrategy", id: "opendiscord:assignment-strategy", defaultValue: null },
    { key: "firstStaffResponseAt", id: "opendiscord:first-staff-response-on", defaultValue: null },
    { key: "resolvedAt", id: "opendiscord:resolved-on", defaultValue: null },
    { key: "awaitingUserState", id: "opendiscord:awaiting-user-state", defaultValue: null },
    { key: "awaitingUserSince", id: "opendiscord:awaiting-user-since", defaultValue: null },
    { key: "closeRequestState", id: "opendiscord:close-request-state", defaultValue: null },
    { key: "closeRequestBy", id: "opendiscord:close-request-by", defaultValue: null },
    { key: "closeRequestAt", id: "opendiscord:close-request-on", defaultValue: null },
    { key: "integrationProfileId", id: "opendiscord:integration-profile", defaultValue: null },
    { key: "aiAssistProfileId", id: "opendiscord:ai-assist-profile", defaultValue: null }
] as const

const buildTicketPlatformIdMap = () => {
    const entries = TICKET_PLATFORM_METADATA_FIELDS.map((field) => [field.key, field.id])
    return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<TicketPlatformMetadataKey, string>>
}

const buildTicketPlatformDefaultMap = () => {
    const entries = TICKET_PLATFORM_METADATA_FIELDS.map((field) => [field.key, cloneTicketPlatformValue(field.defaultValue)])
    return Object.freeze(Object.fromEntries(entries)) as Readonly<ODTicketPlatformMetadata>
}

export const ODTICKET_PLATFORM_METADATA_IDS = buildTicketPlatformIdMap()
export const ODTICKET_PLATFORM_METADATA_DEFAULTS = buildTicketPlatformDefaultMap()

export interface ODTicketPlatformMetadataSource {
    get?: (id: string) => { value?: unknown } | null
}

export function createDefaultTicketPlatformMetadata(): ODTicketPlatformMetadata {
    return {
        ...ODTICKET_PLATFORM_METADATA_DEFAULTS
    }
}

export function createTicketPlatformMetadataEntries(overrides: Partial<ODTicketPlatformMetadata> = {}) {
    const metadata = {
        ...createDefaultTicketPlatformMetadata(),
        ...overrides
    } as ODTicketPlatformMetadata

    return TICKET_PLATFORM_METADATA_FIELDS.map((field) => new ODTicketData(field.id, cloneTicketPlatformValue(metadata[field.key]) as ODValidJsonType))
}

export function appendMissingTicketPlatformMetadataFields(ticketData: Array<{ id: string; value: ODValidJsonType }>) {
    const seen = new Set<string>()
    for (const entry of ticketData) {
        seen.add(String(entry.id))
    }

    let changed = false
    for (const field of TICKET_PLATFORM_METADATA_FIELDS) {
        if (seen.has(field.id)) continue
        ticketData.push({
            id: field.id,
            value: cloneTicketPlatformValue(field.defaultValue) as ODValidJsonType
        })
        seen.add(field.id)
        changed = true
    }

    return changed
}

export function readTicketPlatformMetadataFromTicket(ticket: ODTicketPlatformMetadataSource): ODTicketPlatformMetadata {
    const metadata = createDefaultTicketPlatformMetadata()
    const writableMetadata = metadata as Record<TicketPlatformMetadataKey, string | number | null>
    for (const field of TICKET_PLATFORM_METADATA_FIELDS) {
        writableMetadata[field.key] = normalizeTicketPlatformField(field.key, ticket.get?.(field.id)?.value) as string | number | null
    }
    return metadata
}

export const TICKET_PLATFORM_RUNTIME_SYMBOL = Symbol.for("open-ticket.ot-ticket-platform")

export type TicketPlatformIntegrationCapability = "eligibility" | "status" | "action" | "enrichment"
export type TicketPlatformAiAssistCapability = "summarize" | "answerFaq" | "suggestReply"

type TicketPlatformHookHandler = (...args: any[]) => unknown

export interface TicketPlatformIntegrationProvider {
    id: string
    pluginId?: string
    capabilities: readonly TicketPlatformIntegrationCapability[]
    validateProfileSettings?: TicketPlatformHookHandler
    eligibility?: TicketPlatformHookHandler
    status?: TicketPlatformHookHandler
    action?: TicketPlatformHookHandler
    enrichment?: TicketPlatformHookHandler
}

export interface TicketPlatformAiAssistProvider {
    id: string
    pluginId?: string
    capabilities: readonly TicketPlatformAiAssistCapability[]
    validateProfileSettings?: TicketPlatformHookHandler
    summarize?: TicketPlatformHookHandler
    answerFaq?: TicketPlatformHookHandler
    suggestReply?: TicketPlatformHookHandler
}

export interface TicketPlatformRuntimeApi {
    registerIntegrationProvider(provider: TicketPlatformIntegrationProvider): TicketPlatformIntegrationProvider
    getIntegrationProvider(id: string): TicketPlatformIntegrationProvider | null
    listIntegrationProviders(): TicketPlatformIntegrationProvider[]
    registerAiAssistProvider(provider: TicketPlatformAiAssistProvider): TicketPlatformAiAssistProvider
    getAiAssistProvider(id: string): TicketPlatformAiAssistProvider | null
    listAiAssistProviders(): TicketPlatformAiAssistProvider[]
}

type TicketPlatformRuntimeController = {
    api: TicketPlatformRuntimeApi
    seal(): void
}

let ticketPlatformRuntimeController: TicketPlatformRuntimeController | null = null

const INTEGRATION_CAPABILITIES = ["eligibility", "status", "action", "enrichment"] as const
const AI_ASSIST_CAPABILITIES = ["summarize", "answerFaq", "suggestReply"] as const

export function installTicketPlatformRuntimeApi(): TicketPlatformRuntimeApi {
    const integrationProviders = new Map<string, TicketPlatformIntegrationProvider>()
    const aiAssistProviders = new Map<string, TicketPlatformAiAssistProvider>()
    let sealed = false

    const requireOpenWindow = () => {
        if (!sealed) return
        throw new Error("Ticket platform runtime registration is sealed.")
    }

    const api: TicketPlatformRuntimeApi = {
        registerIntegrationProvider(provider) {
            requireOpenWindow()
            const normalized = normalizeIntegrationProvider(provider)
            return registerTicketPlatformProvider(integrationProviders, normalized, "integration")
        },
        getIntegrationProvider(id) {
            const normalizedId = normalizeProviderId(id, "integration")
            return integrationProviders.get(normalizedId) ?? null
        },
        listIntegrationProviders() {
            return [...integrationProviders.values()]
        },
        registerAiAssistProvider(provider) {
            requireOpenWindow()
            const normalized = normalizeAiAssistProvider(provider)
            return registerTicketPlatformProvider(aiAssistProviders, normalized, "ai-assist")
        },
        getAiAssistProvider(id) {
            const normalizedId = normalizeProviderId(id, "ai-assist")
            return aiAssistProviders.get(normalizedId) ?? null
        },
        listAiAssistProviders() {
            return [...aiAssistProviders.values()]
        }
    }

    const controller: TicketPlatformRuntimeController = {
        api,
        seal() {
            sealed = true
        }
    }

    ;(globalThis as Record<symbol, TicketPlatformRuntimeApi | undefined>)[TICKET_PLATFORM_RUNTIME_SYMBOL] = api
    ticketPlatformRuntimeController = controller
    return api
}

export function getTicketPlatformRuntimeApi(): TicketPlatformRuntimeApi | null {
    return (globalThis as Record<symbol, TicketPlatformRuntimeApi | undefined>)[TICKET_PLATFORM_RUNTIME_SYMBOL] ?? null
}

export function sealTicketPlatformRuntimeApi() {
    ticketPlatformRuntimeController?.seal()
}

export function clearTicketPlatformRuntimeApiForTests() {
    delete (globalThis as Record<symbol, TicketPlatformRuntimeApi | undefined>)[TICKET_PLATFORM_RUNTIME_SYMBOL]
    ticketPlatformRuntimeController = null
}

function cloneTicketPlatformValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return [...value] as T
    }
    if (value && typeof value == "object") {
        return { ...(value as Record<string, unknown>) } as T
    }
    return value
}

function normalizeTicketPlatformField<Key extends TicketPlatformMetadataKey>(key: Key, value: unknown): ODTicketPlatformMetadata[Key] {
    if (key == "transportMode") {
        return (value == "private_thread" || value == "channel_text" ? value : ODTICKET_PLATFORM_METADATA_DEFAULTS.transportMode) as ODTicketPlatformMetadata[Key]
    }

    if (key == "firstStaffResponseAt" || key == "resolvedAt" || key == "awaitingUserSince" || key == "closeRequestAt") {
        return normalizeNumericField(value) as ODTicketPlatformMetadata[Key]
    }

    return normalizeStringField(value) as ODTicketPlatformMetadata[Key]
}

function normalizeNumericField(value: unknown) {
    if (typeof value == "number" && Number.isFinite(value)) return value
    return null
}

function normalizeStringField(value: unknown) {
    if (typeof value == "string") return value
    return null
}

function normalizeProviderId(id: string, registryLabel: string) {
    if (typeof id != "string") {
        throw new Error(`Ticket platform ${registryLabel} provider ids must be strings.`)
    }

    const normalizedId = id.trim()
    if (normalizedId.length < 1) {
        throw new Error(`Ticket platform ${registryLabel} provider ids may not be blank.`)
    }

    return normalizedId
}

function normalizeCapabilityList<Capability extends string>(
    providerId: string,
    capabilities: readonly Capability[],
    allowedCapabilities: readonly Capability[],
    registryLabel: string
) {
    if (!Array.isArray(capabilities)) {
        throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" must declare capabilities as an array.`)
    }

    const allowedCapabilitySet = new Set<string>(allowedCapabilities)
    const normalizedCapabilities: Capability[] = []
    const seen = new Set<string>()

    for (const capability of capabilities) {
        if (typeof capability != "string" || !allowedCapabilitySet.has(capability)) {
            throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" declared unsupported capability "${String(capability)}".`)
        }
        if (seen.has(capability)) continue
        seen.add(capability)
        normalizedCapabilities.push(capability as Capability)
    }

    return Object.freeze(normalizedCapabilities)
}

function normalizeOptionalPluginId(providerId: string, registryLabel: string, pluginId: unknown) {
    if (pluginId == null) {
        return undefined
    }
    if (typeof pluginId != "string") {
        throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" must use a string pluginId when supplied.`)
    }

    const normalizedPluginId = pluginId.trim()
    return normalizedPluginId.length > 0 ? normalizedPluginId : undefined
}

function validateOptionalHelperHook(providerId: string, registryLabel: string, provider: { validateProfileSettings?: unknown }) {
    if (provider.validateProfileSettings === undefined) return
    if (typeof provider.validateProfileSettings != "function") {
        throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" must supply validateProfileSettings as a function.`)
    }
}

function validateCapabilityHooks<Capability extends string, Provider extends { [key: string]: unknown }>(
    providerId: string,
    registryLabel: string,
    provider: Provider,
    capabilities: readonly Capability[],
    hookNames: readonly Capability[]
) {
    const suppliedHooks: Capability[] = []

    for (const hookName of hookNames) {
        const hook = provider[hookName]
        if (hook === undefined) continue
        if (typeof hook != "function") {
            throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" must supply hook "${hookName}" as a function.`)
        }
        suppliedHooks.push(hookName)
    }

    if (suppliedHooks.length < 1) return

    for (const capability of capabilities) {
        if (typeof provider[capability] != "function") {
            throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" declared capability "${capability}" without a matching hook.`)
        }
    }

    for (const hookName of suppliedHooks) {
        if (capabilities.includes(hookName)) continue
        throw new Error(`Ticket platform ${registryLabel} provider "${providerId}" supplied hook "${hookName}" without declaring capability "${hookName}".`)
    }
}

function normalizeIntegrationProvider(provider: TicketPlatformIntegrationProvider): TicketPlatformIntegrationProvider {
    const providerId = normalizeProviderId(provider?.id, "integration")
    const capabilities = normalizeCapabilityList(providerId, provider?.capabilities ?? [], INTEGRATION_CAPABILITIES, "integration")
    validateOptionalHelperHook(providerId, "integration", provider)
    validateCapabilityHooks(providerId, "integration", provider as unknown as Record<string, unknown>, capabilities, INTEGRATION_CAPABILITIES)

    return {
        ...provider,
        id: providerId,
        pluginId: normalizeOptionalPluginId(providerId, "integration", provider?.pluginId),
        capabilities
    }
}

function normalizeAiAssistProvider(provider: TicketPlatformAiAssistProvider): TicketPlatformAiAssistProvider {
    const providerId = normalizeProviderId(provider?.id, "ai-assist")
    const capabilities = normalizeCapabilityList(providerId, provider?.capabilities ?? [], AI_ASSIST_CAPABILITIES, "ai-assist")
    validateOptionalHelperHook(providerId, "ai-assist", provider)
    validateCapabilityHooks(providerId, "ai-assist", provider as unknown as Record<string, unknown>, capabilities, AI_ASSIST_CAPABILITIES)

    return {
        ...provider,
        id: providerId,
        pluginId: normalizeOptionalPluginId(providerId, "ai-assist", provider?.pluginId),
        capabilities
    }
}

function registerTicketPlatformProvider<Provider extends { id: string }>(
    providers: Map<string, Provider>,
    provider: Provider,
    registryLabel: string
) {
    if (providers.has(provider.id)) {
        throw new Error(`Ticket platform ${registryLabel} provider "${provider.id}" is already registered.`)
    }

    providers.set(provider.id, provider)
    return provider
}
