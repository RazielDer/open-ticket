import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "fs"
import path from "path"

import { DEFAULT_PLUGIN_CONFIG } from "../config/defaults.js"
import { resolveTranscriptStoragePaths } from "../storage/archive-paths.js"
import { TranscriptRepository } from "../storage/repository.js"
import { TranscriptSqliteDatabase } from "../storage/sqlite.js"

function createTestConfig(testName: string) {
    const safeName = testName.replaceAll(/[^a-z0-9-]/gi, "-").toLowerCase()
    const root = path.resolve(process.cwd(), "plugins", "ot-html-transcripts", ".test-runtime", safeName)

    return {
        config: {
            ...DEFAULT_PLUGIN_CONFIG,
            links: {
                ...DEFAULT_PLUGIN_CONFIG.links,
                expiry: {
                    ...DEFAULT_PLUGIN_CONFIG.links.expiry
                }
            },
            storage: {
                archiveRoot: path.join(root, "archives"),
                sqlitePath: path.join(root, "database", "transcripts.sqlite")
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

async function withRepository(testName: string, callback: (repository: TranscriptRepository) => Promise<void>) {
    const { config, root } = createTestConfig(testName)
    const { sqlitePath } = resolveTranscriptStoragePaths(config)

    await fs.promises.rm(root, { recursive: true, force: true })
    await fs.promises.mkdir(path.dirname(sqlitePath), { recursive: true })

    const repository = new TranscriptRepository(new TranscriptSqliteDatabase(sqlitePath))
    await repository.init()

    try {
        await callback(repository)
    } finally {
        await repository.close()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
}

test("repository resolves transcripts by id, slug, ticket id, and channel id", async () => {
    await withRepository("resolve-targets", async (repository) => {
        const transcriptId = await repository.createTranscript({
            id: "tr-1",
            status: "active",
            ticketId: "ticket-1",
            channelId: "channel-1",
            guildId: "guild-1",
            archivePath: "/tmp/tr-1",
            searchText: "alpha beta"
        })

        await repository.createTranscriptLink({
            transcriptId,
            slug: "slug-1"
        })

        assert.equal((await repository.resolveTranscript("tr-1"))?.id, "tr-1")
        assert.equal((await repository.resolveTranscript("slug-1"))?.id, "tr-1")
        assert.equal((await repository.resolveTranscript("ticket-1"))?.id, "tr-1")
        assert.equal((await repository.resolveTranscript("channel-1"))?.id, "tr-1")
    })
})

test("repository initializes transcript_events in a clean database", async () => {
    await withRepository("events-table-init", async (repository) => {
        const tables = await repository.database.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transcript_events'"
        )
        const indexes = await repository.database.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transcript_events'"
        )

        assert.equal(tables.length, 1)
        assert.equal(indexes.some((index) => index.name == "transcript_events_transcript_id_created_at_index"), true)
        assert.equal(indexes.some((index) => index.name == "transcript_events_type_index"), true)
        assert.equal(indexes.some((index) => index.name == "transcript_events_created_at_index"), true)
    })
})

test("repository migrates older sqlite schemas in place, preserves transcript rows, and adds transcript_events", async () => {
    const { config, root } = createTestConfig("schema-migration")
    const { sqlitePath } = resolveTranscriptStoragePaths(config)

    await fs.promises.rm(root, { recursive: true, force: true })
    await fs.promises.mkdir(path.dirname(sqlitePath), { recursive: true })

    const legacyDatabase = new TranscriptSqliteDatabase(sqlitePath)
    await legacyDatabase.init()
    await legacyDatabase.exec(`
CREATE TABLE transcripts (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    ticket_id TEXT,
    channel_id TEXT,
    guild_id TEXT,
    creator_id TEXT,
    deleter_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archive_path TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    search_text TEXT NOT NULL DEFAULT ''
);
CREATE TABLE transcript_links (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL
);
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    local_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL
);
`)
    await legacyDatabase.run(
        `INSERT INTO transcripts (
            id, status, ticket_id, channel_id, guild_id, creator_id, deleter_id, created_at, updated_at, archive_path, message_count, attachment_count, warning_count, total_bytes, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            "legacy-tr-1",
            "active",
            "legacy-ticket",
            "legacy-channel",
            "legacy-guild",
            "legacy-user",
            null,
            "2026-03-25T00:00:00.000Z",
            "2026-03-25T00:00:00.000Z",
            "/legacy/archive",
            3,
            2,
            1,
            99,
            "legacy text"
        ]
    )
    await legacyDatabase.close()

    const repository = new TranscriptRepository(new TranscriptSqliteDatabase(sqlitePath))
    await repository.init()

    try {
        const transcriptColumns = await repository.database.all<{ name: string }>("PRAGMA table_info(transcripts)")
        const assetColumns = await repository.database.all<{ name: string }>("PRAGMA table_info(assets)")
        const linkColumns = await repository.database.all<{ name: string }>("PRAGMA table_info(transcript_links)")
        const eventTables = await repository.database.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'transcript_events'"
        )
        const linkIndexes = await repository.database.all<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transcript_links'"
        )
        const legacyTranscript = await repository.getTranscriptById("legacy-tr-1")

        assert.equal(transcriptColumns.some((column) => column.name == "status_reason"), true)
        assert.equal(assetColumns.some((column) => column.name == "reason"), true)
        assert.equal(linkColumns.some((column) => column.name == "expires_at"), true)
        assert.equal(linkColumns.some((column) => column.name == "expired_at"), true)
        assert.equal(eventTables.length, 1)
        assert.equal(linkIndexes.some((index) => index.name == "transcript_links_status_expires_at_index"), true)
        assert.equal(legacyTranscript?.ticketId, "legacy-ticket")
        assert.equal(legacyTranscript?.archivePath, "/legacy/archive")
    } finally {
        await repository.close()
        await fs.promises.rm(root, { recursive: true, force: true })
    }
})

test("repository summary counts transcript statuses and archive bytes", async () => {
    await withRepository("summary-counts", async (repository) => {
        await repository.createTranscript({ id: "tr-a", status: "active", totalBytes: 10 })
        await repository.createTranscript({ id: "tr-b", status: "partial", totalBytes: 20 })
        await repository.createTranscript({ id: "tr-c", status: "revoked", totalBytes: 30 })

        const summary = await repository.getSummary()

        assert.equal(summary.total, 3)
        assert.equal(summary.active, 1)
        assert.equal(summary.partial, 1)
        assert.equal(summary.revoked, 1)
        assert.equal(summary.totalArchiveBytes, 60)
    })
})

test("repository lists transcripts in deterministic descending order and clamps limits", async () => {
    await withRepository("list-ordering", async (repository) => {
        await repository.createTranscript({
            id: "tr-old",
            status: "active",
            createdAt: "2026-03-24T00:00:00.000Z",
            updatedAt: "2026-03-24T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-newer-a",
            status: "active",
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-newer-b",
            status: "active",
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z"
        })

        const result = await repository.listTranscripts({ limit: 999 })

        assert.equal(result.items.length, 3)
        assert.deepEqual(result.items.map((item) => item.id), ["tr-newer-b", "tr-newer-a", "tr-old"])
    })
})

test("repository listTranscriptCandidates reuses search and status filters without pagination", async () => {
    await withRepository("list-candidates", async (repository) => {
        await repository.createTranscript({
            id: "tr-a",
            status: "active",
            ticketId: "ticket-a",
            searchText: "customer alpha",
            createdAt: "2026-03-25T00:00:00.000Z",
            updatedAt: "2026-03-25T00:00:00.000Z"
        })
        await repository.createTranscriptLink({
            transcriptId: "tr-a",
            slug: "alpha-slug",
            status: "active"
        })
        await repository.createTranscript({
            id: "tr-b",
            status: "active",
            ticketId: "ticket-b",
            searchText: "customer beta",
            createdAt: "2026-03-26T00:00:00.000Z",
            updatedAt: "2026-03-26T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-c",
            status: "revoked",
            ticketId: "ticket-c",
            searchText: "customer alpha archived",
            createdAt: "2026-03-27T00:00:00.000Z",
            updatedAt: "2026-03-27T00:00:00.000Z"
        })

        const activeAlpha = await repository.listTranscriptCandidates({
            search: "alpha",
            status: "active",
            limit: 1,
            offset: 999
        })

        assert.deepEqual(activeAlpha.map((item) => item.id), ["tr-a"])

        const allAlpha = await repository.listTranscriptCandidates({
            search: "customer"
        })

        assert.deepEqual(allAlpha.map((item) => item.id), ["tr-c", "tr-b", "tr-a"])
    })
})

test("repository listTranscriptCandidates applies exact creator/channel/date filters and stable sort modes", async () => {
    await withRepository("list-candidate-filters-and-sorts", async (repository) => {
        await repository.createTranscript({
            id: "tr-a",
            status: "active",
            creatorId: "creator-1",
            channelId: "channel-1",
            searchText: "alpha oldest",
            createdAt: "2026-03-20T12:00:00.000Z",
            updatedAt: "2026-03-23T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-b",
            status: "active",
            creatorId: "creator-1",
            channelId: "channel-2",
            searchText: "alpha middle b",
            createdAt: "2026-03-21T12:00:00.000Z",
            updatedAt: "2026-03-21T12:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-c",
            status: "active",
            creatorId: "creator-2",
            channelId: "channel-1",
            searchText: "alpha middle c",
            createdAt: "2026-03-21T12:00:00.000Z",
            updatedAt: "2026-03-21T12:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-d",
            status: "active",
            creatorId: "creator-1",
            channelId: "channel-1",
            searchText: "alpha newest",
            createdAt: "2026-03-22T12:00:00.000Z",
            updatedAt: "2026-03-20T12:00:00.000Z"
        })

        const creatorOnly = await repository.listTranscriptCandidates({
            creatorId: "creator-1"
        })
        const channelOnly = await repository.listTranscriptCandidates({
            channelId: "channel-1"
        })
        const exactCombined = await repository.listTranscriptCandidates({
            creatorId: "creator-1",
            channelId: "channel-1"
        })
        const createdWindow = await repository.listTranscriptCandidates({
            search: "alpha",
            createdFrom: "2026-03-21T00:00:00.000Z",
            createdTo: "2026-03-21T23:59:59.999Z"
        })
        const createdDesc = await repository.listTranscriptCandidates({
            search: "alpha",
            sort: "created-desc"
        })
        const createdAsc = await repository.listTranscriptCandidates({
            search: "alpha",
            sort: "created-asc"
        })
        const updatedDesc = await repository.listTranscriptCandidates({
            search: "alpha",
            sort: "updated-desc"
        })
        const updatedAsc = await repository.listTranscriptCandidates({
            search: "alpha",
            sort: "updated-asc"
        })

        assert.deepEqual(creatorOnly.map((item) => item.id), ["tr-d", "tr-b", "tr-a"])
        assert.deepEqual(channelOnly.map((item) => item.id), ["tr-d", "tr-c", "tr-a"])
        assert.deepEqual(exactCombined.map((item) => item.id), ["tr-d", "tr-a"])
        assert.deepEqual(createdWindow.map((item) => item.id), ["tr-c", "tr-b"])
        assert.deepEqual(createdDesc.map((item) => item.id), ["tr-d", "tr-c", "tr-b", "tr-a"])
        assert.deepEqual(createdAsc.map((item) => item.id), ["tr-a", "tr-b", "tr-c", "tr-d"])
        assert.deepEqual(updatedDesc.map((item) => item.id), ["tr-a", "tr-c", "tr-b", "tr-d"])
        assert.deepEqual(updatedAsc.map((item) => item.id), ["tr-d", "tr-b", "tr-c", "tr-a"])
    })
})

test("repository expiry helpers list elapsed active links, expire them once, and keep expired slugs searchable", async () => {
    await withRepository("link-expiry-helpers", async (repository) => {
        await repository.createTranscript({
            id: "tr-expired-link",
            status: "active",
            ticketId: "ticket-expired-link",
            searchText: "customer expired",
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z"
        })
        await repository.createTranscriptLink({
            id: "link-expired-link",
            transcriptId: "tr-expired-link",
            slug: "expired-slug",
            createdAt: "2026-03-20T00:00:00.000Z",
            expiresAt: "2026-03-21T00:00:00.000Z"
        })

        await repository.createTranscript({
            id: "tr-future-link",
            status: "active",
            searchText: "customer future"
        })
        await repository.createTranscriptLink({
            id: "link-future-link",
            transcriptId: "tr-future-link",
            slug: "future-slug",
            createdAt: "2026-03-20T00:00:00.000Z",
            expiresAt: "2026-03-29T00:00:00.000Z"
        })

        await repository.createTranscript({
            id: "tr-permanent-link",
            status: "active",
            searchText: "customer permanent"
        })
        await repository.createTranscriptLink({
            id: "link-permanent-link",
            transcriptId: "tr-permanent-link",
            slug: "permanent-slug",
            createdAt: "2026-03-20T00:00:00.000Z",
            expiresAt: null
        })

        const elapsedAll = await repository.listElapsedActiveTranscriptLinks({
            referenceTime: "2026-03-27T00:00:00.000Z"
        })
        const elapsedBySlug = await repository.listElapsedActiveTranscriptLinks({
            referenceTime: "2026-03-27T00:00:00.000Z",
            slug: "expired-slug"
        })
        const elapsedByTranscript = await repository.listElapsedActiveTranscriptLinks({
            referenceTime: "2026-03-27T00:00:00.000Z",
            transcriptId: "tr-expired-link"
        })

        assert.deepEqual(elapsedAll.map((link) => link.id), ["link-expired-link"])
        assert.deepEqual(elapsedBySlug.map((link) => link.slug), ["expired-slug"])
        assert.deepEqual(elapsedByTranscript.map((link) => link.transcriptId), ["tr-expired-link"])

        const firstExpire = await repository.markTranscriptLinkExpired("link-expired-link", "2026-03-27T12:00:00.000Z")
        const secondExpire = await repository.markTranscriptLinkExpired("link-expired-link", "2026-03-27T12:05:00.000Z")
        const expiredLink = await repository.getTranscriptLinkBySlug("expired-slug")
        const searchResult = await repository.listTranscripts({
            search: "expired-slug"
        })

        assert.equal(firstExpire, true)
        assert.equal(secondExpire, false)
        assert.equal(expiredLink?.status, "expired")
        assert.equal(expiredLink?.reason, "Link expired by policy.")
        assert.equal(expiredLink?.expired_at, "2026-03-27T12:00:00.000Z")
        assert.equal((await repository.resolveTranscript("expired-slug")), null)
        assert.equal((await repository.resolveTranscriptAdminTarget("expired-slug"))?.id, "tr-expired-link")
        assert.deepEqual(searchResult.items.map((item) => item.id), ["tr-expired-link"])
        assert.equal(searchResult.items[0]?.activeSlug, null)
    })
})

test("repository lists transcript events newest first and filters by type", async () => {
    await withRepository("event-listing", async (repository) => {
        await repository.createTranscript({
            id: "tr-events",
            status: "active"
        })
        await repository.createTranscriptEvent({
            id: "event-1",
            transcriptId: "tr-events",
            type: "build-started",
            createdAt: "2026-03-25T00:00:00.000Z",
            details: {
                ticketId: "ticket-1"
            }
        })
        await repository.createTranscriptEvent({
            id: "event-3",
            transcriptId: "tr-events",
            type: "link-revoked",
            reason: "cleanup",
            createdAt: "2026-03-25T00:00:00.000Z"
        })
        await repository.createTranscriptEvent({
            id: "event-2",
            transcriptId: "tr-events",
            type: "build-succeeded",
            createdAt: "2026-03-26T00:00:00.000Z",
            details: {
                messageCount: 12,
                totalBytes: 100
            }
        })

        const filtered = await repository.listTranscriptEvents("tr-events", {
            limit: 999,
            offset: -5,
            types: ["build-started", "build-succeeded"]
        })

        assert.equal(filtered.total, 2)
        assert.deepEqual(filtered.items.map((item) => item.id), ["event-2", "event-1"])
        assert.deepEqual(filtered.items[0]?.details, { messageCount: 12, totalBytes: 100 })

        const unfiltered = await repository.listTranscriptEvents("tr-events", {})
        assert.deepEqual(unfiltered.items.map((item) => item.id), ["event-2", "event-3", "event-1"])
        assert.deepEqual(unfiltered.items[1]?.details, {})
    })
})

test("repository retention candidate query filters by status, age, archive presence, and run cap", async () => {
    await withRepository("retention-candidates", async (repository) => {
        await repository.createTranscript({
            id: "tr-revoked-oldest",
            status: "revoked",
            archivePath: "/archives/revoked-oldest",
            totalBytes: 64,
            updatedAt: "2026-03-20T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-failed-middle",
            status: "failed",
            archivePath: "/archives/failed-middle",
            totalBytes: 32,
            updatedAt: "2026-03-21T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-deleted-newest",
            status: "deleted",
            archivePath: "/archives/deleted-newest",
            totalBytes: 16,
            updatedAt: "2026-03-22T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-active",
            status: "active",
            archivePath: "/archives/active",
            totalBytes: 8,
            updatedAt: "2026-03-01T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-revoked-no-archive",
            status: "revoked",
            archivePath: null,
            totalBytes: 4,
            updatedAt: "2026-03-01T00:00:00.000Z"
        })
        await repository.createTranscript({
            id: "tr-failed-too-new",
            status: "failed",
            archivePath: "/archives/failed-too-new",
            totalBytes: 2,
            updatedAt: "2026-03-27T00:00:00.000Z"
        })

        const candidates = await repository.listRetentionCandidates({
            asOf: "2026-03-27T00:00:00.000Z",
            maxResults: 2,
            failedDays: 3,
            revokedDays: 5,
            deletedDays: 4
        })

        assert.deepEqual(candidates.map((candidate) => candidate.transcriptId), [
            "tr-revoked-oldest",
            "tr-failed-middle"
        ])
        assert.deepEqual(candidates.map((candidate) => candidate.configuredDays), [5, 3])
        assert.deepEqual(candidates.map((candidate) => candidate.ageDays), [7, 6])
    })
})
