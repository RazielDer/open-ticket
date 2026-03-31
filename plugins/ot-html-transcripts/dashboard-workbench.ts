import { getTranscriptDeploymentWarnings } from "./config/deployment-warnings"
import { TRANSCRIPT_PLUGIN_CONFIG_ID, TRANSCRIPT_PLUGIN_ID, TRANSCRIPT_PLUGIN_SERVICE_ID } from "./contracts/constants"
import type { OTHtmlTranscriptsConfigData, TranscriptSummary } from "./contracts/types"

const DASHBOARD_RUNTIME_API_SYMBOL = Symbol.for("open-ticket.ot-dashboard")
const TRANSCRIPT_CONFIG_ID = "opendiscord:transcripts"
const TRANSCRIPT_WORKBENCH_ID = "transcript-workspace"
const SUMMARY_UNAVAILABLE_DETAIL = "Summary data appears once the transcript service reports healthy."
const TRANSCRIPT_DELIVERY_MODEL_DETAIL = "Global transcript settings provide the default channel; ticket option overrides live in the ticket option editor."

type DashboardSectionTone = "info" | "success" | "warning" | "danger" | "muted"

export interface DashboardPluginSectionResolverContextLike {
    basePath: string
    buildPath: (...segments: string[]) => string
}

export interface DashboardPluginWorkbenchSectionLike {
    type: "workbench"
    id: string
    title: string
    badge?: {
        label: string
        tone: DashboardSectionTone
    }
    body?: string
    summaryItems?: Array<{
        label: string
        value: string
        detail?: string
    }>
    actions?: Array<{
        label: string
        href: string
        description?: string
        confirmText?: string
        method?: "get" | "post"
    }>
}

export interface DashboardPluginNoticeSectionLike {
    type: "notice"
    id: string
    title: string
    tone: DashboardSectionTone
    body: string
}

export type DashboardPluginSectionLike = DashboardPluginWorkbenchSectionLike | DashboardPluginNoticeSectionLike

export interface DashboardPluginEntryLike {
    pluginId: string
    sections?: DashboardPluginSectionLike[]
    buildSections?: (
        context: DashboardPluginSectionResolverContextLike
    ) => DashboardPluginSectionLike[] | Promise<DashboardPluginSectionLike[]>
}

export interface DashboardRuntimeApiLike {
    registerPluginEntry?: (entry: DashboardPluginEntryLike) => void
}

export interface TranscriptDashboardServiceLike {
    isHealthy: () => boolean
    getSummary: () => Promise<TranscriptSummary>
}

export interface TranscriptDashboardRuntimeLike {
    configs?: {
        get?: (id: string) => { data?: unknown } | null
    }
    plugins?: {
        classes?: {
            get?: (id: string) => unknown | null
        }
    }
}

const registrationState = {
    registered: false
}

function formatBytes(value: number | null | undefined) {
    if (!Number.isFinite(value as number) || (value as number) < 1) return "0 B"

    const units = ["B", "KB", "MB", "GB", "TB"]
    let size = Number(value)
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
    }

    const formatted = size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)
    return `${formatted} ${units[unitIndex]}`
}

function readTranscriptMode(runtime: TranscriptDashboardRuntimeLike) {
    const config = runtime.configs?.get?.(TRANSCRIPT_CONFIG_ID)?.data as { general?: { mode?: unknown } } | undefined
    const mode = config?.general?.mode
    const normalized = typeof mode == "string" ? mode.trim() : ""
    return normalized.length > 0 ? normalized : "unknown"
}

function readTranscriptPluginConfig(runtime: TranscriptDashboardRuntimeLike) {
    return (runtime.configs?.get?.(TRANSCRIPT_PLUGIN_CONFIG_ID)?.data ?? null) as OTHtmlTranscriptsConfigData | null
}

function isTranscriptDashboardService(value: unknown): value is TranscriptDashboardServiceLike {
    if (!value || typeof value != "object") return false
    const candidate = value as Record<string, unknown>
    return typeof candidate.isHealthy == "function" && typeof candidate.getSummary == "function"
}

function resolveTranscriptService(runtime: TranscriptDashboardRuntimeLike) {
    const candidate = runtime.plugins?.classes?.get?.(TRANSCRIPT_PLUGIN_SERVICE_ID) ?? null
    return isTranscriptDashboardService(candidate) ? candidate : null
}

function buildUnavailableSummaryItems(integrationLabel: string, message: string) {
    return [
        { label: "Integration", value: integrationLabel, detail: message },
        { label: "Archived transcripts", value: "Unavailable", detail: SUMMARY_UNAVAILABLE_DETAIL },
        { label: "Failures", value: "Unavailable", detail: SUMMARY_UNAVAILABLE_DETAIL },
        { label: "Archive size", value: "Unavailable", detail: SUMMARY_UNAVAILABLE_DETAIL }
    ]
}

function buildHealthySummaryItems(integrationLabel: string, message: string, summary: TranscriptSummary) {
    return [
        { label: "Integration", value: integrationLabel, detail: message },
        {
            label: "Archived transcripts",
            value: String(summary.total),
            detail: `${summary.active} active, ${summary.partial} partial, ${summary.revoked} revoked`
        },
        {
            label: "Failures",
            value: String(summary.failed),
            detail: `${summary.deleted} deleted, ${summary.building} building`
        },
        {
            label: "Archive size",
            value: formatBytes(summary.totalArchiveBytes),
            detail: `${summary.queueDepth} queued, ${summary.recoveredBuilds} recovered on startup`
        }
    ]
}

export async function buildTranscriptWorkbenchSection(
    runtime: TranscriptDashboardRuntimeLike,
    context: DashboardPluginSectionResolverContextLike
): Promise<DashboardPluginWorkbenchSectionLike> {
    const modeLabel = readTranscriptMode(runtime).toUpperCase()
    const service = resolveTranscriptService(runtime)

    let badgeLabel = "Service missing"
    let badgeTone: DashboardSectionTone = "danger"
    let message = "The transcript service is not available in the runtime registry."
    let summary: TranscriptSummary | null = null

    if (service) {
        let healthy = false
        try {
            healthy = Boolean(service.isHealthy())
        } catch {
            healthy = false
        }

        if (healthy) {
            badgeLabel = "Ready"
            badgeTone = "success"
            message = "The transcript service is available."

            try {
                summary = await service.getSummary()
            } catch {
                summary = null
            }
        } else {
            badgeLabel = "Unhealthy"
            badgeTone = "danger"
            message = "The transcript service is registered but currently unhealthy, so archive operations are disabled until it recovers."
        }
    }

    return {
        type: "workbench",
        id: TRANSCRIPT_WORKBENCH_ID,
        title: "Transcript workspace",
        badge: {
            label: badgeLabel,
            tone: badgeTone
        },
        body: `Configured mode: ${modeLabel}. ${TRANSCRIPT_DELIVERY_MODEL_DETAIL} ${message}`,
        summaryItems: summary
            ? buildHealthySummaryItems(badgeLabel, message, summary)
            : buildUnavailableSummaryItems(badgeLabel, message),
        actions: [
            {
                label: "Open transcript workspace",
                href: context.buildPath("admin", "transcripts")
            },
            {
                label: "Open transcript settings",
                href: context.buildPath("visual", "transcripts")
            }
        ]
    }
}

export function buildTranscriptDeploymentWarningSections(runtime: TranscriptDashboardRuntimeLike): DashboardPluginNoticeSectionLike[] {
    return getTranscriptDeploymentWarnings(readTranscriptPluginConfig(runtime)).map((warning) => ({
        type: "notice",
        id: `transcript-deployment-warning-${warning.code}`,
        title: "Deployment warning",
        tone: "warning",
        body: warning.message
    }))
}

export async function buildTranscriptWorkbenchSections(
    runtime: TranscriptDashboardRuntimeLike,
    context: DashboardPluginSectionResolverContextLike
): Promise<DashboardPluginSectionLike[]> {
    return [
        await buildTranscriptWorkbenchSection(runtime, context),
        ...buildTranscriptDeploymentWarningSections(runtime)
    ]
}

export function createDashboardTranscriptPluginEntry(runtime: TranscriptDashboardRuntimeLike): DashboardPluginEntryLike {
    return {
        pluginId: TRANSCRIPT_PLUGIN_ID,
        async buildSections(context) {
            return await buildTranscriptWorkbenchSections(runtime, context)
        }
    }
}

export function registerDashboardTranscriptWorkbench(
    runtime: TranscriptDashboardRuntimeLike,
    globalObject: typeof globalThis = globalThis
) {
    if (registrationState.registered) return false

    const api = (globalObject as Record<symbol, DashboardRuntimeApiLike | undefined>)[DASHBOARD_RUNTIME_API_SYMBOL]
    if (!api || typeof api.registerPluginEntry != "function") return false

    api.registerPluginEntry(createDashboardTranscriptPluginEntry(runtime))
    registrationState.registered = true
    return true
}

export function resetDashboardTranscriptWorkbenchRegistrationForTests() {
    registrationState.registered = false
}
