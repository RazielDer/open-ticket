import type { OTHtmlTranscriptsConfigData } from "../contracts/types"

export type TranscriptDeploymentWarningCode =
    | "server-bind-public"
    | "public-url-loopback"
    | "public-url-http"

export interface TranscriptDeploymentWarning {
    code: TranscriptDeploymentWarningCode
    message: string
}

const LOOPBACK_HOSTS = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
    "::ffff:127.0.0.1"
])

const WARNING_MESSAGES: Record<TranscriptDeploymentWarningCode, string> = {
    "server-bind-public": "Transcript HTTP server is not loopback-only. Bind it to 127.0.0.1 and publish it through Cloudflare or another trusted reverse proxy.",
    "public-url-loopback": "Public transcript links point to a loopback URL. Replace server.publicBaseUrl with the external transcript URL before sharing links.",
    "public-url-http": "Public transcript links use http. Put the transcript origin behind HTTPS at the edge before exposing it."
}

function normalizeHost(value: unknown) {
    if (typeof value != "string") {
        return ""
    }

    let normalized = value.trim().toLowerCase()
    if (normalized.startsWith("[") && normalized.endsWith("]")) {
        normalized = normalized.slice(1, -1)
    }

    return normalized.replace(/\.+$/, "")
}

export function isLoopbackHost(value: unknown) {
    return LOOPBACK_HOSTS.has(normalizeHost(value))
}

function parsePublicBaseUrl(value: unknown) {
    if (typeof value != "string") {
        return null
    }

    const trimmed = value.trim()
    if (trimmed.length == 0) {
        return null
    }

    try {
        return new URL(trimmed)
    } catch {
        return null
    }
}

export function getTranscriptDeploymentWarnings(
    config: Pick<OTHtmlTranscriptsConfigData, "server" | "links"> | null | undefined
): TranscriptDeploymentWarning[] {
    if (!config || typeof config != "object" || !config.server || !config.links) {
        return []
    }

    const warnings: TranscriptDeploymentWarning[] = []

    if (!isLoopbackHost(config?.server?.host)) {
        warnings.push({
            code: "server-bind-public",
            message: WARNING_MESSAGES["server-bind-public"]
        })
    }

    if (config?.links?.access?.mode != "public") {
        return warnings
    }

    const publicBaseUrl = parsePublicBaseUrl(config?.server?.publicBaseUrl)
    if (!publicBaseUrl) {
        return warnings
    }

    if (isLoopbackHost(publicBaseUrl.hostname)) {
        warnings.push({
            code: "public-url-loopback",
            message: WARNING_MESSAGES["public-url-loopback"]
        })
        return warnings
    }

    if (publicBaseUrl.protocol == "http:") {
        warnings.push({
            code: "public-url-http",
            message: WARNING_MESSAGES["public-url-http"]
        })
    }

    return warnings
}

export function emitTranscriptDeploymentWarnings(
    config: Pick<OTHtmlTranscriptsConfigData, "server" | "links"> | null | undefined,
    emit: (warning: TranscriptDeploymentWarning) => void
) {
    const warnings = getTranscriptDeploymentWarnings(config)
    for (const warning of warnings) {
        emit(warning)
    }
    return warnings
}
