import crypto from "crypto"

import { TRANSCRIPT_OPERATIONAL_SORTS } from "../contracts/constants"
import { createEmptyTranscriptSummary } from "../contracts/factories"
import type {
    CreateTranscriptEventInput,
    ListTranscriptEventsQuery,
    ListTranscriptEventsResult,
    ListTranscriptsQuery,
    ListTranscriptsResult,
    TranscriptAssetRecord,
    TranscriptEventDetails,
    TranscriptEventRecord,
    TranscriptEventType,
    TranscriptLinkRecord,
    TranscriptLinkStatus,
    TranscriptParticipantRecord,
    TranscriptParticipantRole,
    TranscriptRetentionCandidate,
    TranscriptRecord,
    TranscriptOperationalListQuery,
    TranscriptOperationalSort,
    TranscriptStatus,
    TranscriptSummary
} from "../contracts/types"
import { TranscriptSqliteDatabase } from "./sqlite"

interface TranscriptRow {
    id: string
    status: TranscriptStatus
    ticket_id: string | null
    channel_id: string | null
    guild_id: string | null
    creator_id: string | null
    deleter_id: string | null
    created_at: string | null
    updated_at: string | null
    archive_path: string | null
    message_count: number
    attachment_count: number
    warning_count: number
    total_bytes: number
    search_text: string
    status_reason: string | null
    active_slug: string | null
}

interface TranscriptLinkRow {
    id: string
    transcript_id: string
    slug: string
    status: TranscriptLinkStatus
    reason: string | null
    created_at: string
    expires_at: string | null
    expired_at: string | null
    revoked_at: string | null
}

interface TranscriptParticipantRow {
    id: string
    transcript_id: string
    user_id: string
    display_name: string
    role: TranscriptParticipantRole
}

interface TranscriptAssetRow {
    id: string
    transcript_id: string
    asset_name: string
    source_url: string
    local_path: string
    mime_type: string
    byte_size: number
    status: "mirrored" | "failed" | "skipped"
    reason: string | null
}

interface TranscriptEventRow {
    id: string
    transcript_id: string
    type: TranscriptEventType
    reason: string | null
    details_json: string | null
    created_at: string
}

interface TranscriptRetentionCandidateRow {
    id: string
    status: TranscriptStatus
    updated_at: string | null
    archive_path: string | null
    total_bytes: number
}

interface SqliteTableInfoRow {
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
}

export interface CreateTranscriptInput {
    id?: string
    status?: TranscriptStatus
    ticketId?: string | null
    channelId?: string | null
    guildId?: string | null
    creatorId?: string | null
    deleterId?: string | null
    archivePath?: string | null
    messageCount?: number
    attachmentCount?: number
    warningCount?: number
    totalBytes?: number
    searchText?: string
    statusReason?: string | null
    createdAt?: string
    updatedAt?: string
}

export interface CreateTranscriptLinkInput {
    id?: string
    transcriptId: string
    slug: string
    status?: TranscriptLinkStatus
    reason?: string | null
    createdAt?: string
    expiresAt?: string | null
    expiredAt?: string | null
    revokedAt?: string | null
}

export interface ListElapsedTranscriptLinksInput {
    referenceTime: string
    transcriptId?: string
    slug?: string
}

export interface ReplaceParticipantInput {
    userId: string
    displayName: string
    role: TranscriptParticipantRole
}

export interface ReplaceAssetInput {
    assetName: string
    sourceUrl: string
    localPath: string
    mimeType: string
    byteSize: number
    status: "mirrored" | "failed" | "skipped"
    reason?: string | null
}

export interface FinalizeTranscriptBuildInput {
    status: TranscriptStatus
    archivePath: string
    messageCount: number
    attachmentCount: number
    warningCount: number
    totalBytes: number
    searchText: string
    statusReason?: string | null
}

export interface ListRetentionCandidatesInput {
    asOf: string
    maxResults: number
    failedDays: number
    revokedDays: number
    deletedDays: number
}

export interface ListTranscriptAnalyticsCandidatesInput {
    limit?: number
    offset?: number
}

interface TranscriptCandidateFilters {
    search?: string
    status?: TranscriptStatus
    creatorId?: string
    channelId?: string
    createdFrom?: string
    createdTo?: string
}

export class TranscriptRepository {
    readonly database: TranscriptSqliteDatabase

    constructor(database: TranscriptSqliteDatabase) {
        this.database = database
    }

    async init() {
        await this.database.init()
        await this.database.exec(`
CREATE TABLE IF NOT EXISTS transcripts (
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
    search_text TEXT NOT NULL DEFAULT '',
    status_reason TEXT
);
CREATE TABLE IF NOT EXISTS transcript_links (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    expired_at TEXT,
    revoked_at TEXT,
    FOREIGN KEY(transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    FOREIGN KEY(transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    local_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    reason TEXT,
    FOREIGN KEY(transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transcript_events (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_links_active_slug_unique ON transcript_links(slug) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS transcripts_ticket_id_index ON transcripts(ticket_id);
CREATE INDEX IF NOT EXISTS transcripts_channel_id_index ON transcripts(channel_id);
CREATE INDEX IF NOT EXISTS transcripts_guild_id_index ON transcripts(guild_id);
CREATE INDEX IF NOT EXISTS transcripts_status_index ON transcripts(status);
CREATE INDEX IF NOT EXISTS transcripts_created_at_index ON transcripts(created_at);
CREATE INDEX IF NOT EXISTS transcript_events_transcript_id_created_at_index ON transcript_events(transcript_id, created_at);
CREATE INDEX IF NOT EXISTS transcript_events_type_index ON transcript_events(type);
CREATE INDEX IF NOT EXISTS transcript_events_created_at_index ON transcript_events(created_at);
        `)
        await this.migrateSchema()
    }

    async close() {
        await this.database.close()
    }

    async createTranscript(input: CreateTranscriptInput = {}): Promise<string> {
        const now = input.createdAt ?? new Date().toISOString()
        const transcriptId = input.id ?? crypto.randomUUID()

        await this.database.run(
            `INSERT INTO transcripts (
                id, status, ticket_id, channel_id, guild_id, creator_id, deleter_id, created_at, updated_at, archive_path, message_count, attachment_count, warning_count, total_bytes, search_text, status_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                transcriptId,
                input.status ?? "building",
                input.ticketId ?? null,
                input.channelId ?? null,
                input.guildId ?? null,
                input.creatorId ?? null,
                input.deleterId ?? null,
                now,
                input.updatedAt ?? now,
                input.archivePath ?? null,
                input.messageCount ?? 0,
                input.attachmentCount ?? 0,
                input.warningCount ?? 0,
                input.totalBytes ?? 0,
                input.searchText ?? "",
                input.statusReason ?? null
            ]
        )

        return transcriptId
    }

    async createTranscriptLink(input: CreateTranscriptLinkInput) {
        await this.database.run(
            `INSERT INTO transcript_links (id, transcript_id, slug, status, reason, created_at, expires_at, expired_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                input.id ?? crypto.randomUUID(),
                input.transcriptId,
                input.slug,
                input.status ?? "active",
                input.reason ?? null,
                input.createdAt ?? new Date().toISOString(),
                input.expiresAt ?? null,
                input.expiredAt ?? null,
                input.revokedAt ?? null
            ]
        )
    }

    async createTranscriptEvent(input: CreateTranscriptEventInput) {
        const detailsJson = this.stringifyTranscriptEventDetails(input.details)

        await this.database.run(
            `INSERT INTO transcript_events (id, transcript_id, type, reason, details_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                input.id ?? crypto.randomUUID(),
                input.transcriptId,
                input.type,
                input.reason ?? null,
                detailsJson,
                input.createdAt ?? new Date().toISOString()
            ]
        )
    }

    async getTranscriptById(id: string): Promise<TranscriptRecord | null> {
        return await this.getTranscriptByClause("t.id = ?", [id])
    }

    async resolveTranscript(target: string): Promise<TranscriptRecord | null> {
        const byId = await this.getTranscriptById(target)
        if (byId) return byId

        const bySlug = await this.getTranscriptByClause("active_link.slug = ? AND active_link.status = 'active'", [target])
        if (bySlug) return bySlug

        const byTicket = await this.getTranscriptByClause("t.ticket_id = ?", [target])
        if (byTicket) return byTicket

        return await this.getTranscriptByClause("t.channel_id = ?", [target])
    }

    async resolveTranscriptAdminTarget(target: string): Promise<TranscriptRecord | null> {
        const byId = await this.getTranscriptById(target)
        if (byId) return byId

        const byAnySlug = await this.getTranscriptByClause(
            "EXISTS (SELECT 1 FROM transcript_links link WHERE link.transcript_id = t.id AND link.slug = ?)",
            [target]
        )
        if (byAnySlug) return byAnySlug

        const byTicket = await this.getTranscriptByClause("t.ticket_id = ?", [target])
        if (byTicket) return byTicket

        return await this.getTranscriptByClause("t.channel_id = ?", [target])
    }

    async listTranscriptEvents(transcriptId: string, query: ListTranscriptEventsQuery): Promise<ListTranscriptEventsResult> {
        const normalized = this.normalizeTranscriptEventsQuery(query)
        const clauses = ["transcript_id = ?"]
        const params: unknown[] = [transcriptId]

        if (normalized.types.length > 0) {
            clauses.push(`type IN (${normalized.types.map(() => "?").join(", ")})`)
            params.push(...normalized.types)
        }

        const whereClause = "WHERE " + clauses.join(" AND ")
        const totalRow = await this.database.get<{ total: number }>(
            `SELECT COUNT(*) as total
             FROM transcript_events
             ${whereClause}`,
            params
        )

        const rows = await this.database.all<TranscriptEventRow>(
            `SELECT *
             FROM transcript_events
             ${whereClause}
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [...params, normalized.limit, normalized.offset]
        )

        return {
            total: totalRow?.total ?? 0,
            items: rows.map((row) => this.mapTranscriptEventRow(row))
        }
    }

    async listRetentionCandidates(input: ListRetentionCandidatesInput): Promise<TranscriptRetentionCandidate[]> {
        const rows = await this.database.all<TranscriptRetentionCandidateRow>(
            `SELECT id, status, updated_at, archive_path, total_bytes
             FROM transcripts
             WHERE archive_path IS NOT NULL
               AND (
                   (status = 'failed' AND updated_at <= ?)
                   OR (status = 'revoked' AND updated_at <= ?)
                   OR (status = 'deleted' AND updated_at <= ?)
               )
             ORDER BY updated_at ASC, id ASC
             LIMIT ?`,
            [
                this.getRetentionCutoffIso(input.asOf, input.failedDays),
                this.getRetentionCutoffIso(input.asOf, input.revokedDays),
                this.getRetentionCutoffIso(input.asOf, input.deletedDays),
                Math.max(1, input.maxResults)
            ]
        )

        return rows.map((row) => this.mapTranscriptRetentionCandidateRow(row, input.asOf, input))
    }

    async listTranscripts(query: ListTranscriptsQuery): Promise<ListTranscriptsResult> {
        const { whereClause, params } = this.buildTranscriptListFilters(query)
        const limit = Math.max(1, Math.min(query.limit ?? 25, 100))
        const offset = Math.max(0, query.offset ?? 0)

        const totalRow = await this.database.get<{ total: number }>(
            `SELECT COUNT(*) as total
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             ${whereClause}`,
            params
        )

        const rows = await this.database.all<TranscriptRow>(
            `SELECT
                t.*,
                active_link.slug as active_slug
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             ${whereClause}
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        )

        return {
            total: totalRow?.total ?? 0,
            items: rows.map((row) => this.mapTranscriptRow(row))
        }
    }

    async listTranscriptCandidates(query: TranscriptOperationalListQuery): Promise<TranscriptRecord[]> {
        const { whereClause, params } = this.buildTranscriptCandidateFilters(query)
        const rows = await this.database.all<TranscriptRow>(
            `SELECT
                t.*,
                active_link.slug as active_slug
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             ${whereClause}
             ORDER BY ${this.buildOperationalSortClause(query.sort)}`,
            params
        )

        return rows.map((row) => this.mapTranscriptRow(row))
    }

    async listTranscriptAnalyticsCandidates(query: ListTranscriptAnalyticsCandidatesInput): Promise<ListTranscriptsResult> {
        const limit = Math.max(1, Math.min(query.limit ?? 200, 500))
        const offset = Math.max(0, query.offset ?? 0)

        const totalRow = await this.database.get<{ total: number }>(
            `SELECT COUNT(*) as total
             FROM transcripts t
             WHERE t.archive_path IS NOT NULL`
        )

        const rows = await this.database.all<TranscriptRow>(
            `SELECT
                t.*,
                active_link.slug as active_slug
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             WHERE t.archive_path IS NOT NULL
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        )

        return {
            total: totalRow?.total ?? 0,
            items: rows.map((row) => this.mapTranscriptRow(row))
        }
    }

    async listAllTranscripts(): Promise<TranscriptRecord[]> {
        const rows = await this.database.all<TranscriptRow>(
            `SELECT
                t.*,
                active_link.slug as active_slug
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             ORDER BY t.created_at DESC, t.id DESC`
        )

        return rows.map((row) => this.mapTranscriptRow(row))
    }

    async getSummary(): Promise<TranscriptSummary> {
        const row = await this.database.get<TranscriptSummary>(
            `SELECT
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active,
                COALESCE(SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END), 0) as partial,
                COALESCE(SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END), 0) as revoked,
                COALESCE(SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END), 0) as deleted,
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
                COALESCE(SUM(CASE WHEN status = 'building' THEN 1 ELSE 0 END), 0) as building,
                COALESCE(SUM(total_bytes), 0) as totalArchiveBytes,
                0 as queueDepth,
                0 as recoveredBuilds
             FROM transcripts`
        )

        return {
            ...createEmptyTranscriptSummary(),
            ...(row ?? {})
        }
    }

    async getActiveLink(transcriptId: string): Promise<TranscriptLinkRow | null> {
        const row = await this.database.get<TranscriptLinkRow>(
            `SELECT * FROM transcript_links
             WHERE transcript_id = ? AND status = 'active'
             LIMIT 1`,
            [transcriptId]
        )

        return row ?? null
    }

    async getTranscriptLinkBySlug(slug: string): Promise<TranscriptLinkRow | null> {
        const row = await this.database.get<TranscriptLinkRow>(
            `SELECT * FROM transcript_links
             WHERE slug = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [slug]
        )

        return row ?? null
    }

    async listTranscriptLinks(transcriptId: string): Promise<TranscriptLinkRecord[]> {
        const rows = await this.database.all<TranscriptLinkRow>(
            `SELECT * FROM transcript_links
             WHERE transcript_id = ?
             ORDER BY created_at DESC, id DESC`,
            [transcriptId]
        )

        return rows.map((row) => this.mapTranscriptLinkRow(row))
    }

    async listElapsedActiveTranscriptLinks(input: ListElapsedTranscriptLinksInput): Promise<TranscriptLinkRecord[]> {
        const clauses = [
            "status = 'active'",
            "expires_at IS NOT NULL",
            "expires_at <= ?"
        ]
        const params: unknown[] = [input.referenceTime]

        if (input.transcriptId) {
            clauses.push("transcript_id = ?")
            params.push(input.transcriptId)
        }

        if (input.slug) {
            clauses.push("slug = ?")
            params.push(input.slug)
        }

        const rows = await this.database.all<TranscriptLinkRow>(
            `SELECT * FROM transcript_links
             WHERE ${clauses.join(" AND ")}
             ORDER BY expires_at ASC, created_at ASC, id ASC`,
            params
        )

        return rows.map((row) => this.mapTranscriptLinkRow(row))
    }

    async listTranscriptParticipants(transcriptId: string): Promise<TranscriptParticipantRecord[]> {
        const rows = await this.database.all<TranscriptParticipantRow>(
            `SELECT * FROM participants
             WHERE transcript_id = ?
             ORDER BY
               CASE role
                 WHEN 'creator' THEN 0
                 WHEN 'admin' THEN 1
                 ELSE 2
               END,
               display_name ASC,
               id ASC`,
            [transcriptId]
        )

        return rows.map((row) => this.mapTranscriptParticipantRow(row))
    }

    async listTranscriptAssets(transcriptId: string): Promise<TranscriptAssetRecord[]> {
        const rows = await this.database.all<TranscriptAssetRow>(
            `SELECT * FROM assets
             WHERE transcript_id = ?
             ORDER BY
               CASE status
                 WHEN 'failed' THEN 0
                 WHEN 'skipped' THEN 1
                 ELSE 2
               END,
               asset_name ASC,
               id ASC`,
            [transcriptId]
        )

        return rows.map((row) => this.mapTranscriptAssetRow(row))
    }

    async getTranscriptAsset(transcriptId: string, assetName: string): Promise<TranscriptAssetRow | null> {
        const row = await this.database.get<TranscriptAssetRow>(
            `SELECT * FROM assets
             WHERE transcript_id = ? AND asset_name = ?
             LIMIT 1`,
            [transcriptId, assetName]
        )

        return row ?? null
    }

    async updateTranscriptStatus(id: string, status: TranscriptStatus, statusReason?: string | null) {
        await this.database.run(
            "UPDATE transcripts SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?",
            [status, statusReason ?? null, new Date().toISOString(), id]
        )
    }

    async finalizeTranscriptBuild(id: string, input: FinalizeTranscriptBuildInput) {
        await this.database.run(
            `UPDATE transcripts
             SET status = ?, archive_path = ?, message_count = ?, attachment_count = ?, warning_count = ?, total_bytes = ?, search_text = ?, status_reason = ?, updated_at = ?
             WHERE id = ?`,
            [
                input.status,
                input.archivePath,
                input.messageCount,
                input.attachmentCount,
                input.warningCount,
                input.totalBytes,
                input.searchText,
                input.statusReason ?? null,
                new Date().toISOString(),
                id
            ]
        )
    }

    async markTranscriptFailed(id: string, reason?: string | null) {
        await this.database.run(
            "UPDATE transcripts SET status = 'failed', status_reason = ?, updated_at = ? WHERE id = ?",
            [reason ?? null, new Date().toISOString(), id]
        )
    }

    async markStaleBuildingTranscriptsFailed(): Promise<number> {
        const result = await this.database.run(
            `UPDATE transcripts
             SET status = 'failed',
                 status_reason = COALESCE(status_reason, 'Recovered stale building transcript after startup.'),
                 updated_at = ?
             WHERE status = 'building'`,
            [new Date().toISOString()]
        )
        return result.changes
    }

    async listTranscriptIdsByStatus(status: TranscriptStatus): Promise<string[]> {
        const rows = await this.database.all<{ id: string }>(
            `SELECT id
             FROM transcripts
             WHERE status = ?
             ORDER BY created_at DESC, id DESC`,
            [status]
        )

        return rows.map((row) => row.id)
    }

    async setActiveLinkStatus(transcriptId: string, status: TranscriptLinkStatus, reason?: string) {
        const now = new Date().toISOString()
        const revokedAt = status == "active" || status == "expired" ? null : now
        const expiredAt = status == "expired" ? now : null
        await this.database.run(
            `UPDATE transcript_links
             SET status = ?, reason = ?, revoked_at = ?, expired_at = ?
             WHERE transcript_id = ? AND status = 'active'`,
            [status, reason ?? null, revokedAt, expiredAt, transcriptId]
        )
    }

    async setAllLinkStatuses(transcriptId: string, status: TranscriptLinkStatus, reason?: string) {
        const now = new Date().toISOString()
        const revokedAt = status == "active" || status == "expired" ? null : now
        const expiredAt = status == "expired" ? now : null
        await this.database.run(
            `UPDATE transcript_links
             SET status = ?, reason = COALESCE(?, reason), revoked_at = ?, expired_at = CASE WHEN ? IS NULL THEN expired_at ELSE ? END
             WHERE transcript_id = ?`,
            [status, reason ?? null, revokedAt, expiredAt, expiredAt, transcriptId]
        )
    }

    async markTranscriptLinkExpired(linkId: string, expiredAt: string, reason = "Link expired by policy.") {
        const result = await this.database.run(
            `UPDATE transcript_links
             SET status = 'expired', reason = ?, expired_at = ?, revoked_at = NULL
             WHERE id = ? AND status = 'active'`,
            [reason, expiredAt, linkId]
        )

        return result.changes > 0
    }

    async updateTranscriptArchivePath(id: string, archivePath: string | null) {
        await this.database.run(
            "UPDATE transcripts SET archive_path = ?, updated_at = ? WHERE id = ?",
            [archivePath, new Date().toISOString(), id]
        )
    }

    async clearTranscriptArchiveData(id: string, updatedAt = new Date().toISOString()) {
        await this.database.run(
            "UPDATE transcripts SET archive_path = NULL, total_bytes = 0, updated_at = ? WHERE id = ?",
            [updatedAt, id]
        )
    }

    async replaceParticipants(transcriptId: string, participants: ReplaceParticipantInput[]) {
        await this.database.run("DELETE FROM participants WHERE transcript_id = ?", [transcriptId])

        for (const participant of participants) {
            await this.database.run(
                `INSERT INTO participants (id, transcript_id, user_id, display_name, role)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    transcriptId,
                    participant.userId,
                    participant.displayName,
                    participant.role
                ]
            )
        }
    }

    async replaceAssets(transcriptId: string, assets: ReplaceAssetInput[]) {
        await this.database.run("DELETE FROM assets WHERE transcript_id = ?", [transcriptId])

        for (const asset of assets) {
            await this.database.run(
                `INSERT INTO assets (id, transcript_id, asset_name, source_url, local_path, mime_type, byte_size, status, reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    transcriptId,
                    asset.assetName,
                    asset.sourceUrl,
                    asset.localPath,
                    asset.mimeType,
                    asset.byteSize,
                    asset.status,
                    asset.reason ?? null
                ]
            )
        }
    }

    private async getTranscriptByClause(clause: string, params: unknown[]): Promise<TranscriptRecord | null> {
        const row = await this.database.get<TranscriptRow>(
            `SELECT
                t.*,
                active_link.slug as active_slug
             FROM transcripts t
             LEFT JOIN transcript_links active_link
               ON active_link.transcript_id = t.id AND active_link.status = 'active'
             WHERE ${clause}
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT 1`,
            params
        )

        return row ? this.mapTranscriptRow(row) : null
    }

    private buildTranscriptListFilters(query: ListTranscriptsQuery) {
        const clauses: string[] = []
        const params: unknown[] = []

        if (query.status) {
            clauses.push("t.status = ?")
            params.push(query.status)
        }

        if (query.search) {
            const searchValue = "%" + query.search.toLowerCase() + "%"
            clauses.push(`(
                LOWER(
                    COALESCE(t.search_text, '') || ' ' ||
                    COALESCE(t.id, '') || ' ' ||
                    COALESCE(t.ticket_id, '') || ' ' ||
                    COALESCE(t.channel_id, '') || ' ' ||
                    COALESCE(t.status_reason, '')
                ) LIKE ?
                OR EXISTS (
                    SELECT 1
                    FROM transcript_links search_link
                    WHERE search_link.transcript_id = t.id
                      AND LOWER(COALESCE(search_link.slug, '')) LIKE ?
                )
            )`)
            params.push(searchValue, searchValue)
        }

        return {
            whereClause: clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "",
            params
        }
    }

    private buildTranscriptCandidateFilters(query: TranscriptCandidateFilters) {
        const { whereClause, params } = this.buildTranscriptListFilters(query)
        const clauses = whereClause == "" ? [] : [whereClause.replace(/^WHERE\s+/i, "")]

        if (query.creatorId) {
            clauses.push("t.creator_id = ?")
            params.push(query.creatorId)
        }

        if (query.channelId) {
            clauses.push("t.channel_id = ?")
            params.push(query.channelId)
        }

        if (query.createdFrom) {
            clauses.push("t.created_at >= ?")
            params.push(query.createdFrom)
        }

        if (query.createdTo) {
            clauses.push("t.created_at <= ?")
            params.push(query.createdTo)
        }

        return {
            whereClause: clauses.length > 0 ? "WHERE " + clauses.join(" AND ") : "",
            params
        }
    }

    private buildOperationalSortClause(sort?: TranscriptOperationalSort) {
        const normalizedSort = TRANSCRIPT_OPERATIONAL_SORTS.includes(sort as TranscriptOperationalSort)
            ? sort as TranscriptOperationalSort
            : "created-desc"

        switch (normalizedSort) {
            case "created-asc":
                return "t.created_at ASC, t.id ASC"
            case "updated-desc":
                return "t.updated_at DESC, t.id DESC"
            case "updated-asc":
                return "t.updated_at ASC, t.id ASC"
            default:
                return "t.created_at DESC, t.id DESC"
        }
    }

    private mapTranscriptRow(row: TranscriptRow): TranscriptRecord {
        return {
            id: row.id,
            status: row.status,
            ticketId: row.ticket_id,
            channelId: row.channel_id,
            guildId: row.guild_id,
            creatorId: row.creator_id,
            deleterId: row.deleter_id,
            activeSlug: row.active_slug,
            publicUrl: null,
            archivePath: row.archive_path,
            statusReason: row.status_reason,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            messageCount: row.message_count ?? 0,
            attachmentCount: row.attachment_count ?? 0,
            warningCount: row.warning_count ?? 0,
            totalBytes: row.total_bytes ?? 0
        }
    }

    private mapTranscriptLinkRow(row: TranscriptLinkRow): TranscriptLinkRecord {
        return {
            id: row.id,
            transcriptId: row.transcript_id,
            slug: row.slug,
            status: row.status,
            reason: row.reason,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            expiredAt: row.expired_at,
            revokedAt: row.revoked_at,
            publicUrl: null
        }
    }

    private mapTranscriptParticipantRow(row: TranscriptParticipantRow): TranscriptParticipantRecord {
        return {
            id: row.id,
            userId: row.user_id,
            displayName: row.display_name,
            role: row.role
        }
    }

    private mapTranscriptAssetRow(row: TranscriptAssetRow): TranscriptAssetRecord {
        return {
            id: row.id,
            assetName: row.asset_name,
            sourceUrl: row.source_url,
            archiveRelativePath: row.local_path.trim() == "" ? null : row.local_path,
            mimeType: row.mime_type,
            byteSize: row.byte_size ?? 0,
            status: row.status,
            reason: row.reason
        }
    }

    private mapTranscriptEventRow(row: TranscriptEventRow): TranscriptEventRecord {
        return {
            id: row.id,
            transcriptId: row.transcript_id,
            type: row.type,
            reason: row.reason,
            details: this.parseTranscriptEventDetails(row.details_json),
            createdAt: row.created_at
        }
    }

    private mapTranscriptRetentionCandidateRow(
        row: TranscriptRetentionCandidateRow,
        asOf: string,
        windows: Pick<ListRetentionCandidatesInput, "failedDays" | "revokedDays" | "deletedDays">
    ): TranscriptRetentionCandidate {
        const configuredDays = row.status == "failed"
            ? windows.failedDays
            : row.status == "revoked"
                ? windows.revokedDays
                : windows.deletedDays

        return {
            transcriptId: row.id,
            status: row.status,
            updatedAt: row.updated_at,
            ageDays: this.calculateAgeDays(row.updated_at, asOf),
            configuredDays,
            archivePath: row.archive_path,
            totalBytes: row.total_bytes ?? 0
        }
    }

    private async migrateSchema() {
        await this.ensureColumn("transcripts", "status_reason", "TEXT")
        await this.ensureColumn("assets", "reason", "TEXT")
        await this.ensureColumn("transcript_links", "expires_at", "TEXT")
        await this.ensureColumn("transcript_links", "expired_at", "TEXT")
        await this.database.run("CREATE INDEX IF NOT EXISTS transcript_links_status_expires_at_index ON transcript_links(status, expires_at)")
    }

    private async ensureColumn(tableName: string, columnName: string, columnDefinition: string) {
        const columns = await this.database.all<SqliteTableInfoRow>(`PRAGMA table_info(${tableName})`)
        if (columns.some((column) => column.name == columnName)) {
            return
        }

        await this.database.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
    }

    private normalizeTranscriptEventsQuery(query: ListTranscriptEventsQuery) {
        return {
            limit: Math.max(1, Math.min(query.limit ?? 25, 100)),
            offset: Math.max(0, query.offset ?? 0),
            types: Array.isArray(query.types) && query.types.length > 0 ? query.types : []
        }
    }

    private stringifyTranscriptEventDetails(details?: TranscriptEventDetails): string | null {
        if (!details) return null
        if (Object.keys(details).length == 0) return null
        return JSON.stringify(details)
    }

    private parseTranscriptEventDetails(detailsJson: string | null): TranscriptEventDetails {
        if (!detailsJson || detailsJson.trim() == "") return {}

        try {
            const parsed = JSON.parse(detailsJson)
            if (!parsed || Array.isArray(parsed) || typeof parsed != "object") {
                return {}
            }

            return parsed as TranscriptEventDetails
        } catch {
            return {}
        }
    }

    private getRetentionCutoffIso(asOf: string, days: number) {
        const asOfDate = new Date(asOf)
        return new Date(asOfDate.getTime() - days * 86400000).toISOString()
    }

    private calculateAgeDays(updatedAt: string | null, asOf: string) {
        if (!updatedAt) return 0

        const updatedAtMs = new Date(updatedAt).getTime()
        const asOfMs = new Date(asOf).getTime()
        if (!Number.isFinite(updatedAtMs) || !Number.isFinite(asOfMs) || updatedAtMs >= asOfMs) {
            return 0
        }

        return Math.floor((asOfMs - updatedAtMs) / 86400000)
    }
}
