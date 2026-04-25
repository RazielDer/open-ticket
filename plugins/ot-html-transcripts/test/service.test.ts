import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import type { LocalAssetRef, LocalTranscriptDocument } from "../contracts/document.js"
import type { TranscriptViewerAccessContext } from "../contracts/types.js"
import { DEFAULT_PLUGIN_CONFIG } from "../config/defaults.js"
import { buildTranscriptHtmlCsp } from "../http/security.js"
import { TranscriptServiceCore, type TranscriptBuildDependencies } from "../service/transcript-service-core.js"
import { resolveTranscriptStoragePaths } from "../storage/archive-paths.js"

const DASHBOARD_RUNTIME_API_SYMBOL = Symbol.for("open-ticket.ot-dashboard")

function createServiceConfig(testName: string) {
    const safeName = testName.replaceAll(/[^a-z0-9-]/gi, "-").toLowerCase()
    const root = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", ".test-runtime", safeName)

    return {
        config: {
            ...DEFAULT_PLUGIN_CONFIG,
            server: {
                ...DEFAULT_PLUGIN_CONFIG.server,
                publicBaseUrl: "http://127.0.0.1"
            },
            storage: {
                archiveRoot: path.join(root, "archives"),
                sqlitePath: path.join(root, "database", "transcripts.sqlite")
            },
            links: {
                ...DEFAULT_PLUGIN_CONFIG.links,
                expiry: {
                    ...DEFAULT_PLUGIN_CONFIG.links.expiry
                }
            },
            retention: {
                ...DEFAULT_PLUGIN_CONFIG.retention,
                statuses: {
                    ...DEFAULT_PLUGIN_CONFIG.retention.statuses
                }
            }
        },
        root
    }
}

async function withService(testName: string, callback: (service: TranscriptServiceCore, root: string) => Promise<void>) {
    await withCustomService(testName, {}, callback)
}

async function withCustomService(testName: string, dependencies: Partial<TranscriptBuildDependencies>, callback: (service: TranscriptServiceCore, root: string) => Promise<void>) {
    const { config, root } = createServiceConfig(testName)
    await fs.promises.rm(root, { recursive: true, force: true })

    const service = new TranscriptServiceCore(dependencies)
    await service.initialize(config)

    try {
        await callback(service, root)
    } finally {
        await service.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
}

async function withConfiguredService(
    testName: string,
    configure: (config: ReturnType<typeof createServiceConfig>["config"]) => void,
    dependencies: Partial<TranscriptBuildDependencies>,
    callback: (service: TranscriptServiceCore, root: string) => Promise<void>
) {
    const { config, root } = createServiceConfig(testName)
    configure(config)
    await fs.promises.rm(root, { recursive: true, force: true })

    const service = new TranscriptServiceCore(dependencies)
    await service.initialize(config)

    try {
        await callback(service, root)
    } finally {
        await service.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
}

async function withDashboardRuntimeApi(
    runtimeApi: (
        ((routePath: string) => string | null)
        | {
            buildPublicUrl?: ((routePath: string) => string | null) | null
            buildViewerPublicUrl?: ((routePath: string) => string | null) | null
        }
        | null
    ),
    callback: () => Promise<void>
) {
    const registry = globalThis as Record<symbol, {
        buildPublicUrl: (routePath: string) => string | null
        buildViewerPublicUrl: (routePath: string) => string | null
    } | undefined>
    const previous = registry[DASHBOARD_RUNTIME_API_SYMBOL]

    if (runtimeApi) {
        const buildPublicUrl = typeof runtimeApi == "function"
            ? runtimeApi
            : runtimeApi.buildPublicUrl ?? null
        const buildViewerPublicUrl = typeof runtimeApi == "function"
            ? runtimeApi
            : runtimeApi.buildViewerPublicUrl ?? buildPublicUrl ?? null

        if (!buildPublicUrl || !buildViewerPublicUrl) {
            delete registry[DASHBOARD_RUNTIME_API_SYMBOL]
        } else {
            registry[DASHBOARD_RUNTIME_API_SYMBOL] = {
                buildPublicUrl,
                buildViewerPublicUrl
            }
        }
    } else {
        delete registry[DASHBOARD_RUNTIME_API_SYMBOL]
    }

    try {
        await callback()
    } finally {
        if (previous) {
            registry[DASHBOARD_RUNTIME_API_SYMBOL] = previous
        } else {
            delete registry[DASHBOARD_RUNTIME_API_SYMBOL]
        }
    }
}

function createViewerAccessContext(overrides: Partial<TranscriptViewerAccessContext> = {}): TranscriptViewerAccessContext {
    return {
        membership: "member",
        liveTier: null,
        ownerOverride: false,
        source: "live",
        freshnessMs: 0,
        revalidatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString(),
        ...overrides
    }
}

function createFakeDocument(transcriptId: string): LocalTranscriptDocument {
    return {
        version: "1.0" as const,
        transcriptId,
        generatedAt: new Date().toISOString(),
        status: "active" as const,
        warningCount: 0,
        warnings: [] as Array<{ code: string; message: string; sourceUrl?: string | null }>,
        searchText: "compiled transcript",
        totals: {
            messages: 2,
            embeds: 0,
            attachments: 1,
            reactions: 0,
            interactions: 0
        },
        style: {
            background: { enabled: false, backgroundColor: "#313338", backgroundAsset: null },
            header: { enabled: false, backgroundColor: "#1e1f22", decoColor: "#5865f2", textColor: "#f2f3f5" },
            stats: { enabled: false, backgroundColor: "#2b2d31", keyTextColor: "#b5bac1", valueTextColor: "#f2f3f5", hideBackgroundColor: "#404249", hideTextColor: "#dbdee1" },
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

function createFakeCompileInputs(ticketId: string, channelId: string, guildId = "guild-1"): {
    ticket: {
        id: { value: string }
        get(key: string): { value: string | null }
    }
    channel: {
        id: string
        name: string
        guild: {
            id: string
            name: string
        }
    }
    user: {
        id: string
        displayName: string
        displayAvatarURL(): string
        bot: boolean
        system: boolean
    }
} {
    return {
        ticket: {
            id: { value: ticketId },
            get: (key: string) => {
                if (key == "opendiscord:opened-by") return { value: "user-1" }
                return { value: null }
            }
        },
        channel: {
            id: channelId,
            name: channelId,
            guild: {
                id: guildId,
                name: "Guild 1"
            }
        },
        user: {
            id: "moderator-1",
            displayName: "Moderator",
            displayAvatarURL: () => "",
            bot: false,
            system: false
        }
    }
}

function createCompileDependencies(options: {
    failReason?: string
    warningMessage?: string
    assetBytes?: number
    archiveBytes?: number
    attachmentCount?: number
} = {}): Partial<TranscriptBuildDependencies> {
    return {
        collectMessages: async () => {
            if (options.failReason) {
                throw new Error(options.failReason)
            }

            return [
                { id: "m-1", content: "hello" },
                { id: "m-2", content: "world" }
            ]
        },
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
        buildDocument: async (transcriptId) => {
            const document = createFakeDocument(transcriptId)
            document.totals.attachments = options.attachmentCount ?? 1
            return document
        },
        mirrorAssets: async () => ({
            warnings: options.warningMessage ? [{
                code: "asset-warning",
                message: options.warningMessage
            }] : [],
            totalBytes: options.assetBytes ?? 25,
            mirroredCount: 0,
            assetRecords: []
        }),
        writeArchive: async (tempArchivePath, document) => {
            const documentJson = JSON.stringify(document, null, 2)
            const html = "<html><body>compiled transcript</body></html>"

            await fs.promises.writeFile(path.join(tempArchivePath, "document.json"), documentJson, "utf8")
            await fs.promises.writeFile(path.join(tempArchivePath, "index.html"), html, "utf8")

            return {
                documentBytes: Buffer.byteLength(documentJson, "utf8"),
                htmlBytes: Buffer.byteLength(html, "utf8"),
                totalBytes: options.archiveBytes ?? 75
            }
        }
    }
}

function createMirroredAssetRef(assetName: string, archivePath: string, purpose = "attachment"): LocalAssetRef {
    return {
        sourceUrl: "https://example.invalid/" + assetName,
        purpose,
        inlinePreferred: false,
        assetName,
        archivePath,
        mimeType: "image/png",
        byteSize: 12,
        status: "mirrored" as const,
        unavailableReason: null
    }
}

function createPreviewStyleDraft() {
    return {
        background: {
            enableCustomBackground: true,
            backgroundColor: "#08131d",
            backgroundImage: "https://cdn.example.com/background-preview.png"
        },
        header: {
            enableCustomHeader: true,
            backgroundColor: "#0f2230",
            decoColor: "#3dd9eb",
            textColor: "#eafcff"
        },
        stats: {
            enableCustomStats: true,
            backgroundColor: "#0c1b28",
            keyTextColor: "#7cb9c5",
            valueTextColor: "#eafcff",
            hideBackgroundColor: "#153447",
            hideTextColor: "#dcfbff"
        },
        favicon: {
            enableCustomFavicon: true,
            imageUrl: "https://cdn.example.com/favicon-preview.png"
        }
    }
}

test("html transcript service exposes bridge-safe readiness and compile helpers for whitelist staging", () => {
    const serviceSourcePath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "service", "transcript-service.ts")
    const serviceSource = fs.readFileSync(serviceSourcePath, "utf8")

    assert.match(serviceSource, /export class OTHtmlTranscriptService extends api\.ODManagerData/)
    assert.match(serviceSource, /async validateWhitelistBridgeTranscriptReadiness\(/)
    assert.match(serviceSource, /async compileWhitelistBridgeTranscript\(/)
})

test("whitelist bridge readiness messages stay explicit for wrong-guild and deleted transcript lanes", () => {
    const serviceSourcePath = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "service", "transcript-service.ts")
    const serviceSource = fs.readFileSync(serviceSourcePath, "utf8")

    assert.match(serviceSource, /configured lane may have been deleted/i)
    assert.match(serviceSource, /same OT guild as the ticket/i)
    assert.match(serviceSource, /verified as a text channel/i)
})

async function writeArchiveFixture(
    archivePath: string,
    document: object,
    options: {
        writeDocument?: boolean
        writeHtml?: boolean
        html?: string
        assetFiles?: string[]
    } = {}
) {
    await fs.promises.mkdir(archivePath, { recursive: true })

    if (options.writeDocument !== false) {
        await fs.promises.writeFile(path.join(archivePath, "document.json"), JSON.stringify(document, null, 2), "utf8")
    }

    if (options.writeHtml !== false) {
        await fs.promises.writeFile(
            path.join(archivePath, "index.html"),
            options.html ?? "<html><body>fixture transcript</body></html>",
            "utf8"
        )
    }

    for (const assetFile of options.assetFiles ?? []) {
        const assetPath = path.join(archivePath, assetFile)
        await fs.promises.mkdir(path.dirname(assetPath), { recursive: true })
        await fs.promises.writeFile(assetPath, "asset", "utf8")
    }
}

test("service initialization reports healthy summary state and recovery metadata", async () => {
    await withService("initialize-summary", async (service) => {
        assert.equal(service.isHealthy(), true)

        const summary = await service.getSummary()
        assert.equal(summary.queueDepth, 0)
        assert.equal(summary.recoveredBuilds, 0)
    })
})

test("service getTranscriptDetail exposes public urls, links, participants, assets, and status reasons", async () => {
    await withService("transcript-detail", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-detail")
        await fs.promises.mkdir(archivePath, { recursive: true })

        const created = await service.createTranscript({
            id: "tr-detail",
            status: "partial",
            ticketId: "ticket-detail",
            channelId: "channel-detail",
            archivePath,
            warningCount: 2,
            statusReason: "2 archive warning(s) were recorded during build."
        }, "slug-detail")

        assert.ok(created)

        await service.repository!.createTranscriptLink({
            transcriptId: "tr-detail",
            slug: "slug-detail-old",
            status: "revoked",
            reason: "superseded",
            revokedAt: "2026-03-25T00:00:00.000Z"
        })
        await service.repository!.replaceParticipants("tr-detail", [
            { userId: "user-1", displayName: "Creator", role: "creator" },
            { userId: "user-2", displayName: "Admin", role: "admin" },
            { userId: "user-3", displayName: "Participant", role: "participant" }
        ])
        await service.repository!.replaceAssets("tr-detail", [
            {
                assetName: "asset.png",
                sourceUrl: "https://example.invalid/asset.png",
                localPath: "assets/asset.png",
                mimeType: "image/png",
                byteSize: 128,
                status: "mirrored",
                reason: null
            },
            {
                assetName: "avatar.png",
                sourceUrl: "https://example.invalid/avatar.png",
                localPath: "",
                mimeType: "application/octet-stream",
                byteSize: 0,
                status: "failed",
                reason: "HTTP 404 while downloading asset."
            }
        ])

        const detail = await service.getTranscriptDetail("slug-detail-old")
        assert.ok(detail)
        assert.equal(detail?.transcript.id, "tr-detail")
        assert.equal(detail?.transcript.publicUrl, service.buildPublicTranscriptUrl("slug-detail"))
        assert.equal(detail?.transcript.statusReason, "2 archive warning(s) were recorded during build.")
        assert.equal(detail?.links.length, 2)
        assert.equal(detail?.links[0]?.publicUrl?.startsWith("http://127.0.0.1/transcripts/"), true)
        assert.equal(detail?.participants.map((item) => item.role).join(","), "creator,admin,participant")
        assert.equal(detail?.assets[0]?.status, "failed")
        assert.equal(detail?.assets[0]?.reason, "HTTP 404 while downloading asset.")
        assert.equal(detail?.assets[1]?.archiveRelativePath, "assets/asset.png")
    })
})

test("service listTicketAnalyticsHistory reads analytics-safe ticket metadata from document archives", async () => {
    await withService("ticket-analytics-history", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-analytics")
        await fs.promises.mkdir(archivePath, { recursive: true })
        const document = createFakeDocument("tr-analytics")
        document.version = "2.0"
        document.ticket.id = "ticket-analytics"
        document.ticket.createdOn = Date.parse("2026-04-20T10:00:00.000Z")
        document.ticket.closedOn = Date.parse("2026-04-20T12:00:00.000Z")
        document.ticket.createdBy = { id: "creator-1", name: "Creator", color: "#ffffff", avatar: null, bot: false, verifiedBot: false, system: false }
        document.ticket.metadata = {
            transportMode: "private_thread",
            transportParentChannelId: "parent-1",
            transportParentMessageId: null,
            assignedTeamId: "triage",
            assignedStaffUserId: "staff-1",
            assignmentStrategy: "manual",
            firstStaffResponseAt: Date.parse("2026-04-20T10:15:00.000Z"),
            resolvedAt: Date.parse("2026-04-20T12:00:00.000Z"),
            awaitingUserState: null,
            awaitingUserSince: null,
            closeRequestState: null,
            closeRequestBy: null,
            closeRequestAt: null,
            integrationProfileId: null,
            aiAssistProfileId: null
        }
        await fs.promises.writeFile(path.join(archivePath, "document.json"), JSON.stringify(document, null, 2), "utf8")
        await fs.promises.writeFile(path.join(archivePath, "index.html"), "<html></html>", "utf8")
        await service.createTranscript({
            id: "tr-analytics",
            status: "active",
            ticketId: "ticket-analytics",
            channelId: "ticket-analytics",
            creatorId: "creator-1",
            archivePath,
            createdAt: "2026-04-20T12:01:00.000Z"
        })

        const result = await service.listTicketAnalyticsHistory({
            openedFrom: "2026-04-20T00:00:00.000Z",
            openedTo: "2026-04-21T00:00:00.000Z",
            teamId: "triage",
            assigneeId: "staff-1",
            transportMode: "private_thread",
            limit: 200
        })

        assert.equal(result.items.length, 1)
        assert.equal(result.items[0].ticketId, "ticket-analytics")
        assert.equal(result.items[0].transcriptId, "tr-analytics")
        assert.equal(result.items[0].creatorId, "creator-1")
        assert.equal(result.items[0].assignedTeamId, "triage")
        assert.equal(result.items[0].assignedStaffUserId, "staff-1")
        assert.equal(result.items[0].transportMode, "private_thread")
        assert.equal(result.items[0].firstStaffResponseAt, Date.parse("2026-04-20T10:15:00.000Z"))
        assert.equal(result.items[0].resolvedAt, Date.parse("2026-04-20T12:00:00.000Z"))
        assert.equal(result.nextCursor, null)
        assert.equal(result.truncated, false)
    })
})

test("successful builds log build-started then build-succeeded and resolve event history through admin targets", async () => {
    await withCustomService("build-events-success", createCompileDependencies(), async (service) => {
        const { ticket, channel, user } = createFakeCompileInputs("ticket-build-success", "channel-build-success")
        const result = await service.compileHtmlTranscript(ticket, channel, user)
        assert.equal(result.success, true)

        const transcript = (await service.listTranscripts({ limit: 1 })).items[0]
        assert.ok(transcript?.activeSlug)
        assert.equal(transcript?.status, "active")

        const byId = await service.listTranscriptEvents(transcript!.id, {})
        const bySlug = await service.listTranscriptEvents(transcript!.activeSlug!, {})
        const byTicket = await service.listTranscriptEvents(ticket.id.value, {})
        const byChannel = await service.listTranscriptEvents(channel.id, {})

        assert.deepEqual(byId.items.map((item) => item.type), ["build-succeeded", "build-started"])
        assert.deepEqual(bySlug.items.map((item) => item.type), ["build-succeeded", "build-started"])
        assert.deepEqual(byTicket.items.map((item) => item.type), ["build-succeeded", "build-started"])
        assert.deepEqual(byChannel.items.map((item) => item.type), ["build-succeeded", "build-started"])
        assert.deepEqual(byId.items[0]?.details, {
            messageCount: 2,
            attachmentCount: 1,
            warningCount: 0,
            totalBytes: 100
        })
        assert.deepEqual(byId.items[1]?.details, {
            ticketId: "ticket-build-success",
            channelId: "channel-build-success",
            guildId: "guild-1"
        })
    })
})

test("compileHtmlTranscript creates an expiring link and matching availability when expiry is enabled", async () => {
    await withConfiguredService(
        "compile-expiring-link",
        (config) => {
            config.links.expiry.enabled = true
            config.links.expiry.ttlDays = 7
        },
        createCompileDependencies(),
        async (service) => {
            const { ticket, channel, user } = createFakeCompileInputs("ticket-expiring-link", "channel-expiring-link")
            const result = await service.compileHtmlTranscript(ticket, channel, user)
            const detail = await service.getTranscriptDetail(ticket.id.value)

            assert.equal(result.success, true)
            assert.ok(result.data)
            assert.ok(detail)

            const activeLink = detail!.links.find((link) => link.status == "active")
            assert.ok(activeLink?.expiresAt)
            assert.equal(result.data!.availableUntil.toISOString(), activeLink!.expiresAt)
            assert.equal(result.data!.url, detail!.transcript.publicUrl)
            assert.equal(
                result.data!.availableUntil.getTime() - Date.parse(activeLink!.createdAt),
                7 * 86400000
            )
        }
    )
})

test("compileHtmlTranscript keeps permanent availability when expiry is disabled", async () => {
    await withCustomService("compile-permanent-link", createCompileDependencies(), async (service) => {
        const { ticket, channel, user } = createFakeCompileInputs("ticket-permanent-link", "channel-permanent-link")
        const result = await service.compileHtmlTranscript(ticket, channel, user)
        const detail = await service.getTranscriptDetail(ticket.id.value)

        assert.equal(result.success, true)
        assert.ok(result.data)
        assert.ok(detail)

        const activeLink = detail!.links.find((link) => link.status == "active")
        assert.equal(activeLink?.expiresAt, null)
        assert.equal(result.data!.availableUntil.toISOString(), "2100-01-01T00:00:00.000Z")
    })
})

test("listTranscriptStylePresets returns the locked preset ids and exact draft values", async () => {
    await withService("style-presets", async (service) => {
        const presets = await service.listTranscriptStylePresets()

        assert.deepEqual(presets.map((preset) => preset.id), ["discord-classic"])
        assert.deepEqual(presets[0], {
            id: "discord-classic",
            label: "Discord Default",
            description: "Locked Discord dark theme used for every HTML transcript.",
            draft: {
                background: {
                    enableCustomBackground: false,
                    backgroundColor: "#313338",
                    backgroundImage: ""
                },
                header: {
                    enableCustomHeader: false,
                    backgroundColor: "#1e1f22",
                    decoColor: "#5865f2",
                    textColor: "#f2f3f5"
                },
                stats: {
                    enableCustomStats: false,
                    backgroundColor: "#2b2d31",
                    keyTextColor: "#b5bac1",
                    valueTextColor: "#f2f3f5",
                    hideBackgroundColor: "#404249",
                    hideTextColor: "#dbdee1"
                },
                favicon: {
                    enableCustomFavicon: false,
                    imageUrl: ""
                }
            }
        })
    })
})

test("renderTranscriptStylePreview uses the deterministic sample document, preview CSP, and direct background and favicon URLs", async () => {
    await withService("style-preview", async (service) => {
        const styleDraft = createPreviewStyleDraft()
        const result = await service.renderTranscriptStylePreview(styleDraft)

        assert.equal(result.status, "ok")
        assert.match(result.contentSecurityPolicy || "", /frame-ancestors 'self'/)
        assert.match(result.contentSecurityPolicy || "", /img-src 'self' data: http: https:/)
        assert.equal(buildTranscriptHtmlCsp(), "default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'self' data:; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; media-src 'self'; object-src 'none'; script-src 'none'; style-src 'unsafe-inline'")
        assert.match(result.html || "", /ops-escalation-preview/)
        assert.match(result.html || "", /Archive Warnings/)
        assert.match(result.html || "", /Reply Context/)
        assert.match(result.html || "", /Escalation path/)
        assert.match(result.html || "", /error-screenshot\.png/)
        assert.match(result.html || "", /#313338/)
        assert.match(result.html || "", /#1e1f22/)
        assert.match(result.html || "", /#5865f2/)
        assert.doesNotMatch(result.html || "", /https:\/\/cdn\.example\.com\/background-preview\.png/)
        assert.doesNotMatch(result.html || "", /https:\/\/cdn\.example\.com\/favicon-preview\.png/)
    })
})

test("renderTranscriptStylePreview returns an unavailable placeholder when the service is not initialized", async () => {
    const service = new TranscriptServiceCore()
    const result = await service.renderTranscriptStylePreview(createPreviewStyleDraft())

    assert.equal(result.status, "unavailable")
    assert.match(result.message, /preview/i)
    assert.match(result.html || "", /Preview is unavailable/)
    assert.match(result.contentSecurityPolicy || "", /frame-ancestors 'self'/)
})

test("private-discord mode compiles dashboard viewer URLs and reports ready access policy when dashboard runtime URL building is available", async () => {
    await withDashboardRuntimeApi(
        {
            buildPublicUrl: (routePath) => `https://dashboard.example/dash${routePath}`,
            buildViewerPublicUrl: (routePath) => `https://records.example/dash${routePath}`
        },
        async () => {
            await withConfiguredService(
                "compile-private-discord",
                (config) => {
                    config.links.access.mode = "private-discord"
                    config.server.publicBaseUrl = ""
                },
                createCompileDependencies(),
                async (service) => {
                    const { ticket, channel, user } = createFakeCompileInputs("ticket-private-discord", "channel-private-discord")
                    const result = await service.compileHtmlTranscript(ticket, channel, user)
                    const detail = await service.getTranscriptDetail(ticket.id.value)
                    const accessPolicy = await service.getAccessPolicy()

                    assert.equal(result.success, true)
                    assert.equal(accessPolicy.mode, "private-discord")
                    assert.equal(accessPolicy.viewerReady, true)
                    assert.match(accessPolicy.message, /ready/i)
                    assert.equal(result.data?.url.startsWith("https://records.example/dash/transcripts/"), true)
                    assert.equal(detail?.transcript.publicUrl?.startsWith("https://records.example/dash/transcripts/"), true)
                    assert.equal(detail?.links.every((link) => (link.publicUrl || "").startsWith("https://records.example/dash/transcripts/")), true)
                }
            )
        }
    )
})

test("private-discord mode fails closed for compile and reissue when dashboard viewer URL building is unavailable but list and detail hydration stay readable", async () => {
    await withDashboardRuntimeApi(null, async () => {
        await withConfiguredService(
            "private-discord-not-ready",
            (config) => {
                config.links.access.mode = "private-discord"
                config.server.publicBaseUrl = ""
            },
            createCompileDependencies(),
            async (service, root) => {
                const accessPolicy = await service.getAccessPolicy()
                const { ticket, channel, user } = createFakeCompileInputs("ticket-private-not-ready", "channel-private-not-ready")
                const compileResult = await service.compileHtmlTranscript(ticket, channel, user)

                assert.equal(accessPolicy.mode, "private-discord")
                assert.equal(accessPolicy.viewerReady, false)
                assert.match(accessPolicy.message, /unavailable/i)
                assert.match(accessPolicy.message, /whitelist review submit stays blocked/i)
                assert.equal(compileResult.success, false)
                assert.match(compileResult.errorReason || "", /dashboard transcript viewer urls are unavailable/i)
                assert.match(compileResult.errorReason || "", /whitelist review submit stays blocked/i)

                const archivePath = path.join(root, "archives", "tr-private-existing")
                await writeArchiveFixture(archivePath, createFakeDocument("tr-private-existing"), {
                    html: `<html><body><img src="${"__OT_TRANSCRIPT_ASSET_BASE__"}asset.png"></body></html>`,
                    assetFiles: ["assets/asset.png"]
                })
                await service.createTranscript({
                    id: "tr-private-existing",
                    status: "active",
                    archivePath
                }, "slug-private-existing")
                await service.repository!.replaceParticipants("tr-private-existing", [
                    { userId: "creator-1", displayName: "Creator", role: "creator" }
                ])
                await service.repository!.replaceAssets("tr-private-existing", [
                    {
                        assetName: "asset.png",
                        sourceUrl: "https://example.invalid/asset.png",
                        localPath: "assets/asset.png",
                        mimeType: "image/png",
                        byteSize: 12,
                        status: "mirrored",
                        reason: null
                    }
                ])

                assert.equal((await service.listTranscripts({ limit: 10 })).items[0]?.publicUrl, null)
                assert.equal((await service.getTranscriptDetail("tr-private-existing"))?.transcript.publicUrl, null)

                const reissue = await service.reissueTranscript("tr-private-existing", "viewer unavailable")
                const detail = await service.getTranscriptDetail("tr-private-existing")
                assert.equal(reissue.ok, false)
                assert.match(reissue.message, /dashboard transcript viewer urls are unavailable/i)
                assert.equal(detail?.links.filter((link) => link.status == "active").length, 1)
            }
        )
    })
})

test("private-discord viewer methods enforce live creator and staff access, keep owner override direct-only, and serve mirrored assets through viewer-host paths", async () => {
    await withDashboardRuntimeApi(
        {
            buildPublicUrl: (routePath) => `https://dashboard.example${routePath}`,
            buildViewerPublicUrl: (routePath) => `https://records.example${routePath}`
        },
        async () => {
            await withConfiguredService(
                "private-viewer-access",
                (config) => {
                    config.links.access.mode = "private-discord"
                    config.server.publicBaseUrl = ""
                },
                {},
                async (service, root) => {
                    const archivePath = path.join(root, "archives", "tr-private-viewer")
                    await writeArchiveFixture(archivePath, createFakeDocument("tr-private-viewer"), {
                        html: "<html><body><img src=\"__OT_TRANSCRIPT_ASSET_BASE__asset.png\"></body></html>",
                        assetFiles: ["assets/asset.png"]
                    })
                    await service.createTranscript({
                        id: "tr-private-viewer",
                        status: "active",
                        creatorId: "creator-1",
                        archivePath
                    }, "slug-private-viewer")
                    await service.repository!.replaceParticipants("tr-private-viewer", [
                        { userId: "admin-1", displayName: "Admin", role: "admin" },
                        { userId: "participant-1", displayName: "Participant", role: "participant" }
                    ])
                    await service.repository!.replaceAssets("tr-private-viewer", [
                        {
                            assetName: "asset.png",
                            sourceUrl: "https://example.invalid/asset.png",
                            localPath: "assets/asset.png",
                            mimeType: "image/png",
                            byteSize: 12,
                            status: "mirrored",
                            reason: null
                        }
                    ])

                    const creatorAccess = createViewerAccessContext()
                    const staffAccess = createViewerAccessContext({ liveTier: "reviewer" })
                    const ownerAccess = createViewerAccessContext({ liveTier: "admin", ownerOverride: true })
                    const staleUnresolvedAccess = createViewerAccessContext({
                        membership: "unresolved",
                        liveTier: null,
                        source: "live",
                        freshnessMs: 60_001
                    })
                    const creatorDocument = await service.renderViewerTranscript("slug-private-viewer", "creator-1", "/dash/transcripts/slug-private-viewer/assets/", creatorAccess)
                    const creatorAsset = await service.resolveViewerTranscriptAsset("slug-private-viewer", "asset.png", "creator-1", creatorAccess)
                    const creatorList = await service.listViewerAccessibleTranscripts("creator-1", creatorAccess)
                    const creatorDeniedWithoutGuild = await service.renderViewerTranscript(
                        "slug-private-viewer",
                        "creator-1",
                        "/dash/transcripts/slug-private-viewer/assets/",
                        createViewerAccessContext({ membership: "missing" })
                    )
                    const staffDocument = await service.renderViewerTranscript("slug-private-viewer", "admin-1", "/dash/transcripts/slug-private-viewer/assets/", staffAccess)
                    const staffList = await service.listViewerAccessibleTranscripts("admin-1", staffAccess)
                    const participantDenied = await service.renderViewerTranscript("slug-private-viewer", "participant-1", "/dash/transcripts/slug-private-viewer/assets/", staffAccess)
                    const participantList = await service.listViewerAccessibleTranscripts("participant-1", staffAccess)
                    const staleDenied = await service.renderViewerTranscript("slug-private-viewer", "admin-1", "/dash/transcripts/slug-private-viewer/assets/", staleUnresolvedAccess)
                    const ownerOverride = await service.renderViewerTranscript("slug-private-viewer", "owner-1", "/dash/transcripts/slug-private-viewer/assets/", ownerAccess)
                    const ownerList = await service.listViewerAccessibleTranscripts("owner-1", ownerAccess)
                    const unauthorized = await service.renderViewerTranscript("slug-private-viewer", "outsider-1", "/dash/transcripts/slug-private-viewer/assets/", staffAccess)
                    const publicMode = await service.renderViewerTranscript("missing", "creator-1", "/dash/transcripts/missing/assets/", creatorAccess)
                    const detail = await service.getTranscriptDetail("tr-private-viewer")

                    assert.equal(creatorDocument.status, "ok")
                    assert.equal(creatorDocument.accessPath, "creator-current-guild")
                    assert.match(creatorDocument.html || "", /\/dash\/transcripts\/slug-private-viewer\/assets\/asset\.png/)
                    assert.match(creatorDocument.contentSecurityPolicy || "", /frame-ancestors 'none'/)
                    assert.equal(creatorAsset.status, "ok")
                    assert.equal(creatorAsset.accessPath, "creator-current-guild")
                    assert.equal(creatorAsset.contentType, "image/png")
                    assert.equal(fs.existsSync(creatorAsset.filePath || ""), true)
                    assert.equal(creatorList.total, 1)
                    assert.equal(creatorList.items[0]?.accessPath, "creator-current-guild")
                    assert.equal(creatorList.items[0]?.publicUrl?.startsWith("https://records.example/transcripts/"), true)
                    assert.equal(detail?.transcript.publicUrl?.startsWith("https://records.example/transcripts/"), true)
                    assert.equal(detail?.links.every((link) => (link.publicUrl || "").startsWith("https://records.example/transcripts/")), true)
                    assert.equal(creatorDeniedWithoutGuild.status, "not-found")

                    assert.equal(staffDocument.status, "ok")
                    assert.equal(staffDocument.accessPath, "recorded-admin-current-staff")
                    assert.equal(staffList.total, 1)
                    assert.equal(staffList.items[0]?.accessPath, "recorded-admin-current-staff")

                    assert.equal(participantDenied.status, "not-found")
                    assert.equal(participantList.total, 0)
                    assert.equal(staleDenied.status, "not-found")

                    assert.equal(ownerOverride.status, "ok")
                    assert.equal(ownerOverride.accessPath, "owner-override")
                    assert.equal(ownerList.total, 0)
                    assert.equal(unauthorized.status, "not-found")

                    service.config!.links.access.mode = "public"
                    assert.equal(
                        (await service.renderViewerTranscript("slug-private-viewer", "creator-1", "/dash/transcripts/slug-private-viewer/assets/", creatorAccess)).status,
                        "not-found"
                    )
                    assert.equal(publicMode.status, "not-found")
                }
            )
        }
    )
})

test("private-discord viewer audit events are recorded only for successful document renders", async () => {
    await withDashboardRuntimeApi(
        {
            buildPublicUrl: (routePath) => `https://dashboard.example${routePath}`,
            buildViewerPublicUrl: (routePath) => `https://records.example${routePath}`
        },
        async () => {
            await withConfiguredService(
                "private-viewer-audit-events",
                (config) => {
                    config.links.access.mode = "private-discord"
                    config.server.publicBaseUrl = ""
                },
                {},
                async (service, root) => {
                    const archivePath = path.join(root, "archives", "tr-private-viewer-audit")
                    await writeArchiveFixture(archivePath, createFakeDocument("tr-private-viewer-audit"), {
                        html: "<html><body><img src=\"__OT_TRANSCRIPT_ASSET_BASE__asset.png\"></body></html>",
                        assetFiles: ["assets/asset.png"]
                    })
                    await service.createTranscript({
                        id: "tr-private-viewer-audit",
                        status: "active",
                        creatorId: "creator-1",
                        archivePath
                    }, "slug-private-viewer-audit")
                    await service.repository!.replaceParticipants("tr-private-viewer-audit", [
                        { userId: "participant-1", displayName: "Participant", role: "participant" },
                        { userId: "admin-1", displayName: "Admin", role: "admin" }
                    ])
                    await service.repository!.replaceAssets("tr-private-viewer-audit", [
                        {
                            assetName: "asset.png",
                            sourceUrl: "https://example.invalid/asset.png",
                            localPath: "assets/asset.png",
                            mimeType: "image/png",
                            byteSize: 12,
                            status: "mirrored",
                            reason: null
                        }
                    ])

                    const detail = await service.getTranscriptDetail("tr-private-viewer-audit")
                    const activeLink = detail?.links.find((link) => link.status == "active")
                    assert.ok(activeLink)

                    const creatorAccess = createViewerAccessContext()
                    const staffAccess = createViewerAccessContext({ liveTier: "reviewer" })
                    const firstDocument = await service.renderViewerTranscript(
                        "slug-private-viewer-audit",
                        "admin-1",
                        "/dash/transcripts/slug-private-viewer-audit/assets/",
                        staffAccess
                    )
                    const firstEvents = await service.listTranscriptEvents("tr-private-viewer-audit", {})

                    assert.equal(firstDocument.status, "ok")
                    assert.equal(firstDocument.accessPath, "recorded-admin-current-staff")
                    assert.deepEqual(firstEvents.items.map((item) => item.type), ["viewer-accessed"])
                    assert.equal(firstEvents.items[0]?.reason, null)
                    assert.deepEqual(firstEvents.items[0]?.details, {
                        viewerUserId: "admin-1",
                        viewerRole: "admin",
                        accessPath: "recorded-admin-current-staff",
                        slug: "slug-private-viewer-audit",
                        linkId: activeLink!.id
                    })

                    await service.resolveViewerTranscriptAsset("slug-private-viewer-audit", "asset.png", "creator-1", creatorAccess)
                    await service.resolveViewerTranscriptAsset("slug-private-viewer-audit", "asset.png", "creator-1", creatorAccess)
                    assert.equal((await service.listTranscriptEvents("tr-private-viewer-audit", {})).items.filter((item) => item.type == "viewer-accessed").length, 1)

                    assert.equal(
                        (await service.renderViewerTranscript("slug-private-viewer-audit", "outsider-1", "/dash/transcripts/slug-private-viewer-audit/assets/", staffAccess)).status,
                        "not-found"
                    )
                    assert.equal((await service.listTranscriptEvents("tr-private-viewer-audit", {})).items.filter((item) => item.type == "viewer-accessed").length, 1)

                    const revoked = await service.revokeTranscript("tr-private-viewer-audit", "close access")
                    assert.equal(revoked.ok, true)
                    assert.equal(
                        (await service.renderViewerTranscript("slug-private-viewer-audit", "admin-1", "/dash/transcripts/slug-private-viewer-audit/assets/", staffAccess)).status,
                        "gone"
                    )
                    assert.equal((await service.listTranscriptEvents("tr-private-viewer-audit", {})).items.filter((item) => item.type == "viewer-accessed").length, 1)

                    service.config!.links.access.mode = "public"
                    assert.equal(
                        (await service.renderViewerTranscript("slug-private-viewer-audit", "admin-1", "/dash/transcripts/slug-private-viewer-audit/assets/", staffAccess)).status,
                        "not-found"
                    )
                    assert.equal((await service.listTranscriptEvents("tr-private-viewer-audit", {})).items.filter((item) => item.type == "viewer-accessed").length, 1)
                }
            )
        }
    )
})

test("partial builds log build-started then build-partial", async () => {
    await withCustomService(
        "build-events-partial",
        createCompileDependencies({ warningMessage: "Asset unavailable in archive." }),
        async (service) => {
            const { ticket, channel, user } = createFakeCompileInputs("ticket-build-partial", "channel-build-partial")
            const result = await service.compileHtmlTranscript(ticket, channel, user)
            assert.equal(result.success, true)

            const transcript = await service.resolveAdminTarget(ticket.id.value)
            const events = await service.listTranscriptEvents(ticket.id.value, {})

            assert.equal(transcript?.status, "partial")
            assert.deepEqual(events.items.map((item) => item.type), ["build-partial", "build-started"])
            assert.deepEqual(events.items[0]?.details, {
                messageCount: 2,
                attachmentCount: 1,
                warningCount: 1,
                totalBytes: 100
            })
        }
    )
})

test("fatal build failures log build-started then build-failed", async () => {
    await withCustomService(
        "build-events-failed",
        createCompileDependencies({ failReason: "collector exploded" }),
        async (service) => {
            const { ticket, channel, user } = createFakeCompileInputs("ticket-build-failed", "channel-build-failed")
            const result = await service.compileHtmlTranscript(ticket, channel, user)
            assert.equal(result.success, false)

            const transcript = await service.resolveAdminTarget(ticket.id.value)
            const events = await service.listTranscriptEvents(ticket.id.value, {})

            assert.equal(transcript?.status, "failed")
            assert.deepEqual(
                [...events.items.map((item) => item.type)].sort(),
                ["build-failed", "build-started"]
            )
            assert.equal(events.items.find((item) => item.type == "build-failed")?.reason, "collector exploded")
        }
    )
})

test("service revoke and reissue append transcript events with reasons and new slug details", async () => {
    await withService("revoke-reissue", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-42")
        const transcript = await service.createTranscript({
            id: "tr-42",
            status: "active",
            ticketId: "ticket-42",
            channelId: "channel-42",
            archivePath
        }, "slug-42")

        assert.ok(transcript)
        await fs.promises.mkdir(archivePath, { recursive: true })

        const revoked = await service.revokeTranscript("tr-42", "moderator request")
        assert.equal(revoked.ok, true)
        assert.equal((await service.resolveTranscript("slug-42")), null)

        const reissued = await service.reissueTranscript("tr-42", "new share link")
        assert.equal(reissued.ok, true)

        const resolved = await service.resolveTranscript("tr-42")
        const events = await service.listTranscriptEvents("slug-42", {})

        assert.ok(resolved?.activeSlug)
        assert.ok(resolved?.publicUrl)
        assert.notEqual(resolved?.activeSlug, "slug-42")
        assert.equal((await service.resolveTranscript(resolved!.activeSlug!))?.id, "tr-42")
        assert.equal((await service.resolveTranscript("tr-42"))?.statusReason, null)
        assert.deepEqual(events.items.map((item) => item.type), ["link-reissued", "link-revoked"])
        assert.equal(events.items[0]?.reason, "new share link")
        assert.deepEqual(events.items[0]?.details, { newSlug: resolved!.activeSlug! })
        assert.equal(events.items[1]?.reason, "moderator request")
    })
})

test("reissue after enabling expiry keeps old permanent links historical and creates a fresh expiring link", async () => {
    await withConfiguredService(
        "reissue-upgrades-to-expiring-link",
        (config) => {
            config.links.expiry.enabled = true
            config.links.expiry.ttlDays = 14
        },
        {},
        async (service, root) => {
            const archivePath = path.join(root, "archives", "tr-reissue-expiry")
            await writeArchiveFixture(archivePath, createFakeDocument("tr-reissue-expiry"))
            await service.createTranscript({
                id: "tr-reissue-expiry",
                status: "active",
                archivePath
            }, "legacy-permanent-slug")

            const beforeReissue = await service.resolveTranscript("legacy-permanent-slug")
            const reissued = await service.reissueTranscript("tr-reissue-expiry", "enable ttl")
            const detail = await service.getTranscriptDetail("tr-reissue-expiry")

            assert.equal(beforeReissue?.id, "tr-reissue-expiry")
            assert.equal(reissued.ok, true)
            assert.ok(detail)

            const activeLink = detail!.links.find((link) => link.status == "active")
            const oldLink = detail!.links.find((link) => link.slug == "legacy-permanent-slug")
            assert.ok(activeLink)
            assert.notEqual(activeLink?.slug, "legacy-permanent-slug")
            assert.ok(activeLink?.expiresAt)
            assert.equal(oldLink?.status, "superseded")
            assert.equal(oldLink?.expiresAt, null)
        }
    )
})

test("expired links normalize without changing transcript status or archive bytes, stay admin-searchable, and can be reissued", async () => {
    await withConfiguredService(
        "expire-and-reissue-link",
        (config) => {
            config.links.expiry.enabled = true
            config.links.expiry.ttlDays = 3
        },
        {},
        async (service, root) => {
            const archivePath = path.join(root, "archives", "tr-expired-runtime")
            await writeArchiveFixture(archivePath, createFakeDocument("tr-expired-runtime"))
            await service.repository!.createTranscript({
                id: "tr-expired-runtime",
                status: "active",
                ticketId: "ticket-expired-runtime",
                channelId: "channel-expired-runtime",
                archivePath,
                totalBytes: 256,
                searchText: "customer expired runtime",
                createdAt: "2026-03-20T00:00:00.000Z",
                updatedAt: "2026-03-20T00:00:00.000Z"
            })
            await service.repository!.createTranscriptLink({
                id: "link-expired-runtime",
                transcriptId: "tr-expired-runtime",
                slug: "expired-runtime-slug",
                status: "active",
                createdAt: "2026-03-20T00:00:00.000Z",
                expiresAt: "2026-03-21T00:00:00.000Z"
            })

            await service.createTranscript({
                id: "tr-permanent-runtime",
                status: "active",
                archivePath: path.join(root, "archives", "tr-permanent-runtime"),
                searchText: "customer permanent runtime"
            }, "permanent-runtime-slug")

            const listed = await service.listTranscripts({
                search: "expired-runtime-slug"
            })
            const detail = await service.getTranscriptDetail("expired-runtime-slug")
            const resolvedPublic = await service.resolveTranscript("expired-runtime-slug")
            const resolvedAdmin = await service.resolveAdminTarget("expired-runtime-slug")
            const events = await service.listTranscriptEvents("expired-runtime-slug", {})
            const permanentEvents = await service.listTranscriptEvents("permanent-runtime-slug", {})
            const reissued = await service.reissueTranscript("expired-runtime-slug", "restore link")
            const afterReissue = await service.resolveTranscript("tr-expired-runtime")
            const detailAfter = await service.getTranscriptDetail("tr-expired-runtime")
            const repeatedEvents = await service.listTranscriptEvents("expired-runtime-slug", {})

            assert.deepEqual(listed.items.map((item) => item.id), ["tr-expired-runtime"])
            assert.equal(listed.items[0]?.publicUrl, null)
            assert.equal(resolvedPublic, null)
            assert.equal(resolvedAdmin?.id, "tr-expired-runtime")
            assert.equal(resolvedAdmin?.status, "active")
            assert.equal(resolvedAdmin?.archivePath, archivePath)
            assert.equal(resolvedAdmin?.totalBytes, 256)
            assert.equal(detail?.transcript.publicUrl, null)
            assert.equal(detail?.links.find((link) => link.slug == "expired-runtime-slug")?.status, "expired")
            assert.equal(detail?.links.find((link) => link.slug == "expired-runtime-slug")?.reason, "Link expired by policy.")
            assert.equal(events.items.filter((item) => item.type == "link-expired").length, 1)
            assert.deepEqual(events.items.find((item) => item.type == "link-expired")?.details, {
                linkId: "link-expired-runtime",
                slug: "expired-runtime-slug",
                expiresAt: "2026-03-21T00:00:00.000Z",
                expiredAt: detail?.links.find((link) => link.slug == "expired-runtime-slug")?.expiredAt ?? null,
                trigger: "list"
            })
            assert.equal(permanentEvents.total, 0)
            assert.equal(reissued.ok, true)
            assert.ok(afterReissue?.activeSlug)
            assert.notEqual(afterReissue?.activeSlug, "expired-runtime-slug")
            assert.equal(fs.existsSync(archivePath), true)
            assert.ok(detailAfter?.links.some((link) => link.status == "active" && link.slug == afterReissue?.activeSlug))
            assert.equal(repeatedEvents.items.filter((item) => item.type == "link-expired").length, 1)
        }
    )
})

test("service delete removes archive path and logs transcript-deleted", async () => {
    await withService("delete-transcript", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-delete")
        const transcript = await service.createTranscript({
            id: "tr-delete",
            status: "active",
            archivePath
        }, "slug-delete")

        assert.ok(transcript)
        await fs.promises.mkdir(archivePath, { recursive: true })
        await fs.promises.writeFile(path.join(archivePath, "index.html"), "test")

        const deleted = await service.deleteTranscript("tr-delete", "cleanup")
        assert.equal(deleted.ok, true)
        assert.equal(fs.existsSync(archivePath), false)

        const resolved = await service.resolveTranscript("tr-delete")
        const events = await service.listTranscriptEvents("tr-delete", {})

        assert.equal(resolved?.status, "deleted")
        assert.equal(resolved?.archivePath, null)
        assert.equal(events.items[0]?.type, "transcript-deleted")
        assert.equal(events.items[0]?.reason, "cleanup")
    })
})

test("previewRetentionSweep returns disabled defaults and no candidates when retention is off", async () => {
    await withService("retention-preview-disabled", async (service) => {
        const preview = await service.previewRetentionSweep()

        assert.deepEqual(preview, {
            enabled: false,
            runOnStartup: true,
            maxTranscriptsPerRun: 100,
            windows: {
                failedDays: 30,
                revokedDays: 365,
                deletedDays: 7
            },
            totalCandidates: 0,
            candidates: []
        })
    })
})

test("previewRetentionSweep returns the expected candidate set and configured windows when retention is enabled", async () => {
    await withConfiguredService(
        "retention-preview-enabled",
        (config) => {
            config.retention.enabled = true
            config.retention.maxTranscriptsPerRun = 2
            config.retention.statuses.failedDays = 3
            config.retention.statuses.revokedDays = 5
            config.retention.statuses.deletedDays = 1
        },
        {},
        async (service, root) => {
            await service.createTranscript({
                id: "tr-preview-revoked",
                status: "revoked",
                archivePath: path.join(root, "archives", "tr-preview-revoked"),
                totalBytes: 40,
                updatedAt: "2026-03-20T00:00:00.000Z"
            })
            await service.createTranscript({
                id: "tr-preview-failed",
                status: "failed",
                archivePath: path.join(root, "archives", "tr-preview-failed"),
                totalBytes: 20,
                updatedAt: "2026-03-21T00:00:00.000Z"
            })
            await service.createTranscript({
                id: "tr-preview-active",
                status: "active",
                archivePath: path.join(root, "archives", "tr-preview-active"),
                totalBytes: 10,
                updatedAt: "2026-03-01T00:00:00.000Z"
            })

            const preview = await service.previewRetentionSweep()

            assert.equal(preview.enabled, true)
            assert.equal(preview.runOnStartup, true)
            assert.equal(preview.maxTranscriptsPerRun, 2)
            assert.deepEqual(preview.windows, {
                failedDays: 3,
                revokedDays: 5,
                deletedDays: 1
            })
            assert.equal(preview.totalCandidates, 2)
            assert.deepEqual(preview.candidates.map((candidate) => candidate.transcriptId), [
                "tr-preview-revoked",
                "tr-preview-failed"
            ])
        }
    )
})

test("executeRetentionSweep returns a no-op result when retention is disabled", async () => {
    await withService("retention-execute-disabled", async (service) => {
        const result = await service.executeRetentionSweep()

        assert.deepEqual(result, {
            enabled: false,
            trigger: "manual",
            attempted: 0,
            swept: 0,
            failed: 0,
            freedBytes: 0,
            candidates: [],
            failures: []
        })
    })
})

test("executeRetentionSweep removes archive directories, clears metadata, and emits archive-swept events", async () => {
    await withConfiguredService(
        "retention-execute-success",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.failedDays = 0
        },
        {},
        async (service, root) => {
            const archivePath = path.join(root, "archives", "tr-sweep")
            await fs.promises.mkdir(archivePath, { recursive: true })
            await fs.promises.writeFile(path.join(archivePath, "index.html"), "sweep me", "utf8")

            await service.createTranscript({
                id: "tr-sweep",
                status: "failed",
                archivePath,
                totalBytes: 64,
                updatedAt: "2026-03-20T00:00:00.000Z"
            })

            const result = await service.executeRetentionSweep("manual")
            const transcript = await service.resolveAdminTarget("tr-sweep")
            const events = await service.listTranscriptEvents("tr-sweep", {})

            assert.equal(result.swept, 1)
            assert.equal(result.failed, 0)
            assert.equal(result.freedBytes, 64)
            assert.equal(fs.existsSync(archivePath), false)
            assert.equal(transcript?.archivePath, null)
            assert.equal(transcript?.totalBytes, 0)
            assert.equal(events.items[0]?.type, "archive-swept")
            assert.deepEqual(events.items[0]?.details, {
                priorStatus: "failed",
                priorArchivePath: archivePath,
                configuredDays: 0,
                trigger: "manual",
                freedBytes: 64
            })
        }
    )
})

test("executeRetentionSweep normalizes missing archive paths and swept revoked transcripts are no longer reissuable", async () => {
    await withConfiguredService(
        "retention-execute-missing-archive",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.revokedDays = 0
        },
        {},
        async (service, root) => {
            const archivePath = path.join(root, "archives", "tr-revoked-missing")
            await service.createTranscript({
                id: "tr-revoked-missing",
                status: "revoked",
                archivePath,
                totalBytes: 24,
                updatedAt: "2026-03-20T00:00:00.000Z"
            })

            const result = await service.executeRetentionSweep("manual")
            const transcript = await service.resolveAdminTarget("tr-revoked-missing")
            const reissue = await service.reissueTranscript("tr-revoked-missing", "retry")

            assert.equal(result.swept, 1)
            assert.equal(result.freedBytes, 0)
            assert.equal(transcript?.archivePath, null)
            assert.equal(transcript?.totalBytes, 0)
            assert.equal(reissue.ok, false)
            assert.equal(reissue.message, "Transcript archive path does not exist.")
        }
    )
})

test("executeRetentionSweep leaves transcript metadata unchanged when archive-path safety validation fails", async () => {
    await withConfiguredService(
        "retention-execute-unsafe-path",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.failedDays = 0
        },
        {},
        async (service, root) => {
            const unsafeArchivePath = path.resolve(root, "..", "outside", "tr-unsafe")
            await service.createTranscript({
                id: "tr-unsafe",
                status: "failed",
                archivePath: unsafeArchivePath,
                totalBytes: 12,
                updatedAt: "2026-03-20T00:00:00.000Z"
            })

            const result = await service.executeRetentionSweep("manual")
            const transcript = await service.resolveAdminTarget("tr-unsafe")

            assert.equal(result.swept, 0)
            assert.equal(result.failed, 1)
            assert.match(result.failures[0]?.message ?? "", /archive root/i)
            assert.equal(transcript?.archivePath, unsafeArchivePath)
            assert.equal(transcript?.totalBytes, 12)
        }
    )
})

test("executeRetentionSweep continues after one archive deletion fails", async () => {
    await withConfiguredService(
        "retention-execute-continues",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.failedDays = 0
        },
        {},
        async (service, root) => {
            const failingArchivePath = path.join(root, "archives", "tr-delete-fail")
            const passingArchivePath = path.join(root, "archives", "tr-delete-pass")
            await fs.promises.mkdir(failingArchivePath, { recursive: true })
            await fs.promises.mkdir(passingArchivePath, { recursive: true })

            await service.createTranscript({
                id: "tr-delete-fail",
                status: "failed",
                archivePath: failingArchivePath,
                totalBytes: 30,
                updatedAt: "2026-03-20T00:00:00.000Z"
            })
            await service.createTranscript({
                id: "tr-delete-pass",
                status: "failed",
                archivePath: passingArchivePath,
                totalBytes: 15,
                updatedAt: "2026-03-21T00:00:00.000Z"
            })

            const originalRm = fs.promises.rm
            fs.promises.rm = (async (target, options) => {
                if (String(target) == failingArchivePath) {
                    throw new Error("simulated deletion failure")
                }

                return await originalRm(target, options)
            }) as typeof fs.promises.rm

            try {
                const result = await service.executeRetentionSweep("manual")
                const failedTranscript = await service.resolveAdminTarget("tr-delete-fail")
                const passedTranscript = await service.resolveAdminTarget("tr-delete-pass")

                assert.equal(result.failed, 1)
                assert.equal(result.swept, 1)
                assert.equal(failedTranscript?.archivePath, failingArchivePath)
                assert.equal(passedTranscript?.archivePath, null)
            } finally {
                fs.promises.rm = originalRm
            }
        }
    )
})

test("getIntegritySummary counts healthy, warning, error, repairable, and skipped transcripts", async () => {
    await withService("integrity-summary", async (service, root) => {
        const healthyArchivePath = path.join(root, "archives", "tr-healthy")
        await writeArchiveFixture(healthyArchivePath, createFakeDocument("tr-healthy"), {
            assetFiles: []
        })
        await service.createTranscript({
            id: "tr-healthy",
            status: "active",
            archivePath: healthyArchivePath
        })

        const warningArchivePath = path.join(root, "archives", "tr-warning")
        const warningDocument = createFakeDocument("tr-warning")
        warningDocument.style.favicon.enabled = true
        warningDocument.style.favicon.faviconAsset = createMirroredAssetRef("missing-file.png", "assets/missing-file.png", "favicon")
        await writeArchiveFixture(warningArchivePath, warningDocument)
        await service.createTranscript({
            id: "tr-warning",
            status: "partial",
            archivePath: warningArchivePath
        })
        await service.repository!.replaceAssets("tr-warning", [{
            assetName: "missing-file.png",
            sourceUrl: "https://example.invalid/missing-file.png",
            localPath: "assets/missing-file.png",
            mimeType: "image/png",
            byteSize: 9,
            status: "mirrored",
            reason: null
        }])

        await service.createTranscript({
            id: "tr-error",
            status: "failed",
            archivePath: path.join(root, "archives", "tr-error-missing")
        })

        await service.createTranscript({
            id: "tr-building-summary",
            status: "building"
        })

        const summary = await service.getIntegritySummary()

        assert.equal(summary.total, 4)
        assert.equal(summary.healthy, 1)
        assert.equal(summary.warning, 1)
        assert.equal(summary.error, 1)
        assert.equal(summary.skipped, 1)
        assert.equal(summary.repairable, 2)
        assert.equal(summary.issueCounts["asset-file-missing"], 1)
        assert.equal(summary.issueCounts["archive-directory-missing"], 1)
        assert.equal(summary.issueCounts["build-in-progress"], 1)
    })
})

test("scanTranscriptIntegrity classifies building, broken archives, invalid documents, and asset drift", async () => {
    await withService("integrity-detail-scan", async (service, root) => {
        await service.createTranscript({
            id: "tr-building-scan",
            status: "building"
        })

        await service.createTranscript({
            id: "tr-unsafe",
            status: "active",
            archivePath: path.resolve(root, "..", "unsafe", "tr-unsafe")
        })

        await service.createTranscript({
            id: "tr-missing-archive",
            status: "failed",
            archivePath: path.join(root, "archives", "tr-missing-archive")
        })

        const invalidArchivePath = path.join(root, "archives", "tr-invalid-doc")
        await writeArchiveFixture(invalidArchivePath, { nope: true }, { html: "<html>invalid</html>" })
        await service.createTranscript({
            id: "tr-invalid-doc",
            status: "active",
            archivePath: invalidArchivePath
        })

        const mismatchArchivePath = path.join(root, "archives", "tr-mismatch")
        await writeArchiveFixture(mismatchArchivePath, createFakeDocument("tr-other"), { html: "<html>mismatch</html>" })
        await service.createTranscript({
            id: "tr-mismatch",
            status: "active",
            archivePath: mismatchArchivePath
        })

        const missingHtmlArchivePath = path.join(root, "archives", "tr-missing-html")
        await writeArchiveFixture(missingHtmlArchivePath, createFakeDocument("tr-missing-html"), { writeHtml: false })
        await service.createTranscript({
            id: "tr-missing-html",
            status: "active",
            archivePath: missingHtmlArchivePath
        })

        const assetArchivePath = path.join(root, "archives", "tr-asset-issues")
        const assetDocument = createFakeDocument("tr-asset-issues")
        assetDocument.style.favicon.enabled = true
        assetDocument.style.favicon.faviconAsset = createMirroredAssetRef("missing-file.png", "assets/missing-file.png", "favicon")
        assetDocument.style.background.backgroundAsset = createMirroredAssetRef("missing-row.png", "assets/missing-row.png", "background")
        await writeArchiveFixture(assetArchivePath, assetDocument)
        await service.createTranscript({
            id: "tr-asset-issues",
            status: "active",
            archivePath: assetArchivePath
        })
        await service.repository!.replaceAssets("tr-asset-issues", [
            {
                assetName: "missing-file.png",
                sourceUrl: "https://example.invalid/missing-file.png",
                localPath: "assets/missing-file.png",
                mimeType: "image/png",
                byteSize: 12,
                status: "mirrored",
                reason: null
            },
            {
                assetName: "orphan.png",
                sourceUrl: "https://example.invalid/orphan.png",
                localPath: "assets/orphan.png",
                mimeType: "image/png",
                byteSize: 12,
                status: "mirrored",
                reason: null
            }
        ])

        const buildingReport = await service.scanTranscriptIntegrity("tr-building-scan")
        const unsafeReport = await service.scanTranscriptIntegrity("tr-unsafe")
        const missingArchiveReport = await service.scanTranscriptIntegrity("tr-missing-archive")
        const invalidDocumentReport = await service.scanTranscriptIntegrity("tr-invalid-doc")
        const mismatchReport = await service.scanTranscriptIntegrity("tr-mismatch")
        const missingHtmlReport = await service.scanTranscriptIntegrity("tr-missing-html")
        const assetReport = await service.scanTranscriptIntegrity("tr-asset-issues")

        assert.equal(buildingReport?.health, "skipped")
        assert.deepEqual(buildingReport?.issues.map((issue) => issue.code), ["build-in-progress"])
        assert.deepEqual(unsafeReport?.issues.map((issue) => issue.code), ["unsafe-archive-path"])
        assert.deepEqual(missingArchiveReport?.issues.map((issue) => issue.code), ["archive-directory-missing"])
        assert.deepEqual(invalidDocumentReport?.issues.map((issue) => issue.code), ["document-invalid"])
        assert.deepEqual(mismatchReport?.issues.map((issue) => issue.code), ["document-transcript-mismatch"])
        assert.equal(missingHtmlReport?.issues.some((issue) => issue.code == "html-missing"), true)
        assert.equal(assetReport?.issues.some((issue) => issue.code == "asset-file-missing"), true)
        assert.equal(assetReport?.issues.some((issue) => issue.code == "asset-row-missing"), true)
        assert.equal(assetReport?.issues.some((issue) => issue.code == "orphan-asset-row"), true)
    })
})

test("service integrity and repair paths accept 2.0 transcript documents", async () => {
    await withService("integrity-v2-document", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-v2-document")
        const document = createFakeDocument("tr-v2-document")
        document.version = "2.0"
        document.messages[0]!.formRecord = {
            source: "ot-ticket-forms",
            formId: "whitelist-review",
            formName: "Whitelist Review",
            applicantDiscordUserId: "user-1",
            draftState: "completed",
            updatedAt: "2026-04-21T12:00:00.000Z",
            completedAt: "2026-04-21T12:05:00.000Z",
            answers: [{
                position: 1,
                question: "Name",
                answer: "RazielDer",
                answerData: { kind: "text", value: "RazielDer" }
            }]
        }
        await writeArchiveFixture(archivePath, document, { writeHtml: false })
        await service.createTranscript({
            id: "tr-v2-document",
            status: "active",
            archivePath
        })

        const reportBefore = await service.scanTranscriptIntegrity("tr-v2-document")
        assert.equal(reportBefore?.issues.some((issue) => issue.code == "document-invalid"), false)
        assert.equal(reportBefore?.issues.some((issue) => issue.code == "html-missing"), true)

        const result = await service.repairTranscriptIntegrity("tr-v2-document")
        const reportAfter = await service.scanTranscriptIntegrity("tr-v2-document")
        const html = await fs.promises.readFile(path.join(archivePath, "index.html"), "utf8")

        assert.equal(result.ok, true)
        assert.equal(reportAfter?.health, "healthy")
        assert.match(html, /Archived form result/)
        assert.match(html, /Whitelist Review/)
    })
})

test("repairTranscriptIntegrity rerenders missing index.html and logs integrity-repaired", async () => {
    await withService("integrity-rerender", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-rerender")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-rerender"), { writeHtml: false })
        await service.createTranscript({
            id: "tr-rerender",
            status: "active",
            archivePath
        })

        const result = await service.repairTranscriptIntegrity("tr-rerender")
        const report = await service.scanTranscriptIntegrity("tr-rerender")
        const events = await service.listTranscriptEvents("tr-rerender", {})

        assert.equal(result.ok, true)
        assert.deepEqual(result.appliedActions, ["rerender-index-html"])
        assert.equal(report?.health, "healthy")
        assert.equal(fs.existsSync(path.join(archivePath, "index.html")), true)
        assert.equal(events.items[0]?.type, "integrity-repaired")
    })
})

test("repairTranscriptIntegrity downgrades missing mirrored assets, rewrites rows, and rerenders html", async () => {
    await withService("integrity-downgrade-assets", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-downgrade")
        const document = createFakeDocument("tr-downgrade")
        document.style.favicon.enabled = true
        document.style.favicon.faviconAsset = createMirroredAssetRef("missing-file.png", "assets/missing-file.png", "favicon")
        document.style.background.backgroundAsset = createMirroredAssetRef("missing-row.png", "assets/missing-row.png", "background")
        await writeArchiveFixture(archivePath, document)

        await service.createTranscript({
            id: "tr-downgrade",
            status: "active",
            archivePath
        })
        await service.repository!.replaceAssets("tr-downgrade", [{
            assetName: "missing-file.png",
            sourceUrl: "https://example.invalid/missing-file.png",
            localPath: "assets/missing-file.png",
            mimeType: "image/png",
            byteSize: 12,
            status: "mirrored",
            reason: null
        }])

        const result = await service.repairTranscriptIntegrity("tr-downgrade", ["downgrade-missing-assets"])
        const repairedDocument = JSON.parse(await fs.promises.readFile(path.join(archivePath, "document.json"), "utf8")) as typeof document
        const assets = await service.repository!.listTranscriptAssets("tr-downgrade")
        const report = await service.scanTranscriptIntegrity("tr-downgrade")

        assert.equal(result.ok, true)
        assert.equal(repairedDocument.style.favicon.faviconAsset?.status, "failed")
        assert.equal(repairedDocument.style.background.backgroundAsset?.status, "failed")
        assert.equal(assets[0]?.status, "failed")
        assert.equal(assets[0]?.archiveRelativePath, null)
        assert.equal(report?.health, "healthy")
    })
})

test("repairTranscriptIntegrity demotes broken active and partial transcripts to failed", async () => {
    await withService("integrity-demote", async (service, root) => {
        for (const status of ["active", "partial"] as const) {
            const archivePath = path.join(root, "archives", "tr-" + status + "-missing")
            await service.createTranscript({
                id: "tr-" + status,
                status,
                archivePath
            }, "slug-" + status)
        }

        const activeResult = await service.repairTranscriptIntegrity("tr-active")
        const partialResult = await service.repairTranscriptIntegrity("tr-partial")
        const activeTranscript = await service.resolveAdminTarget("tr-active")
        const partialTranscript = await service.resolveAdminTarget("tr-partial")

        assert.equal(activeResult.ok, true)
        assert.equal(partialResult.ok, true)
        assert.equal(activeTranscript?.status, "failed")
        assert.equal(partialTranscript?.status, "failed")
        assert.equal(activeTranscript?.archivePath, null)
        assert.equal(partialTranscript?.archivePath, null)
        assert.equal((await service.resolveTranscript("slug-active")), null)
        assert.equal((await service.resolveTranscript("slug-partial")), null)
    })
})

test("repairTranscriptIntegrity clears metadata for failed, revoked, and deleted transcripts with broken archive paths", async () => {
    await withService("integrity-clear-metadata", async (service, root) => {
        for (const status of ["failed", "revoked", "deleted"] as const) {
            await service.createTranscript({
                id: "tr-" + status,
                status,
                archivePath: path.join(root, "archives", "tr-" + status)
            })
        }

        for (const status of ["failed", "revoked", "deleted"] as const) {
            const result = await service.repairTranscriptIntegrity("tr-" + status)
            const transcript = await service.resolveAdminTarget("tr-" + status)

            assert.equal(result.ok, true)
            assert.equal(transcript?.status, status)
            assert.equal(transcript?.archivePath, null)
            assert.equal(transcript?.totalBytes, 0)
        }
    })
})

test("prepareTranscriptExport includes archive files when present and falls back to metadata-only when missing", async () => {
    await withService("prepare-export", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-export")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-export"), {
            assetFiles: ["assets/example.txt"]
        })
        await service.createTranscript({
            id: "tr-export",
            status: "active",
            archivePath
        }, "slug-export")

        await service.createTranscript({
            id: "tr-export-metadata",
            status: "failed",
            archivePath: null
        })

        const archiveExport = await service.prepareTranscriptExport("tr-export")
        const metadataOnlyExport = await service.prepareTranscriptExport("tr-export-metadata")

        const archiveZip = await fs.promises.readFile(archiveExport.export!.filePath, "utf8")
        const metadataZip = await fs.promises.readFile(metadataOnlyExport.export!.filePath, "utf8")

        assert.equal(archiveExport.ok, true)
        assert.equal(archiveExport.export?.archiveIncluded, true)
        assert.equal(archiveZip.includes("manifest.json"), true)
        assert.equal(archiveZip.includes("archive/index.html"), true)
        assert.equal(metadataOnlyExport.ok, true)
        assert.equal(metadataOnlyExport.export?.archiveIncluded, false)
        assert.equal(metadataZip.includes("manifest.json"), true)
        assert.equal(metadataZip.includes("archive/index.html"), false)
    })
})

test("listOperationalTranscripts applies service-backed integrity and retention filters after annotation", async () => {
    await withConfiguredService(
        "operational-list",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.revokedDays = 5
        },
        {},
        async (service, root) => {
            const healthyArchivePath = path.join(root, "archives", "tr-healthy")
            await writeArchiveFixture(healthyArchivePath, createFakeDocument("tr-healthy"))
            await service.createTranscript({
                id: "tr-healthy",
                status: "active",
                archivePath: healthyArchivePath,
                searchText: "customer alpha healthy",
                createdAt: "2026-03-20T00:00:00.000Z",
                updatedAt: "2026-03-20T00:00:00.000Z"
            }, "slug-healthy")

            const revokedArchivePath = path.join(root, "archives", "tr-revoked")
            await writeArchiveFixture(revokedArchivePath, createFakeDocument("tr-revoked"))
            await service.createTranscript({
                id: "tr-revoked",
                status: "revoked",
                archivePath: revokedArchivePath,
                searchText: "customer alpha candidate",
                createdAt: "2026-03-21T00:00:00.000Z",
                updatedAt: "2026-03-21T00:00:00.000Z"
            })

            const repairableArchivePath = path.join(root, "archives", "tr-repairable")
            await writeArchiveFixture(repairableArchivePath, createFakeDocument("tr-repairable"), { writeHtml: false })
            await service.createTranscript({
                id: "tr-repairable",
                status: "active",
                archivePath: repairableArchivePath,
                searchText: "customer alpha repairable",
                createdAt: "2026-03-22T00:00:00.000Z",
                updatedAt: "2026-03-22T00:00:00.000Z"
            }, "slug-repairable")

            await service.createTranscript({
                id: "tr-building",
                status: "building",
                searchText: "customer alpha building",
                createdAt: "2026-03-23T00:00:00.000Z",
                updatedAt: "2026-03-23T00:00:00.000Z"
            }, "slug-building")

            const all = await service.listOperationalTranscripts({
                search: "customer alpha",
                limit: 10,
                offset: 0
            })
            const secondPage = await service.listOperationalTranscripts({
                search: "customer alpha",
                limit: 1,
                offset: 1
            })
            const repairable = await service.listOperationalTranscripts({
                integrity: "repairable",
                limit: 10,
                offset: 0
            })
            const candidates = await service.listOperationalTranscripts({
                retention: "candidate",
                limit: 10,
                offset: 0
            })
            const skipped = await service.listOperationalTranscripts({
                integrity: "skipped",
                limit: 10,
                offset: 0
            })
            const revokedOnly = await service.listOperationalTranscripts({
                search: "customer alpha",
                status: "revoked",
                limit: 10,
                offset: 0
            })

            assert.deepEqual(all.items.map((item) => item.id), ["tr-building", "tr-repairable", "tr-revoked", "tr-healthy"])
            assert.equal(all.total, 4)
            assert.deepEqual(all.matchingSummary, {
                total: 4,
                active: 2,
                partial: 0,
                revoked: 1,
                deleted: 0,
                failed: 0,
                building: 1
            })
            assert.equal(all.items[0]?.integrityHealth, "skipped")
            assert.equal(all.items[0]?.canExport, false)
            assert.equal(all.items[1]?.repairable, true)
            assert.equal(all.items[1]?.integrityHealth, "error")
            assert.equal(all.items[1]?.canBulkRevoke, true)
            assert.equal(all.items[2]?.retentionCandidate, true)
            assert.equal(all.items[2]?.canBulkDelete, true)
            assert.equal(all.items[3]?.integrityHealth, "healthy")
            assert.equal(secondPage.total, 4)
            assert.deepEqual(secondPage.matchingSummary, all.matchingSummary)
            assert.deepEqual(secondPage.items.map((item) => item.id), ["tr-repairable"])
            assert.deepEqual(repairable.items.map((item) => item.id), ["tr-repairable"])
            assert.deepEqual(repairable.matchingSummary, {
                total: 1,
                active: 1,
                partial: 0,
                revoked: 0,
                deleted: 0,
                failed: 0,
                building: 0
            })
            assert.deepEqual(candidates.items.map((item) => item.id), ["tr-revoked"])
            assert.deepEqual(candidates.matchingSummary, {
                total: 1,
                active: 0,
                partial: 0,
                revoked: 1,
                deleted: 0,
                failed: 0,
                building: 0
            })
            assert.deepEqual(skipped.items.map((item) => item.id), ["tr-building"])
            assert.deepEqual(skipped.matchingSummary, {
                total: 1,
                active: 0,
                partial: 0,
                revoked: 0,
                deleted: 0,
                failed: 0,
                building: 1
            })
            assert.deepEqual(revokedOnly.items.map((item) => item.id), ["tr-revoked"])
            assert.deepEqual(revokedOnly.matchingSummary, {
                total: 1,
                active: 0,
                partial: 0,
                revoked: 1,
                deleted: 0,
                failed: 0,
                building: 0
            })
        }
    )
})

test("listOperationalTranscripts normalizes creator/channel/date filters and keeps filtered summaries before pagination", async () => {
    await withConfiguredService(
        "operational-list-query-contracts",
        (config) => {
            config.retention.enabled = true
            config.retention.statuses.revokedDays = 5
        },
        {},
        async (service, root) => {
            const activeOldArchivePath = path.join(root, "archives", "tr-active-old")
            await writeArchiveFixture(activeOldArchivePath, createFakeDocument("tr-active-old"))
            await service.createTranscript({
                id: "tr-active-old",
                status: "active",
                creatorId: "creator-1",
                channelId: "channel-1",
                archivePath: activeOldArchivePath,
                searchText: "customer alpha active old",
                createdAt: "2026-03-20T12:00:00.000Z",
                updatedAt: "2026-03-23T00:00:00.000Z"
            }, "slug-active-old")

            const activeNewArchivePath = path.join(root, "archives", "tr-active-new")
            await writeArchiveFixture(activeNewArchivePath, createFakeDocument("tr-active-new"))
            await service.createTranscript({
                id: "tr-active-new",
                status: "active",
                creatorId: "creator-1",
                channelId: "channel-1",
                archivePath: activeNewArchivePath,
                searchText: "customer alpha active new",
                createdAt: "2026-03-22T08:00:00.000Z",
                updatedAt: "2026-03-20T00:00:00.000Z"
            }, "slug-active-new")

            await service.createTranscript({
                id: "tr-building",
                status: "building",
                creatorId: "creator-1",
                channelId: "channel-1",
                searchText: "customer alpha building",
                createdAt: "2026-03-22T16:00:00.000Z",
                updatedAt: "2026-03-24T00:00:00.000Z"
            }, "slug-building")

            const revokedArchivePath = path.join(root, "archives", "tr-revoked")
            await writeArchiveFixture(revokedArchivePath, createFakeDocument("tr-revoked"))
            await service.createTranscript({
                id: "tr-revoked",
                status: "revoked",
                creatorId: "creator-1",
                channelId: "channel-2",
                archivePath: revokedArchivePath,
                searchText: "customer alpha revoked",
                createdAt: "2026-03-21T10:00:00.000Z",
                updatedAt: "2026-03-21T00:00:00.000Z"
            })

            const otherCreatorArchivePath = path.join(root, "archives", "tr-other-creator")
            await writeArchiveFixture(otherCreatorArchivePath, createFakeDocument("tr-other-creator"))
            await service.createTranscript({
                id: "tr-other-creator",
                status: "active",
                creatorId: "creator-2",
                channelId: "channel-1",
                archivePath: otherCreatorArchivePath,
                searchText: "customer alpha other",
                createdAt: "2026-03-22T12:00:00.000Z",
                updatedAt: "2026-03-22T00:00:00.000Z"
            })

            const combined = await service.listOperationalTranscripts({
                search: "customer alpha",
                status: "active",
                creatorId: "  creator-1  ",
                channelId: " channel-1 ",
                createdFrom: "2026-03-20",
                createdTo: "2026-03-22",
                sort: "updated-asc",
                limit: 10,
                offset: 0
            })
            const ignoredInvalidFilters = await service.listOperationalTranscripts({
                search: "customer alpha",
                creatorId: "   ",
                channelId: " ",
                createdFrom: "2026/03/22",
                createdTo: "not-a-date",
                sort: "not-a-real-sort" as never,
                limit: 10,
                offset: 0
            })
            const retentionCandidates = await service.listOperationalTranscripts({
                creatorId: "creator-1",
                retention: "candidate",
                limit: 10,
                offset: 0
            })
            const skippedIntegrity = await service.listOperationalTranscripts({
                creatorId: "creator-1",
                channelId: "channel-1",
                integrity: "skipped",
                createdFrom: "2026-03-22",
                createdTo: "2026-03-22",
                limit: 10,
                offset: 0
            })
            const reversedRange = await service.listOperationalTranscripts({
                createdFrom: "2026-03-23",
                createdTo: "2026-03-21",
                limit: 10,
                offset: 0
            })

            assert.deepEqual(combined.items.map((item) => item.id), ["tr-active-new", "tr-active-old"])
            assert.deepEqual(combined.matchingSummary, {
                total: 2,
                active: 2,
                partial: 0,
                revoked: 0,
                deleted: 0,
                failed: 0,
                building: 0
            })

            assert.deepEqual(ignoredInvalidFilters.items.map((item) => item.id), [
                "tr-building",
                "tr-other-creator",
                "tr-active-new",
                "tr-revoked",
                "tr-active-old"
            ])
            assert.deepEqual(ignoredInvalidFilters.matchingSummary, {
                total: 5,
                active: 3,
                partial: 0,
                revoked: 1,
                deleted: 0,
                failed: 0,
                building: 1
            })

            assert.deepEqual(retentionCandidates.items.map((item) => item.id), ["tr-revoked"])
            assert.deepEqual(retentionCandidates.matchingSummary, {
                total: 1,
                active: 0,
                partial: 0,
                revoked: 1,
                deleted: 0,
                failed: 0,
                building: 0
            })

            assert.deepEqual(skippedIntegrity.items.map((item) => item.id), ["tr-building"])
            assert.deepEqual(skippedIntegrity.matchingSummary, {
                total: 1,
                active: 0,
                partial: 0,
                revoked: 0,
                deleted: 0,
                failed: 0,
                building: 1
            })

            assert.equal(reversedRange.total, 0)
            assert.deepEqual(reversedRange.matchingSummary, {
                total: 0,
                active: 0,
                partial: 0,
                revoked: 0,
                deleted: 0,
                failed: 0,
                building: 0
            })
            assert.deepEqual(reversedRange.items, [])
        }
    )
})

test("disabled retention marks every operational transcript as not-candidate", async () => {
    await withService("operational-list-disabled-retention", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-retention-disabled")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-retention-disabled"))
        await service.createTranscript({
            id: "tr-retention-disabled",
            status: "revoked",
            archivePath,
            updatedAt: "2026-03-01T00:00:00.000Z"
        })

        const candidates = await service.listOperationalTranscripts({
            retention: "candidate",
            limit: 10,
            offset: 0
        })
        const nonCandidates = await service.listOperationalTranscripts({
            retention: "not-candidate",
            limit: 10,
            offset: 0
        })

        assert.equal(candidates.total, 0)
        assert.equal(nonCandidates.total, 1)
        assert.equal(nonCandidates.items[0]?.retentionCandidate, false)
    })
})

test("bulkRevokeTranscripts deduplicates ids, reuses revoke rules, and skips transcripts without an active link", async () => {
    await withService("bulk-revoke", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-bulk-revoke")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-bulk-revoke"))
        await service.createTranscript({
            id: "tr-bulk-revoke",
            status: "active",
            archivePath
        }, "slug-bulk-revoke")
        await service.createTranscript({
            id: "tr-no-link",
            status: "active",
            archivePath: path.join(root, "archives", "tr-no-link")
        })

        const result = await service.bulkRevokeTranscripts([
            "tr-bulk-revoke",
            "tr-no-link",
            "missing",
            "tr-bulk-revoke"
        ], "moderator cleanup")
        const revoked = await service.resolveAdminTarget("tr-bulk-revoke")
        const events = await service.listTranscriptEvents("tr-bulk-revoke", {})

        assert.equal(result.requested, 3)
        assert.equal(result.succeeded, 1)
        assert.equal(result.skipped, 1)
        assert.equal(result.failed, 1)
        assert.equal(revoked?.status, "revoked")
        assert.equal((await service.resolveTranscript("slug-bulk-revoke")), null)
        assert.equal(events.items[0]?.type, "link-revoked")
        assert.equal(events.items[0]?.reason, "moderator cleanup")
        assert.deepEqual(result.items.map((item) => item.status), ["ok", "skipped", "not-found"])
    })
})

test("bulkDeleteTranscripts skips active, building, and partial transcripts while reusing delete behavior for allowed statuses", async () => {
    await withService("bulk-delete", async (service, root) => {
        const deletableStatuses = ["failed", "revoked", "deleted"] as const
        for (const id of ["tr-active", "tr-building", "tr-partial", "tr-failed", "tr-revoked", "tr-deleted"]) {
            const archivePath = path.join(root, "archives", id)
            if (id != "tr-building") {
                await writeArchiveFixture(archivePath, createFakeDocument(id))
            }
            await service.createTranscript({
                id,
                status: id == "tr-active"
                    ? "active"
                    : id == "tr-building"
                        ? "building"
                        : id == "tr-partial"
                            ? "partial"
                            : id == "tr-failed"
                                ? "failed"
                                : id == "tr-revoked"
                                    ? "revoked"
                                    : "deleted",
                archivePath: id == "tr-building" ? null : archivePath
            }, id == "tr-active" ? "slug-active-delete" : undefined)
        }

        const result = await service.bulkDeleteTranscripts([
            "tr-active",
            "tr-building",
            "tr-partial",
            "tr-failed",
            "tr-revoked",
            "tr-deleted"
        ], "cleanup pass")

        assert.equal(result.succeeded, 3)
        assert.equal(result.skipped, 3)
        assert.equal(result.failed, 0)

        for (const transcriptId of deletableStatuses.map((status) => `tr-${status}`)) {
            const transcript = await service.resolveAdminTarget(transcriptId)
            assert.equal(transcript?.status, "deleted")
            assert.equal(transcript?.archivePath, null)
        }

        assert.equal((await service.resolveAdminTarget("tr-active"))?.status, "active")
        assert.equal((await service.resolveAdminTarget("tr-building"))?.status, "building")
        assert.equal((await service.resolveAdminTarget("tr-partial"))?.status, "partial")
        assert.deepEqual(result.items.map((item) => item.status), ["skipped", "skipped", "skipped", "ok", "ok", "ok"])
    })
})

test("bulk transcript requests reject empty selections and selections larger than one hundred ids", async () => {
    await withService("bulk-validation", async (service) => {
        const empty = await service.bulkRevokeTranscripts([])
        const tooMany = await service.bulkDeleteTranscripts(Array.from({ length: 101 }, (_, index) => `tr-${index}`))

        assert.equal(empty.requested, 0)
        assert.equal(empty.message, "Select at least one transcript.")
        assert.equal(tooMany.requested, 0)
        assert.equal(tooMany.message, "Bulk transcript actions are limited to 100 transcript ids per request.")
    })
})

test("prepareBulkTranscriptExport bundles successful child exports, releases temporary children, and reports skipped selections", async () => {
    await withService("bulk-export", async (service, root) => {
        const firstArchivePath = path.join(root, "archives", "tr-export-a")
        await writeArchiveFixture(firstArchivePath, createFakeDocument("tr-export-a"), {
            assetFiles: ["assets/example.txt"]
        })
        await service.createTranscript({
            id: "tr-export-a",
            status: "active",
            archivePath: firstArchivePath
        })

        await service.createTranscript({
            id: "tr-export-b",
            status: "failed",
            archivePath: null
        })

        await service.createTranscript({
            id: "tr-export-building",
            status: "building"
        })

        const result = await service.prepareBulkTranscriptExport([
            "tr-export-a",
            "tr-export-building",
            "missing",
            "tr-export-b"
        ])

        const bundleText = await fs.promises.readFile(result.export!.filePath, "utf8")
        const { tempRoot } = resolveTranscriptStoragePaths(service.config!)
        const remainingExportRoots = await fs.promises.readdir(path.join(tempRoot, "exports"))

        assert.equal(result.ok, true)
        assert.equal(result.export?.exportedCount, 2)
        assert.equal(result.export?.skippedCount, 2)
        assert.equal(bundleText.includes("manifest.json"), true)
        assert.equal(bundleText.includes("exports/transcript-tr-export-a.zip"), true)
        assert.equal(bundleText.includes("exports/transcript-tr-export-b.zip"), true)
        assert.equal(bundleText.includes("\"selectedCount\": 4"), true)
        assert.equal(bundleText.includes("\"exportedCount\": 2"), true)
        assert.equal(bundleText.includes("\"skippedCount\": 2"), true)
        assert.deepEqual(result.items.map((item) => item.status), ["ok", "skipped", "not-found", "ok"])
        assert.equal(remainingExportRoots.length, 1)
        assert.equal(remainingExportRoots[0], result.export?.exportId)
    })
})

test("prepareBulkTranscriptExport returns an error result when no selected transcript can be exported", async () => {
    await withService("bulk-export-empty", async (service) => {
        await service.createTranscript({
            id: "tr-building-export-empty",
            status: "building"
        })

        const result = await service.prepareBulkTranscriptExport([
            "tr-building-export-empty",
            "missing"
        ])

        assert.equal(result.ok, false)
        assert.equal(result.export, null)
        assert.equal(result.message, "No selected transcripts could be exported.")
        assert.deepEqual(result.items.map((item) => item.status), ["skipped", "not-found"])
    })
})

test("releasePreparedTranscriptExport removes staged artifacts and returns false for unknown exports", async () => {
    await withService("release-export", async (service, root) => {
        const archivePath = path.join(root, "archives", "tr-release-export")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-release-export"))
        await service.createTranscript({
            id: "tr-release-export",
            status: "active",
            archivePath
        })

        const prepared = await service.prepareTranscriptExport("tr-release-export")
        const released = await service.releasePreparedTranscriptExport(prepared.export!.exportId)
        const releasedAgain = await service.releasePreparedTranscriptExport("missing-export-id")

        assert.equal(released, true)
        assert.equal(fs.existsSync(path.dirname(prepared.export!.filePath)), false)
        assert.equal(releasedAgain, false)
    })
})

test("startup recovery appends recovery-marked-failed events for stale building transcripts", async () => {
    const { config, root } = createServiceConfig("recovery-events")
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
    } finally {
        await first.shutdown()
    }

    const recovered = new TranscriptServiceCore()
    await recovered.initialize(config)

    try {
        const summary = await recovered.getSummary()
        const transcript = await recovered.resolveAdminTarget("tr-building")
        const events = await recovered.listTranscriptEvents("tr-building", {})

        assert.equal(summary.recoveredBuilds, 1)
        assert.equal(transcript?.status, "failed")
        assert.deepEqual(events.items.map((item) => item.type), ["recovery-marked-failed"])
        assert.equal(events.items[0]?.reason, "Recovered stale building transcript after startup.")
    } finally {
        await recovered.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("startup normalization expires elapsed active links before the service reports healthy", async () => {
    const { config, root } = createServiceConfig("startup-link-expiry")
    config.links.expiry.enabled = true
    config.links.expiry.ttlDays = 2
    await fs.promises.rm(root, { recursive: true, force: true })

    const first = new TranscriptServiceCore()
    await first.initialize(config)

    try {
        const archivePath = path.join(root, "archives", "tr-startup-expiry")
        await writeArchiveFixture(archivePath, createFakeDocument("tr-startup-expiry"))
        await first.repository!.createTranscript({
            id: "tr-startup-expiry",
            status: "active",
            archivePath,
            searchText: "startup expiry"
        })
        await first.repository!.createTranscriptLink({
            id: "link-startup-expiry",
            transcriptId: "tr-startup-expiry",
            slug: "startup-expiry-slug",
            status: "active",
            createdAt: "2026-03-20T00:00:00.000Z",
            expiresAt: "2026-03-21T00:00:00.000Z"
        })
    } finally {
        await first.shutdown()
    }

    const recovered = new TranscriptServiceCore()
    await recovered.initialize(config)

    try {
        const detail = await recovered.getTranscriptDetail("startup-expiry-slug")
        const events = await recovered.listTranscriptEvents("startup-expiry-slug", {})

        assert.equal(recovered.isHealthy(), true)
        assert.equal((await recovered.resolveTranscript("startup-expiry-slug")), null)
        assert.equal((await recovered.resolveAdminTarget("startup-expiry-slug"))?.id, "tr-startup-expiry")
        assert.equal(detail?.links.find((link) => link.slug == "startup-expiry-slug")?.status, "expired")
        assert.equal(events.items[0]?.type, "link-expired")
        assert.deepEqual(events.items[0]?.details, {
            linkId: "link-startup-expiry",
            slug: "startup-expiry-slug",
            expiresAt: "2026-03-21T00:00:00.000Z",
            expiredAt: detail?.links.find((link) => link.slug == "startup-expiry-slug")?.expiredAt ?? null,
            trigger: "startup"
        })
    } finally {
        await recovered.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("startup retention auto-run happens after stale-build recovery and before healthy summary state is reported", async () => {
    const { config, root } = createServiceConfig("startup-retention")
    config.retention.enabled = true
    config.retention.runOnStartup = true
    config.retention.statuses.failedDays = 0
    await fs.promises.rm(root, { recursive: true, force: true })

    const archivePath = path.join(root, "archives", "tr-startup-sweep")

    const first = new TranscriptServiceCore()
    await first.initialize(config)

    try {
        await fs.promises.mkdir(archivePath, { recursive: true })
        await first.repository!.createTranscript({
            id: "tr-building",
            status: "building",
            ticketId: "ticket-building",
            channelId: "channel-building"
        })
        await first.repository!.createTranscript({
            id: "tr-startup-sweep",
            status: "failed",
            archivePath,
            totalBytes: 50,
            updatedAt: "2026-03-20T00:00:00.000Z"
        })
    } finally {
        await first.shutdown()
    }

    const recovered = new TranscriptServiceCore()
    await recovered.initialize(config)

    try {
        const summary = await recovered.getSummary()
        const sweptTranscript = await recovered.resolveAdminTarget("tr-startup-sweep")
        const recoveryEvents = await recovered.listTranscriptEvents("tr-building", {})
        const sweepEvents = await recovered.listTranscriptEvents("tr-startup-sweep", {})
        const preview = await recovered.previewRetentionSweep()

        assert.equal(recovered.isHealthy(), true)
        assert.equal(summary.recoveredBuilds, 1)
        assert.equal(summary.totalArchiveBytes, 0)
        assert.equal(sweptTranscript?.archivePath, null)
        assert.deepEqual(recoveryEvents.items.map((item) => item.type), ["recovery-marked-failed"])
        assert.deepEqual(sweepEvents.items.map((item) => item.type), ["archive-swept"])
        assert.equal(preview.totalCandidates, 0)
    } finally {
        await recovered.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("unresolved listTranscriptEvents target returns an empty result", async () => {
    await withService("unresolved-events", async (service) => {
        const events = await service.listTranscriptEvents("missing-target", {
            limit: 999,
            offset: 50
        })

        assert.equal(events.total, 0)
        assert.deepEqual(events.items, [])
    })
})
