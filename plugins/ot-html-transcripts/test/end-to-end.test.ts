import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import { createLocalHtmlTranscriptCompiler } from "../compiler/html-compiler.js"
import { createWrappedTextTranscriptCompiler } from "../compiler/text-compiler.js"
import { TranscriptHttpServer } from "../http/server.js"
import { routeTranscriptReadyMessages } from "../routing/channel-delivery.js"
import { resolveEffectiveTranscriptChannelTargetsFromConfigs } from "../routing/option-routing.js"
import { TranscriptServiceCore } from "../service/transcript-service-core.js"
import { getTranscriptTempPath, resolveTranscriptStoragePaths } from "../storage/archive-paths.js"
import { createTestConfig } from "../test-support/helpers.js"

test("startup recovery marks stale building transcripts failed and removes orphan temp directories", async () => {
    const { config, root } = createTestConfig("startup-recovery")
    await fs.promises.rm(root, { recursive: true, force: true })

    const first = new TranscriptServiceCore()
    await first.initialize(config)

    try {
        await first.repository!.createTranscript({
            id: "tr-building",
            status: "building",
            ticketId: "ticket-building",
            channelId: "channel-building"
        })
        await fs.promises.mkdir(getTranscriptTempPath(config, "tr-building"), { recursive: true })
    } finally {
        await first.shutdown()
    }

    const recovered = new TranscriptServiceCore()
    await recovered.initialize(config)

    try {
        const summary = await recovered.getSummary()
        const transcript = await recovered.resolveAdminTarget("tr-building")

        assert.equal(summary.recoveredBuilds, 1)
        assert.equal(transcript?.status, "failed")
        assert.equal(fs.existsSync(getTranscriptTempPath(config, "tr-building")), false)
    } finally {
        await recovered.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("restart preserves transcript availability through the local HTTP server", async () => {
    const { config, root } = createTestConfig("restart-availability")
    await fs.promises.rm(root, { recursive: true, force: true })

    const archivePath = path.join(root, "archives", "tr-restart")
    await fs.promises.mkdir(path.join(archivePath, "assets"), { recursive: true })
    await fs.promises.writeFile(path.join(archivePath, "index.html"), "<html><body>persisted transcript</body></html>", "utf8")
    await fs.promises.writeFile(path.join(archivePath, "document.json"), "{}", "utf8")

    const first = new TranscriptServiceCore()
    await first.initialize(config)

    try {
        await first.createTranscript({
            id: "tr-restart",
            status: "active",
            ticketId: "ticket-restart",
            channelId: "channel-restart",
            archivePath
        }, "slug-restart")
    } finally {
        await first.shutdown()
    }

    const second = new TranscriptServiceCore()
    await second.initialize(config)
    const server = new TranscriptHttpServer({
        isHealthy: () => second.isHealthy(),
        getSummary: () => second.getSummary(),
        core: second
    })
    await server.start()

    try {
        const address = server.address
        assert.ok(address)

        const response = await fetch("http://127.0.0.1:" + address.port + "/transcripts/slug-restart")
        assert.equal(response.status, 200)
        assert.match(await response.text(), /persisted transcript/)
    } finally {
        await server.stop()
        await second.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("startup recovery removes leftover prepared export staging directories under the temp root", async () => {
    const { config, root } = createTestConfig("startup-export-recovery")
    await fs.promises.rm(root, { recursive: true, force: true })

    const archivePath = path.join(root, "archives", "tr-export-recovery")

    const first = new TranscriptServiceCore()
    await first.initialize(config)

    let preparedExportPath = ""
    try {
        await fs.promises.mkdir(archivePath, { recursive: true })
        await fs.promises.writeFile(path.join(archivePath, "document.json"), JSON.stringify({ version: "1.0", transcriptId: "tr-export-recovery", generatedAt: new Date().toISOString(), status: "active", warningCount: 0, warnings: [], searchText: "", totals: { messages: 0, embeds: 0, attachments: 0, reactions: 0, interactions: 0 }, style: { background: { enabled: false, backgroundColor: "#101010", backgroundAsset: null }, header: { enabled: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" }, stats: { enabled: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" }, favicon: { enabled: false, faviconAsset: null } }, bot: { name: "Bot", id: "bot-1", avatar: null }, guild: { name: "Guild", id: "guild-1", icon: null }, ticket: { name: "ticket", id: "channel", createdOn: false, closedOn: false, claimedOn: false, pinnedOn: false, deletedOn: false, createdBy: null, closedBy: null, claimedBy: null, pinnedBy: null, deletedBy: null }, participants: [], messages: [] }, null, 2), "utf8")
        await fs.promises.writeFile(path.join(archivePath, "index.html"), "<html><body>export me</body></html>", "utf8")

        await first.createTranscript({
            id: "tr-export-recovery",
            status: "active",
            archivePath
        })

        const prepared = await first.prepareTranscriptExport("tr-export-recovery")
        preparedExportPath = prepared.export?.filePath ?? ""
        assert.ok(preparedExportPath)
        assert.equal(fs.existsSync(preparedExportPath), true)
    } finally {
        await first.shutdown()
    }

    const second = new TranscriptServiceCore()
    await second.initialize(config)

    try {
        const { tempRoot } = resolveTranscriptStoragePaths(config)
        assert.equal(fs.existsSync(path.join(tempRoot, "exports")), false)
        assert.equal(fs.existsSync(preparedExportPath), false)
    } finally {
        await second.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("text mode explicit override sends to all normalized per-option destinations even when the global toggle is off", async () => {
    const deliveries: string[] = []
    const compiler = createWrappedTextTranscriptCompiler({
        init: null,
        async compile() {
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
                    contents: "transcript body"
                }
            }
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
                resolveTargets: () => resolveEffectiveTranscriptChannelTargetsFromConfigs([
                    {
                        id: "billing",
                        type: "ticket",
                        transcripts: {
                            useGlobalDefault: false,
                            channels: ["123456789012345678", "123456789012345678", "234567890123456789"]
                        }
                    }
                ], {
                    general: {
                        enableChannel: false,
                        channel: "999999999999999999"
                    }
                }, "billing"),
                fetchChannel: async (_guild, id) => ({
                    id,
                    isTextBased() {
                        return true
                    },
                    isDMBased() {
                        return false
                    },
                    async send() {
                        deliveries.push(id)
                    }
                })
            })
        }
    ,
        createCompiler: (definition) => definition
    })

    const ready = await compiler?.ready?.({
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
    } as never)

    assert.deepEqual(deliveries, ["123456789012345678", "234567890123456789"])
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})

test("html mode explicit override still routes to explicit channels and skips broken targets without failing", async () => {
    const deliveries: string[] = []
    const warnings: string[] = []
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
                    availableUntil: new Date("2026-03-28T12:00:00.000Z")
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
                resolveTargets: () => resolveEffectiveTranscriptChannelTargetsFromConfigs([
                    {
                        id: "billing",
                        type: "ticket",
                        transcripts: {
                            useGlobalDefault: false,
                            channels: ["123456789012345678", "234567890123456789", "345678901234567890"]
                        }
                    }
                ], {
                    general: {
                        enableChannel: false,
                        channel: "999999999999999999"
                    }
                }, "billing"),
                fetchChannel: async (_guild, id) => {
                    if (id == "234567890123456789") {
                        return null
                    }

                    if (id == "345678901234567890") {
                        return {
                            id,
                            isTextBased() {
                                return false
                            }
                        }
                    }

                    return {
                        id,
                        isTextBased() {
                            return true
                        },
                        isDMBased() {
                            return false
                        },
                        async send() {
                            deliveries.push(id)
                        }
                    }
                },
                logWarning: (warning) => {
                    warnings.push(warning.code + ":" + warning.destinationId)
                }
            })
        }
    ,
        createCompiler: (definition) => definition
    })

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
            availableUntil: new Date("2026-03-28T12:00:00.000Z")
        }
    } as never)

    assert.deepEqual(deliveries, ["123456789012345678"])
    assert.deepEqual(warnings, [
        "missing-channel:234567890123456789",
        "non-text-channel:345678901234567890"
    ])
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})

test("inherited default routing only sends when the global transcript channel is enabled and configured", async () => {
    const deliveries: string[] = []
    const inheritedEnabled = resolveEffectiveTranscriptChannelTargetsFromConfigs([
        {
            id: "billing",
            type: "ticket"
        }
    ], {
        general: {
            enableChannel: true,
            channel: "123456789012345678"
        }
    }, "billing")
    const inheritedDisabled = resolveEffectiveTranscriptChannelTargetsFromConfigs([
        {
            id: "billing",
            type: "ticket"
        }
    ], {
        general: {
            enableChannel: true,
            channel: "   "
        }
    }, "billing")

    assert.deepEqual(inheritedEnabled?.targets, ["123456789012345678"])
    assert.deepEqual(inheritedDisabled?.targets, [])

    const ready = await routeTranscriptReadyMessages({
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
        channelMessage: { message: { content: "channel ready" } },
        creatorDmMessage: { message: { content: "creator ready" } }
    }, {
        resolveTargets: () => inheritedEnabled!,
        fetchChannel: async (_guild, id) => ({
            id,
            isTextBased() {
                return true
            },
            isDMBased() {
                return false
            },
            async send() {
                deliveries.push(id)
            }
        })
    })

    assert.deepEqual(deliveries, ["123456789012345678"])
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})

test("explicit no-channel routing preserves DM delivery and posts no transcript channel message", async () => {
    let delivered = false

    const ready = await routeTranscriptReadyMessages({
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
        channelMessage: { message: { content: "channel ready" } },
        creatorDmMessage: { message: { content: "creator ready" } }
    }, {
        resolveTargets: () => ({
            optionId: "billing",
            useGlobalDefault: false,
            channels: [],
            source: "disabled",
            targets: []
        }),
        sendMessage: async () => {
            delivered = true
        }
    })

    assert.equal(delivered, false)
    assert.deepEqual(ready, {
        creatorDmMessage: { message: { content: "creator ready" } },
        participantDmMessage: undefined,
        activeAdminDmMessage: undefined,
        everyAdminDmMessage: undefined
    })
})
