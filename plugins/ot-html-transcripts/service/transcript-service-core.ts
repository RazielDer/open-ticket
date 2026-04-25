import crypto from "crypto"
import * as fs from "fs"
import path from "path"

import {
    createEmptyTranscriptOperationalListResult,
    createEmptyTranscriptOperationalMatchingSummary,
    createEmptyTranscriptSummary,
    createErrorActionResult,
    createOkActionResult,
    createTranscriptBulkActionErrorResult,
    createTranscriptPrepareBulkExportErrorResult
} from "../contracts/factories"
import { TRANSCRIPT_OPERATIONAL_SORTS } from "../contracts/constants"
import type { LocalAssetRef, LocalTranscriptDocument } from "../contracts/document"
import type {
    ActionResult,
    CreateTranscriptEventInput,
    ListViewerAccessibleTranscriptsQuery,
    ListViewerAccessibleTranscriptsResult,
    TranscriptBulkActionItemResult,
    TranscriptBulkActionResult,
    TranscriptBulkExportItemResult,
    TranscriptAccessMode,
    TranscriptAccessPolicy,
    TranscriptExportFormat,
    TranscriptHtmlStyleDraft,
    TranscriptIntegrityHealth,
    TranscriptIntegrityIssue,
    TranscriptIntegrityIssueCode,
    TranscriptIntegrityRepairAction,
    TranscriptIntegrityRepairFailure,
    TranscriptIntegrityRepairResult,
    TranscriptIntegrityReport,
    TranscriptIntegritySummary,
    TranscriptOperationalIntegrityFilter,
    TranscriptOperationalListQuery,
    TranscriptOperationalListResult,
    TranscriptOperationalMatchingSummary,
    TranscriptOperationalRecord,
    TranscriptOperationalRetentionFilter,
    TranscriptOperationalSort,
    TranscriptPreparedBulkExport,
    TranscriptPrepareExportResult,
    TranscriptPrepareBulkExportResult,
    TranscriptStylePreset,
    TranscriptStylePreviewResult,
    ListTranscriptEventsQuery,
    ListTranscriptEventsResult,
    ListTranscriptsQuery,
    ListTranscriptsResult,
    OTHtmlTranscriptsConfigData,
    TicketAnalyticsHistoryQuery,
    TicketAnalyticsHistoryRecord,
    TicketAnalyticsHistoryResult,
    TranscriptDetail,
    TranscriptLinkRecord,
    TranscriptParticipantRecord,
    TranscriptParticipantRole,
    TranscriptRecord,
    TranscriptRetentionExecutionResult,
    TranscriptRetentionPreview,
    TranscriptRetentionTrigger,
    TranscriptRetentionWindows,
    TranscriptPreparedExport,
    TranscriptStatus,
    TranscriptSummary,
    TranscriptViewerAccessContext,
    TranscriptViewerAccessPath,
    TranscriptViewerAssetResult,
    TranscriptViewerDocumentResult
} from "../contracts/types"
import { TranscriptQueue } from "../queue/transcript-queue"
import { ASSET_BASE_PLACEHOLDER, renderTranscriptHtml } from "../render/html-renderer"
import { buildTranscriptPreviewDocument } from "../build/preview-document"
import { buildTranscriptHtmlCsp, buildTranscriptPreviewHtmlCsp } from "../http/security"
import { ensurePathWithinRoot, ensureTranscriptStorageDirs, getTranscriptArchivePath, getTranscriptTempPath, resolveTranscriptStoragePaths } from "../storage/archive-paths"
import type { CreateTranscriptInput, ReplaceAssetInput, ReplaceParticipantInput } from "../storage/repository"
import { TranscriptRepository } from "../storage/repository"
import { recoverTranscriptStorage } from "../storage/recovery"
import { TranscriptSqliteDatabase } from "../storage/sqlite"
import { cloneDiscordDefaultTranscriptHtmlStyleDraft } from "../build/style-mapper"

const FAR_FUTURE_AVAILABILITY = new Date("2100-01-01T00:00:00.000Z")
const DEFAULT_LINK_EXPIRY_CONFIG = {
    enabled: false,
    ttlDays: 30
} as const
const DEFAULT_RETENTION_CONFIG = {
    enabled: false,
    runOnStartup: true,
    maxTranscriptsPerRun: 100,
    statuses: {
        failedDays: 30,
        revokedDays: 365,
        deletedDays: 7
    }
} as const
const DEFAULT_INTEGRITY_REPAIR_ORDER: TranscriptIntegrityRepairAction[] = [
    "clear-archive-metadata",
    "rerender-index-html",
    "downgrade-missing-assets",
    "demote-to-failed"
]
const INTEGRITY_DEMOTION_REASON = "Transcript integrity repair demoted this transcript to failed."
const LINK_EXPIRED_REASON = "Link expired by policy."
const PRIVATE_VIEWER_URL_NOT_READY_MESSAGE = "Dashboard transcript viewer URLs are unavailable. Load ot-dashboard and configure a valid publicBaseUrl before issuing private transcript links. Whitelist review submit stays blocked until the viewer host is ready."
const VIEWER_ACCESS_NOT_FOUND_MESSAGE = "Transcript not found."
const VIEWER_ACCESS_GONE_MESSAGE = "Transcript link is no longer available."
const VIEWER_NOT_READY_MESSAGE = "Transcript archive is not ready."
const PREVIEW_UNAVAILABLE_MESSAGE = "Transcript style preview is unavailable while the transcript service is unhealthy or missing the preview renderer."
const OPERATIONAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_VIEWER_ACCESS_FRESHNESS_MS = 60_000
const ANALYTICS_CANDIDATE_SCAN_PAGE_SIZE = 500
const ANALYTICS_CANDIDATE_SCAN_LIMIT = 2_000
const ANALYTICS_CANDIDATE_SCAN_LIMIT_WARNING = "Transcript analytics history exceeded the archive scan ceiling and was truncated."

function normalizeAnalyticsCursor(value: unknown) {
    if (typeof value != "string" || value.trim().length == 0) return 0
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function parseAnalyticsIsoMillis(value: unknown) {
    if (typeof value != "string" || value.trim().length == 0) return null
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
}

function normalizeNullableAnalyticsString(value: unknown) {
    return typeof value == "string" && value.trim().length > 0 ? value.trim() : null
}

function normalizeAnalyticsTransport(value: unknown): "channel_text" | "private_thread" | null {
    if (value == "channel_text") return "channel_text"
    if (value == "private_thread") return "private_thread"
    return null
}

function numberOrNull(value: unknown) {
    return typeof value == "number" && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown) {
    return typeof value == "string" && value.trim().length > 0 ? value.trim() : null
}

const BUILT_IN_TRANSCRIPT_STYLE_PRESETS: TranscriptStylePreset[] = [
    {
        id: "discord-classic",
        label: "Discord Default",
        description: "Locked Discord dark theme used for every HTML transcript.",
        draft: cloneDiscordDefaultTranscriptHtmlStyleDraft()
    }
]

interface TranscriptDocumentAssetRef {
    asset: LocalAssetRef
    location: string
}

type TicketParticipant = { user: { id: string; displayName: string }; role: "creator" | "participant" | "admin" }
type TicketLike = { id: { value: string }; get(key: string): { value: unknown } }
type ChannelLike = { id: string; name: string; guild: { id: string; name: string } }
type UserLike = { id: string; displayName: string }
type TranscriptLinkExpiryTrigger = "startup" | "public-route" | "viewer-route" | "resolve" | "list"

export interface HtmlTranscriptCompileResult {
    ticket: TicketLike
    channel: ChannelLike
    user: UserLike
    success: boolean
    errorReason: string | null
    messages: any[] | null
    data: { url: string; availableUntil: Date } | null
}

export interface TranscriptBuildDependencies {
    collectMessages: (ticket: TicketLike, channel: ChannelLike) => Promise<any[]>
    buildDocument: (transcriptId: string, ticket: TicketLike, channel: ChannelLike, user: UserLike, messages: any[], participants: TicketParticipant[]) => Promise<any>
    mirrorAssets: (document: any, tempArchivePath: string, config: OTHtmlTranscriptsConfigData) => Promise<{ warnings: Array<{ code: string; message: string; sourceUrl?: string | null }>; totalBytes: number; mirroredCount: number; assetRecords: ReplaceAssetInput[] }>
    writeArchive: (tempArchivePath: string, document: any) => Promise<{ documentBytes: number; htmlBytes: number; totalBytes: number }>
    markDocumentStatus: (document: any, status: TranscriptStatus) => void
    getParticipants: (ticket: TicketLike) => Promise<TicketParticipant[] | null>
}

const DEFAULT_BUILD_DEPENDENCIES: TranscriptBuildDependencies = {
    collectMessages: async (ticket, channel) => {
        const { collectFullHistoryTranscriptMessages } = await import("../collect/full-history-collector.js")
        return await collectFullHistoryTranscriptMessages(ticket as never, channel as never)
    },
    buildDocument: async (transcriptId, ticket, channel, user, messages, participants) => {
        const { buildTranscriptDocument } = await import("../build/document-builder.js")
        return await buildTranscriptDocument(transcriptId, ticket as never, channel as never, user as never, messages, participants as never)
    },
    mirrorAssets: async (document, tempArchivePath, config) => {
        const { mirrorDocumentAssets } = await import("../assets/asset-mirror.js")
        return await mirrorDocumentAssets(document, tempArchivePath, config)
    },
    writeArchive: async (tempArchivePath, document) => {
        const { writeTranscriptArchive } = await import("../build/archive-writer.js")
        return await writeTranscriptArchive(tempArchivePath, document)
    },
    markDocumentStatus: (document, status) => {
        document.status = status
        document.warningCount = document.warnings.length
    },
    getParticipants: async (ticket) => {
        const runtime = await import("#opendiscord")
        return await runtime.opendiscord.tickets.getAllTicketParticipants(ticket as never)
    }
}

export class TranscriptServiceCore {
    readonly queue = new TranscriptQueue()
    readonly dependencies: TranscriptBuildDependencies
    repository: TranscriptRepository | null = null
    config: OTHtmlTranscriptsConfigData | null = null
    #healthy = false
    #recoveredBuilds = 0

    constructor(dependencies: Partial<TranscriptBuildDependencies> = {}) {
        this.dependencies = {
            ...DEFAULT_BUILD_DEPENDENCIES,
            ...dependencies
        }
    }

    async initialize(config: OTHtmlTranscriptsConfigData) {
        this.config = config
        await ensureTranscriptStorageDirs(config)

        const { sqlitePath } = resolveTranscriptStoragePaths(config)
        const database = new TranscriptSqliteDatabase(sqlitePath)
        const repository = new TranscriptRepository(database)
        await repository.init()

        this.repository = repository
        this.queue.configure(config.queue.maxActiveTranscripts)

        const recovery = await recoverTranscriptStorage(repository, config)
        this.#recoveredBuilds = recovery.recoveredBuilds
        await this.normalizeExpiredLinks("startup")
        if (config.retention.enabled && config.retention.runOnStartup) {
            await this.executeRetentionSweep("startup")
        }
        this.#healthy = true
    }

    async shutdown() {
        this.#healthy = false
        if (this.repository) {
            await this.repository.close()
            this.repository = null
        }
    }

    isHealthy() {
        return this.#healthy
    }

    async getSummary(): Promise<TranscriptSummary> {
        if (!this.repository) {
            return createEmptyTranscriptSummary()
        }

        const summary = await this.repository.getSummary()
        return {
            ...summary,
            queueDepth: this.queue.getDepth(),
            recoveredBuilds: this.#recoveredBuilds
        }
    }

    async resolveTranscript(target: string): Promise<TranscriptRecord | null> {
        if (!this.repository) return null
        await this.normalizeExpiredLinks("resolve")
        return this.hydrateTranscript(await this.repository.resolveTranscript(target))
    }

    async resolveAdminTarget(target: string): Promise<TranscriptRecord | null> {
        if (!this.repository) return null
        await this.normalizeExpiredLinks("resolve")
        return this.hydrateTranscript(await this.repository.resolveTranscriptAdminTarget(target))
    }

    async listTranscripts(query: ListTranscriptsQuery): Promise<ListTranscriptsResult> {
        if (!this.repository) return { total: 0, items: [] }
        await this.normalizeExpiredLinks("list")
        const result = await this.repository.listTranscripts(query)
        return {
            ...result,
            items: result.items.map((item) => this.hydrateTranscript(item)!)
        }
    }

    async listTicketAnalyticsHistory(query: TicketAnalyticsHistoryQuery): Promise<TicketAnalyticsHistoryResult> {
        const empty = (warnings: string[] = []): TicketAnalyticsHistoryResult => ({
            total: 0,
            items: [],
            warnings,
            nextCursor: null,
            truncated: false
        })
        if (!this.repository || !this.config) {
            return empty(["Transcript analytics history is unavailable because the transcript service is not initialized."])
        }

        const limit = Math.max(1, Math.min(query.limit ?? 200, 500))
        const offset = normalizeAnalyticsCursor(query.cursor)
        const openedFrom = parseAnalyticsIsoMillis(query.openedFrom)
        const openedTo = parseAnalyticsIsoMillis(query.openedTo)
        const teamId = normalizeNullableAnalyticsString(query.teamId)
        const assigneeId = normalizeNullableAnalyticsString(query.assigneeId)
        const transportMode = normalizeAnalyticsTransport(query.transportMode)
        const warnings: string[] = []
        const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
        const matchingRecords: TicketAnalyticsHistoryRecord[] = []
        let candidateOffset = 0

        let scannedCandidates = 0
        let truncated = false

        while (scannedCandidates < ANALYTICS_CANDIDATE_SCAN_LIMIT) {
            const pageLimit = Math.min(ANALYTICS_CANDIDATE_SCAN_PAGE_SIZE, ANALYTICS_CANDIDATE_SCAN_LIMIT - scannedCandidates)
            const result = await this.repository.listTranscriptAnalyticsCandidates({
                limit: pageLimit,
                offset: candidateOffset
            })

            for (const transcript of result.items) {
                if (!transcript.archivePath) {
                    warnings.push(`Transcript ${transcript.id} is missing archive metadata and was skipped.`)
                    continue
                }

                let document: LocalTranscriptDocument | null = null
                try {
                    const safeArchivePath = ensurePathWithinRoot(archiveRoot, transcript.archivePath)
                    document = await this.readTranscriptDocument(path.join(safeArchivePath, "document.json"))
                } catch {
                    document = null
                }

                if (!document?.ticket?.metadata) {
                    warnings.push(`Transcript ${transcript.id} is missing analytics-safe ticket metadata and was skipped.`)
                    continue
                }

                const record = this.mapTicketAnalyticsHistoryRecord(transcript, document)
                if (!record) {
                    warnings.push(`Transcript ${transcript.id} has invalid analytics metadata and was skipped.`)
                    continue
                }
                if (openedFrom != null && (record.openedAt == null || record.openedAt < openedFrom)) continue
                if (openedTo != null && (record.openedAt == null || record.openedAt >= openedTo)) continue
                if (teamId && record.assignedTeamId !== teamId) continue
                if (assigneeId && record.assignedStaffUserId !== assigneeId) continue
                if (transportMode && record.transportMode !== transportMode) continue

                matchingRecords.push(record)
            }

            candidateOffset += result.items.length
            scannedCandidates += result.items.length
            if (result.items.length == 0 || candidateOffset >= result.total) {
                break
            }
            if (scannedCandidates >= ANALYTICS_CANDIDATE_SCAN_LIMIT) {
                truncated = true
                warnings.push(ANALYTICS_CANDIDATE_SCAN_LIMIT_WARNING)
                break
            }
        }

        matchingRecords.sort((left, right) => (right.openedAt ?? 0) - (left.openedAt ?? 0) || right.transcriptId.localeCompare(left.transcriptId))
        if (truncated) {
            return {
                total: matchingRecords.length,
                items: [],
                warnings,
                nextCursor: null,
                truncated: true
            }
        }

        const items = matchingRecords.slice(offset, offset + limit)
        const nextOffset = offset + items.length
        return {
            total: matchingRecords.length,
            items,
            warnings,
            nextCursor: nextOffset < matchingRecords.length ? String(nextOffset) : null,
            truncated: false
        }
    }

    async listOperationalTranscripts(query: TranscriptOperationalListQuery): Promise<TranscriptOperationalListResult> {
        if (!this.repository) {
            return createEmptyTranscriptOperationalListResult()
        }
        await this.normalizeExpiredLinks("list")

        const normalized = this.normalizeOperationalListQuery(query)
        if (normalized.reversedDateRange) {
            return createEmptyTranscriptOperationalListResult()
        }

        const retention = this.getRetentionConfig()
        const windows = this.getRetentionWindows(retention)
        const asOf = new Date().toISOString()
        const candidates = await this.repository.listTranscriptCandidates({
            search: normalized.search,
            status: normalized.status,
            creatorId: normalized.creatorId,
            channelId: normalized.channelId,
            createdFrom: normalized.createdFrom,
            createdTo: normalized.createdTo,
            sort: normalized.sort
        })

        const annotated: TranscriptOperationalRecord[] = []
        for (const candidate of candidates) {
            const transcript = this.hydrateTranscript(candidate)!
            const integrity = await this.scanTranscriptIntegrityRecord(transcript, asOf)
            annotated.push({
                ...transcript,
                integrityHealth: integrity.health,
                repairable: integrity.repairableActions.length > 0,
                retentionCandidate: this.isRetentionCandidate(transcript, retention.enabled, windows, asOf),
                canBulkRevoke: Boolean(transcript.activeSlug),
                canBulkDelete: transcript.status == "revoked" || transcript.status == "deleted" || transcript.status == "failed",
                canExport: transcript.status != "building"
            })
        }

        const filtered = annotated.filter((item) => this.matchesOperationalFilters(item, normalized.integrity, normalized.retention))
        const matchingSummary = this.buildOperationalMatchingSummary(filtered)
        return {
            total: filtered.length,
            matchingSummary,
            items: filtered.slice(normalized.offset, normalized.offset + normalized.limit)
        }
    }

    async getAccessPolicy(): Promise<TranscriptAccessPolicy> {
        const mode = this.getAccessMode()
        if (mode == "public") {
            return {
                mode,
                viewerReady: true,
                message: "Public transcript links are enabled."
            }
        }

        const status = this.resolvePrivateViewerUrlBuilderStatus()
        return {
            mode,
            viewerReady: status.ready,
            message: status.message
        }
    }

    async listTranscriptStylePresets(): Promise<TranscriptStylePreset[]> {
        return BUILT_IN_TRANSCRIPT_STYLE_PRESETS.map((preset) => this.cloneTranscriptStylePreset(preset))
    }

    async renderTranscriptStylePreview(styleDraft: TranscriptHtmlStyleDraft): Promise<TranscriptStylePreviewResult> {
        if (!this.isHealthy()) {
            return this.createUnavailableTranscriptStylePreviewResult(PREVIEW_UNAVAILABLE_MESSAGE)
        }

        try {
            const document = buildTranscriptPreviewDocument(styleDraft)
            return {
                status: "ok",
                message: "",
                html: renderTranscriptHtml(document, { previewMode: true }),
                contentSecurityPolicy: buildTranscriptPreviewHtmlCsp()
            }
        } catch (error) {
            return this.createUnavailableTranscriptStylePreviewResult(
                error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : PREVIEW_UNAVAILABLE_MESSAGE
            )
        }
    }

    async listTranscriptEvents(target: string, query: ListTranscriptEventsQuery): Promise<ListTranscriptEventsResult> {
        if (!this.repository) return { total: 0, items: [] }
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return { total: 0, items: [] }

        return await this.repository.listTranscriptEvents(transcript.id, query)
    }

    async previewRetentionSweep(): Promise<TranscriptRetentionPreview> {
        const { retention, windows, candidates } = await this.resolveRetentionCandidates()

        return {
            enabled: retention.enabled,
            runOnStartup: retention.runOnStartup,
            maxTranscriptsPerRun: retention.maxTranscriptsPerRun,
            windows,
            totalCandidates: candidates.length,
            candidates
        }
    }

    async executeRetentionSweep(trigger: TranscriptRetentionTrigger = "manual"): Promise<TranscriptRetentionExecutionResult> {
        const { retention, candidates } = await this.resolveRetentionCandidates()
        const result: TranscriptRetentionExecutionResult = {
            enabled: retention.enabled,
            trigger,
            attempted: candidates.length,
            swept: 0,
            failed: 0,
            freedBytes: 0,
            candidates,
            failures: []
        }

        if (!retention.enabled || !this.repository || !this.config) {
            return result
        }

        const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
        for (const candidate of candidates) {
            try {
                const safeArchivePath = ensurePathWithinRoot(archiveRoot, candidate.archivePath!)
                const archivePresent = fs.existsSync(safeArchivePath)
                if (archivePresent) {
                    await fs.promises.rm(safeArchivePath, { recursive: true, force: true })
                }

                const freedBytes = archivePresent ? candidate.totalBytes : 0
                await this.repository.clearTranscriptArchiveData(candidate.transcriptId)
                await this.recordTranscriptEvent({
                    transcriptId: candidate.transcriptId,
                    type: "archive-swept",
                    details: {
                        priorStatus: candidate.status,
                        priorArchivePath: candidate.archivePath,
                        configuredDays: candidate.configuredDays,
                        trigger,
                        freedBytes
                    }
                })

                result.swept += 1
                result.freedBytes += freedBytes
            } catch (error) {
                result.failed += 1
                result.failures.push({
                    transcriptId: candidate.transcriptId,
                    archivePath: candidate.archivePath,
                    message: error instanceof Error ? error.message : String(error)
                })
            }
        }

        return result
    }

    async getIntegritySummary(): Promise<TranscriptIntegritySummary> {
        const scannedAt = new Date().toISOString()
        const summary = this.createEmptyIntegritySummary(scannedAt)
        if (!this.repository) {
            return summary
        }
        await this.normalizeExpiredLinks("list")

        const transcripts = await this.repository.listAllTranscripts()
        summary.total = transcripts.length

        for (const transcript of transcripts) {
            const report = await this.scanTranscriptIntegrityRecord(this.hydrateTranscript(transcript)!, scannedAt)
            summary[report.health] += 1
            if (report.repairableActions.length > 0) {
                summary.repairable += 1
            }

            for (const issue of report.issues) {
                summary.issueCounts[issue.code] += 1
            }
        }

        return summary
    }

    async scanTranscriptIntegrity(target: string): Promise<TranscriptIntegrityReport | null> {
        if (!this.repository) return null
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return null

        return await this.scanTranscriptIntegrityRecord(this.hydrateTranscript(transcript)!)
    }

    async repairTranscriptIntegrity(target: string, actions?: TranscriptIntegrityRepairAction[]): Promise<TranscriptIntegrityRepairResult> {
        if (!this.repository || !this.config) {
            return {
                ok: false,
                target,
                transcriptId: null,
                requestedActions: this.normalizeRepairActions(actions),
                appliedActions: [],
                failures: [],
                reportBefore: null,
                reportAfter: null,
                message: "Transcript service is not initialized."
            }
        }
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) {
            return {
                ok: false,
                target,
                transcriptId: null,
                requestedActions: this.normalizeRepairActions(actions),
                appliedActions: [],
                failures: [],
                reportBefore: null,
                reportAfter: null,
                message: "Transcript not found."
            }
        }

        const transcriptId = transcript.id
        const reportBefore = await this.scanTranscriptIntegrityRecord(this.hydrateTranscript(transcript)!)
        const requestedActions = this.normalizeRepairActions(actions, reportBefore.repairableActions)
        const appliedActions: TranscriptIntegrityRepairAction[] = []
        const failures: TranscriptIntegrityRepairFailure[] = []
        let activeLinkRevoked = false
        let currentTranscript = this.hydrateTranscript(transcript)!
        let currentReport = reportBefore

        for (const action of requestedActions) {
            if (!currentReport.repairableActions.includes(action)) {
                failures.push({
                    action,
                    message: "Repair action is not applicable for the current transcript state."
                })
                continue
            }

            try {
                const applied = await this.applyIntegrityRepairAction(currentTranscript, currentReport, action)
                appliedActions.push(action)
                activeLinkRevoked = activeLinkRevoked || applied.activeLinkRevoked

                const refreshed = await this.repository.resolveTranscriptAdminTarget(transcriptId)
                currentTranscript = this.hydrateTranscript(refreshed)!
                currentReport = await this.scanTranscriptIntegrityRecord(currentTranscript)
            } catch (error) {
                failures.push({
                    action,
                    message: error instanceof Error ? error.message : String(error)
                })
            }
        }

        const reportAfter = await this.scanTranscriptIntegrityRecord(currentTranscript)
        const ok = failures.length == 0
        const message = appliedActions.length == 0
            ? (ok ? "No integrity repairs were required." : "Integrity repair did not apply any changes.")
            : (ok ? "Transcript integrity repair completed." : "Transcript integrity repair completed with failures.")

        if (ok) {
            await this.recordTranscriptEvent({
                transcriptId,
                type: "integrity-repaired",
                details: {
                    actions: JSON.stringify(appliedActions),
                    healthBefore: reportBefore.health,
                    healthAfter: reportAfter.health,
                    resultingStatus: reportAfter.transcript.status,
                    activeLinkRevoked
                }
            })
        }

        return {
            ok,
            target,
            transcriptId,
            requestedActions,
            appliedActions,
            failures,
            reportBefore,
            reportAfter,
            message
        }
    }

    async prepareTranscriptExport(target: string, format: TranscriptExportFormat = "zip"): Promise<TranscriptPrepareExportResult> {
        if (!this.repository || !this.config) {
            return {
                ok: false,
                target,
                transcriptId: null,
                message: "Transcript service is not initialized.",
                export: null
            }
        }
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) {
            return {
                ok: false,
                target,
                transcriptId: null,
                message: "Transcript not found.",
                export: null
            }
        }

        if (transcript.status == "building") {
            return {
                ok: false,
                target,
                transcriptId: transcript.id,
                message: "Building transcripts cannot be exported yet.",
                export: null
            }
        }

        const prepared = await this.prepareZipExport(this.hydrateTranscript(transcript)!, format)
        await this.recordTranscriptEvent({
            transcriptId: transcript.id,
            type: "export-prepared",
            details: {
                format: prepared.format,
                archiveIncluded: prepared.archiveIncluded,
                exportId: prepared.exportId
            }
        })

        return {
            ok: true,
            target,
            transcriptId: transcript.id,
            message: "Transcript export prepared.",
            export: prepared
        }
    }

    async releasePreparedTranscriptExport(exportId: string): Promise<boolean> {
        if (!this.config) return false

        const exportRoot = this.getPreparedExportRoot(exportId)
        if (!fs.existsSync(exportRoot)) {
            return false
        }

        await fs.promises.rm(exportRoot, { recursive: true, force: true })
        return true
    }

    async bulkRevokeTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult> {
        if (!this.repository) {
            return createTranscriptBulkActionErrorResult("revoke", "Transcript service is not initialized.")
        }

        const normalized = this.normalizeBulkTranscriptIds(ids)
        if (!normalized.ok) {
            return createTranscriptBulkActionErrorResult("revoke", normalized.message)
        }

        const appliedReason = this.normalizeOptionalReason(reason)
        const items: TranscriptBulkActionItemResult[] = []
        let succeeded = 0
        let skipped = 0
        let failed = 0

        for (const transcriptId of normalized.ids) {
            const transcript = await this.repository.getTranscriptById(transcriptId)
            if (!transcript) {
                failed += 1
                items.push({
                    transcriptId,
                    ok: false,
                    status: "not-found",
                    message: "Transcript not found."
                })
                continue
            }

            if (!transcript.activeSlug) {
                skipped += 1
                items.push({
                    transcriptId,
                    ok: false,
                    status: "skipped",
                    message: "Transcript does not have an active link."
                })
                continue
            }

            const result = await this.revokeTranscript(transcriptId, appliedReason)
            if (result.ok) {
                succeeded += 1
                items.push({
                    transcriptId,
                    ok: true,
                    status: "ok",
                    message: result.message
                })
                continue
            }

            failed += 1
            items.push({
                transcriptId,
                ok: false,
                status: "error",
                message: result.message
            })
        }

        return {
            action: "revoke",
            requested: normalized.ids.length,
            succeeded,
            skipped,
            failed,
            items,
            message: this.buildBulkActionMessage("revoke", succeeded, skipped, failed)
        }
    }

    async bulkDeleteTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult> {
        if (!this.repository) {
            return createTranscriptBulkActionErrorResult("delete", "Transcript service is not initialized.")
        }

        const normalized = this.normalizeBulkTranscriptIds(ids)
        if (!normalized.ok) {
            return createTranscriptBulkActionErrorResult("delete", normalized.message)
        }

        const appliedReason = this.normalizeOptionalReason(reason)
        const items: TranscriptBulkActionItemResult[] = []
        let succeeded = 0
        let skipped = 0
        let failed = 0

        for (const transcriptId of normalized.ids) {
            const transcript = await this.repository.getTranscriptById(transcriptId)
            if (!transcript) {
                failed += 1
                items.push({
                    transcriptId,
                    ok: false,
                    status: "not-found",
                    message: "Transcript not found."
                })
                continue
            }

            if (transcript.status == "active" || transcript.status == "building" || transcript.status == "partial") {
                skipped += 1
                items.push({
                    transcriptId,
                    ok: false,
                    status: "skipped",
                    message: `Transcript status ${transcript.status} cannot be bulk deleted.`
                })
                continue
            }

            const result = await this.deleteTranscript(transcriptId, appliedReason)
            if (result.ok) {
                succeeded += 1
                items.push({
                    transcriptId,
                    ok: true,
                    status: "ok",
                    message: result.message
                })
                continue
            }

            failed += 1
            items.push({
                transcriptId,
                ok: false,
                status: "error",
                message: result.message
            })
        }

        return {
            action: "delete",
            requested: normalized.ids.length,
            succeeded,
            skipped,
            failed,
            items,
            message: this.buildBulkActionMessage("delete", succeeded, skipped, failed)
        }
    }

    async prepareBulkTranscriptExport(ids: string[]): Promise<TranscriptPrepareBulkExportResult> {
        if (!this.repository || !this.config) {
            return createTranscriptPrepareBulkExportErrorResult("Transcript service is not initialized.")
        }

        const normalized = this.normalizeBulkTranscriptIds(ids)
        if (!normalized.ok) {
            return createTranscriptPrepareBulkExportErrorResult(normalized.message)
        }

        const items: TranscriptBulkExportItemResult[] = []
        const preparedChildren: TranscriptPreparedExport[] = []

        for (const transcriptId of normalized.ids) {
            const transcript = await this.repository.getTranscriptById(transcriptId)
            if (!transcript) {
                items.push({
                    transcriptId,
                    ok: false,
                    status: "not-found",
                    message: "Transcript not found.",
                    fileName: null
                })
                continue
            }

            if (transcript.status == "building") {
                items.push({
                    transcriptId,
                    ok: false,
                    status: "skipped",
                    message: "Building transcripts cannot be exported yet.",
                    fileName: null
                })
                continue
            }

            const result = await this.prepareTranscriptExport(transcriptId)
            if (!result.ok || !result.export) {
                items.push({
                    transcriptId,
                    ok: false,
                    status: "error",
                    message: result.message,
                    fileName: null
                })
                continue
            }

            preparedChildren.push(result.export)
            items.push({
                transcriptId,
                ok: true,
                status: "ok",
                message: result.message,
                fileName: result.export.fileName
            })
        }

        if (preparedChildren.length == 0) {
            return {
                ok: false,
                message: "No selected transcripts could be exported.",
                export: null,
                items
            }
        }

        const createdAt = new Date().toISOString()
        const exportId = crypto.randomUUID()
        const exportRoot = this.getPreparedExportRoot(exportId)
        const fileName = `transcripts-bulk-export-${exportId}.zip`
        const filePath = path.join(exportRoot, fileName)
        const skippedCount = items.length - preparedChildren.length
        const manifest = {
            formatVersion: 1,
            createdAt,
            selectedCount: normalized.ids.length,
            exportedCount: preparedChildren.length,
            skippedCount,
            items: items.map((item) => ({
                transcriptId: item.transcriptId,
                status: item.status,
                fileName: item.fileName,
                message: item.message
            }))
        }

        try {
            await fs.promises.rm(exportRoot, { recursive: true, force: true })
            await fs.promises.mkdir(exportRoot, { recursive: true })
            await this.writePreparedBundleZip(filePath, manifest, preparedChildren)
            const byteSize = (await fs.promises.stat(filePath)).size

            const prepared: TranscriptPreparedBulkExport = {
                exportId,
                fileName,
                filePath,
                contentType: "application/zip",
                byteSize,
                exportedCount: preparedChildren.length,
                skippedCount,
                createdAt
            }

            return {
                ok: true,
                message: `Prepared a bundled export for ${preparedChildren.length} transcript(s).`,
                export: prepared,
                items
            }
        } catch (error) {
            await fs.promises.rm(exportRoot, { recursive: true, force: true }).catch(() => {})
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
                export: null,
                items
            }
        } finally {
            for (const child of preparedChildren) {
                await this.releasePreparedTranscriptExport(child.exportId).catch(() => false)
            }
        }
    }

    async listViewerAccessibleTranscripts(
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext,
        query: ListViewerAccessibleTranscriptsQuery = {}
    ): Promise<ListViewerAccessibleTranscriptsResult> {
        if (!this.repository || this.getAccessMode() != "private-discord") {
            return { total: 0, items: [] }
        }

        const normalizedViewerUserId = viewerUserId.trim()
        if (normalizedViewerUserId.length == 0) {
            return { total: 0, items: [] }
        }

        const normalizedAccess = this.normalizeViewerAccessContext(viewerAccess)
        if (!this.canUseViewerAccess(normalizedAccess)) {
            return { total: 0, items: [] }
        }

        await this.normalizeExpiredLinks("list")
        const limit = Math.max(1, Math.min(query.limit ?? 25, 100))
        const offset = Math.max(0, query.offset ?? 0)

        const items: ListViewerAccessibleTranscriptsResult["items"] = []
        const pageSize = 250
        for (let pageOffset = 0;; pageOffset += pageSize) {
            const listed = await this.repository.listTranscripts({
                limit: pageSize,
                offset: pageOffset
            })

            for (const candidate of listed.items) {
                const transcript = this.hydrateTranscript(candidate)
                if (!transcript || !transcript.activeSlug || !transcript.archivePath) {
                    continue
                }

                if (transcript.status != "active" && transcript.status != "partial") {
                    continue
                }

                const link = await this.repository.getActiveLink(transcript.id)
                if (!link) {
                    continue
                }

                const accessDecision = await this.resolveViewerAccessDecision(transcript, normalizedViewerUserId, normalizedAccess, {
                    allowOwnerOverride: false
                })
                if (!accessDecision) {
                    continue
                }

                items.push({
                    ...transcript,
                    accessPath: accessDecision.accessPath
                })
            }

            if (listed.items.length < pageSize || pageOffset + listed.items.length >= listed.total) {
                break
            }
        }

        return {
            total: items.length,
            items: items.slice(offset, offset + limit)
        }
    }

    async renderViewerTranscript(
        slug: string,
        viewerUserId: string,
        assetBasePath: string,
        viewerAccess: TranscriptViewerAccessContext
    ): Promise<TranscriptViewerDocumentResult> {
        const context = await this.resolveViewerTranscriptContext(slug, viewerUserId, viewerAccess)
        if (context.status != "ok") {
            return {
                status: context.status,
                message: context.message,
                html: null,
                contentSecurityPolicy: null,
                accessPath: null
            }
        }

        const htmlPath = ensurePathWithinRoot(context.transcript.archivePath!, path.join(context.transcript.archivePath!, "index.html"))
        if (!fs.existsSync(htmlPath)) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE,
                html: null,
                contentSecurityPolicy: null,
                accessPath: null
            }
        }

        const html = await fs.promises.readFile(htmlPath, "utf8")
        await this.recordTranscriptEvent({
            transcriptId: context.transcript.id,
            type: "viewer-accessed",
            reason: null,
            details: {
                viewerUserId: context.viewerUserId,
                viewerRole: context.viewerRole,
                accessPath: context.accessPath,
                slug: context.link.slug,
                linkId: context.link.id
            }
        }).catch(() => {})

        return {
            status: "ok",
            message: "",
            html: html.replaceAll(ASSET_BASE_PLACEHOLDER, assetBasePath),
            contentSecurityPolicy: buildTranscriptHtmlCsp(),
            accessPath: context.accessPath
        }
    }

    async resolveViewerTranscriptAsset(
        slug: string,
        assetName: string,
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext
    ): Promise<TranscriptViewerAssetResult> {
        if (!this.repository) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE,
                filePath: null,
                contentType: null,
                cacheControl: null,
                accessPath: null
            }
        }

        const context = await this.resolveViewerTranscriptContext(slug, viewerUserId, viewerAccess)
        if (context.status != "ok") {
            return {
                status: context.status,
                message: context.message,
                filePath: null,
                contentType: null,
                cacheControl: null,
                accessPath: null
            }
        }

        const asset = await this.repository.getTranscriptAsset(context.transcript.id, assetName)
        if (!asset || asset.status != "mirrored" || !asset.local_path) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE,
                filePath: null,
                contentType: null,
                cacheControl: null,
                accessPath: null
            }
        }

        const assetPath = ensurePathWithinRoot(context.transcript.archivePath!, path.join(context.transcript.archivePath!, asset.local_path))
        if (!fs.existsSync(assetPath)) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE,
                filePath: null,
                contentType: null,
                cacheControl: null,
                accessPath: null
            }
        }

        return {
            status: "ok",
            message: "",
            filePath: assetPath,
            contentType: asset.mime_type,
            cacheControl: "public, max-age=31536000, immutable",
            accessPath: context.accessPath
        }
    }

    async getTranscriptDetail(target: string): Promise<TranscriptDetail | null> {
        if (!this.repository) return null
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return null

        const [links, participants, assets] = await Promise.all([
            this.repository.listTranscriptLinks(transcript.id),
            this.repository.listTranscriptParticipants(transcript.id),
            this.repository.listTranscriptAssets(transcript.id)
        ])

        return {
            transcript: this.hydrateTranscript(transcript)!,
            links: links.map((link) => this.hydrateTranscriptLink(link)),
            participants,
            assets
        }
    }

    async createTranscript(input: CreateTranscriptInput = {}, activeSlug?: string): Promise<TranscriptRecord | null> {
        if (!this.repository) throw new Error("Transcript service is not initialized.")

        const transcriptId = await this.repository.createTranscript(input)
        if (activeSlug) {
            await this.repository.createTranscriptLink({
                transcriptId,
                slug: activeSlug,
                status: "active"
            })
        }

        return this.hydrateTranscript(await this.repository.getTranscriptById(transcriptId))
    }

    async compileHtmlTranscript(
        ticket: TicketLike,
        channel: ChannelLike,
        user: UserLike
    ): Promise<HtmlTranscriptCompileResult> {
        if (!this.repository || !this.config) {
            return {
                ticket,
                channel,
                user,
                success: false,
                errorReason: "The local HTML transcript service is not initialized.",
                messages: null,
                data: null
            }
        }

        return await this.queue.run(async () => {
            const transcriptId = crypto.randomUUID()
            const tempArchivePath = getTranscriptTempPath(this.config!, transcriptId)
            const finalArchivePath = getTranscriptArchivePath(this.config!, transcriptId)

            let messages: any[] | null = null
            let renamedToFinal = false
            let issuedLink: { slug: string; url: string; availableUntil: Date } | null = null

            try {
                if (this.getAccessMode() == "private-discord") {
                    this.requireCanonicalTranscriptUrl("compile-readiness-probe")
                }

                await this.repository!.createTranscript({
                    id: transcriptId,
                    status: "building",
                    ticketId: ticket.id.value,
                    channelId: channel.id,
                    guildId: channel.guild.id,
                    creatorId: (ticket.get("opendiscord:opened-by").value as string | null) ?? null,
                    deleterId: user.id
                })
                issuedLink = await this.issueTranscriptLink(transcriptId)
                await this.recordTranscriptEvent({
                    transcriptId,
                    type: "build-started",
                    details: {
                        ticketId: ticket.id.value,
                        channelId: channel.id,
                        guildId: channel.guild.id
                    }
                })

                await fs.promises.rm(tempArchivePath, { recursive: true, force: true })
                await fs.promises.mkdir(tempArchivePath, { recursive: true })

                messages = await this.dependencies.collectMessages(ticket, channel)
                const participants = await this.dependencies.getParticipants(ticket)
                if (!participants) {
                    throw new Error("Unable to fetch ticket participants.")
                }

                const document = await this.dependencies.buildDocument(
                    transcriptId,
                    ticket,
                    channel,
                    user,
                    messages,
                    participants
                )
                const assetResult = await this.dependencies.mirrorAssets(document, tempArchivePath, this.config!)

                document.warnings.push(...assetResult.warnings)
                this.dependencies.markDocumentStatus(document, document.warnings.length > 0 ? "partial" : "active")

                const archiveWrite = await this.dependencies.writeArchive(tempArchivePath, document)
                const totalBytes = assetResult.totalBytes + archiveWrite.totalBytes
                await fs.promises.rename(tempArchivePath, finalArchivePath)
                renamedToFinal = true

                await this.repository!.replaceParticipants(
                    transcriptId,
                    participants.map((participant) => ({
                        userId: participant.user.id,
                        displayName: participant.user.displayName,
                        role: participant.role
                    }))
                )
                await this.repository!.replaceAssets(
                    transcriptId,
                    assetResult.assetRecords.map((asset) => ({
                        assetName: asset.assetName,
                        sourceUrl: asset.sourceUrl,
                        localPath: asset.localPath,
                        mimeType: asset.mimeType,
                        byteSize: asset.byteSize,
                        status: asset.status,
                        reason: asset.reason ?? null
                    }))
                )
                await this.repository!.finalizeTranscriptBuild(transcriptId, {
                    status: document.status,
                    archivePath: finalArchivePath,
                    messageCount: messages.length,
                    attachmentCount: document.totals.attachments,
                    warningCount: document.warningCount,
                    totalBytes,
                    searchText: document.searchText,
                    statusReason: this.getBuildStatusReason(document.status, document.warningCount)
                })
                await this.recordTranscriptEvent({
                    transcriptId,
                    type: document.status == "partial" ? "build-partial" : "build-succeeded",
                    details: {
                        messageCount: messages.length,
                        attachmentCount: document.totals.attachments,
                        warningCount: document.warningCount,
                        totalBytes
                    }
                })

                return {
                    ticket,
                    channel,
                    user,
                    success: true,
                    errorReason: null,
                    messages,
                    data: {
                        url: issuedLink.url,
                        availableUntil: issuedLink.availableUntil
                    }
                }
            } catch (error) {
                const failureReason = error instanceof Error ? error.message : String(error)
                await this.handleBuildFailure(transcriptId, tempArchivePath, renamedToFinal ? finalArchivePath : null, failureReason)
                const diagnosticPath = path.join(path.dirname(this.config!.storage.archiveRoot), "build-failures.log")
                await fs.promises.mkdir(path.dirname(diagnosticPath), { recursive: true }).catch(() => {})
                await fs.promises.appendFile(
                    diagnosticPath,
                    JSON.stringify({
                        at: new Date().toISOString(),
                        ticket: ticket.id.value,
                        channel: channel.id,
                        reason: failureReason
                    }) + "\n",
                    "utf8"
                ).catch(() => {})

                return {
                    ticket,
                    channel,
                    user,
                    success: false,
                    errorReason: "Unable to generate the local HTML transcript. " + failureReason,
                    messages: null,
                    data: null
                }
            }
        })
    }

    async revokeTranscript(target: string, reason?: string): Promise<ActionResult> {
        if (!this.repository) return createErrorActionResult("revoke", target, "Transcript service is not initialized.", reason)
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return createErrorActionResult("revoke", target, "Transcript not found.", reason)

        const activeLink = await this.repository.getActiveLink(transcript.id)
        if (!activeLink) return createErrorActionResult("revoke", target, "Transcript does not have an active link.", reason)

        await this.repository.setActiveLinkStatus(transcript.id, "revoked", reason)
        await this.repository.updateTranscriptStatus(transcript.id, "revoked", reason?.trim() || "Transcript link revoked by an admin action.")
        await this.recordTranscriptEvent({
            transcriptId: transcript.id,
            type: "link-revoked",
            reason: reason?.trim() || null
        })
        this.logAdminAction("revoke", transcript.id, reason)

        return createOkActionResult("revoke", transcript.id, "Transcript link revoked.", reason)
    }

    async reissueTranscript(target: string, reason?: string): Promise<ActionResult> {
        if (!this.repository || !this.config) return createErrorActionResult("reissue", target, "Transcript service is not initialized.", reason)
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return createErrorActionResult("reissue", target, "Transcript not found.", reason)
        if (transcript.status == "deleted") return createErrorActionResult("reissue", target, "Deleted transcripts cannot be reissued.", reason)
        if (transcript.status == "building") return createErrorActionResult("reissue", target, "Building transcripts cannot be reissued yet.", reason)
        if (!transcript.archivePath || !fs.existsSync(transcript.archivePath)) {
            return createErrorActionResult("reissue", target, "Transcript archive path does not exist.", reason)
        }
        if (this.getAccessMode() == "private-discord") {
            try {
                this.requireCanonicalTranscriptUrl("reissue-readiness-probe")
            } catch (error) {
                return createErrorActionResult("reissue", target, error instanceof Error ? error.message : String(error), reason)
            }
        }

        const activeLink = await this.repository.getActiveLink(transcript.id)
        if (activeLink) {
            await this.repository.setActiveLinkStatus(transcript.id, "superseded", reason)
        }

        const issuedLink = await this.issueTranscriptLink(transcript.id)

        const restoredStatus = this.getRestoredTranscriptStatus(transcript)
        await this.repository.updateTranscriptStatus(transcript.id, restoredStatus, this.getRestoredStatusReason(transcript, restoredStatus))
        await this.recordTranscriptEvent({
            transcriptId: transcript.id,
            type: "link-reissued",
            reason: reason?.trim() || null,
            details: {
                newSlug: issuedLink.slug
            }
        })
        this.logAdminAction("reissue", transcript.id, reason)

        return createOkActionResult("reissue", transcript.id, "Transcript link reissued.", reason)
    }

    async deleteTranscript(target: string, reason?: string): Promise<ActionResult> {
        if (!this.repository || !this.config) return createErrorActionResult("delete", target, "Transcript service is not initialized.", reason)
        await this.normalizeExpiredLinks("resolve")

        const transcript = await this.repository.resolveTranscriptAdminTarget(target)
        if (!transcript) return createErrorActionResult("delete", target, "Transcript not found.", reason)

        if (transcript.archivePath) {
            const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
            const safeArchivePath = ensurePathWithinRoot(archiveRoot, transcript.archivePath)
            await fs.promises.rm(safeArchivePath, { recursive: true, force: true })
        }

        await this.repository.setAllLinkStatuses(transcript.id, "deleted", reason)
        await this.repository.updateTranscriptStatus(transcript.id, "deleted", reason?.trim() || "Transcript deleted by an admin action.")
        await this.repository.updateTranscriptArchivePath(transcript.id, null)
        await this.recordTranscriptEvent({
            transcriptId: transcript.id,
            type: "transcript-deleted",
            reason: reason?.trim() || null
        })
        this.logAdminAction("delete", transcript.id, reason)

        return createOkActionResult("delete", transcript.id, "Transcript deleted.", reason)
    }

    buildPublicTranscriptUrl(slug: string): string {
        return this.requireCanonicalTranscriptUrl(slug)
    }

    async normalizeExpiredLinks(trigger: TranscriptLinkExpiryTrigger, options: { transcriptId?: string; slug?: string } = {}) {
        if (!this.repository) return 0

        const expiredAt = new Date().toISOString()
        const elapsedLinks = await this.repository.listElapsedActiveTranscriptLinks({
            referenceTime: expiredAt,
            transcriptId: options.transcriptId,
            slug: options.slug
        })

        let expiredCount = 0
        for (const link of elapsedLinks) {
            if (!link.expiresAt) {
                continue
            }

            const changed = await this.repository.markTranscriptLinkExpired(link.id, expiredAt, LINK_EXPIRED_REASON)
            if (!changed) {
                continue
            }

            expiredCount += 1
            await this.recordTranscriptEvent({
                transcriptId: link.transcriptId,
                type: "link-expired",
                reason: LINK_EXPIRED_REASON,
                details: {
                    linkId: link.id,
                    slug: link.slug,
                    expiresAt: link.expiresAt,
                    expiredAt,
                    trigger
                }
            })
        }

        return expiredCount
    }

    private async generateUniqueSlug(): Promise<string> {
        if (!this.repository || !this.config) throw new Error("Transcript service is not initialized.")

        for (let attempt = 0; attempt < 10; attempt++) {
            const slug = crypto.randomBytes(this.config.links.slugBytes).toString("base64url")
            const existing = await this.repository.getTranscriptLinkBySlug(slug)
            if (!existing) return slug
        }

        throw new Error("Unable to generate a unique transcript slug.")
    }

    private async issueTranscriptLink(transcriptId: string) {
        if (!this.repository || !this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        const issuedAt = new Date()
        const slug = await this.generateUniqueSlug()
        const url = this.requireCanonicalTranscriptUrl(slug)
        const expiresAt = this.getIssuedLinkExpiresAt(issuedAt)

        await this.repository.createTranscriptLink({
            transcriptId,
            slug,
            status: "active",
            createdAt: issuedAt.toISOString(),
            expiresAt: expiresAt?.toISOString() ?? null
        })

        return {
            slug,
            url,
            availableUntil: expiresAt ? new Date(expiresAt.getTime()) : new Date(FAR_FUTURE_AVAILABILITY.getTime())
        }
    }

    private async handleBuildFailure(transcriptId: string, tempArchivePath: string, finalArchivePath: string | null, reason: string) {
        if (!this.repository) return

        await fs.promises.rm(tempArchivePath, { recursive: true, force: true }).catch(() => {})
        if (finalArchivePath) {
            await fs.promises.rm(finalArchivePath, { recursive: true, force: true }).catch(() => {})
        }

        await this.repository.markTranscriptFailed(transcriptId, reason).catch(() => {})
        await this.repository.setAllLinkStatuses(transcriptId, "revoked", "build failed: " + reason).catch(() => {})
        await this.recordTranscriptEvent({
            transcriptId,
            type: "build-failed",
            reason
        }).catch(() => {})
    }

    private getRestoredTranscriptStatus(transcript: TranscriptRecord): TranscriptStatus {
        if (transcript.warningCount > 0) return "partial"
        return "active"
    }

    private getRestoredStatusReason(transcript: TranscriptRecord, status: TranscriptStatus) {
        if (status == "partial") {
            return this.getBuildStatusReason(status, transcript.warningCount)
        }

        return null
    }

    private getBuildStatusReason(status: TranscriptStatus, warningCount: number) {
        if (status != "partial" || warningCount <= 0) return null
        return `${warningCount} archive warning(s) were recorded during build.`
    }

    private logAdminAction(action: "revoke" | "reissue" | "delete", transcriptId: string, reason?: string) {
        console.info("[ot-html-transcripts] Transcript admin action executed.", {
            action,
            transcriptId,
            reason: reason ?? "/"
        })
    }

    private async recordTranscriptEvent(input: CreateTranscriptEventInput) {
        if (!this.repository) return
        await this.repository.createTranscriptEvent(input)
    }

    private getIssuedLinkExpiresAt(issuedAt: Date) {
        const expiry = this.config?.links.expiry ?? DEFAULT_LINK_EXPIRY_CONFIG
        if (!expiry.enabled) {
            return null
        }

        return new Date(issuedAt.getTime() + (expiry.ttlDays * 86400000))
    }

    private async resolveRetentionCandidates() {
        const retention = this.getRetentionConfig()
        const windows = this.getRetentionWindows(retention)

        if (!retention.enabled || !this.repository) {
            return {
                retention,
                windows,
                candidates: []
            }
        }

        const asOf = new Date().toISOString()
        const candidates = await this.repository.listRetentionCandidates({
            asOf,
            maxResults: retention.maxTranscriptsPerRun,
            failedDays: windows.failedDays,
            revokedDays: windows.revokedDays,
            deletedDays: windows.deletedDays
        })

        return {
            retention,
            windows,
            candidates
        }
    }

    private getRetentionConfig() {
        return this.config?.retention ?? DEFAULT_RETENTION_CONFIG
    }

    private getRetentionWindows(retention: OTHtmlTranscriptsConfigData["retention"] | typeof DEFAULT_RETENTION_CONFIG): TranscriptRetentionWindows {
        return {
            failedDays: retention.statuses.failedDays,
            revokedDays: retention.statuses.revokedDays,
            deletedDays: retention.statuses.deletedDays
        }
    }

    private createEmptyIntegritySummary(scannedAt: string): TranscriptIntegritySummary {
        return {
            scannedAt,
            total: 0,
            healthy: 0,
            warning: 0,
            error: 0,
            repairable: 0,
            skipped: 0,
            issueCounts: this.createEmptyIntegrityIssueCounts()
        }
    }

    private createEmptyIntegrityIssueCounts(): Record<TranscriptIntegrityIssueCode, number> {
        return {
            "build-in-progress": 0,
            "unsafe-archive-path": 0,
            "archive-directory-missing": 0,
            "document-missing": 0,
            "document-invalid": 0,
            "document-transcript-mismatch": 0,
            "html-missing": 0,
            "asset-file-missing": 0,
            "asset-row-missing": 0,
            "orphan-asset-row": 0
        }
    }

    private async scanTranscriptIntegrityRecord(transcript: TranscriptRecord, scannedAt = new Date().toISOString()): Promise<TranscriptIntegrityReport> {
        if (!this.repository || !this.config) {
            return {
                transcript,
                scannedAt,
                health: "healthy",
                issues: [],
                repairableActions: [],
                archivePathSafe: true,
                archivePresent: false,
                documentPresent: false,
                htmlPresent: false
            }
        }

        const issues: TranscriptIntegrityIssue[] = []
        let archivePathSafe = true
        let archivePresent = false
        let documentPresent = false
        let htmlPresent = false

        if (transcript.status == "building") {
            issues.push(this.createIntegrityIssue(
                "build-in-progress",
                "warning",
                "Transcript build is still in progress.",
                []
            ))

            return this.buildIntegrityReport(
                transcript,
                scannedAt,
                issues,
                archivePathSafe,
                archivePresent,
                documentPresent,
                htmlPresent
            )
        }

        if (!transcript.archivePath) {
            if (this.isMetadataOnlyHealthy(transcript.status)) {
                return this.buildIntegrityReport(
                    transcript,
                    scannedAt,
                    issues,
                    archivePathSafe,
                    archivePresent,
                    documentPresent,
                    htmlPresent
                )
            }

            issues.push(this.createIntegrityIssue(
                "archive-directory-missing",
                "error",
                "Transcript archive metadata is missing for this transcript.",
                this.getMissingArchiveRepairActions(transcript.status)
            ))

            return this.buildIntegrityReport(
                transcript,
                scannedAt,
                issues,
                archivePathSafe,
                archivePresent,
                documentPresent,
                htmlPresent
            )
        }

        const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
        let safeArchivePath: string
        try {
            safeArchivePath = ensurePathWithinRoot(archiveRoot, transcript.archivePath)
        } catch {
            archivePathSafe = false
            issues.push(this.createIntegrityIssue(
                "unsafe-archive-path",
                "error",
                "Transcript archive path escapes the configured archive root.",
                this.getMissingArchiveRepairActions(transcript.status)
            ))

            return this.buildIntegrityReport(
                transcript,
                scannedAt,
                issues,
                archivePathSafe,
                archivePresent,
                documentPresent,
                htmlPresent
            )
        }

        let archiveStats: fs.Stats | null = null
        try {
            archiveStats = await fs.promises.stat(safeArchivePath)
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException
            if (nodeError.code != "ENOENT") {
                throw error
            }
        }

        if (!archiveStats || !archiveStats.isDirectory()) {
            issues.push(this.createIntegrityIssue(
                "archive-directory-missing",
                "error",
                "Transcript archive directory is missing.",
                this.getMissingArchiveRepairActions(transcript.status)
            ))

            return this.buildIntegrityReport(
                transcript,
                scannedAt,
                issues,
                archivePathSafe,
                archivePresent,
                documentPresent,
                htmlPresent
            )
        }

        archivePresent = true
        const documentPath = path.join(safeArchivePath, "document.json")
        const htmlPath = path.join(safeArchivePath, "index.html")
        documentPresent = fs.existsSync(documentPath)
        htmlPresent = fs.existsSync(htmlPath)

        let document: LocalTranscriptDocument | null = null
        let documentUsable = false

        if (!documentPresent) {
            issues.push(this.createIntegrityIssue(
                "document-missing",
                "error",
                "Transcript archive is missing document.json.",
                this.getMissingArchiveRepairActions(transcript.status)
            ))
        } else {
            document = await this.readTranscriptDocument(documentPath)
            if (!document) {
                issues.push(this.createIntegrityIssue(
                    "document-invalid",
                    "error",
                    "Transcript document.json could not be parsed into the current document structure.",
                    this.getMissingArchiveRepairActions(transcript.status)
                ))
            } else if (document.transcriptId != transcript.id) {
                issues.push(this.createIntegrityIssue(
                    "document-transcript-mismatch",
                    "error",
                    "Transcript document.json belongs to a different transcript id.",
                    this.getMissingArchiveRepairActions(transcript.status)
                ))
            } else {
                documentUsable = true
            }
        }

        if (!htmlPresent) {
            issues.push(this.createIntegrityIssue(
                "html-missing",
                "error",
                "Transcript archive is missing index.html.",
                documentUsable ? ["rerender-index-html"] : []
            ))
        }

        if (documentUsable && document) {
            const assets = await this.repository.listTranscriptAssets(transcript.id)
            const mirroredRefs = this.collectMirroredDocumentAssets(document)
            const referencedAssetNames = new Set<string>()
            const missingAssetFiles = new Set<string>()
            const missingAssetRows = new Set<string>()
            const assetRowsByName = new Map(assets.map((asset) => [asset.assetName, asset]))

            for (const ref of mirroredRefs) {
                const assetName = ref.asset.assetName
                if (!assetName) continue

                referencedAssetNames.add(assetName)
                const row = assetRowsByName.get(assetName)
                if (!row || row.status != "mirrored" || !row.archiveRelativePath) {
                    missingAssetRows.add(assetName)
                    continue
                }

                const assetPath = path.join(safeArchivePath, row.archiveRelativePath)
                if (!fs.existsSync(assetPath)) {
                    missingAssetFiles.add(assetName)
                }
            }

            for (const row of assets) {
                if (row.status != "mirrored") continue

                if (!referencedAssetNames.has(row.assetName)) {
                    issues.push(this.createIntegrityIssue(
                        "orphan-asset-row",
                        "warning",
                        `Mirrored asset row ${row.assetName} is no longer referenced by the transcript document.`,
                        ["downgrade-missing-assets"]
                    ))
                }

                if (!row.archiveRelativePath) {
                    missingAssetFiles.add(row.assetName)
                    continue
                }

                const assetPath = path.join(safeArchivePath, row.archiveRelativePath)
                if (!fs.existsSync(assetPath)) {
                    missingAssetFiles.add(row.assetName)
                }
            }

            for (const assetName of missingAssetRows) {
                issues.push(this.createIntegrityIssue(
                    "asset-row-missing",
                    "warning",
                    `Mirrored transcript asset ${assetName} has no matching asset row.`,
                    ["downgrade-missing-assets"]
                ))
            }

            for (const assetName of missingAssetFiles) {
                issues.push(this.createIntegrityIssue(
                    "asset-file-missing",
                    "warning",
                    `Mirrored transcript asset ${assetName} is missing from the archive directory.`,
                    ["downgrade-missing-assets"]
                ))
            }
        }

        return this.buildIntegrityReport(
            transcript,
            scannedAt,
            issues,
            archivePathSafe,
            archivePresent,
            documentPresent,
            htmlPresent
        )
    }

    private buildIntegrityReport(
        transcript: TranscriptRecord,
        scannedAt: string,
        issues: TranscriptIntegrityIssue[],
        archivePathSafe: boolean,
        archivePresent: boolean,
        documentPresent: boolean,
        htmlPresent: boolean
    ): TranscriptIntegrityReport {
        const repairableActions = DEFAULT_INTEGRITY_REPAIR_ORDER.filter((action) => issues.some((issue) => issue.repairableActions.includes(action)))
        const health = transcript.status == "building"
            ? "skipped"
            : issues.some((issue) => issue.severity == "error")
                ? "error"
                : issues.some((issue) => issue.severity == "warning")
                    ? "warning"
                    : "healthy"

        return {
            transcript,
            scannedAt,
            health,
            issues,
            repairableActions,
            archivePathSafe,
            archivePresent,
            documentPresent,
            htmlPresent
        }
    }

    private createIntegrityIssue(
        code: TranscriptIntegrityIssueCode,
        severity: TranscriptIntegrityIssue["severity"],
        message: string,
        repairableActions: TranscriptIntegrityRepairAction[]
    ): TranscriptIntegrityIssue {
        return {
            code,
            severity,
            message,
            repairableActions: [...new Set(repairableActions)]
        }
    }

    private isMetadataOnlyHealthy(status: TranscriptStatus) {
        return status == "failed" || status == "revoked" || status == "deleted"
    }

    private getMissingArchiveRepairActions(status: TranscriptStatus): TranscriptIntegrityRepairAction[] {
        if (status == "failed" || status == "revoked" || status == "deleted") {
            return ["clear-archive-metadata"]
        }

        if (status == "active" || status == "partial") {
            return ["demote-to-failed"]
        }

        return []
    }

    private mapTicketAnalyticsHistoryRecord(transcript: TranscriptRecord, document: LocalTranscriptDocument): TicketAnalyticsHistoryRecord | null {
        const metadata = document.ticket.metadata
        if (!metadata) return null
        const transportMode = normalizeAnalyticsTransport(metadata.transportMode)

        return {
            ticketId: stringOrNull(document.ticket.id),
            transcriptId: transcript.id,
            creatorId: stringOrNull(document.ticket.createdBy?.id) || transcript.creatorId || null,
            openedAt: numberOrNull(document.ticket.createdOn),
            closedAt: numberOrNull(document.ticket.closedOn),
            resolvedAt: numberOrNull(metadata.resolvedAt),
            firstStaffResponseAt: numberOrNull(metadata.firstStaffResponseAt),
            assignedTeamId: stringOrNull(metadata.assignedTeamId),
            assignedStaffUserId: stringOrNull(metadata.assignedStaffUserId),
            transportMode,
            transcriptStatus: transcript.status
        }
    }

    private async readTranscriptDocument(documentPath: string): Promise<LocalTranscriptDocument | null> {
        try {
            const raw = await fs.promises.readFile(documentPath, "utf8")
            const parsed = JSON.parse(raw)
            return this.isLocalTranscriptDocument(parsed) ? parsed : null
        } catch {
            return null
        }
    }

    private isLocalTranscriptDocument(value: unknown): value is LocalTranscriptDocument {
        if (!value || typeof value != "object" || Array.isArray(value)) return false
        const document = value as Partial<LocalTranscriptDocument>

        return (document.version == "1.0" || document.version == "2.0")
            && typeof document.transcriptId == "string"
            && typeof document.generatedAt == "string"
            && typeof document.searchText == "string"
            && Array.isArray(document.warnings)
            && Array.isArray(document.messages)
            && Array.isArray(document.participants)
            && !!document.totals
            && !!document.style
            && !!document.ticket
            && !!document.bot
            && !!document.guild
    }

    private collectMirroredDocumentAssets(document: LocalTranscriptDocument): TranscriptDocumentAssetRef[] {
        const refs: TranscriptDocumentAssetRef[] = []
        const visit = (value: unknown, location: string) => {
            if (!value || typeof value != "object") return

            if (this.isLocalAssetRef(value)) {
                if (value.status == "mirrored" && value.assetName) {
                    refs.push({
                        asset: value,
                        location
                    })
                }
                return
            }

            if (Array.isArray(value)) {
                value.forEach((item, index) => visit(item, `${location}[${index}]`))
                return
            }

            for (const [key, child] of Object.entries(value)) {
                visit(child, location == "" ? key : `${location}.${key}`)
            }
        }

        visit(document, "document")
        return refs
    }

    private isLocalAssetRef(value: unknown): value is LocalAssetRef {
        if (!value || typeof value != "object" || Array.isArray(value)) return false
        const asset = value as Partial<LocalAssetRef>
        return "status" in asset && "assetName" in asset && "archivePath" in asset && "sourceUrl" in asset
    }

    private normalizeRepairActions(actions?: TranscriptIntegrityRepairAction[], repairableActions?: TranscriptIntegrityRepairAction[]) {
        if (actions && actions.length > 0) {
            return [...new Set(actions)]
        }

        if (!repairableActions) {
            return [...DEFAULT_INTEGRITY_REPAIR_ORDER]
        }

        return DEFAULT_INTEGRITY_REPAIR_ORDER.filter((action) => repairableActions.includes(action))
    }

    private async applyIntegrityRepairAction(
        transcript: TranscriptRecord,
        report: TranscriptIntegrityReport,
        action: TranscriptIntegrityRepairAction
    ) {
        if (!this.repository || !this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        switch (action) {
            case "clear-archive-metadata":
                if (!this.isMetadataOnlyHealthy(transcript.status) || !report.issues.some((issue) => issue.code == "unsafe-archive-path" || issue.code == "archive-directory-missing")) {
                    throw new Error("Clear-archive-metadata is not applicable for this transcript.")
                }

                await this.repository.clearTranscriptArchiveData(transcript.id)
                return { activeLinkRevoked: false }
            case "rerender-index-html": {
                const context = await this.loadRepairableDocumentContext(transcript)
                await fs.promises.writeFile(path.join(context.safeArchivePath, "index.html"), renderTranscriptHtml(context.document), "utf8")
                return { activeLinkRevoked: false }
            }
            case "downgrade-missing-assets": {
                const context = await this.loadRepairableDocumentContext(transcript)
                const assets = await this.repository.listTranscriptAssets(transcript.id)
                const assetRowsByName = new Map(assets.map((asset) => [asset.assetName, asset]))
                const referencedAssetNames = new Set<string>()
                let changed = false

                for (const ref of this.collectMirroredDocumentAssets(context.document)) {
                    const assetName = ref.asset.assetName
                    if (!assetName) continue

                    referencedAssetNames.add(assetName)
                    const row = assetRowsByName.get(assetName)
                    const missingRow = !row || row.status != "mirrored" || !row.archiveRelativePath
                    const missingFile = !missingRow && !fs.existsSync(path.join(context.safeArchivePath, row.archiveRelativePath!))
                    if (missingRow || missingFile) {
                        this.downgradeDocumentAssetRef(ref.asset, "Archived asset is unavailable after integrity repair.")
                        changed = true

                        if (row && row.status == "mirrored") {
                            assetRowsByName.set(assetName, {
                                ...row,
                                archiveRelativePath: null,
                                byteSize: 0,
                                status: "failed",
                                reason: "Archived asset is unavailable after integrity repair."
                            })
                        }
                    }
                }

                for (const row of assets) {
                    if (row.status != "mirrored") continue

                    const missingFile = !row.archiveRelativePath || !fs.existsSync(path.join(context.safeArchivePath, row.archiveRelativePath))
                    if (!referencedAssetNames.has(row.assetName) || missingFile) {
                        assetRowsByName.set(row.assetName, {
                            ...row,
                            archiveRelativePath: null,
                            byteSize: 0,
                            status: "failed",
                            reason: !referencedAssetNames.has(row.assetName)
                                ? "Asset row is no longer referenced by the transcript document."
                                : "Archived asset is unavailable after integrity repair."
                        })
                        changed = true
                    }
                }

                if (!changed) {
                    return { activeLinkRevoked: false }
                }

                const updatedAssets = assets.map((asset) => assetRowsByName.get(asset.assetName) ?? asset)
                await fs.promises.writeFile(path.join(context.safeArchivePath, "document.json"), JSON.stringify(context.document, null, 2), "utf8")
                await fs.promises.writeFile(path.join(context.safeArchivePath, "index.html"), renderTranscriptHtml(context.document), "utf8")
                await this.repository.replaceAssets(
                    transcript.id,
                    updatedAssets.map((asset) => ({
                        assetName: asset.assetName,
                        sourceUrl: asset.sourceUrl,
                        localPath: asset.archiveRelativePath ?? "",
                        mimeType: asset.mimeType,
                        byteSize: asset.byteSize,
                        status: asset.status,
                        reason: asset.reason ?? null
                    }))
                )

                return { activeLinkRevoked: false }
            }
            case "demote-to-failed": {
                if ((transcript.status != "active" && transcript.status != "partial") || report.health != "error") {
                    throw new Error("Demote-to-failed is not applicable for this transcript.")
                }

                const activeLink = await this.repository.getActiveLink(transcript.id)
                const activeLinkRevoked = !!activeLink
                if (activeLink) {
                    await this.repository.setActiveLinkStatus(transcript.id, "revoked", INTEGRITY_DEMOTION_REASON)
                }

                await this.repository.updateTranscriptStatus(transcript.id, "failed", INTEGRITY_DEMOTION_REASON)
                await this.repository.clearTranscriptArchiveData(transcript.id)
                return { activeLinkRevoked }
            }
        }
    }

    private async loadRepairableDocumentContext(transcript: TranscriptRecord) {
        if (!this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        if (!transcript.archivePath) {
            throw new Error("Transcript archive path is missing.")
        }

        const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
        const safeArchivePath = ensurePathWithinRoot(archiveRoot, transcript.archivePath)
        const documentPath = path.join(safeArchivePath, "document.json")
        const document = await this.readTranscriptDocument(documentPath)
        if (!document || document.transcriptId != transcript.id) {
            throw new Error("Transcript document.json is not valid for integrity repair.")
        }

        return {
            safeArchivePath,
            document
        }
    }

    private downgradeDocumentAssetRef(asset: LocalAssetRef, reason: string) {
        asset.status = "failed"
        asset.assetName = null
        asset.archivePath = null
        asset.byteSize = 0
        asset.unavailableReason = reason
    }

    private async listAllTranscriptEvents(transcriptId: string) {
        if (!this.repository) return []

        const events: ListTranscriptEventsResult["items"] = []
        let offset = 0

        while (true) {
            const page = await this.repository.listTranscriptEvents(transcriptId, {
                limit: 100,
                offset
            })

            events.push(...page.items)
            offset += page.items.length
            if (events.length >= page.total || page.items.length == 0) {
                break
            }
        }

        return events
    }

    private matchesOperationalFilters(
        record: TranscriptOperationalRecord,
        integrity?: TranscriptOperationalIntegrityFilter,
        retention?: TranscriptOperationalRetentionFilter
    ) {
        if (integrity) {
            const matchesIntegrity = integrity == "repairable"
                ? record.repairable
                : record.integrityHealth == integrity
            if (!matchesIntegrity) {
                return false
            }
        }

        if (retention == "candidate" && !record.retentionCandidate) {
            return false
        }

        if (retention == "not-candidate" && record.retentionCandidate) {
            return false
        }

        return true
    }

    private buildOperationalMatchingSummary(records: TranscriptOperationalRecord[]): TranscriptOperationalMatchingSummary {
        const summary = createEmptyTranscriptOperationalMatchingSummary()
        summary.total = records.length

        for (const record of records) {
            if (record.status == "active") summary.active += 1
            else if (record.status == "partial") summary.partial += 1
            else if (record.status == "revoked") summary.revoked += 1
            else if (record.status == "deleted") summary.deleted += 1
            else if (record.status == "failed") summary.failed += 1
            else if (record.status == "building") summary.building += 1
        }

        return summary
    }

    private normalizeOperationalListQuery(query: TranscriptOperationalListQuery) {
        const createdFrom = this.normalizeOperationalDateBoundary(query.createdFrom, "start")
        const createdTo = this.normalizeOperationalDateBoundary(query.createdTo, "end")

        return {
            search: this.normalizeOptionalQueryValue(query.search),
            status: query.status,
            integrity: query.integrity,
            retention: query.retention,
            creatorId: this.normalizeOptionalQueryValue(query.creatorId),
            channelId: this.normalizeOptionalQueryValue(query.channelId),
            createdFrom,
            createdTo,
            sort: TRANSCRIPT_OPERATIONAL_SORTS.includes(query.sort as TranscriptOperationalSort)
                ? query.sort as TranscriptOperationalSort
                : "created-desc",
            limit: Math.max(1, Math.min(query.limit ?? 25, 100)),
            offset: Math.max(0, query.offset ?? 0),
            reversedDateRange: !!createdFrom && !!createdTo && createdFrom > createdTo
        }
    }

    private normalizeOptionalQueryValue(value?: string) {
        if (typeof value != "string") {
            return undefined
        }

        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }

    private normalizeOperationalDateBoundary(value: string | undefined, boundary: "start" | "end") {
        if (typeof value != "string") {
            return undefined
        }

        const trimmed = value.trim()
        if (!OPERATIONAL_DATE_PATTERN.test(trimmed)) {
            return undefined
        }

        const isoValue = boundary == "start"
            ? `${trimmed}T00:00:00.000Z`
            : `${trimmed}T23:59:59.999Z`
        const parsed = new Date(isoValue)
        if (!Number.isFinite(parsed.getTime())) {
            return undefined
        }

        return parsed.toISOString()
    }

    private isRetentionCandidate(
        transcript: TranscriptRecord,
        retentionEnabled: boolean,
        windows: TranscriptRetentionWindows,
        asOf: string
    ) {
        if (!retentionEnabled || !transcript.archivePath || !transcript.updatedAt) {
            return false
        }

        const updatedAt = Date.parse(transcript.updatedAt)
        const asOfTime = Date.parse(asOf)
        if (!Number.isFinite(updatedAt) || !Number.isFinite(asOfTime)) {
            return false
        }

        const configuredDays = transcript.status == "failed"
            ? windows.failedDays
            : transcript.status == "revoked"
                ? windows.revokedDays
                : transcript.status == "deleted"
                    ? windows.deletedDays
                    : null

        if (configuredDays === null) {
            return false
        }

        return updatedAt <= asOfTime - (configuredDays * 24 * 60 * 60 * 1000)
    }

    private normalizeBulkTranscriptIds(ids: string[]) {
        const uniqueIds: string[] = []
        const seen = new Set<string>()

        for (const value of ids) {
            if (typeof value != "string") {
                continue
            }

            const transcriptId = value.trim()
            if (transcriptId.length == 0 || seen.has(transcriptId)) {
                continue
            }

            seen.add(transcriptId)
            uniqueIds.push(transcriptId)
        }

        if (uniqueIds.length == 0) {
            return {
                ok: false as const,
                message: "Select at least one transcript."
            }
        }

        if (uniqueIds.length > 100) {
            return {
                ok: false as const,
                message: "Bulk transcript actions are limited to 100 transcript ids per request."
            }
        }

        return {
            ok: true as const,
            ids: uniqueIds
        }
    }

    private normalizeOptionalReason(reason?: string) {
        if (typeof reason != "string") {
            return undefined
        }

        const trimmed = reason.trim()
        return trimmed.length > 0 ? trimmed : undefined
    }

    private buildBulkActionMessage(action: "revoke" | "delete", succeeded: number, skipped: number, failed: number) {
        const actionLabel = action == "revoke" ? "Bulk revoke" : "Bulk delete"
        return `${actionLabel} finished: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed.`
    }

    private async prepareZipExport(transcript: TranscriptRecord, format: TranscriptExportFormat): Promise<TranscriptPreparedExport> {
        if (!this.repository || !this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        const detail = await this.getTranscriptDetail(transcript.id)
        if (!detail) {
            throw new Error("Transcript detail is unavailable.")
        }

        const events = await this.listAllTranscriptEvents(transcript.id)
        const integrityReport = await this.scanTranscriptIntegrityRecord(detail.transcript)
        const exportId = crypto.randomUUID()
        const exportRoot = this.getPreparedExportRoot(exportId)
        const fileName = `transcript-${transcript.id}.${format}`
        const filePath = path.join(exportRoot, fileName)
        const createdAt = new Date().toISOString()

        let safeArchivePath: string | null = null
        let archiveIncluded = false
        if (transcript.archivePath) {
            try {
                const { archiveRoot } = resolveTranscriptStoragePaths(this.config)
                const resolvedArchivePath = ensurePathWithinRoot(archiveRoot, transcript.archivePath)
                const archiveStats = await fs.promises.stat(resolvedArchivePath).catch(() => null)
                if (archiveStats?.isDirectory()) {
                    safeArchivePath = resolvedArchivePath
                    archiveIncluded = true
                }
            } catch {
                safeArchivePath = null
            }
        }

        await fs.promises.rm(exportRoot, { recursive: true, force: true })
        await fs.promises.mkdir(exportRoot, { recursive: true })

        try {
            await this.writePreparedExportZip(filePath, {
                formatVersion: 1,
                exportedAt: createdAt,
                archiveIncluded,
                transcript: detail.transcript,
                links: detail.links,
                participants: detail.participants,
                assets: detail.assets,
                events,
                integrityReport
            }, safeArchivePath)
        } catch (error) {
            await fs.promises.rm(exportRoot, { recursive: true, force: true }).catch(() => {})
            throw error
        }

        const byteSize = (await fs.promises.stat(filePath)).size
        return {
            exportId,
            transcriptId: transcript.id,
            format,
            fileName,
            filePath,
            contentType: "application/zip",
            byteSize,
            archiveIncluded,
            createdAt
        }
    }

    private async writePreparedBundleZip(
        filePath: string,
        manifest: Record<string, unknown>,
        preparedChildren: TranscriptPreparedExport[]
    ) {
        const { ZipFile } = require(path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "vendor", "yazl.js")) as {
            ZipFile: new () => {
                outputStream: NodeJS.ReadableStream
                addBuffer(buffer: Buffer, metadataPath: string): void
                addFile(realPath: string, metadataPath: string): void
                end(): void
            }
        }

        const zip = new ZipFile()
        zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), "manifest.json")

        for (const child of preparedChildren) {
            zip.addFile(child.filePath, path.posix.join("exports", child.fileName.replaceAll("\\", "/")))
        }

        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(filePath)
            zip.outputStream.on("error", reject)
            output.on("error", reject)
            output.on("close", () => resolve())
            zip.outputStream.pipe(output)
            zip.end()
        })
    }

    private async writePreparedExportZip(filePath: string, manifest: Record<string, unknown>, archivePath: string | null) {
        const { ZipFile } = require(path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "vendor", "yazl.js")) as {
            ZipFile: new () => {
                outputStream: NodeJS.ReadableStream
                addBuffer(buffer: Buffer, metadataPath: string): void
                addFile(realPath: string, metadataPath: string): void
                end(): void
            }
        }

        const zip = new ZipFile()
        zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), "manifest.json")

        if (archivePath) {
            const archiveFiles = await this.listArchiveFiles(archivePath)
            for (const file of archiveFiles) {
                const zipPath = path.posix.join("archive", file.relativePath.replaceAll("\\", "/"))
                zip.addFile(file.absolutePath, zipPath)
            }
        }

        await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(filePath)
            zip.outputStream.on("error", reject)
            output.on("error", reject)
            output.on("close", () => resolve())
            zip.outputStream.pipe(output)
            zip.end()
        })
    }

    private async listArchiveFiles(rootPath: string, relativePath = ""): Promise<Array<{ absolutePath: string; relativePath: string }>> {
        const absoluteRoot = relativePath == "" ? rootPath : path.join(rootPath, relativePath)
        const entries = await fs.promises.readdir(absoluteRoot, { withFileTypes: true })
        const files: Array<{ absolutePath: string; relativePath: string }> = []

        for (const entry of entries) {
            const nextRelative = relativePath == "" ? entry.name : path.join(relativePath, entry.name)
            const nextAbsolute = path.join(rootPath, nextRelative)

            if (entry.isDirectory()) {
                files.push(...await this.listArchiveFiles(rootPath, nextRelative))
                continue
            }

            if (entry.isFile()) {
                files.push({
                    absolutePath: nextAbsolute,
                    relativePath: nextRelative
                })
            }
        }

        return files
    }

    private getPreparedExportRoot(exportId: string) {
        if (!this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        const { tempRoot } = resolveTranscriptStoragePaths(this.config)
        return path.join(tempRoot, "exports", exportId)
    }

    private cloneTranscriptStylePreset(preset: TranscriptStylePreset): TranscriptStylePreset {
        return {
            ...preset,
            draft: this.cloneTranscriptHtmlStyleDraft(preset.draft)
        }
    }

    private cloneTranscriptHtmlStyleDraft(styleDraft: TranscriptHtmlStyleDraft): TranscriptHtmlStyleDraft {
        return {
            background: {
                ...styleDraft.background
            },
            header: {
                ...styleDraft.header
            },
            stats: {
                ...styleDraft.stats
            },
            favicon: {
                ...styleDraft.favicon
            }
        }
    }

    private createUnavailableTranscriptStylePreviewResult(message: string): TranscriptStylePreviewResult {
        const safeMessage = this.escapePreviewHtml(message)
        return {
            status: "unavailable",
            message,
            html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Transcript preview unavailable</title><style>body{margin:0;font-family:"Segoe UI","Trebuchet MS",sans-serif;background:#0f1722;color:#eff3f8;padding:24px}main{max-width:720px;margin:0 auto;padding:24px;border-radius:20px;background:#162232;border:1px solid rgba(255,255,255,0.12)}h1{margin:0 0 12px;font-size:24px}p{margin:0;line-height:1.55;color:rgba(239,243,248,0.84)}</style></head><body><main><h1>Preview is unavailable</h1><p>${safeMessage}</p></main></body></html>`,
            contentSecurityPolicy: buildTranscriptPreviewHtmlCsp()
        }
    }

    private escapePreviewHtml(value: string) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;")
    }

    private normalizeBasePath(basePath: string) {
        const trimmed = (basePath || "/").trim()
        if (trimmed == "" || trimmed == "/") return ""

        const leading = trimmed.startsWith("/") ? trimmed : "/" + trimmed
        return leading.endsWith("/") ? leading.slice(0, -1) : leading
    }

    private getAccessMode(): TranscriptAccessMode {
        return this.config?.links.access.mode ?? "public"
    }

    private buildPluginHostedTranscriptUrl(slug: string) {
        if (!this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        const baseUrl = this.config.server.publicBaseUrl.replace(/\/+$/, "")
        const basePath = this.normalizeBasePath(this.config.server.basePath)
        return baseUrl + basePath + "/transcripts/" + encodeURIComponent(slug)
    }

    private getDashboardRuntimeApi() {
        const symbol = Symbol.for("open-ticket.ot-dashboard")
        return (globalThis as Record<symbol, {
            buildPublicUrl?: (routePath: string) => string | null
            buildViewerPublicUrl?: (routePath: string) => string | null
        } | undefined>)[symbol] ?? null
    }

    private resolvePrivateViewerUrlBuilderStatus() {
        const runtimeApi = this.getDashboardRuntimeApi()
        const viewerUrlBuilder = runtimeApi?.buildViewerPublicUrl
        if (!viewerUrlBuilder) {
            return {
                ready: false,
                message: PRIVATE_VIEWER_URL_NOT_READY_MESSAGE
            }
        }

        const viewerUrl = viewerUrlBuilder("/transcripts/viewer-readiness")
        if (typeof viewerUrl != "string" || viewerUrl.trim().length == 0) {
            return {
                ready: false,
                message: PRIVATE_VIEWER_URL_NOT_READY_MESSAGE
            }
        }

        return {
            ready: true,
            message: "Dashboard transcript viewer URLs are ready for private transcript links and whitelist review submit."
        }
    }

    private buildCanonicalTranscriptUrl(slug: string, options: { requireReady?: boolean } = {}) {
        if (!this.config) {
            throw new Error("Transcript service is not initialized.")
        }

        if (this.getAccessMode() == "public") {
            return this.buildPluginHostedTranscriptUrl(slug)
        }

        const runtimeApi = this.getDashboardRuntimeApi()
        const viewerUrl = runtimeApi?.buildViewerPublicUrl?.("/transcripts/" + encodeURIComponent(slug)) ?? null
        if (typeof viewerUrl == "string" && viewerUrl.trim().length > 0) {
            return viewerUrl
        }

        if (options.requireReady) {
            throw new Error(PRIVATE_VIEWER_URL_NOT_READY_MESSAGE)
        }

        return null
    }

    private requireCanonicalTranscriptUrl(slug: string) {
        return this.buildCanonicalTranscriptUrl(slug, { requireReady: true })!
    }

    private normalizeViewerAccessContext(viewerAccess?: TranscriptViewerAccessContext | null): TranscriptViewerAccessContext {
        return {
            membership: viewerAccess?.membership == "member" || viewerAccess?.membership == "missing"
                ? viewerAccess.membership
                : "unresolved",
            liveTier: viewerAccess?.liveTier == "reviewer" || viewerAccess?.liveTier == "editor" || viewerAccess?.liveTier == "admin"
                ? viewerAccess.liveTier
                : null,
            ownerOverride: viewerAccess?.ownerOverride === true,
            source: viewerAccess?.source == "cache" ? "cache" : "live",
            freshnessMs: typeof viewerAccess?.freshnessMs == "number" && Number.isFinite(viewerAccess.freshnessMs)
                ? Math.max(0, Math.floor(viewerAccess.freshnessMs))
                : MAX_VIEWER_ACCESS_FRESHNESS_MS,
            revalidatedAt: typeof viewerAccess?.revalidatedAt == "string" && viewerAccess.revalidatedAt.trim().length > 0
                ? viewerAccess.revalidatedAt
                : new Date().toISOString()
        }
    }

    private canUseViewerAccess(viewerAccess: TranscriptViewerAccessContext) {
        return viewerAccess.membership == "member" && viewerAccess.freshnessMs <= MAX_VIEWER_ACCESS_FRESHNESS_MS
    }

    private async resolveViewerRole(transcript: TranscriptRecord, viewerUserId: string): Promise<TranscriptParticipantRole | null> {
        if (!this.repository) {
            return null
        }

        const normalizedViewerUserId = viewerUserId.trim()
        if (normalizedViewerUserId.length == 0) {
            return null
        }

        const participants = await this.repository.listTranscriptParticipants(transcript.id)
        const participant = participants.find((candidate) => candidate.userId == normalizedViewerUserId)
        return participant?.role ?? null
    }

    private async resolveViewerAccessDecision(
        transcript: TranscriptRecord,
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext,
        options: {
            allowOwnerOverride: boolean
        }
    ): Promise<null | {
        viewerRole: TranscriptParticipantRole
        accessPath: TranscriptViewerAccessPath
    }> {
        const normalizedViewerUserId = viewerUserId.trim()
        if (normalizedViewerUserId.length == 0) {
            return null
        }

        if (!this.canUseViewerAccess(viewerAccess)) {
            return null
        }

        if (transcript.creatorId && transcript.creatorId == normalizedViewerUserId) {
            return {
                viewerRole: "creator",
                accessPath: "creator-current-guild"
            }
        }

        const viewerRole = await this.resolveViewerRole(transcript, normalizedViewerUserId)
        if (viewerRole == "admin" && viewerAccess.liveTier) {
            return {
                viewerRole,
                accessPath: "recorded-admin-current-staff"
            }
        }

        if (options.allowOwnerOverride && viewerAccess.ownerOverride) {
            return {
                viewerRole: "admin",
                accessPath: "owner-override"
            }
        }

        return null
    }

    private async resolveViewerTranscriptContext(
        slug: string,
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext
    ): Promise<
        | {
            status: "ok"
            transcript: TranscriptRecord
            link: {
                id: string
                slug: string
            }
            viewerUserId: string
            viewerRole: TranscriptParticipantRole
            accessPath: TranscriptViewerAccessPath
        }
        | { status: "not-found" | "gone"; message: string }
    > {
        if (!this.repository || this.getAccessMode() != "private-discord") {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE
            }
        }

        await this.normalizeExpiredLinks("viewer-route", { slug })

        const link = await this.repository.getTranscriptLinkBySlug(slug)
        if (!link) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE
            }
        }

        const transcript = this.hydrateTranscript(await this.repository.getTranscriptById(link.transcript_id))
        if (!transcript) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE
            }
        }

        const normalizedViewerUserId = viewerUserId.trim()
        const normalizedAccess = this.normalizeViewerAccessContext(viewerAccess)
        const accessDecision = await this.resolveViewerAccessDecision(transcript, normalizedViewerUserId, normalizedAccess, {
            allowOwnerOverride: true
        })
        if (!accessDecision) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE
            }
        }

        if (link.status != "active" || transcript.status == "revoked" || transcript.status == "deleted") {
            return {
                status: "gone",
                message: VIEWER_ACCESS_GONE_MESSAGE
            }
        }

        if (!transcript.archivePath) {
            return {
                status: "not-found",
                message: VIEWER_ACCESS_NOT_FOUND_MESSAGE
            }
        }

        if (transcript.status != "active" && transcript.status != "partial") {
            return {
                status: "not-found",
                message: VIEWER_NOT_READY_MESSAGE
            }
        }

        return {
            status: "ok",
            transcript,
            link: {
                id: link.id,
                slug: link.slug
            },
            viewerUserId: normalizedViewerUserId,
            viewerRole: accessDecision.viewerRole,
            accessPath: accessDecision.accessPath
        }
    }

    private hydrateTranscript(transcript: TranscriptRecord | null): TranscriptRecord | null {
        if (!transcript) return null

        return {
            ...transcript,
            publicUrl: transcript.activeSlug ? this.buildCanonicalTranscriptUrl(transcript.activeSlug) : null
        }
    }

    private hydrateTranscriptLink(link: TranscriptLinkRecord): TranscriptLinkRecord {
        return {
            ...link,
            publicUrl: link.slug ? this.buildCanonicalTranscriptUrl(link.slug) : null
        }
    }
}
