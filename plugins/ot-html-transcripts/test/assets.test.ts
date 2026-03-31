import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import http from "http"
import path from "path"

import { mirrorDocumentAssets } from "../assets/asset-mirror.js"
import type { LocalAssetRef, LocalTranscriptDocument } from "../contracts/document.js"
import { createTestConfig } from "../test-support/helpers.js"

function createAssetRef(sourceUrl: string, purpose: string): LocalAssetRef {
    return {
        sourceUrl,
        purpose,
        inlinePreferred: true,
        assetName: null,
        archivePath: null,
        mimeType: null,
        byteSize: 0,
        status: "skipped"
    }
}

function createDocument(assetRefs: { avatar?: LocalAssetRef | null; attachment?: LocalAssetRef | null }): LocalTranscriptDocument {
    return {
        version: "1.0",
        transcriptId: "tr-assets",
        generatedAt: new Date().toISOString(),
        status: "active",
        warningCount: 0,
        warnings: [],
        searchText: "asset test",
        totals: {
            messages: 1,
            embeds: 0,
            attachments: assetRefs.attachment ? 1 : 0,
            reactions: 0,
            interactions: 0
        },
        style: {
            background: {
                enabled: false,
                backgroundColor: "#101010",
                backgroundAsset: null
            },
            header: {
                enabled: false,
                backgroundColor: "#202225",
                decoColor: "#f8ba00",
                textColor: "#ffffff"
            },
            stats: {
                enabled: false,
                backgroundColor: "#202225",
                keyTextColor: "#737373",
                valueTextColor: "#ffffff",
                hideBackgroundColor: "#40444a",
                hideTextColor: "#ffffff"
            },
            favicon: {
                enabled: false,
                faviconAsset: null
            }
        },
        bot: {
            name: "Bot",
            id: "bot-1",
            avatar: null
        },
        guild: {
            name: "Guild",
            id: "guild-1",
            icon: null
        },
        ticket: {
            name: "ticket-1",
            id: "ticket-1",
            createdOn: false,
            closedOn: false,
            claimedOn: false,
            pinnedOn: false,
            deletedOn: false,
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
                author: {
                    id: "user-1",
                    name: "User 1",
                    color: "#ffffff",
                    avatar: assetRefs.avatar ?? null,
                    bot: false,
                    verifiedBot: false,
                    system: false
                },
                content: false,
                reply: { type: false },
                embeds: [],
                attachments: assetRefs.attachment
                    ? [{
                        name: "attachment",
                        fileType: "image/png",
                        size: "1 KB",
                        spoiler: false,
                        alt: null,
                        displayKind: "image",
                        asset: assetRefs.attachment
                    }]
                    : [],
                components: []
            }
        ]
    }
}

async function withAssetServer(
    routes: Record<string, { status?: number; contentType?: string; body: Buffer | string }>
) {
    const server = http.createServer((request, response) => {
        const route = routes[request.url ?? ""]
        if (!route) {
            response.statusCode = 404
            response.end("not found")
            return
        }

        response.statusCode = route.status ?? 200
        response.setHeader("Content-Type", route.contentType ?? "application/octet-stream")
        response.end(route.body)
    })

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address == "string") throw new Error("Unable to determine asset server address.")

    return {
        baseUrl: "http://127.0.0.1:" + address.port,
        async close() {
            await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        }
    }
}

test("asset mirroring stores safe assets locally and skips risky file types", async () => {
    const { config, root } = createTestConfig("assets-safe-and-risky")
    const assetServer = await withAssetServer({
        "/avatar.png": { contentType: "image/png", body: Buffer.from("avatar") },
        "/risky.svg": { contentType: "image/svg+xml", body: "<svg></svg>" }
    })

    await fs.promises.rm(root, { recursive: true, force: true })
    const tempArchivePath = path.join(root, "temp")
    await fs.promises.mkdir(tempArchivePath, { recursive: true })

    try {
        const avatarRef = createAssetRef(assetServer.baseUrl + "/avatar.png", "message.avatar")
        const riskyRef = createAssetRef(assetServer.baseUrl + "/risky.svg", "message.attachment")
        const document = createDocument({ avatar: avatarRef, attachment: riskyRef })

        const result = await mirrorDocumentAssets(document, tempArchivePath, config)

        assert.equal(result.mirroredCount, 1)
        assert.ok(result.warnings.length >= 1)
        assert.equal(avatarRef.status, "mirrored")
        assert.ok(avatarRef.assetName)
        assert.equal(riskyRef.status, "skipped")
        assert.equal(fs.existsSync(path.join(tempArchivePath, "assets", avatarRef.assetName!)), true)
    } finally {
        await assetServer.close()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("asset mirroring enforces byte limits by marking assets unavailable without failing the archive", async () => {
    const { config, root } = createTestConfig("assets-byte-limit")
    const assetServer = await withAssetServer({
        "/large.png": { contentType: "image/png", body: Buffer.alloc(64, 1) }
    })

    await fs.promises.rm(root, { recursive: true, force: true })
    const tempArchivePath = path.join(root, "temp")
    await fs.promises.mkdir(tempArchivePath, { recursive: true })

    try {
        const attachmentRef = createAssetRef(assetServer.baseUrl + "/large.png", "message.attachment")
        const document = createDocument({ attachment: attachmentRef })
        const limitedConfig = {
            ...config,
            assets: {
                ...config.assets,
                maxBytesPerFile: 8
            }
        }

        const result = await mirrorDocumentAssets(document, tempArchivePath, limitedConfig)

        assert.equal(result.mirroredCount, 0)
        assert.ok(result.warnings.some((warning) => warning.message.includes("Failed to mirror asset")))
        assert.equal(attachmentRef.status, "skipped")
        assert.match(attachmentRef.unavailableReason ?? "", /maxBytesPerFile/i)
    } finally {
        await assetServer.close()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})
