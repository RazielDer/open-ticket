import test from "node:test"
import assert from "node:assert/strict"

import * as discord from "discord.js"

import { collectFullHistoryTranscriptMessages } from "../collect/full-history-collector.js"

function createFakeMessage(id: number) {
    return {
        id: String(id),
        author: {
            id: "user-" + id,
            bot: false,
            system: false
        },
        client: {
            user: {
                id: "client-user"
            }
        }
    }
}

function createPagedChannel(totalMessages: number, failFirstAttempt = false) {
    const messages = Array.from({ length: totalMessages }, (_, index) => createFakeMessage(totalMessages - index))
    let hasFailed = false

    return {
        messages: {
            fetch: async ({ limit, before }: { limit: number; before?: string }) => {
                if (failFirstAttempt && !hasFailed) {
                    hasFailed = true
                    throw new Error("transient fetch failure")
                }

                const startIndex = before
                    ? messages.findIndex((message) => message.id == before) + 1
                    : 0
                const page = messages.slice(startIndex, startIndex + limit)
                return new discord.Collection(page.map((message) => [message.id, message as never]))
            }
        }
    } as never
}

test("full-history collector fetches beyond the core 2000 message cap in chronological order", async () => {
    const channel = createPagedChannel(2501)
    const transformed = await collectFullHistoryTranscriptMessages({} as never, channel, {
        transformPage: async (page) => page.map((message) => ({
            id: message.id,
            author: {
                id: message.author.id,
                username: message.author.id,
                displayname: message.author.id,
                pfp: "",
                tag: null,
                color: "#ffffff"
            },
            guild: "guild-1",
            channel: "channel-1",
            edited: false,
            timestamp: Number(message.id),
            type: "default",
            content: "msg-" + message.id,
            embeds: [],
            files: [],
            components: [],
            reply: null,
            reactions: []
        }))
    })

    assert.equal(transformed.length, 2501)
    assert.equal(transformed[0]?.id, "1")
    assert.equal(transformed.at(-1)?.id, "2501")
})

test("full-history collector retries transient page fetch failures", async () => {
    const channel = createPagedChannel(150, true)
    const transformed = await collectFullHistoryTranscriptMessages({} as never, channel, {
        backoffMs: 1,
        transformPage: async (page) => page.map((message) => ({
            id: message.id,
            author: {
                id: message.author.id,
                username: message.author.id,
                displayname: message.author.id,
                pfp: "",
                tag: null,
                color: "#ffffff"
            },
            guild: "guild-1",
            channel: "channel-1",
            edited: false,
            timestamp: Number(message.id),
            type: "default",
            content: "msg-" + message.id,
            embeds: [],
            files: [],
            components: [],
            reply: null,
            reactions: []
        }))
    })

    assert.equal(transformed.length, 150)
    assert.equal(transformed[0]?.id, "1")
    assert.equal(transformed.at(-1)?.id, "150")
})
