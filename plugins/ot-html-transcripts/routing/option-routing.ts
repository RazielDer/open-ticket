export interface TicketOptionTranscriptRouting {
    useGlobalDefault: boolean
    channels: string[]
}

export interface TicketOptionTranscriptRoutingTargets extends TicketOptionTranscriptRouting {
    optionId: string
    source: "global-default" | "option-override" | "disabled"
    targets: string[]
}

export interface TicketOptionTranscriptRoutingValidationIssue {
    path: Array<string | number>
    id: string
    message: string
}

const DEFAULT_TICKET_OPTION_TRANSCRIPT_ROUTING: TicketOptionTranscriptRouting = {
    useGlobalDefault: true,
    channels: []
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value == "object" && value !== null && !Array.isArray(value)
}

function getTrimmedString(value: unknown): string {
    return typeof value == "string" ? value.trim() : ""
}

export function isDiscordChannelId(value: string): boolean {
    return /^\d{15,50}$/.test(value)
}

export function normalizeTranscriptChannelIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    const seen = new Set<string>()
    const normalized: string[] = []

    for (const entry of value) {
        if (typeof entry != "string") {
            continue
        }

        const channelId = entry.trim()
        if (channelId.length == 0 || seen.has(channelId)) {
            continue
        }

        seen.add(channelId)
        normalized.push(channelId)
    }

    return normalized
}

export function normalizeTicketOptionTranscriptRouting(value: unknown): TicketOptionTranscriptRouting {
    if (!isRecord(value)) {
        return {
            ...DEFAULT_TICKET_OPTION_TRANSCRIPT_ROUTING,
            channels: []
        }
    }

    return {
        useGlobalDefault: typeof value.useGlobalDefault == "boolean"
            ? value.useGlobalDefault
            : DEFAULT_TICKET_OPTION_TRANSCRIPT_ROUTING.useGlobalDefault,
        channels: normalizeTranscriptChannelIds(value.channels)
    }
}

export function findRawTicketOptionById(optionsConfig: unknown, optionId: string): Record<string, unknown> | null {
    if (!Array.isArray(optionsConfig)) {
        return null
    }

    for (const option of optionsConfig) {
        if (!isRecord(option)) {
            continue
        }

        if (option.id == optionId && option.type == "ticket") {
            return option
        }
    }

    return null
}

export function readTicketOptionTranscriptRoutingFromOptionsConfig(optionsConfig: unknown, optionId: string): TicketOptionTranscriptRouting | null {
    const option = findRawTicketOptionById(optionsConfig, optionId)
    if (!option) {
        return null
    }

    return normalizeTicketOptionTranscriptRouting(option.transcripts)
}

export function resolveEffectiveTranscriptChannelTargetsFromConfigs(
    optionsConfig: unknown,
    transcriptsConfig: unknown,
    optionId: string
): TicketOptionTranscriptRoutingTargets | null {
    const routing = readTicketOptionTranscriptRoutingFromOptionsConfig(optionsConfig, optionId)
    if (!routing) {
        return null
    }

    if (!routing.useGlobalDefault) {
        return {
            optionId,
            useGlobalDefault: false,
            channels: [...routing.channels],
            source: routing.channels.length > 0 ? "option-override" : "disabled",
            targets: [...routing.channels]
        }
    }

    const transcriptsRoot = isRecord(transcriptsConfig) ? transcriptsConfig : null
    const general = isRecord(transcriptsRoot?.general) ? transcriptsRoot.general : null
    const globalChannel = getTrimmedString(general?.channel)
    const globalEnabled = general?.enableChannel === true
    const targets = globalEnabled && globalChannel.length > 0 ? [globalChannel] : []

    return {
        optionId,
        useGlobalDefault: true,
        channels: [],
        source: "global-default",
        targets
    }
}

export function validateTicketOptionTranscriptRoutingConfig(optionsConfig: unknown): TicketOptionTranscriptRoutingValidationIssue[] {
    if (!Array.isArray(optionsConfig)) {
        return []
    }

    const issues: TicketOptionTranscriptRoutingValidationIssue[] = []

    optionsConfig.forEach((option, optionIndex) => {
        if (!isRecord(option) || option.type != "ticket") {
            return
        }

        if (typeof option.transcripts == "undefined") {
            return
        }

        const transcriptsPath = [optionIndex, "transcripts"] as Array<string | number>
        if (!isRecord(option.transcripts)) {
            issues.push({
                path: transcriptsPath,
                id: "ot-html-transcripts:options:transcripts-invalid-type",
                message: "Ticket option transcript routing must be stored as an object when the plugin-owned transcripts block is present."
            })
            return
        }

        if (typeof option.transcripts.useGlobalDefault != "undefined" && typeof option.transcripts.useGlobalDefault != "boolean") {
            issues.push({
                path: [...transcriptsPath, "useGlobalDefault"],
                id: "ot-html-transcripts:options:use-global-default-invalid-type",
                message: "Ticket option transcript routing field transcripts.useGlobalDefault must be a boolean when present."
            })
        }

        if (typeof option.transcripts.channels == "undefined") {
            return
        }

        if (!Array.isArray(option.transcripts.channels)) {
            issues.push({
                path: [...transcriptsPath, "channels"],
                id: "ot-html-transcripts:options:channels-invalid-type",
                message: "Ticket option transcript routing field transcripts.channels must be an array when present."
            })
            return
        }

        option.transcripts.channels.forEach((channel, channelIndex) => {
            if (typeof channel != "string") {
                issues.push({
                    path: [...transcriptsPath, "channels", channelIndex],
                    id: "ot-html-transcripts:options:channel-invalid-type",
                    message: "Each explicit transcript routing channel must be a Discord channel id string."
                })
                return
            }

            const normalized = channel.trim()
            if (normalized.length == 0) {
                return
            }

            if (!isDiscordChannelId(normalized)) {
                issues.push({
                    path: [...transcriptsPath, "channels", channelIndex],
                    id: "ot-html-transcripts:options:channel-invalid-id",
                    message: "Each explicit transcript routing channel must be a syntactically valid Discord channel id."
                })
            }
        })
    })

    return issues
}

function getRuntime() {
    return require("#opendiscord") as typeof import("#opendiscord")
}

export function readTicketOptionTranscriptRouting(optionId: string): TicketOptionTranscriptRouting | null {
    const { opendiscord } = getRuntime()
    return readTicketOptionTranscriptRoutingFromOptionsConfig(opendiscord.configs.get("opendiscord:options")?.data, optionId)
}

export function resolveEffectiveTranscriptChannelTargets(optionId: string): TicketOptionTranscriptRoutingTargets | null {
    const { opendiscord } = getRuntime()
    return resolveEffectiveTranscriptChannelTargetsFromConfigs(
        opendiscord.configs.get("opendiscord:options")?.data,
        opendiscord.configs.get("opendiscord:transcripts")?.data,
        optionId
    )
}
