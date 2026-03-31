import * as discord from "discord.js"

type CollectorIncludeSettings = {
    users: boolean
    bots: boolean
    client: boolean
}

type CollectorMessage = {
    id: string
    author: {
        id: string
        bot: boolean
        system: boolean
    }
    client: {
        user: {
            id: string
        }
    }
}

type CollectorChannel = {
    messages: {
        fetch: (options: { limit: number; before?: string }) => Promise<discord.Collection<string, CollectorMessage>>
    }
}

export interface FullHistoryCollectorOptions {
    include?: CollectorIncludeSettings
    pageSize?: number
    maxAttempts?: number
    backoffMs?: number
    transformPage?: (messages: CollectorMessage[]) => Promise<any[]>
}

const DEFAULT_OPTIONS: Omit<Required<FullHistoryCollectorOptions>, "transformPage"> = {
    include: {
        users: true,
        bots: true,
        client: true
    },
    pageSize: 100,
    maxAttempts: 3,
    backoffMs: 400
}

export async function collectFullHistoryTranscriptMessages(_ticket: unknown, channel: CollectorChannel, options?: FullHistoryCollectorOptions): Promise<any[]> {
    const settings = {
        ...DEFAULT_OPTIONS,
        ...options,
        include: {
            ...DEFAULT_OPTIONS.include,
            ...(options?.include ?? {})
        }
    }

    const pages: any[][] = []
    let beforeId: string | undefined

    while (true) {
        const messages = await fetchMessagePage(channel, beforeId, settings.pageSize, settings.maxAttempts, settings.backoffMs)
        if (messages.size == 0) break

        const filtered = filterMessages(messages, settings.include)
        if (filtered.length > 0) {
            const transformPage = options?.transformPage ?? (async (page: CollectorMessage[]) => {
                const runtime = await import("#opendiscord")
                return await runtime.opendiscord.transcripts.collector.convertMessagesToTranscriptData(page.reverse() as never)
            })
            const transformed = await transformPage(filtered.reverse())
            pages.unshift(transformed)
        }

        const lastMessage = messages.last()
        if (messages.size < settings.pageSize || !lastMessage) break
        beforeId = lastMessage.id
    }

    return pages.flat()
}

async function fetchMessagePage(channel: CollectorChannel, beforeId: string | undefined, limit: number, maxAttempts: number, backoffMs: number) {
    let lastError: unknown = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await channel.messages.fetch(beforeId ? { limit, before: beforeId } : { limit })
        } catch (error) {
            lastError = error
            if (attempt == maxAttempts) break
            await delay(backoffMs * attempt)
        }
    }

    throw new Error("Failed to fetch transcript history page: " + String(lastError))
}

function filterMessages(messages: discord.Collection<string, CollectorMessage>, include: CollectorIncludeSettings) {
    const final: CollectorMessage[] = []

    messages.forEach((message) => {
        if (message.author.id == message.client.user.id && include.client) final.push(message)
        else if ((message.author.bot || message.author.system) && include.bots) final.push(message)
        else if (include.users) final.push(message)
    })

    return final
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
