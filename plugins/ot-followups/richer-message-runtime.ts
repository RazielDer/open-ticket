type FollowUpRicherMessageCandidate = {
    content?: string
    embed: {
        enabled: boolean
        image?: string
        thumbnail?: string
        authorImage?: string
        footerImage?: string
    }
    ping: {
        "@here"?: boolean
        "@everyone"?: boolean
        custom?: readonly string[]
    }
}

function hasConfiguredText(value: unknown): boolean {
    return typeof value == "string" && value.trim().length > 0
}

function hasRawNotificationMention(value: unknown): boolean {
    if (typeof value != "string") return false
    return /(^|[^\w])@(everyone|here)\b/i.test(value) || /<@&\d+>/.test(value)
}

export function followUpHasNotificationTargets(message: FollowUpRicherMessageCandidate): boolean {
    return message.ping["@here"] === true
        || message.ping["@everyone"] === true
        || (message.ping.custom?.length ?? 0) > 0
        || hasRawNotificationMention(message.content)
}

export function followUpHasUnsafeRicherMedia(message: FollowUpRicherMessageCandidate): boolean {
    if (message.embed.enabled !== true) return false
    return hasConfiguredText(message.embed.image)
        || hasConfiguredText(message.embed.thumbnail)
        || hasConfiguredText(message.embed.authorImage)
        || hasConfiguredText(message.embed.footerImage)
}

export function followUpMessageRequiresLegacyPayload(message: FollowUpRicherMessageCandidate): boolean {
    return followUpHasNotificationTargets(message) || followUpHasUnsafeRicherMedia(message)
}
