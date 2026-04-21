import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import { createLocalHtmlTranscriptCompiler } from "../compiler/html-compiler.js"
import { createWrappedTextTranscriptCompiler } from "../compiler/text-compiler.js"
import type { LocalTranscriptDocument } from "../contracts/document.js"
import { deliverMessageToTranscriptTargets, routeTranscriptReadyMessages } from "../routing/channel-delivery.js"
import { TranscriptServiceCore } from "../service/transcript-service-core.js"
import { createTestConfig } from "../test-support/helpers.js"

function createFakeDocument(transcriptId: string): LocalTranscriptDocument {
    return {
        version: "1.0" as const,
        transcriptId,
        generatedAt: new Date().toISOString(),
        status: "active" as const,
        warningCount: 0,
        warnings: [] as { code: string; message: string; sourceUrl?: string | null }[],
        searchText: "compiled transcript",
        totals: {
            messages: 2501,
            embeds: 0,
            attachments: 0,
            reactions: 0,
            interactions: 0
        },
        style: {
            background: { enabled: false, backgroundColor: "#101010", backgroundAsset: null },
            header: { enabled: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
            stats: { enabled: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
            favicon: { enabled: false, faviconAsset: null }
        },
        bot: { name: "Bot", id: "bot-1", avatar: null },
        guild: { name: "Guild", id: "guild-1", icon: null },
        ticket: {
            name: "ticket-compile",
            id: "channel-compile",
            createdOn: false as const,
            closedOn: false as const,
            claimedOn: false as const,
            pinnedOn: false as const,
            deletedOn: false as const,
            createdBy: null,
            closedBy: null,
            claimedBy: null,
            pinnedBy: null,
            deletedBy: null
        },
        participants: [],
        messages: [
            {
                id: "1",
                timestamp: 1,
                edited: false,
                important: false,
                author: { id: "user-1", name: "User 1", color: "#ffffff", avatar: null, bot: false, verifiedBot: false, system: false },
                content: "hello",
                reply: { type: false as const },
                embeds: [],
                attachments: [],
                components: []
            }
        ]
    }
}

function createFakeTextChannel(
    id: string,
    behavior: "text" | "voice" | "fails",
    sent: Array<{ id: string; message: unknown }>,
    guildId = "guild-1"
) {
    return {
        id,
        guild: {
            id: guildId
        },
        isTextBased() {
            return behavior != "voice"
        },
        isDMBased() {
            return false
        },
        async send(message: unknown) {
            if (behavior == "fails") {
                throw new Error("send failed")
            }

            sent.push({ id, message })
            return { id: "sent-" + id }
        }
    }
}

test("compileHtmlTranscript captures full history and marks asset warnings as partial instead of fatal", async () => {
    const { config, root } = createTestConfig("compile-html-transcript")
    const service = new TranscriptServiceCore({
        collectMessages: async () => Array.from({ length: 2501 }, (_, index) => ({
            id: String(index + 1),
            author: {
                id: "user-" + (index + 1),
                username: "user-" + (index + 1),
                displayname: "User " + (index + 1),
                pfp: "",
                tag: null,
                color: "#ffffff"
            },
            guild: "guild-1",
            channel: "channel-compile",
            edited: false,
            timestamp: index + 1,
            type: "default" as const,
            content: "message-" + (index + 1),
            embeds: [],
            files: [],
            components: [],
            reply: null,
            reactions: []
        })),
        getParticipants: async () => [{
            user: {
                id: "user-1",
                username: "user-1",
                displayName: "User 1",
                bot: false,
                system: false,
                displayAvatarURL: () => ""
            } as never,
            role: "creator" as const
        }],
        buildDocument: async (transcriptId) => createFakeDocument(transcriptId),
        mirrorAssets: async (document) => {
            document.warnings.push({ code: "asset-warning", message: "Asset unavailable in archive." })
            return {
                warnings: [],
                totalBytes: 0,
                mirroredCount: 0,
                assetRecords: []
            }
        },
        writeArchive: async (tempArchivePath, document) => {
            const documentJson = JSON.stringify(document, null, 2)
            const html = "<html><body>compiled transcript</body></html>"

            await fs.promises.writeFile(path.join(tempArchivePath, "document.json"), documentJson, "utf8")
            await fs.promises.writeFile(path.join(tempArchivePath, "index.html"), html, "utf8")

            return {
                documentBytes: Buffer.byteLength(documentJson, "utf8"),
                htmlBytes: Buffer.byteLength(html, "utf8"),
                totalBytes: Buffer.byteLength(documentJson, "utf8") + Buffer.byteLength(html, "utf8")
            }
        }
    })

    await fs.promises.rm(root, { recursive: true, force: true })
    await service.initialize(config)

    try {
        const fakeTicket = {
            id: { value: "ticket-compile" },
            get: (key: string) => {
                if (key == "opendiscord:opened-by") return { value: "user-1" }
                return { value: null }
            }
        } as never
        const fakeChannel = {
            id: "channel-compile",
            name: "ticket-compile",
            guild: {
                id: "guild-1",
                name: "Guild 1"
            }
        } as never
        const fakeUser = {
            id: "deleter-1",
            displayName: "Moderator",
            displayAvatarURL: () => "",
            bot: false,
            system: false
        } as never

        const result = await service.compileHtmlTranscript(fakeTicket, fakeChannel, fakeUser)

        assert.equal(result.success, true)
        assert.equal(result.messages?.length, 2501)
        assert.match(result.data?.url ?? "", /^http:\/\/127\.0\.0\.1\/transcripts\//)

        const transcripts = await service.listTranscripts({ limit: 10 })
        assert.equal(transcripts.total, 1)
        assert.equal(transcripts.items[0]?.status, "partial")
        assert.equal(transcripts.items[0]?.messageCount, 2501)

        const archivePath = transcripts.items[0]?.archivePath
        assert.ok(archivePath)
        assert.equal(fs.existsSync(path.join(archivePath!, "document.json")), true)
        assert.equal(fs.existsSync(path.join(archivePath!, "index.html")), true)
    } finally {
        await service.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("direct channel delivery skips invalid and non-text targets and continues after a send failure", async () => {
    const sent: Array<{ id: string; message: unknown }> = []
    const warnings: string[] = []
    const channels = new Map<string, unknown>([
        ["123456789012345678", createFakeTextChannel("123456789012345678", "text", sent)],
        ["234567890123456789", createFakeTextChannel("234567890123456789", "fails", sent)],
        ["345678901234567890", createFakeTextChannel("345678901234567890", "voice", sent)],
        ["456789012345678901", createFakeTextChannel("456789012345678901", "text", sent)]
    ])

    const result = await deliverMessageToTranscriptTargets({
        guild: {},
        targetIds: ["bad-id", "123456789012345678", "123456789012345678", "234567890123456789", "345678901234567890", "456789012345678901"],
        channelMessage: { message: { content: "ready" } },
        optionId: "billing"
    }, {
        fetchChannel: async (_guild, targetId) => channels.get(targetId) ?? null,
        logWarning: (warning) => {
            warnings.push(warning.code + ":" + warning.destinationId)
        }
    })

    assert.deepEqual(result.deliveredTargetIds, ["123456789012345678", "456789012345678901"])
    assert.deepEqual(result.skippedTargetIds, ["bad-id", "345678901234567890", "234567890123456789"])
    assert.deepEqual(sent.map((entry) => entry.id), ["123456789012345678", "456789012345678901"])
    assert.deepEqual(warnings, [
        "invalid-id:bad-id",
        "non-text-channel:345678901234567890",
        "send-failed:234567890123456789"
    ])
})

test("transcript channel validation rejects targets from the wrong guild before delivery", async () => {
    const warnings: string[] = []
    const result = await deliverMessageToTranscriptTargets({
        guild: { id: "guild-1" },
        targetIds: ["123456789012345678", "234567890123456789"],
        channelMessage: { message: { content: "ready" } },
        optionId: "billing"
    }, {
        fetchChannel: async (_guild, targetId) => (
            targetId == "123456789012345678"
                ? createFakeTextChannel(targetId, "text", [], "guild-1")
                : createFakeTextChannel(targetId, "text", [], "guild-2")
        ),
        sendMessage: async () => undefined,
        logWarning: (warning) => {
            warnings.push(`${warning.code}:${warning.destinationId}`)
        }
    })

    assert.deepEqual(result.deliveredTargetIds, ["123456789012345678"])
    assert.deepEqual(result.skippedTargetIds, ["234567890123456789"])
    assert.deepEqual(warnings, ["wrong-guild:234567890123456789"])
})

test("default transcript channel fetch keeps the guild channel manager binding intact", async () => {
    const warnings: string[] = []
    const guild = {
        id: "guild-1",
        channels: {
            async fetch(this: { ownerId: string }, targetId: string) {
                assert.equal(this.ownerId, "guild-channel-manager")
                return createFakeTextChannel(targetId, "text", [], "guild-1")
            },
            ownerId: "guild-channel-manager"
        }
    }

    const result = await deliverMessageToTranscriptTargets({
        guild,
        targetIds: ["123456789012345678"],
        channelMessage: { message: { content: "ready" } },
        optionId: "billing"
    }, {
        sendMessage: async () => undefined,
        logWarning: (warning) => {
            warnings.push(`${warning.code}:${warning.destinationId}`)
        }
    })

    assert.deepEqual(result.deliveredTargetIds, ["123456789012345678"])
    assert.deepEqual(result.skippedTargetIds, [])
    assert.deepEqual(warnings, [])
})

test("default transcript channel fetch falls back to the client channel manager when the guild fetch throws", async () => {
    const warnings: string[] = []
    const guild = {
        id: "guild-1",
        channels: {
            async fetch() {
                throw new Error("guild channel manager unavailable")
            }
        },
        client: {
            channels: {
                async fetch(this: { ownerId: string }, targetId: string) {
                    assert.equal(this.ownerId, "client-channel-manager")
                    return createFakeTextChannel(targetId, "text", [], "guild-1")
                },
                ownerId: "client-channel-manager"
            }
        }
    }

    const result = await deliverMessageToTranscriptTargets({
        guild,
        targetIds: ["123456789012345678"],
        channelMessage: { message: { content: "ready" } },
        optionId: "billing"
    }, {
        sendMessage: async () => undefined,
        logWarning: (warning) => {
            warnings.push(`${warning.code}:${warning.destinationId}`)
        }
    })

    assert.deepEqual(result.deliveredTargetIds, ["123456789012345678"])
    assert.deepEqual(result.skippedTargetIds, [])
    assert.deepEqual(warnings, [])
})

test("routeTranscriptReadyMessages suppresses the core channel post when an option resolves to no targets", async () => {
    const readyResult = await routeTranscriptReadyMessages({
        ticket: {
            option: {
                id: {
                    value: "billing"
                }
            }
        },
        channel: {
            guild: {}
        }
    }, {
        channelMessage: { message: { content: "channel" } },
        creatorDmMessage: { message: { content: "creator" } }
    }, {
        resolveTargets: () => ({
            optionId: "billing",
            useGlobalDefault: false,
            channels: [],
            source: "disabled",
            targets: []
        })
    })

    assert.deepEqual(readyResult, {
        creatorDmMessage: { message: { content: "creator" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})

test("wrapped text compiler preserves text contents and routes the ready message only once per unique override target", async () => {
    const compileResult = {
        ticket: {
            option: {
                id: {
                    value: "billing"
                }
            }
        },
        channel: {
            guild: {}
        },
        user: { id: "user-1" },
        success: true,
        errorReason: null,
        messages: [],
        data: {
            contents: "transcript body"
        }
    }
    const deliveries: string[] = []

    const compiler = createWrappedTextTranscriptCompiler({
        init: null,
        async compile() {
            return compileResult
        },
        async ready() {
            return {
                channelMessage: { message: { content: "channel ready" } },
                creatorDmMessage: { message: { content: "creator ready" } }
            }
        }
    }, {
        routeReadyMessages: async (result, readyResult) => {
            return await routeTranscriptReadyMessages(result as any, readyResult, {
                resolveTargets: () => ({
                    optionId: "billing",
                    useGlobalDefault: false,
                    channels: ["123456789012345678", "123456789012345678", "234567890123456789"],
                    source: "option-override",
                    targets: ["123456789012345678", "123456789012345678", "234567890123456789"]
                }),
                fetchChannel: async (_guild, id) => createFakeTextChannel(id, "text", []),
                sendMessage: async (channel) => {
                    deliveries.push((channel as { id: string }).id)
                }
            })
        }
    ,
        createCompiler: (definition) => definition
    })

    const compiled = await compiler?.compile?.({} as never, {} as never, {} as never, null)
    const ready = await compiler?.ready?.(compileResult as never)

    assert.equal(compiled?.data?.contents, "transcript body")
    assert.deepEqual(deliveries, ["123456789012345678", "234567890123456789"])
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})

test("local html compiler preserves the html result shape while routing the ready message through inherited targets", async () => {
    const availableUntil = new Date("2026-03-28T12:00:00.000Z")
    const deliveries: string[] = []
    const compiler = createLocalHtmlTranscriptCompiler({
        async compileHtmlTranscript() {
            return {
                ticket: {
                    option: {
                        id: {
                            value: "billing"
                        }
                    }
                },
                channel: {
                    guild: {}
                },
                user: { id: "user-1" },
                success: true,
                errorReason: null,
                messages: [],
                data: {
                    url: "https://transcripts.example/slug",
                    availableUntil
                }
            }
        },
        async buildReadyMessages() {
            return {
                channelMessage: { message: { content: "channel ready" } },
                creatorDmMessage: { message: { content: "creator ready" } }
            }
        },
        routeReadyMessages: async (result, readyResult) => {
            return await routeTranscriptReadyMessages(result as any, readyResult, {
                resolveTargets: () => ({
                    optionId: "billing",
                    useGlobalDefault: true,
                    channels: [],
                    source: "global-default",
                    targets: ["123456789012345678"]
                }),
                fetchChannel: async (_guild, id) => createFakeTextChannel(id, "text", []),
                sendMessage: async (channel) => {
                    deliveries.push((channel as { id: string }).id)
                }
            })
        }
    ,
        createCompiler: (definition) => definition
    })

    const compiled = await compiler.compile?.({} as never, {} as never, {} as never, null)
    const ready = await compiler.ready?.({
        ticket: {
            option: {
                id: {
                    value: "billing"
                }
            }
        },
        channel: {
            guild: {}
        },
        user: { id: "user-1" },
        success: true,
        errorReason: null,
        messages: [],
        data: {
            url: "https://transcripts.example/slug",
            availableUntil
        }
    } as never)

    assert.equal(compiled?.data?.url, "https://transcripts.example/slug")
    assert.ok(compiled?.data?.availableUntil instanceof Date)
    assert.equal(compiled?.data?.availableUntil?.toISOString(), availableUntil.toISOString())
    assert.deepEqual(deliveries, ["123456789012345678"])
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})
