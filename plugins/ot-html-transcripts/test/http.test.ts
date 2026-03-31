import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import { TranscriptHttpServer } from "../http/server.js"
import { TranscriptServiceCore } from "../service/transcript-service-core.js"
import { createTestConfig } from "../test-support/helpers.js"

test("http server serves health, transcript html, transcript assets, and gone responses", async () => {
    const { config, root } = createTestConfig("http-routes")
    await fs.promises.rm(root, { recursive: true, force: true })

    const core = new TranscriptServiceCore()
    await core.initialize(config)
    const server = new TranscriptHttpServer({
        isHealthy: () => core.isHealthy(),
        getSummary: () => core.getSummary(),
        core
    })
    await server.start()

    try {
        const archivePath = path.join(root, "archives", "tr-http")
        await fs.promises.mkdir(path.join(archivePath, "assets"), { recursive: true })
        await fs.promises.writeFile(
            path.join(archivePath, "index.html"),
            "<html><body><img src=\"__OT_TRANSCRIPT_ASSET_BASE__asset.png\"></body></html>",
            "utf8"
        )
        await fs.promises.writeFile(path.join(archivePath, "assets", "asset.png"), "asset-data", "utf8")

        await core.createTranscript({
            id: "tr-http",
            status: "active",
            ticketId: "ticket-http",
            channelId: "channel-http",
            guildId: "guild-http",
            archivePath
        }, "slug-http")
        await core.repository!.replaceAssets("tr-http", [
            {
                assetName: "asset.png",
                sourceUrl: "https://example.invalid/asset.png",
                localPath: "assets/asset.png",
                mimeType: "image/png",
                byteSize: 10,
                status: "mirrored"
            }
        ])

        const address = server.address
        assert.ok(address)
        const baseUrl = "http://127.0.0.1:" + address.port

        const healthResponse = await fetch(baseUrl + "/health")
        assert.equal(healthResponse.status, 200)
        const healthPayload = await healthResponse.json() as { healthy: boolean }
        assert.equal(healthPayload.healthy, true)

        const transcriptResponse = await fetch(baseUrl + "/transcripts/slug-http")
        assert.equal(transcriptResponse.status, 200)
        const transcriptHtml = await transcriptResponse.text()
        assert.match(transcriptHtml, /\/transcripts\/slug-http\/assets\/asset\.png/)

        const assetResponse = await fetch(baseUrl + "/transcripts/slug-http/assets/asset.png")
        assert.equal(assetResponse.status, 200)
        assert.equal(await assetResponse.text(), "asset-data")

        const missingResponse = await fetch(baseUrl + "/transcripts/missing")
        assert.equal(missingResponse.status, 404)

        const revoked = await core.revokeTranscript("tr-http", "http test")
        assert.equal(revoked.ok, true)

        const goneResponse = await fetch(baseUrl + "/transcripts/slug-http")
        assert.equal(goneResponse.status, 410)
    } finally {
        await server.stop()
        await core.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("http server expires elapsed public links on demand and returns gone for transcript and asset routes", async () => {
    const { config, root } = createTestConfig("http-expired-routes")
    config.links.expiry.enabled = true
    config.links.expiry.ttlDays = 5
    await fs.promises.rm(root, { recursive: true, force: true })

    const core = new TranscriptServiceCore()
    await core.initialize(config)
    const server = new TranscriptHttpServer({
        isHealthy: () => core.isHealthy(),
        getSummary: () => core.getSummary(),
        core
    })
    await server.start()

    try {
        const archivePath = path.join(root, "archives", "tr-http-expired")
        await fs.promises.mkdir(path.join(archivePath, "assets"), { recursive: true })
        await fs.promises.writeFile(
            path.join(archivePath, "index.html"),
            "<html><body><img src=\"__OT_TRANSCRIPT_ASSET_BASE__asset.png\"></body></html>",
            "utf8"
        )
        await fs.promises.writeFile(path.join(archivePath, "assets", "asset.png"), "asset-data", "utf8")

        await core.repository!.createTranscript({
            id: "tr-http-expired",
            status: "active",
            ticketId: "ticket-http-expired",
            channelId: "channel-http-expired",
            archivePath,
            totalBytes: 10
        })
        await core.repository!.createTranscriptLink({
            id: "link-http-expired",
            transcriptId: "tr-http-expired",
            slug: "slug-http-expired",
            status: "active",
            createdAt: "2026-03-20T00:00:00.000Z",
            expiresAt: "2026-03-21T00:00:00.000Z"
        })
        await core.repository!.replaceAssets("tr-http-expired", [
            {
                assetName: "asset.png",
                sourceUrl: "https://example.invalid/asset.png",
                localPath: "assets/asset.png",
                mimeType: "image/png",
                byteSize: 10,
                status: "mirrored"
            }
        ])

        const address = server.address
        assert.ok(address)
        const baseUrl = "http://127.0.0.1:" + address.port

        const transcriptResponse = await fetch(baseUrl + "/transcripts/slug-http-expired")
        const assetResponse = await fetch(baseUrl + "/transcripts/slug-http-expired/assets/asset.png")
        const events = await core.listTranscriptEvents("slug-http-expired", {})
        const detail = await core.getTranscriptDetail("slug-http-expired")

        assert.equal(transcriptResponse.status, 410)
        assert.equal(assetResponse.status, 410)
        assert.equal((await core.resolveTranscript("slug-http-expired")), null)
        assert.equal((await core.resolveAdminTarget("slug-http-expired"))?.id, "tr-http-expired")
        assert.equal(detail?.links[0]?.status, "expired")
        assert.equal(events.items[0]?.type, "link-expired")
        assert.deepEqual(events.items[0]?.details, {
            linkId: "link-http-expired",
            slug: "slug-http-expired",
            expiresAt: "2026-03-21T00:00:00.000Z",
            expiredAt: detail?.links[0]?.expiredAt ?? null,
            trigger: "public-route"
        })
    } finally {
        await server.stop()
        await core.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("http server hides plugin-owned transcript routes when private-discord mode is enabled", async () => {
    const { config, root } = createTestConfig("http-private-discord")
    config.links.access.mode = "private-discord"
    config.server.publicBaseUrl = ""
    await fs.promises.rm(root, { recursive: true, force: true })

    const core = new TranscriptServiceCore()
    await core.initialize(config)
    const server = new TranscriptHttpServer({
        isHealthy: () => core.isHealthy(),
        getSummary: () => core.getSummary(),
        core
    })
    await server.start()

    try {
        const archivePath = path.join(root, "archives", "tr-http-private")
        await fs.promises.mkdir(path.join(archivePath, "assets"), { recursive: true })
        await fs.promises.writeFile(path.join(archivePath, "index.html"), "<html><body>private</body></html>", "utf8")
        await fs.promises.writeFile(path.join(archivePath, "assets", "asset.png"), "asset-data", "utf8")

        await core.createTranscript({
            id: "tr-http-private",
            status: "active",
            archivePath
        }, "slug-http-private")
        await core.repository!.replaceAssets("tr-http-private", [
            {
                assetName: "asset.png",
                sourceUrl: "https://example.invalid/asset.png",
                localPath: "assets/asset.png",
                mimeType: "image/png",
                byteSize: 10,
                status: "mirrored"
            }
        ])

        const address = server.address
        assert.ok(address)
        const baseUrl = "http://127.0.0.1:" + address.port

        const transcriptResponse = await fetch(baseUrl + "/transcripts/slug-http-private")
        const assetResponse = await fetch(baseUrl + "/transcripts/slug-http-private/assets/asset.png")
        const healthResponse = await fetch(baseUrl + "/health")

        assert.equal(transcriptResponse.status, 404)
        assert.equal(assetResponse.status, 404)
        assert.equal(healthResponse.status, 200)
    } finally {
        await server.stop()
        await core.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})
