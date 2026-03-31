import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import { resolveCommandRenderData } from "../commands/resolve-command-render-data.js"
import { TranscriptServiceCore } from "../service/transcript-service-core.js"
import { createTestConfig } from "../test-support/helpers.js"

test("command render data resolves transcripts by transcript id, slug, ticket id, and channel id", async () => {
    const { config, root } = createTestConfig("command-targets")
    await fs.promises.rm(root, { recursive: true, force: true })

    const core = new TranscriptServiceCore()
    await core.initialize(config)

    try {
        const archivePath = path.join(root, "archives", "tr-command")
        await fs.promises.mkdir(archivePath, { recursive: true })

        await core.createTranscript({
            id: "tr-command",
            status: "active",
            ticketId: "ticket-command",
            channelId: "channel-command",
            archivePath
        }, "slug-command")
        const service = {
            isHealthy: () => core.isHealthy(),
            resolveAdminTarget: (target: string) => core.resolveAdminTarget(target),
            buildPublicTranscriptUrl: (slug: string) => core.buildPublicTranscriptUrl(slug),
            revokeTranscript: (target: string, reason?: string) => core.revokeTranscript(target, reason),
            reissueTranscript: (target: string, reason?: string) => core.reissueTranscript(target, reason),
            deleteTranscript: (target: string, reason?: string) => core.deleteTranscript(target, reason)
        } as never

        for (const target of ["tr-command", "slug-command", "ticket-command", "channel-command"]) {
            const renderData = await resolveCommandRenderData(service, "get", target, null)
            assert.equal(renderData.ok, true)
            assert.equal(renderData.transcript?.id, "tr-command")
        }
    } finally {
        await core.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("command render data reflects revoke, reissue, and delete actions", async () => {
    const { config, root } = createTestConfig("command-actions")
    await fs.promises.rm(root, { recursive: true, force: true })

    const core = new TranscriptServiceCore()
    await core.initialize(config)

    try {
        const archivePath = path.join(root, "archives", "tr-action")
        await fs.promises.mkdir(archivePath, { recursive: true })

        await core.createTranscript({
            id: "tr-action",
            status: "active",
            ticketId: "ticket-action",
            channelId: "channel-action",
            archivePath
        }, "slug-action")
        const service = {
            isHealthy: () => core.isHealthy(),
            resolveAdminTarget: (target: string) => core.resolveAdminTarget(target),
            buildPublicTranscriptUrl: (slug: string) => core.buildPublicTranscriptUrl(slug),
            revokeTranscript: (target: string, reason?: string) => core.revokeTranscript(target, reason),
            reissueTranscript: (target: string, reason?: string) => core.reissueTranscript(target, reason),
            deleteTranscript: (target: string, reason?: string) => core.deleteTranscript(target, reason)
        } as never

        const revoked = await resolveCommandRenderData(service, "revoke", "slug-action", "moderator request")
        assert.equal(revoked.ok, true)
        assert.equal(revoked.transcript?.status, "revoked")

        const reissued = await resolveCommandRenderData(service, "reissue", "tr-action", "new url")
        assert.equal(reissued.ok, true)
        assert.equal(reissued.transcript?.status, "active")
        assert.ok(reissued.url)

        const deleted = await resolveCommandRenderData(service, "delete", "ticket-action", "cleanup")
        assert.equal(deleted.ok, true)
        assert.equal(deleted.transcript?.status, "deleted")
        assert.equal(fs.existsSync(archivePath), false)
    } finally {
        await core.shutdown()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})
