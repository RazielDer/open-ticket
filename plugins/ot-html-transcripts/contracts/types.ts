import type {
    TRANSCRIPT_ACCESS_MODES,
    TRANSCRIPT_ACTION_RESULT_STATUSES,
    TRANSCRIPT_ASSET_STATUSES,
    TRANSCRIPT_COMMAND_ACTIONS,
    TRANSCRIPT_LINK_STATUSES,
    TRANSCRIPT_OPERATIONAL_SORTS,
    TRANSCRIPT_STATUSES
} from "./constants"

export type TranscriptAdminAction = (typeof TRANSCRIPT_COMMAND_ACTIONS)[number]
export type TranscriptAccessMode = (typeof TRANSCRIPT_ACCESS_MODES)[number]
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]
export type TranscriptLinkStatus = (typeof TRANSCRIPT_LINK_STATUSES)[number]
export type TranscriptAssetStatus = (typeof TRANSCRIPT_ASSET_STATUSES)[number]
export type TranscriptActionResultStatus = (typeof TRANSCRIPT_ACTION_RESULT_STATUSES)[number]
export type TranscriptOperationalSort = (typeof TRANSCRIPT_OPERATIONAL_SORTS)[number]
export type TranscriptParticipantRole = "creator" | "participant" | "admin"
export type TranscriptViewerAccessPath =
    | "creator-current-guild"
    | "recorded-admin-current-staff"
    | "owner-override"
export type TranscriptViewerLiveTier = "reviewer" | "editor" | "admin"
export type TranscriptEventType =
    | "build-started"
    | "build-succeeded"
    | "build-partial"
    | "build-failed"
    | "viewer-accessed"
    | "archive-swept"
    | "integrity-repaired"
    | "export-prepared"
    | "link-expired"
    | "link-revoked"
    | "link-reissued"
    | "transcript-deleted"
    | "recovery-marked-failed"
export type TranscriptEventDetails = Record<string, string | number | boolean | null>
export type TranscriptRetentionTrigger = "startup" | "manual"
export type TranscriptIntegrityHealth = "healthy" | "warning" | "error" | "skipped"
export type TranscriptOperationalIntegrityFilter = TranscriptIntegrityHealth | "repairable"
export type TranscriptOperationalRetentionFilter = "candidate" | "not-candidate"
export type TranscriptIntegrityIssueSeverity = "warning" | "error"
export type TranscriptIntegrityIssueCode =
    | "build-in-progress"
    | "unsafe-archive-path"
    | "archive-directory-missing"
    | "document-missing"
    | "document-invalid"
    | "document-transcript-mismatch"
    | "html-missing"
    | "asset-file-missing"
    | "asset-row-missing"
    | "orphan-asset-row"
export type TranscriptIntegrityRepairAction =
    | "clear-archive-metadata"
    | "rerender-index-html"
    | "downgrade-missing-assets"
    | "demote-to-failed"
export type TranscriptExportFormat = "zip"
export type TranscriptStylePresetId =
    | "discord-classic"
    | "midnight-cyan"
    | "ember-slate"
    | "forest-ledger"

export interface OTHtmlTranscriptsConfigData {
    server: {
        host: string
        port: number
        basePath: string
        publicBaseUrl: string
    }
    storage: {
        archiveRoot: string
        sqlitePath: string
    }
    links: {
        slugBytes: number
        expiry: {
            enabled: boolean
            ttlDays: number
        }
        access: {
            mode: TranscriptAccessMode
        }
    }
    queue: {
        maxActiveTranscripts: number
        maxAssetFetches: number
    }
    assets: {
        maxBytesPerFile: number
        maxBytesPerTranscript: number
        maxCountPerTranscript: number
    }
    retention: {
        enabled: boolean
        runOnStartup: boolean
        maxTranscriptsPerRun: number
        statuses: {
            failedDays: number
            revokedDays: number
            deletedDays: number
        }
    }
}

export interface TranscriptSummary {
    total: number
    active: number
    partial: number
    revoked: number
    deleted: number
    failed: number
    building: number
    totalArchiveBytes: number
    queueDepth: number
    recoveredBuilds: number
}

export interface TranscriptRecord {
    id: string
    status: TranscriptStatus
    ticketId: string | null
    channelId: string | null
    guildId: string | null
    creatorId: string | null
    deleterId: string | null
    activeSlug: string | null
    publicUrl: string | null
    archivePath: string | null
    statusReason: string | null
    createdAt: string | null
    updatedAt: string | null
    messageCount: number
    attachmentCount: number
    warningCount: number
    totalBytes: number
}

export interface TranscriptLinkRecord {
    id: string
    transcriptId: string
    slug: string
    status: TranscriptLinkStatus
    reason: string | null
    createdAt: string
    expiresAt: string | null
    expiredAt: string | null
    revokedAt: string | null
    publicUrl: string | null
}

export interface TranscriptParticipantRecord {
    id: string
    userId: string
    displayName: string
    role: TranscriptParticipantRole
}

export interface TranscriptAssetRecord {
    id: string
    assetName: string
    sourceUrl: string
    archiveRelativePath: string | null
    mimeType: string
    byteSize: number
    status: TranscriptAssetStatus
    reason: string | null
}

export interface TranscriptDetail {
    transcript: TranscriptRecord
    links: TranscriptLinkRecord[]
    participants: TranscriptParticipantRecord[]
    assets: TranscriptAssetRecord[]
}

export interface TranscriptEventRecord {
    id: string
    transcriptId: string
    type: TranscriptEventType
    reason: string | null
    details: TranscriptEventDetails
    createdAt: string
}

export interface CreateTranscriptEventInput {
    id?: string
    transcriptId: string
    type: TranscriptEventType
    reason?: string | null
    details?: TranscriptEventDetails
    createdAt?: string
}

export interface ListTranscriptEventsQuery {
    limit?: number
    offset?: number
    types?: TranscriptEventType[]
}

export interface ListTranscriptEventsResult {
    total: number
    items: TranscriptEventRecord[]
}

export interface TranscriptRetentionWindows {
    failedDays: number
    revokedDays: number
    deletedDays: number
}

export interface TranscriptRetentionCandidate {
    transcriptId: string
    status: TranscriptStatus
    updatedAt: string | null
    ageDays: number
    configuredDays: number
    archivePath: string | null
    totalBytes: number
}

export interface TranscriptRetentionPreview {
    enabled: boolean
    runOnStartup: boolean
    maxTranscriptsPerRun: number
    windows: TranscriptRetentionWindows
    totalCandidates: number
    candidates: TranscriptRetentionCandidate[]
}

export interface TranscriptRetentionFailure {
    transcriptId: string
    archivePath: string | null
    message: string
}

export interface TranscriptRetentionExecutionResult {
    enabled: boolean
    trigger: TranscriptRetentionTrigger
    attempted: number
    swept: number
    failed: number
    freedBytes: number
    candidates: TranscriptRetentionCandidate[]
    failures: TranscriptRetentionFailure[]
}

export interface TranscriptIntegrityIssue {
    code: TranscriptIntegrityIssueCode
    severity: TranscriptIntegrityIssueSeverity
    message: string
    repairableActions: TranscriptIntegrityRepairAction[]
}

export interface TranscriptIntegritySummary {
    scannedAt: string
    total: number
    healthy: number
    warning: number
    error: number
    repairable: number
    skipped: number
    issueCounts: Record<TranscriptIntegrityIssueCode, number>
}

export interface TranscriptIntegrityReport {
    transcript: TranscriptRecord
    scannedAt: string
    health: TranscriptIntegrityHealth
    issues: TranscriptIntegrityIssue[]
    repairableActions: TranscriptIntegrityRepairAction[]
    archivePathSafe: boolean
    archivePresent: boolean
    documentPresent: boolean
    htmlPresent: boolean
}

export interface TranscriptIntegrityRepairFailure {
    action: TranscriptIntegrityRepairAction
    message: string
}

export interface TranscriptIntegrityRepairResult {
    ok: boolean
    target: string
    transcriptId: string | null
    requestedActions: TranscriptIntegrityRepairAction[]
    appliedActions: TranscriptIntegrityRepairAction[]
    failures: TranscriptIntegrityRepairFailure[]
    reportBefore: TranscriptIntegrityReport | null
    reportAfter: TranscriptIntegrityReport | null
    message: string
}

export interface TranscriptPreparedExport {
    exportId: string
    transcriptId: string
    format: TranscriptExportFormat
    fileName: string
    filePath: string
    contentType: string
    byteSize: number
    archiveIncluded: boolean
    createdAt: string
}

export interface TranscriptPrepareExportResult {
    ok: boolean
    target: string
    transcriptId: string | null
    message: string
    export: TranscriptPreparedExport | null
}

export interface TranscriptOperationalRecord extends TranscriptRecord {
    integrityHealth: TranscriptIntegrityHealth
    repairable: boolean
    retentionCandidate: boolean
    canBulkRevoke: boolean
    canBulkDelete: boolean
    canExport: boolean
}

export interface TranscriptOperationalMatchingSummary {
    total: number
    active: number
    partial: number
    revoked: number
    deleted: number
    failed: number
    building: number
}

export interface TranscriptOperationalListQuery {
    search?: string
    status?: TranscriptStatus
    integrity?: TranscriptOperationalIntegrityFilter
    retention?: TranscriptOperationalRetentionFilter
    creatorId?: string
    channelId?: string
    createdFrom?: string
    createdTo?: string
    sort?: TranscriptOperationalSort
    limit?: number
    offset?: number
}

export interface TranscriptOperationalListResult {
    total: number
    matchingSummary: TranscriptOperationalMatchingSummary
    items: TranscriptOperationalRecord[]
}

export interface TranscriptBulkActionItemResult {
    transcriptId: string
    ok: boolean
    status: string
    message: string
}

export interface TranscriptBulkActionResult {
    action: "revoke" | "delete"
    requested: number
    succeeded: number
    skipped: number
    failed: number
    items: TranscriptBulkActionItemResult[]
    message: string
}

export interface TranscriptBulkExportItemResult {
    transcriptId: string
    ok: boolean
    status: string
    message: string
    fileName: string | null
}

export interface TranscriptPreparedBulkExport {
    exportId: string
    fileName: string
    filePath: string
    contentType: string
    byteSize: number
    exportedCount: number
    skippedCount: number
    createdAt: string
}

export interface TranscriptPrepareBulkExportResult {
    ok: boolean
    message: string
    export: TranscriptPreparedBulkExport | null
    items: TranscriptBulkExportItemResult[]
}

export interface TranscriptHtmlStyleDraft {
    background: {
        enableCustomBackground: boolean
        backgroundColor: string
        backgroundImage: string
    }
    header: {
        enableCustomHeader: boolean
        backgroundColor: string
        decoColor: string
        textColor: string
    }
    stats: {
        enableCustomStats: boolean
        backgroundColor: string
        keyTextColor: string
        valueTextColor: string
        hideBackgroundColor: string
        hideTextColor: string
    }
    favicon: {
        enableCustomFavicon: boolean
        imageUrl: string
    }
}

export interface TranscriptStylePreset {
    id: TranscriptStylePresetId
    label: string
    description: string
    draft: TranscriptHtmlStyleDraft
}

export interface TranscriptStylePreviewResult {
    status: "ok" | "unavailable"
    message: string
    html: string | null
    contentSecurityPolicy: string | null
}

export interface TranscriptAccessPolicy {
    mode: TranscriptAccessMode
    viewerReady: boolean
    message: string
}

export interface TranscriptViewerAccessContext {
    membership: "member" | "missing" | "unresolved"
    liveTier: TranscriptViewerLiveTier | null
    ownerOverride: boolean
    source: "live" | "cache"
    freshnessMs: number
    revalidatedAt: string
}

export interface TranscriptViewerDocumentResult {
    status: "ok" | "not-found" | "gone"
    message: string
    html: string | null
    contentSecurityPolicy: string | null
    accessPath: TranscriptViewerAccessPath | null
}

export interface TranscriptViewerAssetResult {
    status: "ok" | "not-found" | "gone"
    message: string
    filePath: string | null
    contentType: string | null
    cacheControl: string | null
    accessPath: TranscriptViewerAccessPath | null
}

export interface TranscriptViewerAccessibleRecord extends TranscriptRecord {
    accessPath: TranscriptViewerAccessPath
}

export interface ListViewerAccessibleTranscriptsQuery {
    limit?: number
    offset?: number
}

export interface ListViewerAccessibleTranscriptsResult {
    total: number
    items: TranscriptViewerAccessibleRecord[]
}

export interface ListTranscriptsQuery {
    search?: string
    status?: TranscriptStatus
    limit?: number
    offset?: number
}

export interface ListTranscriptsResult {
    total: number
    items: TranscriptRecord[]
}

export interface ActionResult {
    ok: boolean
    action: TranscriptAdminAction
    target: string
    status: TranscriptActionResultStatus
    message: string
    reason?: string
}

export interface TranscriptCommandRenderData {
    action: TranscriptAdminAction
    target: string
    ok: boolean
    status: TranscriptActionResultStatus
    message: string
    reason?: string | null
    transcript?: TranscriptRecord | null
    url?: string | null
}
