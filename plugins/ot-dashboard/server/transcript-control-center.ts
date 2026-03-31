import { sanitizeReturnTo } from "./auth"
import { joinBasePath } from "./dashboard-config"
import { formatDate } from "./control-center"
import {
  DASHBOARD_TRANSCRIPT_OPERATIONAL_INTEGRITY_FILTERS,
  DASHBOARD_TRANSCRIPT_OPERATIONAL_RETENTION_FILTERS,
  DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS,
  DASHBOARD_TRANSCRIPT_STATUSES,
  TRANSCRIPT_DASHBOARD_PLUGIN_ID,
  type DashboardTranscriptAccessPolicy,
  type DashboardListTranscriptEventsResult,
  type DashboardListTranscriptsResult,
  type DashboardTranscriptAssetRecord,
  type DashboardTranscriptDetail,
  type DashboardTranscriptEventRecord,
  type DashboardTranscriptIntegrityHealth,
  type DashboardTranscriptIntegrityIssue,
  type DashboardTranscriptIntegrityReport,
  type DashboardTranscriptIntegritySummary,
  type DashboardTranscriptIntegration,
  type DashboardTranscriptOperationalIntegrityFilter,
  type DashboardTranscriptOperationalListResult,
  type DashboardTranscriptOperationalMatchingSummary,
  type DashboardTranscriptOperationalRecord,
  type DashboardTranscriptOperationalRetentionFilter,
  type DashboardTranscriptOperationalSort,
  type DashboardTranscriptParticipantRecord,
  type DashboardTranscriptRecord,
  type DashboardTranscriptRetentionCandidate,
  type DashboardTranscriptRetentionPreview,
  type DashboardTranscriptStatus,
  type DashboardTranscriptSummary
} from "./transcript-service-bridge"

const TRANSCRIPT_LIMIT_OPTIONS = [25, 50, 100] as const
export const TRANSCRIPT_EVENT_PAGE_SIZE = 25
const TRANSCRIPT_DEFAULT_SORT: DashboardTranscriptOperationalSort = "created-desc"
const TRANSCRIPT_QUERY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const PARTICIPANT_ROLE_ORDER: Record<string, number> = {
  creator: 0,
  admin: 1,
  participant: 2
}

const ASSET_STATUS_ORDER: Record<string, number> = {
  failed: 0,
  skipped: 1,
  mirrored: 2
}

const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  "build-started": "transcripts.detail.events.types.buildStarted",
  "build-succeeded": "transcripts.detail.events.types.buildSucceeded",
  "build-partial": "transcripts.detail.events.types.buildPartial",
  "build-failed": "transcripts.detail.events.types.buildFailed",
  "viewer-accessed": "transcripts.detail.events.types.viewerAccessed",
  "archive-swept": "transcripts.detail.events.types.archiveSwept",
  "integrity-repaired": "transcripts.detail.events.types.integrityRepaired",
  "export-prepared": "transcripts.detail.events.types.exportPrepared",
  "link-expired": "transcripts.detail.events.types.linkExpired",
  "link-revoked": "transcripts.detail.events.types.linkRevoked",
  "link-reissued": "transcripts.detail.events.types.linkReissued",
  "transcript-deleted": "transcripts.detail.events.types.transcriptDeleted",
  "recovery-marked-failed": "transcripts.detail.events.types.recoveryMarkedFailed"
}

type TranscriptBadgeTone = "success" | "warning" | "danger" | "muted"
type TranscriptTranslate = (key: string, params?: Record<string, string | number>) => string

export type TranscriptOperationsReadAvailability = "available" | "unsupported" | "unavailable"
export type TranscriptOperationsWriteAvailability = "available" | "unsupported"

interface TranscriptAccessNotice {
  tone: TranscriptBadgeTone
  title: string
  message: string
}

export interface TranscriptListRequestModel {
  search: string
  status: "" | DashboardTranscriptStatus
  integrity: "" | DashboardTranscriptOperationalIntegrityFilter
  retention: "" | DashboardTranscriptOperationalRetentionFilter
  creatorId: string
  channelId: string
  createdFrom: string
  createdTo: string
  sort: DashboardTranscriptOperationalSort
  sortProvided: boolean
  limitProvided: boolean
  page: number
  limit: number
  offset: number
  statusOptions: Array<{ value: string; label: string }>
  integrityOptions: Array<{ value: string; label: string }>
  retentionOptions: Array<{ value: string; label: string }>
  sortOptions: Array<{ value: DashboardTranscriptOperationalSort; label: string }>
  limitOptions: number[]
}

export interface TranscriptEventsRequestModel {
  page: number
  limit: number
  offset: number
}

interface TranscriptOperationsReadModel {
  available: boolean
  badge: {
    label: string
    tone: TranscriptBadgeTone
  }
  warningMessage: string | null
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

function formatBytes(value: number | null | undefined) {
  if (!Number.isFinite(value as number) || (value as number) < 1) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = Number(value)
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const formatted = size >= 100 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

function normalizeSearch(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeTranscriptExactFilter(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeTranscriptDateFilter(value: unknown) {
  if (typeof value !== "string") return ""

  const trimmed = value.trim()
  if (!TRANSCRIPT_QUERY_DATE_PATTERN.test(trimmed)) {
    return ""
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === trimmed
    ? trimmed
    : ""
}

function normalizeTranscriptSort(value: unknown): DashboardTranscriptOperationalSort {
  const sort = typeof value === "string" ? value.trim() : ""
  return DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS.includes(sort as DashboardTranscriptOperationalSort)
    ? sort as DashboardTranscriptOperationalSort
    : TRANSCRIPT_DEFAULT_SORT
}

function normalizeStatus(value: unknown): "" | DashboardTranscriptStatus {
  const status = typeof value === "string" ? value.trim() : ""
  return DASHBOARD_TRANSCRIPT_STATUSES.includes(status as any) ? status as DashboardTranscriptStatus : ""
}

function normalizeIntegrity(value: unknown): "" | DashboardTranscriptOperationalIntegrityFilter {
  const integrity = typeof value === "string" ? value.trim() : ""
  return DASHBOARD_TRANSCRIPT_OPERATIONAL_INTEGRITY_FILTERS.includes(integrity as any)
    ? integrity as DashboardTranscriptOperationalIntegrityFilter
    : ""
}

function normalizeRetention(value: unknown): "" | DashboardTranscriptOperationalRetentionFilter {
  const retention = typeof value === "string" ? value.trim() : ""
  return DASHBOARD_TRANSCRIPT_OPERATIONAL_RETENTION_FILTERS.includes(retention as any)
    ? retention as DashboardTranscriptOperationalRetentionFilter
    : ""
}

function buildListHref(basePath: string, request: TranscriptListRequestModel, page = request.page) {
  const params = new URLSearchParams()
  if (request.search) params.set("q", request.search)
  if (request.status) params.set("status", request.status)
  if (request.integrity) params.set("integrity", request.integrity)
  if (request.retention) params.set("retention", request.retention)
  if (request.creatorId) params.set("creatorId", request.creatorId)
  if (request.channelId) params.set("channelId", request.channelId)
  if (request.createdFrom) params.set("createdFrom", request.createdFrom)
  if (request.createdTo) params.set("createdTo", request.createdTo)
  if (request.sortProvided || request.sort !== TRANSCRIPT_DEFAULT_SORT) params.set("sort", request.sort)
  if (request.limitProvided || request.limit !== TRANSCRIPT_LIMIT_OPTIONS[0]) params.set("limit", String(request.limit))
  if (page > 1) params.set("page", String(page))
  const query = params.toString()
  return `${joinBasePath(basePath, "admin/transcripts")}${query ? `?${query}` : ""}`
}

function buildDetailEventsHref(basePath: string, transcriptId: string, page: number, returnTo?: string | null) {
  const params = new URLSearchParams()
  params.set("eventsPage", String(page))
  if (returnTo) params.set("returnTo", returnTo)
  const query = params.toString()
  return `${joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcriptId)}`)}${query ? `?${query}` : ""}`
}

function buildBulkRouteHref(basePath: string, action: "revoke" | "delete" | "export") {
  return joinBasePath(basePath, `admin/transcripts/bulk/${action}`)
}

function buildTranscriptDetailHref(basePath: string, transcriptId: string, returnTo?: string | null) {
  const params = new URLSearchParams()
  if (returnTo) {
    params.set("returnTo", returnTo)
  }

  const query = params.toString()
  return `${joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcriptId)}`)}${query ? `?${query}` : ""}`
}

function buildDetailExportHref(basePath: string, transcriptId: string) {
  return joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcriptId)}/export`)
}

function buildClearFiltersHref(basePath: string, request: TranscriptListRequestModel) {
  const params = new URLSearchParams()
  if (request.limitProvided) {
    params.set("limit", String(request.limit))
  }

  const query = params.toString()
  return `${joinBasePath(basePath, "admin/transcripts")}${query ? `?${query}` : ""}`
}

function buildIntegrationTone(integration: DashboardTranscriptIntegration): TranscriptBadgeTone {
  switch (integration.state) {
    case "ready":
      return "success"
    case "unhealthy":
    case "missing-service":
      return "danger"
    case "runtime-unavailable":
    case "missing-plugin":
      return integration.htmlMode ? "danger" : "warning"
    default:
      return "muted"
  }
}

function buildIntegrationLabel(integration: DashboardTranscriptIntegration) {
  switch (integration.state) {
    case "ready":
      return "Ready"
    case "runtime-unavailable":
      return "Runtime unavailable"
    case "missing-plugin":
      return "Plugin missing"
    case "missing-service":
      return "Service missing"
    case "unhealthy":
      return "Unhealthy"
    default:
      return "Unavailable"
  }
}

function buildTranscriptStatusTone(status: string): TranscriptBadgeTone {
  switch (status) {
    case "active":
      return "success"
    case "partial":
    case "building":
    case "revoked":
    case "expired":
      return "warning"
    case "failed":
      return "danger"
    case "deleted":
    case "superseded":
      return "muted"
    default:
      return "muted"
  }
}

function buildIntegrityHealthTone(health: DashboardTranscriptIntegrityHealth): TranscriptBadgeTone {
  switch (health) {
    case "healthy":
      return "success"
    case "warning":
      return "warning"
    case "error":
      return "danger"
    case "skipped":
      return "muted"
    default:
      return "muted"
  }
}

function buildSearchText(record: DashboardTranscriptRecord) {
  return [
    record.id,
    record.status,
    record.ticketId,
    record.channelId,
    record.guildId,
    record.creatorId,
    record.deleterId,
    record.activeSlug,
    record.statusReason
  ].join(" ").toLowerCase()
}

function buildTranscriptOperationsReadModel(
  availability: TranscriptOperationsReadAvailability,
  t: TranscriptTranslate,
  fallbackMessage?: string
): TranscriptOperationsReadModel {
  switch (availability) {
    case "available":
      return {
        available: true,
        badge: {
          label: t("transcripts.page.operations.badges.available"),
          tone: "success"
        },
        warningMessage: null
      }
    case "unsupported":
      return {
        available: false,
        badge: {
          label: t("transcripts.page.operations.badges.unavailable"),
          tone: "warning"
        },
        warningMessage: t("transcripts.page.operations.unavailableUnsupported")
      }
    default:
      return {
        available: false,
        badge: {
          label: t("transcripts.page.operations.badges.unavailable"),
          tone: "warning"
        },
        warningMessage: fallbackMessage || t("transcripts.page.operations.unavailableError")
      }
  }
}

function buildTranscriptIntegrityHealthLabel(health: DashboardTranscriptIntegrityHealth, t: TranscriptTranslate) {
  switch (health) {
    case "healthy":
      return t("transcripts.detail.integrity.health.healthy")
    case "warning":
      return t("transcripts.detail.integrity.health.warning")
    case "error":
      return t("transcripts.detail.integrity.health.error")
    case "skipped":
      return t("transcripts.detail.integrity.health.skipped")
    default:
      return t("common.unavailable")
  }
}

function buildTranscriptIssueSeverityLabel(severity: DashboardTranscriptIntegrityIssue["severity"], t: TranscriptTranslate) {
  switch (severity) {
    case "warning":
      return t("transcripts.detail.integrity.severity.warning")
    case "error":
      return t("transcripts.detail.integrity.severity.error")
    default:
      return severity
  }
}

function buildRetentionWindowSummary(preview: DashboardTranscriptRetentionPreview, t: TranscriptTranslate) {
  return t("transcripts.page.operations.retention.windowsValue", {
    failedDays: preview.windows.failedDays,
    revokedDays: preview.windows.revokedDays,
    deletedDays: preview.windows.deletedDays
  })
}

function buildRetentionCandidateRow(basePath: string, candidate: DashboardTranscriptRetentionCandidate, t: TranscriptTranslate) {
  return {
    ...candidate,
    detailHref: joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(candidate.transcriptId)}`),
    updatedLabel: formatDate(candidate.updatedAt),
    ageLabel: t("transcripts.page.operations.retention.ageValue", { count: candidate.ageDays }),
    windowLabel: t("transcripts.page.operations.retention.windowValue", { count: candidate.configuredDays }),
    archiveSizeLabel: formatBytes(candidate.totalBytes),
    statusBadge: {
      label: candidate.status,
      tone: buildTranscriptStatusTone(candidate.status)
    }
  }
}

function formatTranscriptEventDetails(details: DashboardTranscriptEventRecord["details"] | string | null | undefined, emptyValue: string) {
  let value = ""

  if (details === null || details === undefined) {
    value = ""
  } else if (typeof details === "string") {
    value = details
  } else if (Array.isArray(details) || typeof details === "object") {
    try {
      value = JSON.stringify(details)
    } catch {
      value = String(details)
    }
  } else {
    value = String(details)
  }

  if (value.length === 0) return emptyValue
  return value.length > 200 ? `${value.slice(0, 199)}…` : value
}

function buildTranscriptEventTypeLabel(type: string, t: TranscriptTranslate) {
  const key = EVENT_TYPE_LABEL_KEYS[type]
  return key ? t(key) : type
}

function buildTranscriptLinkStatusLabel(status: string, t: TranscriptTranslate) {
  if (status === "expired") {
    return t("transcripts.detail.linksStatuses.expired")
  }

  return status
}

function buildTranscriptEventRow(event: DashboardTranscriptEventRecord, t: TranscriptTranslate) {
  return {
    ...event,
    createdLabel: formatDate(event.createdAt),
    typeLabel: buildTranscriptEventTypeLabel(event.type, t),
    reasonLabel: event.reason && event.reason.length > 0 ? event.reason : t("transcripts.detail.events.reasonEmpty"),
    detailsLabel: formatTranscriptEventDetails(event.details, t("transcripts.detail.events.detailsEmpty"))
  }
}

function buildTranscriptIntegrityIssueRow(issue: DashboardTranscriptIntegrityIssue, t: TranscriptTranslate) {
  return {
    ...issue,
    severityLabel: buildTranscriptIssueSeverityLabel(issue.severity, t),
    severityTone: issue.severity === "error" ? "danger" as TranscriptBadgeTone : "warning" as TranscriptBadgeTone,
    repairableActionsLabel: issue.repairableActions.length > 0
      ? issue.repairableActions.join(", ")
      : t("transcripts.detail.integrity.repairableNone")
  }
}

function sortParticipants(participants: DashboardTranscriptParticipantRecord[]) {
  return [...participants].sort((left, right) => {
    const roleDelta = (PARTICIPANT_ROLE_ORDER[left.role] ?? 99) - (PARTICIPANT_ROLE_ORDER[right.role] ?? 99)
    if (roleDelta !== 0) return roleDelta
    return left.displayName.localeCompare(right.displayName)
  })
}

function sortAssets(assets: DashboardTranscriptAssetRecord[]) {
  return [...assets].sort((left, right) => {
    const statusDelta = (ASSET_STATUS_ORDER[left.status] ?? 99) - (ASSET_STATUS_ORDER[right.status] ?? 99)
    if (statusDelta !== 0) return statusDelta
    return left.assetName.localeCompare(right.assetName)
  })
}

function sortLinks(detail: DashboardTranscriptDetail) {
  return [...detail.links].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt) || 0
    const rightTime = Date.parse(right.createdAt) || 0
    if (leftTime !== rightTime) return rightTime - leftTime
    return right.id.localeCompare(left.id)
  })
}

function isOperationalRecord(value: DashboardTranscriptRecord | DashboardTranscriptOperationalRecord): value is DashboardTranscriptOperationalRecord {
  const candidate = value as Partial<DashboardTranscriptOperationalRecord>
  return typeof candidate.integrityHealth === "string"
    && typeof candidate.repairable === "boolean"
    && typeof candidate.retentionCandidate === "boolean"
    && typeof candidate.canBulkRevoke === "boolean"
    && typeof candidate.canBulkDelete === "boolean"
    && typeof candidate.canExport === "boolean"
}

function isOperationalListResult(
  value: DashboardListTranscriptsResult | DashboardTranscriptOperationalListResult | null
): value is DashboardTranscriptOperationalListResult {
  return Boolean(value && typeof value === "object" && "matchingSummary" in value)
}

function buildIntegrityFilterOptions(t: TranscriptTranslate) {
  return [
    { value: "", label: t("transcripts.page.filters.integrityAll") },
    { value: "healthy", label: t("transcripts.page.filters.integrityHealthy") },
    { value: "warning", label: t("transcripts.page.filters.integrityWarning") },
    { value: "error", label: t("transcripts.page.filters.integrityError") },
    { value: "repairable", label: t("transcripts.page.filters.integrityRepairable") },
    { value: "skipped", label: t("transcripts.page.filters.integritySkipped") }
  ]
}

function buildRetentionFilterOptions(t: TranscriptTranslate) {
  return [
    { value: "", label: t("transcripts.page.filters.retentionAll") },
    { value: "candidate", label: t("transcripts.page.filters.retentionCandidate") },
    { value: "not-candidate", label: t("transcripts.page.filters.retentionNotCandidate") }
  ]
}

function buildSortOptions(t: TranscriptTranslate) {
  return DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS.map((value) => ({
    value,
    label: t(`transcripts.page.filters.sortOptions.${value}`)
  }))
}

function getSelectedOptionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((option) => option.value === value)?.label || value
}

function buildActiveFilterChips(request: TranscriptListRequestModel, t: TranscriptTranslate) {
  const chips: Array<{ label: string; value: string }> = []

  if (request.search) {
    chips.push({ label: t("transcripts.page.activeFilters.search"), value: request.search })
  }
  if (request.status) {
    chips.push({
      label: t("transcripts.page.activeFilters.status"),
      value: getSelectedOptionLabel(request.statusOptions, request.status)
    })
  }
  if (request.integrity) {
    chips.push({
      label: t("transcripts.page.activeFilters.integrity"),
      value: getSelectedOptionLabel(request.integrityOptions, request.integrity)
    })
  }
  if (request.retention) {
    chips.push({
      label: t("transcripts.page.activeFilters.retention"),
      value: getSelectedOptionLabel(request.retentionOptions, request.retention)
    })
  }
  if (request.creatorId) {
    chips.push({ label: t("transcripts.page.activeFilters.creatorId"), value: request.creatorId })
  }
  if (request.channelId) {
    chips.push({ label: t("transcripts.page.activeFilters.channelId"), value: request.channelId })
  }
  if (request.createdFrom) {
    chips.push({ label: t("transcripts.page.activeFilters.createdFrom"), value: request.createdFrom })
  }
  if (request.createdTo) {
    chips.push({ label: t("transcripts.page.activeFilters.createdTo"), value: request.createdTo })
  }
  if (request.sort !== TRANSCRIPT_DEFAULT_SORT) {
    chips.push({
      label: t("transcripts.page.activeFilters.sort"),
      value: getSelectedOptionLabel(request.sortOptions as Array<{ value: string; label: string }>, request.sort)
    })
  }

  return chips
}

function buildFilteredSummaryCards(
  matchingSummary: DashboardTranscriptOperationalMatchingSummary | null,
  total: number,
  t: TranscriptTranslate
) {
  const unavailable = t("common.unavailable")
  const valueFor = (key: keyof DashboardTranscriptOperationalMatchingSummary) => {
    if (matchingSummary) {
      return String(matchingSummary[key])
    }

    return key === "total" ? String(total) : unavailable
  }

  return [
    { label: t("transcripts.page.filteredSummary.total"), value: valueFor("total"), tone: "muted" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.active"), value: valueFor("active"), tone: "success" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.partial"), value: valueFor("partial"), tone: "warning" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.revoked"), value: valueFor("revoked"), tone: "warning" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.deleted"), value: valueFor("deleted"), tone: "muted" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.failed"), value: valueFor("failed"), tone: "danger" as TranscriptBadgeTone },
    { label: t("transcripts.page.filteredSummary.building"), value: valueFor("building"), tone: "muted" as TranscriptBadgeTone }
  ]
}

function buildTranscriptAccessNotices(
  accessPolicy: DashboardTranscriptAccessPolicy | null,
  viewerRouteReadiness: { ready: boolean; message: string } | null,
  t: TranscriptTranslate
): TranscriptAccessNotice[] {
  if (!accessPolicy || accessPolicy.mode !== "private-discord") {
    return []
  }

  const notices: TranscriptAccessNotice[] = [
    {
      tone: "warning",
      title: t("transcripts.access.privateModeTitle"),
      message: t("transcripts.access.privateModeBody")
    }
  ]

  if (!accessPolicy.viewerReady) {
    notices.push({
      tone: "warning",
      title: t("transcripts.access.viewerLinkWarningTitle"),
      message: accessPolicy.message
    })
  }

  if (viewerRouteReadiness && !viewerRouteReadiness.ready) {
    notices.push({
      tone: "warning",
      title: t("transcripts.access.viewerRouteWarningTitle"),
      message: viewerRouteReadiness.message
    })
  }

  return notices
}

export function parseTranscriptListRequest(query: Record<string, unknown>, t: TranscriptTranslate): TranscriptListRequestModel {
  const parsedLimit = Number(query.limit)
  const limitProvided = TRANSCRIPT_LIMIT_OPTIONS.includes(parsedLimit as any)
  const limit = limitProvided
    ? parsedLimit
    : TRANSCRIPT_LIMIT_OPTIONS[0]
  const page = parsePositiveInteger(query.page, 1)
  const status = normalizeStatus(query.status)
  const integrity = normalizeIntegrity(query.integrity)
  const retention = normalizeRetention(query.retention)
  const creatorId = normalizeTranscriptExactFilter(query.creatorId)
  const channelId = normalizeTranscriptExactFilter(query.channelId)
  const createdFrom = normalizeTranscriptDateFilter(query.createdFrom)
  const createdTo = normalizeTranscriptDateFilter(query.createdTo)
  const sort = normalizeTranscriptSort(query.sort)
  const sortProvided = typeof query.sort === "string"
    && DASHBOARD_TRANSCRIPT_OPERATIONAL_SORTS.includes(query.sort.trim() as DashboardTranscriptOperationalSort)

  return {
    search: normalizeSearch(query.q),
    status,
    integrity,
    retention,
    creatorId,
    channelId,
    createdFrom,
    createdTo,
    sort,
    sortProvided,
    limitProvided,
    page,
    limit,
    offset: (page - 1) * limit,
    statusOptions: [
      { value: "", label: t("transcripts.page.filters.statusAll") },
      ...DASHBOARD_TRANSCRIPT_STATUSES.map((value) => ({
        value,
        label: t(`transcripts.page.filters.status.${value}`)
      }))
    ],
    integrityOptions: buildIntegrityFilterOptions(t),
    retentionOptions: buildRetentionFilterOptions(t),
    sortOptions: buildSortOptions(t),
    limitOptions: [...TRANSCRIPT_LIMIT_OPTIONS]
  }
}

export function parseTranscriptEventsRequest(query: Record<string, unknown>): TranscriptEventsRequestModel {
  const page = parsePositiveInteger(query.eventsPage, 1)
  return {
    page,
    limit: TRANSCRIPT_EVENT_PAGE_SIZE,
    offset: (page - 1) * TRANSCRIPT_EVENT_PAGE_SIZE
  }
}

export function sanitizeTranscriptWorkspaceReturnTo(basePath: string, candidate: unknown) {
  const fallback = joinBasePath(basePath, "admin/transcripts")
  const safe = sanitizeReturnTo(basePath, candidate, fallback)
  return safe === fallback || safe.startsWith(`${fallback}?`) || safe.startsWith(`${fallback}/`)
    ? safe
    : fallback
}

export function buildTranscriptAvailabilityAlert(
  integration: DashboardTranscriptIntegration,
  options: { alwaysWhenUnavailable?: boolean } = {}
) {
  if (integration.state === "ready") return null
  if (!options.alwaysWhenUnavailable && !integration.htmlMode) return null

  return {
    tone: integration.htmlMode ? "danger" : "warning",
    message: integration.message
  }
}

export function buildTranscriptSummaryCards(
  integration: DashboardTranscriptIntegration,
  summary: DashboardTranscriptSummary | null
) {
  const integrationLabel = buildIntegrationLabel(integration)
  const integrationTone = buildIntegrationTone(integration)

  if (!summary) {
    return [
      { label: "Integration", value: integrationLabel, detail: integration.message, tone: integrationTone },
      { label: "Configured mode", value: (integration.mode || "unknown").toUpperCase(), detail: "Read from config/transcripts.json", tone: "muted" as TranscriptBadgeTone },
      { label: "Installed plugin", value: integration.plugin ? "Yes" : "No", detail: integration.plugin?.shortDescription || "The transcript plugin is not discoverable by the dashboard.", tone: "muted" as TranscriptBadgeTone },
      { label: "Archive data", value: "Unavailable", detail: "Summary data appears once the transcript service reports healthy.", tone: "muted" as TranscriptBadgeTone }
    ]
  }

  return [
    { label: "Integration", value: integrationLabel, detail: integration.message, tone: integrationTone },
    { label: "Archived transcripts", value: String(summary.total), detail: `${summary.active} active, ${summary.partial} partial, ${summary.revoked} revoked`, tone: "muted" as TranscriptBadgeTone },
    { label: "Failures", value: String(summary.failed), detail: `${summary.deleted} deleted, ${summary.building} building`, tone: summary.failed > 0 ? "danger" : "muted" as TranscriptBadgeTone },
    { label: "Archive size", value: formatBytes(summary.totalArchiveBytes), detail: `${summary.queueDepth} queued, ${summary.recoveredBuilds} recovered on startup`, tone: "muted" as TranscriptBadgeTone }
  ]
}

export function buildTranscriptListModel(
  basePath: string,
  integration: DashboardTranscriptIntegration,
  request: TranscriptListRequestModel,
  summary: DashboardTranscriptSummary | null,
  result: DashboardListTranscriptsResult | DashboardTranscriptOperationalListResult | null,
  options: {
    translate: TranscriptTranslate
    operationsAvailability: TranscriptOperationsReadAvailability
    writeAvailability: TranscriptOperationsWriteAvailability
    integritySummary: DashboardTranscriptIntegritySummary | null
    retentionPreview: DashboardTranscriptRetentionPreview | null
    accessPolicy: DashboardTranscriptAccessPolicy | null
    viewerRouteReadiness: { ready: boolean; message: string } | null
    operationsWarningMessage?: string
  }
) {
  const { translate: t, operationsAvailability, integritySummary, retentionPreview } = options
  const operations = buildTranscriptOperationsReadModel(operationsAvailability, t, options.operationsWarningMessage)

  const total = result?.total || 0
  const matchingSummary = isOperationalListResult(result) ? result.matchingSummary : null
  const items = (result?.items || []).map((record) => {
    const operational = isOperationalRecord(record)
    const bulkCapabilities = operational ? {
      canBulkRevoke: record.canBulkRevoke,
      canBulkDelete: record.canBulkDelete,
      canExport: record.canExport
    } : null

    return {
      ...record,
      statusBadge: {
        label: record.status,
        tone: buildTranscriptStatusTone(record.status)
      },
      createdLabel: formatDate(record.createdAt),
      updatedLabel: formatDate(record.updatedAt),
      totalBytesLabel: formatBytes(record.totalBytes),
      publicUrlLabel: record.publicUrl || "Unavailable",
      searchText: buildSearchText(record),
      selection: options.writeAvailability === "available"
        ? {
            value: record.id,
            canBulkRevoke: bulkCapabilities?.canBulkRevoke ?? false,
            canBulkDelete: bulkCapabilities?.canBulkDelete ?? false,
            canExport: bulkCapabilities?.canExport ?? false
          }
        : null
    }
  })

  const pageCount = total > 0 ? Math.ceil(total / request.limit) : 0
  const currentPage = pageCount > 0 ? Math.min(request.page, pageCount) : 1
  const currentOffset = (currentPage - 1) * request.limit
  const pageStart = total > 0 ? currentOffset + 1 : 0
  const pageEnd = total > 0 ? Math.min(currentOffset + request.limit, total) : 0
  const currentListHref = buildListHref(basePath, request, currentPage)
  const pageLinks = pageCount > 0
    ? Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
        const firstPage = Math.max(1, Math.min(currentPage - 2, pageCount - 4))
        const page = firstPage + index
        if (page > pageCount) return null
        return {
          page,
          active: page === currentPage,
          href: buildListHref(basePath, request, page)
        }
      }).filter(Boolean)
    : []

  return {
    integration: {
      ...integration,
      badge: {
        label: buildIntegrationLabel(integration),
        tone: buildIntegrationTone(integration)
      }
    },
    filterAction: joinBasePath(basePath, "admin/transcripts"),
    clearFiltersHref: buildClearFiltersHref(basePath, request),
    configHref: joinBasePath(basePath, "visual/transcripts"),
    pluginHref: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(TRANSCRIPT_DASHBOARD_PLUGIN_ID)}`),
    accessNotices: buildTranscriptAccessNotices(options.accessPolicy, options.viewerRouteReadiness, t),
    request,
    filteredSummary: {
      cards: buildFilteredSummaryCards(matchingSummary, total, t)
    },
    activeFilters: buildActiveFilterChips(request, t),
    bulkActions: options.writeAvailability === "available"
      ? {
          available: true,
          revokeAction: buildBulkRouteHref(basePath, "revoke"),
          deleteAction: buildBulkRouteHref(basePath, "delete"),
          exportAction: buildBulkRouteHref(basePath, "export"),
          returnTo: sanitizeTranscriptWorkspaceReturnTo(basePath, currentListHref)
        }
      : null,
    summaryCards: buildTranscriptSummaryCards(integration, summary),
    operations: {
      ...operations,
      integrity: integritySummary
        ? {
            scannedAtLabel: formatDate(integritySummary.scannedAt),
            counts: [
              { label: t("transcripts.page.operations.integrity.healthy"), value: String(integritySummary.healthy), tone: "success" as TranscriptBadgeTone },
              { label: t("transcripts.page.operations.integrity.warning"), value: String(integritySummary.warning), tone: "warning" as TranscriptBadgeTone },
              { label: t("transcripts.page.operations.integrity.error"), value: String(integritySummary.error), tone: "danger" as TranscriptBadgeTone },
              { label: t("transcripts.page.operations.integrity.repairable"), value: String(integritySummary.repairable), tone: integritySummary.repairable > 0 ? "warning" as TranscriptBadgeTone : "muted" as TranscriptBadgeTone },
              { label: t("transcripts.page.operations.integrity.skipped"), value: String(integritySummary.skipped), tone: "muted" as TranscriptBadgeTone }
            ]
          }
        : null,
      retention: retentionPreview
        ? {
            enabled: retentionPreview.enabled,
            enabledLabel: retentionPreview.enabled
              ? t("transcripts.page.summary.retentionEnabled")
              : t("transcripts.page.summary.retentionDisabled"),
            startupLabel: retentionPreview.runOnStartup
              ? t("transcripts.page.operations.retention.startupOn")
              : t("transcripts.page.operations.retention.startupOff"),
            windowsLabel: buildRetentionWindowSummary(retentionPreview, t),
            maxTranscriptsPerRunLabel: String(retentionPreview.maxTranscriptsPerRun),
            totalCandidates: retentionPreview.totalCandidates,
            candidates: retentionPreview.candidates.map((candidate) => buildRetentionCandidateRow(basePath, candidate, t))
          }
        : null
    },
    total,
    page: currentPage,
    pageCount,
    pageStart,
    pageEnd,
    currentHref: currentListHref,
    previousHref: currentPage > 1 ? buildListHref(basePath, request, currentPage - 1) : null,
    nextHref: currentPage < pageCount ? buildListHref(basePath, request, currentPage + 1) : null,
    pageLinks,
    items: items.map((item) => ({
      ...item,
      detailHref: buildTranscriptDetailHref(basePath, item.id, currentListHref)
    }))
  }
}

export function buildTranscriptDetailModel(
  basePath: string,
  integration: DashboardTranscriptIntegration,
  detail: DashboardTranscriptDetail,
  options: {
    translate: TranscriptTranslate
    operationsAvailability: TranscriptOperationsReadAvailability
    writeAvailability: TranscriptOperationsWriteAvailability
    integrityReport: DashboardTranscriptIntegrityReport | null
    eventsResult: DashboardListTranscriptEventsResult | null
    eventsRequest: TranscriptEventsRequestModel
    accessPolicy: DashboardTranscriptAccessPolicy | null
    viewerRouteReadiness: { ready: boolean; message: string } | null
    returnTo?: unknown
    integrityWarningMessage?: string
    eventWarningMessage?: string
  }
) {
  const { translate: t, integrityReport, eventsResult, eventsRequest } = options
  const transcript = detail.transcript
  const transcriptListHref = joinBasePath(basePath, "admin/transcripts")
  const backHref = sanitizeTranscriptWorkspaceReturnTo(basePath, options.returnTo)
  const detailReturnTo = backHref === transcriptListHref ? null : backHref
  const ready = integration.state === "ready"
  const canRevoke = ready && Boolean(transcript.activeSlug)
  const canReissue = ready && transcript.status !== "deleted"
  const canDelete = ready && transcript.status !== "deleted"
  const operations = buildTranscriptOperationsReadModel(options.operationsAvailability, t)
  const integrityAvailability = integrityReport
    ? buildTranscriptOperationsReadModel("available", t)
    : buildTranscriptOperationsReadModel(
        options.operationsAvailability === "available" ? "unavailable" : options.operationsAvailability,
        t,
        options.integrityWarningMessage
      )
  const eventsAvailability = eventsResult
    ? buildTranscriptOperationsReadModel("available", t)
    : buildTranscriptOperationsReadModel(
        options.operationsAvailability === "available" ? "unavailable" : options.operationsAvailability,
        t,
        options.eventWarningMessage
      )

  const eventsTotal = eventsResult?.total || 0
  const eventsPageStart = eventsTotal > 0 && (eventsResult?.items.length || 0) > 0
    ? eventsRequest.offset + 1
    : 0
  const eventsPageEnd = eventsTotal > 0 && (eventsResult?.items.length || 0) > 0
    ? Math.min(eventsRequest.offset + (eventsResult?.items.length || 0), eventsTotal)
    : 0

  return {
    integration: {
      ...integration,
      badge: {
        label: buildIntegrationLabel(integration),
        tone: buildIntegrationTone(integration)
      }
    },
    operations,
    transcript: {
      ...transcript,
      statusBadge: {
        label: transcript.status,
        tone: buildTranscriptStatusTone(transcript.status)
      },
      createdLabel: formatDate(transcript.createdAt),
      updatedLabel: formatDate(transcript.updatedAt),
      totalBytesLabel: formatBytes(transcript.totalBytes),
      publicUrlLabel: transcript.publicUrl || "Unavailable",
      exportAction: buildDetailExportHref(basePath, transcript.id),
      revokeAction: joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcript.id)}/revoke`),
      reissueAction: joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcript.id)}/reissue`),
      deleteAction: joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(transcript.id)}/delete`),
      canExport: options.writeAvailability === "available",
      exportUnavailableMessage: options.writeAvailability === "available"
        ? null
        : t("transcripts.detail.operations.exportUnavailable"),
      canRevoke,
      canReissue,
      canDelete
    },
    accessNotices: buildTranscriptAccessNotices(options.accessPolicy, options.viewerRouteReadiness, t),
    integrity: integrityReport
      ? {
          available: true,
          badge: {
            label: buildTranscriptIntegrityHealthLabel(integrityReport.health, t),
            tone: buildIntegrityHealthTone(integrityReport.health)
          },
          scannedAtLabel: formatDate(integrityReport.scannedAt),
          facts: [
            { label: t("transcripts.detail.integrity.facts.archiveSafe"), value: integrityReport.archivePathSafe ? t("common.yes") : t("common.no") },
            { label: t("transcripts.detail.integrity.facts.archivePresent"), value: integrityReport.archivePresent ? t("common.yes") : t("common.no") },
            { label: t("transcripts.detail.integrity.facts.documentPresent"), value: integrityReport.documentPresent ? t("common.yes") : t("common.no") },
            { label: t("transcripts.detail.integrity.facts.htmlPresent"), value: integrityReport.htmlPresent ? t("common.yes") : t("common.no") }
          ],
          issues: integrityReport.issues.map((issue) => buildTranscriptIntegrityIssueRow(issue, t)),
          repairableActionsLabel: integrityReport.repairableActions.length > 0
            ? integrityReport.repairableActions.join(", ")
            : t("transcripts.detail.integrity.repairableNone")
        }
      : {
          available: false,
          badge: integrityAvailability.badge,
          warningMessage: integrityAvailability.warningMessage
        },
    backHref,
    configHref: joinBasePath(basePath, "visual/transcripts"),
    pluginHref: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(TRANSCRIPT_DASHBOARD_PLUGIN_ID)}`),
    events: eventsResult
      ? {
          available: true,
          badge: {
            label: t("transcripts.detail.events.badges.available"),
            tone: "success" as TranscriptBadgeTone
          },
          items: eventsResult.items.map((item) => buildTranscriptEventRow(item, t)),
          total: eventsTotal,
          page: eventsRequest.page,
          pageStart: eventsPageStart,
          pageEnd: eventsPageEnd,
          previousHref: eventsRequest.page > 1 ? buildDetailEventsHref(basePath, transcript.id, eventsRequest.page - 1, detailReturnTo) : null,
          nextHref: eventsTotal > eventsRequest.offset + eventsResult.items.length ? buildDetailEventsHref(basePath, transcript.id, eventsRequest.page + 1, detailReturnTo) : null
        }
      : {
          available: false,
          badge: eventsAvailability.badge,
          warningMessage: eventsAvailability.warningMessage,
          items: [],
          total: 0,
          page: eventsRequest.page,
          pageStart: 0,
          pageEnd: 0,
          previousHref: null,
          nextHref: null
        },
    links: sortLinks(detail).map((link) => ({
      ...link,
      statusBadge: {
        label: buildTranscriptLinkStatusLabel(link.status, t),
        tone: buildTranscriptStatusTone(link.status)
      },
      createdLabel: formatDate(link.createdAt),
      expiresLabel: formatDate(link.expiresAt),
      expiredLabel: formatDate(link.expiredAt),
      revokedLabel: formatDate(link.revokedAt)
    })),
    participants: sortParticipants(detail.participants),
    assets: sortAssets(detail.assets).map((asset) => ({
      ...asset,
      statusBadge: {
        label: asset.status,
        tone: buildTranscriptStatusTone(asset.status)
      },
      byteSizeLabel: formatBytes(asset.byteSize)
    }))
  }
}

export function buildTranscriptIntegritySummaryCard(
  integritySummary: DashboardTranscriptIntegritySummary | null,
  availability: TranscriptOperationsReadAvailability,
  t: TranscriptTranslate
) {
  if (!integritySummary || availability !== "available") {
    return {
      label: t("transcripts.page.summary.integrityLabel"),
      value: t("common.unavailable"),
      detail: t("transcripts.page.summary.unavailableDetail"),
      tone: "muted" as TranscriptBadgeTone
    }
  }

  return {
    label: t("transcripts.page.summary.integrityLabel"),
    value: String(integritySummary.total),
    detail: t("transcripts.page.summary.integrityDetail", {
      error: integritySummary.error,
      warning: integritySummary.warning,
      repairable: integritySummary.repairable
    }),
    tone: integritySummary.error > 0
      ? "danger" as TranscriptBadgeTone
      : integritySummary.warning > 0 || integritySummary.repairable > 0
        ? "warning" as TranscriptBadgeTone
        : "success" as TranscriptBadgeTone
  }
}

export function buildTranscriptRetentionSummaryCard(
  retentionPreview: DashboardTranscriptRetentionPreview | null,
  availability: TranscriptOperationsReadAvailability,
  t: TranscriptTranslate
) {
  if (!retentionPreview || availability !== "available") {
    return {
      label: t("transcripts.page.summary.retentionLabel"),
      value: t("common.unavailable"),
      detail: t("transcripts.page.summary.unavailableDetail"),
      tone: "muted" as TranscriptBadgeTone
    }
  }

  return {
    label: t("transcripts.page.summary.retentionLabel"),
    value: retentionPreview.enabled
      ? t("transcripts.page.summary.retentionEnabled")
      : t("transcripts.page.summary.retentionDisabled"),
    detail: t("transcripts.page.summary.retentionDetail", {
      totalCandidates: retentionPreview.totalCandidates,
      startupState: retentionPreview.runOnStartup
        ? t("transcripts.page.operations.retention.startupOn")
        : t("transcripts.page.operations.retention.startupOff")
    }),
    tone: !retentionPreview.enabled
      ? "muted" as TranscriptBadgeTone
      : retentionPreview.totalCandidates > 0
        ? "warning" as TranscriptBadgeTone
        : "success" as TranscriptBadgeTone
  }
}

export function buildTranscriptDetailIntegritySummaryCard(
  integrityReport: DashboardTranscriptIntegrityReport | null,
  availability: TranscriptOperationsReadAvailability,
  t: TranscriptTranslate
) {
  if (!integrityReport || availability !== "available") {
    return {
      label: t("transcripts.detail.summary.integrity"),
      value: t("common.unavailable"),
      detail: t("transcripts.detail.summary.integrityUnavailableDetail"),
      tone: "muted" as TranscriptBadgeTone
    }
  }

  return {
    label: t("transcripts.detail.summary.integrity"),
    value: buildTranscriptIntegrityHealthLabel(integrityReport.health, t),
    detail: t("transcripts.detail.summary.integrityDetail", {
      count: integrityReport.issues.length,
      repairable: integrityReport.repairableActions.length
    }),
    tone: buildIntegrityHealthTone(integrityReport.health)
  }
}
