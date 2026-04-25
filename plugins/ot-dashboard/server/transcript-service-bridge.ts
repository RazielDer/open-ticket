import type { DashboardConfigService } from "./config-service"
import type { DashboardPluginDetail } from "./dashboard-runtime-registry"
import type { DashboardRuntimeBridge } from "./runtime-bridge"

export const TRANSCRIPT_DASHBOARD_PLUGIN_ID = "ot-html-transcripts"
export const TRANSCRIPT_DASHBOARD_SERVICE_ID = "ot-html-transcripts:service"

export const DASHBOARD_TRANSCRIPT_ACCESS_MODES = ["public", "private-discord"] as const
export const DASHBOARD_TRANSCRIPT_STATUSES = ["building", "active", "partial", "revoked", "deleted", "failed"] as const
export const DASHBOARD_TRANSCRIPT_LINK_STATUSES = ["active", "revoked", "superseded", "deleted", "expired"] as const
export const DASHBOARD_TRANSCRIPT_ASSET_STATUSES = ["mirrored", "failed", "skipped"] as const
export const DASHBOARD_TRANSCRIPT_INTEGRITY_HEALTH = ["healthy", "warning", "error", "skipped"] as const
export const DASHBOARD_TRANSCRIPT_OPERATIONAL_INTEGRITY_FILTERS = ["healthy", "warning", "error", "repairable", "skipped"] as const
export const DASHBOARD_TRANSCRIPT_OPERATIONAL_RETENTION_FILTERS = ["candidate", "not-candidate"] as const
export const DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS = ["created-desc", "created-asc", "updated-desc", "updated-asc"] as const
export const DASHBOARD_TRANSCRIPT_INTEGRITY_ISSUE_SEVERITIES = ["warning", "error"] as const
export const DASHBOARD_TRANSCRIPT_INTEGRITY_ISSUE_CODES = [
  "build-in-progress",
  "unsafe-archive-path",
  "archive-directory-missing",
  "document-missing",
  "document-invalid",
  "document-transcript-mismatch",
  "html-missing",
  "asset-file-missing",
  "asset-row-missing",
  "orphan-asset-row"
] as const
export const DASHBOARD_TRANSCRIPT_INTEGRITY_REPAIR_ACTIONS = [
  "clear-archive-metadata",
  "rerender-index-html",
  "downgrade-missing-assets",
  "demote-to-failed"
] as const

export type DashboardTranscriptStatus = (typeof DASHBOARD_TRANSCRIPT_STATUSES)[number]
export type DashboardTranscriptLinkStatus = (typeof DASHBOARD_TRANSCRIPT_LINK_STATUSES)[number]
export type DashboardTranscriptAssetStatus = (typeof DASHBOARD_TRANSCRIPT_ASSET_STATUSES)[number]
export type DashboardTranscriptAccessMode = (typeof DASHBOARD_TRANSCRIPT_ACCESS_MODES)[number]
export type DashboardTranscriptStylePresetId =
  | "discord-classic"
  | "midnight-cyan"
  | "ember-slate"
  | "forest-ledger"
export type DashboardTranscriptParticipantRole = "creator" | "participant" | "admin"
export type DashboardTranscriptViewerAccessPath =
  | "creator-current-guild"
  | "recorded-admin-current-staff"
  | "owner-override"
export type DashboardTranscriptViewerLiveTier = "reviewer" | "editor" | "admin"
export type DashboardTranscriptIntegrationState = "ready" | "runtime-unavailable" | "missing-plugin" | "missing-service" | "unhealthy"
export type DashboardTranscriptIntegrityHealth = (typeof DASHBOARD_TRANSCRIPT_INTEGRITY_HEALTH)[number]
export type DashboardTranscriptOperationalIntegrityFilter = (typeof DASHBOARD_TRANSCRIPT_OPERATIONAL_INTEGRITY_FILTERS)[number]
export type DashboardTranscriptOperationalRetentionFilter = (typeof DASHBOARD_TRANSCRIPT_OPERATIONAL_RETENTION_FILTERS)[number]
export type DashboardTranscriptOperationalSort = (typeof DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS)[number]
export type DashboardTranscriptIntegrityIssueSeverity = (typeof DASHBOARD_TRANSCRIPT_INTEGRITY_ISSUE_SEVERITIES)[number]
export type DashboardTranscriptIntegrityIssueCode = (typeof DASHBOARD_TRANSCRIPT_INTEGRITY_ISSUE_CODES)[number]
export type DashboardTranscriptIntegrityRepairAction = (typeof DASHBOARD_TRANSCRIPT_INTEGRITY_REPAIR_ACTIONS)[number]

export interface DashboardTranscriptSummary {
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

export interface DashboardTranscriptRecord {
  id: string
  status: DashboardTranscriptStatus
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

export interface DashboardTranscriptLinkRecord {
  id: string
  transcriptId: string
  slug: string
  status: DashboardTranscriptLinkStatus
  reason: string | null
  createdAt: string
  expiresAt: string | null
  expiredAt: string | null
  revokedAt: string | null
  publicUrl: string | null
}

export interface DashboardTranscriptParticipantRecord {
  id: string
  userId: string
  displayName: string
  role: DashboardTranscriptParticipantRole
}

export interface DashboardTranscriptAssetRecord {
  id: string
  assetName: string
  sourceUrl: string
  archiveRelativePath: string | null
  mimeType: string
  byteSize: number
  status: DashboardTranscriptAssetStatus
  reason: string | null
}

export interface DashboardTranscriptDetail {
  transcript: DashboardTranscriptRecord
  links: DashboardTranscriptLinkRecord[]
  participants: DashboardTranscriptParticipantRecord[]
  assets: DashboardTranscriptAssetRecord[]
}

export interface DashboardTranscriptPreparedExport {
  exportId: string
  transcriptId: string
  format: "zip"
  fileName: string
  filePath: string
  contentType: string
  byteSize: number
  archiveIncluded: boolean
  createdAt: string
}

export interface DashboardTranscriptPrepareExportResult {
  ok: boolean
  target: string
  transcriptId: string | null
  message: string
  export: DashboardTranscriptPreparedExport | null
}

export interface DashboardTranscriptEventRecord {
  id: string
  transcriptId: string
  type: string
  reason: string | null
  details: Record<string, string | number | boolean | null>
  createdAt: string
}

export interface DashboardListTranscriptEventsQuery {
  limit?: number
  offset?: number
}

export interface DashboardListTranscriptEventsResult {
  total: number
  items: DashboardTranscriptEventRecord[]
}

export interface DashboardTranscriptRetentionCandidate {
  transcriptId: string
  status: DashboardTranscriptStatus
  updatedAt: string | null
  ageDays: number
  configuredDays: number
  archivePath: string | null
  totalBytes: number
}

export interface DashboardTranscriptRetentionPreview {
  enabled: boolean
  runOnStartup: boolean
  maxTranscriptsPerRun: number
  windows: {
    failedDays: number
    revokedDays: number
    deletedDays: number
  }
  totalCandidates: number
  candidates: DashboardTranscriptRetentionCandidate[]
}

export interface DashboardTranscriptIntegrityIssue {
  code: DashboardTranscriptIntegrityIssueCode
  severity: DashboardTranscriptIntegrityIssueSeverity
  message: string
  repairableActions: DashboardTranscriptIntegrityRepairAction[]
}

export interface DashboardTranscriptIntegritySummary {
  scannedAt: string
  total: number
  healthy: number
  warning: number
  error: number
  repairable: number
  skipped: number
  issueCounts: Record<DashboardTranscriptIntegrityIssueCode, number>
}

export interface DashboardTranscriptIntegrityReport {
  transcript: DashboardTranscriptRecord
  scannedAt: string
  health: DashboardTranscriptIntegrityHealth
  issues: DashboardTranscriptIntegrityIssue[]
  repairableActions: DashboardTranscriptIntegrityRepairAction[]
  archivePathSafe: boolean
  archivePresent: boolean
  documentPresent: boolean
  htmlPresent: boolean
}

export interface DashboardListTranscriptsQuery {
  search?: string
  status?: DashboardTranscriptStatus
  limit?: number
  offset?: number
}

export interface DashboardListTranscriptsResult {
  total: number
  items: DashboardTranscriptRecord[]
}

export interface DashboardTicketAnalyticsHistoryQuery {
  openedFrom?: string
  openedTo?: string
  teamId?: string | null
  assigneeId?: string | null
  transportMode?: "channel_text" | "private_thread" | null
  cursor?: string | null
  limit?: number
}

export interface DashboardTicketAnalyticsHistoryRecord {
  ticketId: string | null
  transcriptId: string
  creatorId: string | null
  openedAt: number | null
  closedAt: number | null
  resolvedAt: number | null
  firstStaffResponseAt: number | null
  assignedTeamId: string | null
  assignedStaffUserId: string | null
  transportMode: "channel_text" | "private_thread" | null
  transcriptStatus: DashboardTranscriptStatus
}

export interface DashboardTicketAnalyticsHistoryResult {
  total: number
  items: DashboardTicketAnalyticsHistoryRecord[]
  warnings: string[]
  nextCursor: string | null
  truncated: boolean
}

export interface DashboardTranscriptOperationalRecord extends DashboardTranscriptRecord {
  integrityHealth: DashboardTranscriptIntegrityHealth
  repairable: boolean
  retentionCandidate: boolean
  canBulkRevoke: boolean
  canBulkDelete: boolean
  canExport: boolean
}

export interface DashboardTranscriptOperationalMatchingSummary {
  total: number
  active: number
  partial: number
  revoked: number
  deleted: number
  failed: number
  building: number
}

export interface DashboardTranscriptOperationalListQuery {
  search?: string
  status?: DashboardTranscriptStatus
  integrity?: DashboardTranscriptOperationalIntegrityFilter
  retention?: DashboardTranscriptOperationalRetentionFilter
  creatorId?: string
  channelId?: string
  createdFrom?: string
  createdTo?: string
  sort?: DashboardTranscriptOperationalSort
  limit?: number
  offset?: number
}

export interface DashboardTranscriptOperationalListResult {
  total: number
  matchingSummary: DashboardTranscriptOperationalMatchingSummary
  items: DashboardTranscriptOperationalRecord[]
}

export interface DashboardTranscriptBulkActionItemResult {
  transcriptId: string
  ok: boolean
  status: string
  message: string
}

export interface DashboardTranscriptBulkActionResult {
  action: "revoke" | "delete"
  requested: number
  succeeded: number
  skipped: number
  failed: number
  items: DashboardTranscriptBulkActionItemResult[]
  message: string
}

export interface DashboardTranscriptBulkExportItemResult {
  transcriptId: string
  ok: boolean
  status: string
  message: string
  fileName: string | null
}

export interface DashboardPreparedBulkTranscriptExport {
  exportId: string
  fileName: string
  filePath: string
  contentType: string
  byteSize: number
  exportedCount: number
  skippedCount: number
  createdAt: string
}

export interface DashboardTranscriptPrepareBulkExportResult {
  ok: boolean
  message: string
  export: DashboardPreparedBulkTranscriptExport | null
  items: DashboardTranscriptBulkExportItemResult[]
}

export interface DashboardTranscriptActionResult {
  ok: boolean
  action: string
  target: string
  status: string
  message: string
  reason?: string
}

export interface DashboardTranscriptAccessPolicy {
  mode: DashboardTranscriptAccessMode
  viewerReady: boolean
  message: string
}

export interface DashboardTranscriptViewerAccessContext {
  membership: "member" | "missing" | "unresolved"
  liveTier: DashboardTranscriptViewerLiveTier | null
  ownerOverride: boolean
  source: "live" | "cache"
  freshnessMs: number
  revalidatedAt: string
}

export interface DashboardTranscriptHtmlStyleDraft {
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

export interface DashboardTranscriptStylePreset {
  id: DashboardTranscriptStylePresetId
  label: string
  description: string
  draft: DashboardTranscriptHtmlStyleDraft
}

export interface DashboardTranscriptStylePreviewResult {
  status: "ok" | "unavailable"
  message: string
  html: string | null
  contentSecurityPolicy: string | null
}

export interface DashboardTranscriptViewerDocumentResult {
  status: "ok" | "not-found" | "gone"
  message: string
  html: string | null
  contentSecurityPolicy: string | null
  accessPath: DashboardTranscriptViewerAccessPath | null
}

export interface DashboardTranscriptViewerAssetResult {
  status: "ok" | "not-found" | "gone"
  message: string
  filePath: string | null
  contentType: string | null
  cacheControl: string | null
  accessPath: DashboardTranscriptViewerAccessPath | null
}

export interface DashboardViewerAccessibleTranscriptRecord extends DashboardTranscriptRecord {
  accessPath: DashboardTranscriptViewerAccessPath
}

export interface DashboardListViewerAccessibleTranscriptsQuery {
  limit?: number
  offset?: number
}

export interface DashboardListViewerAccessibleTranscriptsResult {
  total: number
  items: DashboardViewerAccessibleTranscriptRecord[]
}

export interface DashboardTranscriptService {
  isHealthy: () => boolean
  getSummary: () => Promise<DashboardTranscriptSummary>
  resolveTranscript: (target: string) => Promise<DashboardTranscriptRecord | null>
  listTranscripts: (query: DashboardListTranscriptsQuery) => Promise<DashboardListTranscriptsResult>
  listTicketAnalyticsHistory?: (query: DashboardTicketAnalyticsHistoryQuery) => Promise<DashboardTicketAnalyticsHistoryResult>
  getTranscriptDetail: (target: string) => Promise<DashboardTranscriptDetail | null>
  getAccessPolicy?: () => Promise<DashboardTranscriptAccessPolicy>
  listTranscriptStylePresets?: () => Promise<DashboardTranscriptStylePreset[]>
  renderTranscriptStylePreview?: (styleDraft: DashboardTranscriptHtmlStyleDraft) => Promise<DashboardTranscriptStylePreviewResult>
  prepareTranscriptExport?: (target: string, format?: "zip") => Promise<DashboardTranscriptPrepareExportResult>
  releasePreparedTranscriptExport?: (exportId: string) => Promise<boolean>
  listTranscriptEvents?: (target: string, query: DashboardListTranscriptEventsQuery) => Promise<DashboardListTranscriptEventsResult>
  previewRetentionSweep?: () => Promise<DashboardTranscriptRetentionPreview>
  getIntegritySummary?: () => Promise<DashboardTranscriptIntegritySummary>
  scanTranscriptIntegrity?: (target: string) => Promise<DashboardTranscriptIntegrityReport | null>
  listOperationalTranscripts?: (query: DashboardTranscriptOperationalListQuery) => Promise<DashboardTranscriptOperationalListResult>
  bulkRevokeTranscripts?: (ids: string[], reason?: string) => Promise<DashboardTranscriptBulkActionResult>
  bulkDeleteTranscripts?: (ids: string[], reason?: string) => Promise<DashboardTranscriptBulkActionResult>
  prepareBulkTranscriptExport?: (ids: string[]) => Promise<DashboardTranscriptPrepareBulkExportResult>
  listViewerAccessibleTranscripts?: (
    viewerUserId: string,
    viewerAccess: DashboardTranscriptViewerAccessContext,
    query?: DashboardListViewerAccessibleTranscriptsQuery
  ) => Promise<DashboardListViewerAccessibleTranscriptsResult>
  renderViewerTranscript?: (
    slug: string,
    viewerUserId: string,
    assetBasePath: string,
    viewerAccess: DashboardTranscriptViewerAccessContext
  ) => Promise<DashboardTranscriptViewerDocumentResult>
  resolveViewerTranscriptAsset?: (
    slug: string,
    assetName: string,
    viewerUserId: string,
    viewerAccess: DashboardTranscriptViewerAccessContext
  ) => Promise<DashboardTranscriptViewerAssetResult>
  revokeTranscript: (id: string, reason?: string) => Promise<DashboardTranscriptActionResult>
  reissueTranscript: (id: string, reason?: string) => Promise<DashboardTranscriptActionResult>
  deleteTranscript: (id: string, reason?: string) => Promise<DashboardTranscriptActionResult>
}

export interface DashboardTranscriptOperationsReadService {
  listTranscriptEvents: NonNullable<DashboardTranscriptService["listTranscriptEvents"]>
  previewRetentionSweep: NonNullable<DashboardTranscriptService["previewRetentionSweep"]>
  getIntegritySummary: NonNullable<DashboardTranscriptService["getIntegritySummary"]>
  scanTranscriptIntegrity: NonNullable<DashboardTranscriptService["scanTranscriptIntegrity"]>
}

export interface DashboardTranscriptOperationsWriteService {
  prepareTranscriptExport: NonNullable<DashboardTranscriptService["prepareTranscriptExport"]>
  releasePreparedTranscriptExport: NonNullable<DashboardTranscriptService["releasePreparedTranscriptExport"]>
  listOperationalTranscripts: NonNullable<DashboardTranscriptService["listOperationalTranscripts"]>
  bulkRevokeTranscripts: NonNullable<DashboardTranscriptService["bulkRevokeTranscripts"]>
  bulkDeleteTranscripts: NonNullable<DashboardTranscriptService["bulkDeleteTranscripts"]>
  prepareBulkTranscriptExport: NonNullable<DashboardTranscriptService["prepareBulkTranscriptExport"]>
}

export interface DashboardTranscriptViewerService {
  getAccessPolicy: NonNullable<DashboardTranscriptService["getAccessPolicy"]>
  listViewerAccessibleTranscripts: NonNullable<DashboardTranscriptService["listViewerAccessibleTranscripts"]>
  renderViewerTranscript: NonNullable<DashboardTranscriptService["renderViewerTranscript"]>
  resolveViewerTranscriptAsset: NonNullable<DashboardTranscriptService["resolveViewerTranscriptAsset"]>
}

export interface DashboardTranscriptStylePreviewService {
  listTranscriptStylePresets: NonNullable<DashboardTranscriptService["listTranscriptStylePresets"]>
  renderTranscriptStylePreview: NonNullable<DashboardTranscriptService["renderTranscriptStylePreview"]>
}

export interface DashboardTranscriptTicketAnalyticsHistoryService {
  listTicketAnalyticsHistory: NonNullable<DashboardTranscriptService["listTicketAnalyticsHistory"]>
}

export interface DashboardTranscriptIntegration {
  state: DashboardTranscriptIntegrationState
  mode: string | null
  htmlMode: boolean
  plugin: DashboardPluginDetail | null
  service: DashboardTranscriptService | null
  message: string
}

function readTranscriptMode(configService: DashboardConfigService) {
  try {
    const config = configService.readManagedJson<Record<string, any>>("transcripts")
    const mode = typeof config?.general?.mode === "string" ? config.general.mode.trim() : ""
    return mode.length > 0 ? mode : null
  } catch {
    return null
  }
}

function isTranscriptService(value: unknown): value is DashboardTranscriptService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return [
    "isHealthy",
    "getSummary",
    "resolveTranscript",
    "listTranscripts",
    "getTranscriptDetail",
    "revokeTranscript",
    "reissueTranscript",
    "deleteTranscript"
  ].every((key) => typeof candidate[key] === "function")
}

export function supportsTranscriptOperationsReads(value: unknown): value is DashboardTranscriptService & DashboardTranscriptOperationsReadService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return [
    "listTranscriptEvents",
    "previewRetentionSweep",
    "getIntegritySummary",
    "scanTranscriptIntegrity"
  ].every((key) => typeof candidate[key] === "function")
}

export function supportsTranscriptOperationsWrites(value: unknown): value is DashboardTranscriptService & DashboardTranscriptOperationsWriteService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return [
    "prepareTranscriptExport",
    "releasePreparedTranscriptExport",
    "listOperationalTranscripts",
    "bulkRevokeTranscripts",
    "bulkDeleteTranscripts",
    "prepareBulkTranscriptExport"
  ].every((key) => typeof candidate[key] === "function")
}

export function supportsTranscriptViewerAccess(value: unknown): value is DashboardTranscriptService & DashboardTranscriptViewerService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return [
    "getAccessPolicy",
    "listViewerAccessibleTranscripts",
    "renderViewerTranscript",
    "resolveViewerTranscriptAsset"
  ].every((key) => typeof candidate[key] === "function")
}

export function supportsTranscriptStylePreview(value: unknown): value is DashboardTranscriptService & DashboardTranscriptStylePreviewService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return [
    "listTranscriptStylePresets",
    "renderTranscriptStylePreview"
  ].every((key) => typeof candidate[key] === "function")
}

export function supportsTranscriptTicketAnalyticsHistory(value: unknown): value is DashboardTranscriptService & DashboardTranscriptTicketAnalyticsHistoryService {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.listTicketAnalyticsHistory === "function"
}

function getMissingServiceMessage(plugin: DashboardPluginDetail | null) {
  if (plugin?.crashed) {
    return plugin.crashReason
      ? `The transcript plugin is installed but crashed before exposing ${TRANSCRIPT_DASHBOARD_SERVICE_ID} (${plugin.crashReason}).`
      : `The transcript plugin is installed but crashed before exposing ${TRANSCRIPT_DASHBOARD_SERVICE_ID}.`
  }

  if (plugin && plugin.enabled === false) {
    return `The transcript plugin is installed but disabled, so ${TRANSCRIPT_DASHBOARD_SERVICE_ID} is unavailable.`
  }

  return `The transcript plugin is installed, but ${TRANSCRIPT_DASHBOARD_SERVICE_ID} is not available in the runtime registry.`
}

export function resolveTranscriptIntegration(
  projectRoot: string,
  configService: DashboardConfigService,
  runtimeBridge: DashboardRuntimeBridge
): DashboardTranscriptIntegration {
  const mode = readTranscriptMode(configService)
  const htmlMode = mode === "html"
  const plugin = runtimeBridge.getPluginDetail(projectRoot, TRANSCRIPT_DASHBOARD_PLUGIN_ID)
  const runtimeSource = runtimeBridge.getRuntimeSource?.() || null

  if (!runtimeSource) {
    return {
      state: "runtime-unavailable",
      mode,
      htmlMode,
      plugin,
      service: null,
      message: "Open Ticket runtime is not registered with the dashboard, so transcript operations are unavailable."
    }
  }

  if (!plugin) {
    return {
      state: "missing-plugin",
      mode,
      htmlMode,
      plugin: null,
      service: null,
      message: "The ot-html-transcripts plugin is not installed in this project, so the dashboard cannot manage archived HTML transcripts."
    }
  }

  const serviceCandidate = runtimeSource.plugins?.classes?.get?.(TRANSCRIPT_DASHBOARD_SERVICE_ID) ?? null
  if (!isTranscriptService(serviceCandidate)) {
    return {
      state: "missing-service",
      mode,
      htmlMode,
      plugin,
      service: null,
      message: getMissingServiceMessage(plugin)
    }
  }

  let healthy = false
  try {
    healthy = Boolean(serviceCandidate.isHealthy())
  } catch {
    healthy = false
  }

  if (!healthy) {
    return {
      state: "unhealthy",
      mode,
      htmlMode,
      plugin,
      service: serviceCandidate,
      message: "The transcript service is registered but currently unhealthy, so archive operations are disabled until it recovers."
    }
  }

  return {
    state: "ready",
    mode,
    htmlMode,
    plugin,
    service: serviceCandidate,
    message: "The transcript service is available."
  }
}
