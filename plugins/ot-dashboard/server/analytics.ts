import type { DashboardConfigService } from "./config-service"
import { joinBasePath } from "./dashboard-config"
import type { DashboardSummaryCardInput, DashboardTone } from "./control-center"
import { supportsTicketTelemetryReads, type DashboardRuntimeBridge } from "./runtime-bridge"
import type { DashboardTicketRecord } from "./dashboard-runtime-registry"
import type {
  DashboardTicketFeedbackTelemetryRecord,
  DashboardTicketLifecycleTelemetryRecord,
  DashboardTicketTelemetrySignals
} from "./ticket-workbench-types"
import type {
  DashboardTicketAnalyticsHistoryRecord,
  DashboardTranscriptTicketAnalyticsHistoryService
} from "./transcript-service-bridge"

export type DashboardAnalyticsWindow = "7d" | "30d" | "90d" | "custom"
export type DashboardAnalyticsTransport = "all" | "channel_text" | "private_thread"
export type DashboardAnalyticsHistoryState = "available" | "unavailable" | "truncated"

export interface DashboardAnalyticsRequest {
  window: DashboardAnalyticsWindow
  from: string
  to: string
  teamId: string
  assigneeId: string
  transport: DashboardAnalyticsTransport
  openedFromMs: number
  openedToMs: number
  activeFilters: Array<{ label: string; value: string }>
  windowOptions: DashboardAnalyticsWindow[]
  transportOptions: DashboardAnalyticsTransport[]
}

interface AnalyticsTicketRecord {
  source: "live" | "archive"
  ticketId: string | null
  transcriptId: string | null
  creatorId: string | null
  openedAt: number | null
  closedAt: number | null
  resolvedAt: number | null
  firstStaffResponseAt: number | null
  assignedTeamId: string | null
  assignedStaffUserId: string | null
  transportMode: "channel_text" | "private_thread" | null
  open: boolean
}

export interface DashboardAnalyticsMetricCell {
  value: string
  detail: string
  available: boolean
  lowSample: boolean
}

export type DashboardAnalyticsExportSummaryCardStatus = "available" | "unavailable" | "low-sample"

export interface DashboardAnalyticsExportSummaryCard {
  key: string
  label: string
  value: string
  status: DashboardAnalyticsExportSummaryCardStatus
  warning: string | null
}

export interface DashboardAnalyticsTableRow {
  key: string
  label: string
  count: number
  medianFirstResponseMs: number | null
  p95FirstResponseMs: number | null
  medianResolutionMs: number | null
  p95ResolutionMs: number | null
  firstResponse: DashboardAnalyticsMetricCell
  firstResponseP95: DashboardAnalyticsMetricCell
  resolution: DashboardAnalyticsMetricCell
  resolutionP95: DashboardAnalyticsMetricCell
  missingFirstResponse: number
  missingResolution: number
}

export interface DashboardAnalyticsBacklogRow {
  key: string
  label: string
  count: number
  detail: string
}

export interface DashboardAnalyticsFeedbackOutcomeRow {
  key: string
  label: string
  total: number
  completed: number
  ignored: number
  deliveryFailed: number
  completionRate: DashboardAnalyticsMetricCell
  ignoredRate: DashboardAnalyticsMetricCell
}

export interface DashboardAnalyticsRatingRow {
  questionKey: string
  questionLabel: string
  responses: number
  averageRating: string
  medianRating: string
  lowSample: boolean
}

export interface DashboardAnalyticsReopenRateRow {
  key: string
  label: string
  reopenedTickets: number
  closedTickets: number
  reopenRate: DashboardAnalyticsMetricCell
}

export interface DashboardAnalyticsModel {
  request: DashboardAnalyticsRequest
  filterAction: string
  clearFiltersHref: string
  historyState: DashboardAnalyticsHistoryState
  historyWarnings: string[]
  telemetryState: DashboardAnalyticsHistoryState
  telemetryWarnings: string[]
  summaryCards: DashboardSummaryCardInput[]
  exportSummaryCards: DashboardAnalyticsExportSummaryCard[]
  exportActions: {
    jsonAction: string
    csvAction: string
    returnTo: string
  }
  qualityReviewHref: string | null
  backlogByTeam: DashboardAnalyticsBacklogRow[]
  backlogByAssignee: DashboardAnalyticsBacklogRow[]
  backlogByTransport: DashboardAnalyticsBacklogRow[]
  cohortByTeam: DashboardAnalyticsTableRow[]
  cohortByTransport: DashboardAnalyticsTableRow[]
  feedbackByTeam: DashboardAnalyticsFeedbackOutcomeRow[]
  feedbackByTransport: DashboardAnalyticsFeedbackOutcomeRow[]
  ratingQuestions: DashboardAnalyticsRatingRow[]
  reopenRateByTeam: DashboardAnalyticsReopenRateRow[]
  reopenRateByTransport: DashboardAnalyticsReopenRateRow[]
  reopenedBacklogByTeam: DashboardAnalyticsBacklogRow[]
  reopenedBacklogByTransport: DashboardAnalyticsBacklogRow[]
}

const DEFAULT_WINDOW: DashboardAnalyticsWindow = "30d"
const WINDOW_DAYS: Record<Exclude<DashboardAnalyticsWindow, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
}
const HISTORY_PAGE_LIMIT = 200
const HISTORY_MAX_PAGES = 10
const HISTORY_MAX_RECORDS = 2000
const TELEMETRY_PAGE_LIMIT = 200
const TELEMETRY_MAX_PAGES = 10
const TELEMETRY_MAX_RECORDS = 2000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeTransport(value: unknown): DashboardAnalyticsTransport {
  return value === "channel_text" || value === "private_thread" ? value : "all"
}

function normalizeWindow(value: unknown): DashboardAnalyticsWindow {
  return value === "7d" || value === "90d" || value === "custom" ? value : DEFAULT_WINDOW
}

function parseUtcDateStart(value: string) {
  if (!DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const check = new Date(timestamp)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  return timestamp
}

function yyyyMmDd(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function appendQuery(href: string, entries: Record<string, string | number>) {
  const url = new URL(`http://dashboard.local${href}`)
  for (const [key, value] of Object.entries(entries)) {
    if (String(value).length > 0) {
      url.searchParams.set(key, String(value))
    }
  }
  return `${url.pathname}${url.search}`
}

function buildAnalyticsHref(basePath: string, request: DashboardAnalyticsRequest) {
  return appendQuery(joinBasePath(basePath, "admin/analytics"), {
    window: request.window,
    from: request.from,
    to: request.to,
    transport: request.transport === "all" ? "" : request.transport,
    teamId: request.teamId,
    assigneeId: request.assigneeId
  })
}

function buildWindowRange(query: Record<string, unknown>, now: number) {
  const requestedWindow = normalizeWindow(query.window)
  if (requestedWindow === "custom") {
    const fromText = normalizeString(query.from)
    const toText = normalizeString(query.to)
    const fromMs = parseUtcDateStart(fromText)
    const toStartMs = parseUtcDateStart(toText)
    if (fromMs != null && toStartMs != null) {
      const toExclusiveMs = toStartMs + 86_400_000
      if (fromMs < toExclusiveMs) {
        return {
          window: "custom" as const,
          from: fromText,
          to: toText,
          openedFromMs: fromMs,
          openedToMs: toExclusiveMs
        }
      }
    }
  }

  const window = requestedWindow === "custom" ? DEFAULT_WINDOW : requestedWindow
  const end = now
  const start = end - WINDOW_DAYS[window] * 86_400_000
  return {
    window,
    from: yyyyMmDd(start),
    to: yyyyMmDd(end),
    openedFromMs: start,
    openedToMs: end
  }
}

export function parseDashboardAnalyticsRequest(
  query: Record<string, unknown>,
  options: {
    now?: number
    teamLabel?: (teamId: string) => string
    t?: (key: string, variables?: Record<string, string | number>) => string
  } = {}
): DashboardAnalyticsRequest {
  const now = options.now ?? Date.now()
  const t = options.t || ((key: string) => key)
  const range = buildWindowRange(query, now)
  const teamId = normalizeString(query.teamId)
  const assigneeId = normalizeString(query.assigneeId)
  const transport = normalizeTransport(query.transport)
  const activeFilters: Array<{ label: string; value: string }> = []
  if (teamId) activeFilters.push({ label: t("analytics.page.filters.teamLabel"), value: options.teamLabel?.(teamId) || teamId })
  if (assigneeId) activeFilters.push({ label: t("analytics.page.filters.assigneeLabel"), value: assigneeId })
  if (transport !== "all") activeFilters.push({ label: t("analytics.page.filters.transportLabel"), value: transportLabel(transport, t) })

  return {
    ...range,
    teamId,
    assigneeId,
    transport,
    activeFilters,
    windowOptions: ["7d", "30d", "90d", "custom"],
    transportOptions: ["all", "channel_text", "private_thread"]
  }
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function liveTicketToAnalytics(ticket: DashboardTicketRecord): AnalyticsTicketRecord {
  return {
    source: "live",
    ticketId: ticket.id,
    transcriptId: null,
    creatorId: ticket.creatorId,
    openedAt: numberOrNull(ticket.openedOn),
    closedAt: numberOrNull(ticket.closedOn),
    resolvedAt: numberOrNull(ticket.resolvedAt),
    firstStaffResponseAt: numberOrNull(ticket.firstStaffResponseAt),
    assignedTeamId: ticket.assignedTeamId,
    assignedStaffUserId: ticket.assignedStaffUserId,
    transportMode: ticket.transportMode,
    open: ticket.open && !ticket.closed
  }
}

function archivedTicketToAnalytics(record: DashboardTicketAnalyticsHistoryRecord): AnalyticsTicketRecord {
  return {
    source: "archive",
    ticketId: record.ticketId,
    transcriptId: record.transcriptId,
    creatorId: record.creatorId,
    openedAt: record.openedAt,
    closedAt: record.closedAt,
    resolvedAt: record.resolvedAt,
    firstStaffResponseAt: record.firstStaffResponseAt,
    assignedTeamId: record.assignedTeamId,
    assignedStaffUserId: record.assignedStaffUserId,
    transportMode: record.transportMode,
    open: false
  }
}

function matchesFilters(record: AnalyticsTicketRecord, request: DashboardAnalyticsRequest) {
  if (request.teamId && record.assignedTeamId !== request.teamId) return false
  if (request.assigneeId && record.assignedStaffUserId !== request.assigneeId) return false
  if (request.transport !== "all" && record.transportMode !== request.transport) return false
  return true
}

function isInWindow(record: AnalyticsTicketRecord, request: DashboardAnalyticsRequest) {
  return record.openedAt != null && record.openedAt >= request.openedFromMs && record.openedAt < request.openedToMs
}

function percentileNearestRank(samples: number[], percentile: number) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1)
  return sorted[Math.min(index, sorted.length - 1)]
}

export function medianDurationMs(samples: number[]) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function medianNumber(samples: number[]) {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function p95DurationMs(samples: number[]) {
  return percentileNearestRank(samples, 0.95)
}

function collectDurations(records: AnalyticsTicketRecord[], field: "firstStaffResponseAt" | "resolvedAt") {
  const samples: number[] = []
  let missing = 0
  for (const record of records) {
    const start = record.openedAt
    const end = record[field]
    if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      missing += 1
      continue
    }
    samples.push(end - start)
  }
  return { samples, missing }
}

function formatDuration(ms: number | null, t: (key: string, variables?: Record<string, string | number>) => string) {
  if (ms == null) return t("common.unavailable")
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainderMinutes = minutes % 60
  if (hours < 24) return remainderMinutes > 0 ? `${hours}h ${remainderMinutes}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`
}

function metricCell(samples: number[], value: number | null, missing: number, t: (key: string, variables?: Record<string, string | number>) => string): DashboardAnalyticsMetricCell {
  if (value == null || samples.length === 0) {
    return {
      value: t("common.unavailable"),
      detail: missing > 0 ? t("analytics.page.missingData", { count: missing }) : t("analytics.page.noValidSamples"),
      available: false,
      lowSample: false
    }
  }
  const lowSample = samples.length > 0 && samples.length < 5
  return {
    value: formatDuration(value, t),
    detail: lowSample ? t("analytics.page.lowSampleDetail", { count: samples.length }) : t("analytics.page.sampleCount", { count: samples.length }),
    available: true,
    lowSample
  }
}

function summaryMetricCard(label: string, cell: DashboardAnalyticsMetricCell): DashboardSummaryCardInput {
  return {
    label,
    value: cell.value,
    detail: cell.detail,
    tone: cell.available ? cell.lowSample ? "warning" : "success" : "muted"
  }
}

function countCard(label: string, value: number | null, detail: string, tone?: DashboardTone): DashboardSummaryCardInput {
  return {
    label,
    value: value == null ? "Unavailable" : String(value),
    detail,
    tone: tone || (value == null ? "muted" : "success")
  }
}

function rateMetricCell(
  numerator: number,
  denominator: number,
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsMetricCell {
  if (denominator < 1) {
    return {
      value: t("common.unavailable"),
      detail: t("analytics.telemetry.noRateDenominator"),
      available: false,
      lowSample: false
    }
  }

  const lowSample = denominator > 0 && denominator < 5
  return {
    value: `${Math.round((numerator / denominator) * 1000) / 10}%`,
    detail: lowSample
      ? t("analytics.page.lowSampleDetail", { count: denominator })
      : t("analytics.telemetry.rateDetail", { numerator, denominator }),
    available: true,
    lowSample
  }
}

function rateCard(label: string, cell: DashboardAnalyticsMetricCell): DashboardSummaryCardInput {
  return {
    label,
    value: cell.value,
    detail: cell.detail,
    tone: cell.available ? cell.lowSample ? "warning" : "success" : "muted"
  }
}

function metricExportSummaryCard(
  key: string,
  label: string,
  cell: DashboardAnalyticsMetricCell
): DashboardAnalyticsExportSummaryCard {
  const status: DashboardAnalyticsExportSummaryCardStatus = cell.available
    ? cell.lowSample ? "low-sample" : "available"
    : "unavailable"
  return {
    key,
    label,
    value: cell.value,
    status,
    warning: status === "available" ? null : cell.detail
  }
}

function countExportSummaryCard(
  key: string,
  label: string,
  value: number | null,
  unavailableWarning: string | null = null
): DashboardAnalyticsExportSummaryCard {
  const available = value != null
  return {
    key,
    label,
    value: available ? String(value) : "Unavailable",
    status: available ? "available" : "unavailable",
    warning: available ? null : unavailableWarning
  }
}

function formatRatingValue(value: number | null, t: (key: string, variables?: Record<string, string | number>) => string) {
  return value == null ? t("common.unavailable") : value.toFixed(1)
}

function groupRows(
  records: AnalyticsTicketRecord[],
  getKey: (record: AnalyticsTicketRecord) => string,
  getLabel: (key: string) => string,
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsTableRow[] {
  const groups = new Map<string, AnalyticsTicketRecord[]>()
  for (const record of records) {
    const key = getKey(record)
    groups.set(key, [...(groups.get(key) || []), record])
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const firstResponse = collectDurations(group, "firstStaffResponseAt")
      const resolution = collectDurations(group, "resolvedAt")
      const medianFirstResponseMs = medianDurationMs(firstResponse.samples)
      const p95FirstResponseMs = p95DurationMs(firstResponse.samples)
      const medianResolutionMs = medianDurationMs(resolution.samples)
      const p95ResolutionMs = p95DurationMs(resolution.samples)
      return {
        key,
        label: getLabel(key),
        count: group.length,
        medianFirstResponseMs,
        p95FirstResponseMs,
        medianResolutionMs,
        p95ResolutionMs,
        firstResponse: metricCell(firstResponse.samples, medianFirstResponseMs, firstResponse.missing, t),
        firstResponseP95: metricCell(firstResponse.samples, p95FirstResponseMs, firstResponse.missing, t),
        resolution: metricCell(resolution.samples, medianResolutionMs, resolution.missing, t),
        resolutionP95: metricCell(resolution.samples, p95ResolutionMs, resolution.missing, t),
        missingFirstResponse: firstResponse.missing,
        missingResolution: resolution.missing
      }
    })
}

function backlogRows(
  records: AnalyticsTicketRecord[],
  getKey: (record: AnalyticsTicketRecord) => string,
  getLabel: (key: string) => string
): DashboardAnalyticsBacklogRow[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    const key = getKey(record)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .map(([key, count]) => ({
      key,
      label: getLabel(key),
      count,
      detail: `${count} open ticket(s)`
    }))
}

function transportLabel(value: string | null, t: (key: string, variables?: Record<string, string | number>) => string) {
  if (value === "private_thread") return t("analytics.page.transport.private_thread")
  if (value === "channel_text") return t("analytics.page.transport.channel_text")
  if (value === "all") return t("analytics.page.transport.all")
  return t("analytics.labels.unknownTransport")
}

function readSupportTeamLabels(configService: DashboardConfigService) {
  try {
    const teams = configService.readManagedJson<Array<{ id?: string; name?: string }>>("support-teams")
    const entries: Array<[string, string]> = (Array.isArray(teams) ? teams : [])
      .map((team) => [normalizeString(team.id), normalizeString(team.name) || normalizeString(team.id)] as [string, string])
      .filter(([id]) => id.length > 0)
    return new Map<string, string>(entries)
  } catch {
    return new Map<string, string>()
  }
}

async function fetchHistoryRecords(input: {
  request: DashboardAnalyticsRequest
  transcriptService: DashboardTranscriptTicketAnalyticsHistoryService | null
}) {
  const warnings: string[] = []
  const records: DashboardTicketAnalyticsHistoryRecord[] = []
  if (!input.transcriptService) {
    return {
      state: "unavailable" as DashboardAnalyticsHistoryState,
      records,
      warnings: ["Transcript analytics history is unavailable; cohort and SLA metrics are unavailable."]
    }
  }

  let cursor: string | null = null
  for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
    let result
    try {
      result = await input.transcriptService.listTicketAnalyticsHistory({
        openedFrom: new Date(input.request.openedFromMs).toISOString(),
        openedTo: new Date(input.request.openedToMs).toISOString(),
        teamId: input.request.teamId || null,
        assigneeId: input.request.assigneeId || null,
        transportMode: input.request.transport === "all" ? null : input.request.transport,
        cursor,
        limit: HISTORY_PAGE_LIMIT
      })
    } catch {
      return {
        state: "unavailable" as DashboardAnalyticsHistoryState,
        records: [],
        warnings: [...warnings, "Transcript analytics history could not be read; cohort and SLA metrics are unavailable."]
      }
    }
    warnings.push(...result.warnings)
    records.push(...result.items)
    if (result.truncated) {
      return {
        state: "truncated" as DashboardAnalyticsHistoryState,
        records: [],
        warnings: ["Transcript analytics history was truncated; cohort and SLA metrics are unavailable.", ...warnings]
      }
    }
    cursor = result.nextCursor
    if (!cursor) {
      return { state: "available" as DashboardAnalyticsHistoryState, records, warnings }
    }
    if (records.length >= HISTORY_MAX_RECORDS) break
  }

  return {
    state: "truncated" as DashboardAnalyticsHistoryState,
    records: [],
    warnings: ["Transcript analytics history exceeded the dashboard scan ceiling; cohort and SLA metrics are unavailable.", ...warnings]
  }
}

async function fetchTelemetryRecords(input: {
  request: DashboardAnalyticsRequest
  runtimeBridge: DashboardRuntimeBridge
  backlogRecords: AnalyticsTicketRecord[]
  t: (key: string, variables?: Record<string, string | number>) => string
}) {
  if (!supportsTicketTelemetryReads(input.runtimeBridge)) {
    return {
      state: "unavailable" as DashboardAnalyticsHistoryState,
      lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
      feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
      ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
      warnings: [input.t("analytics.telemetry.unavailableWarning")]
    }
  }

  const baseQuery = {
    since: input.request.openedFromMs,
    until: input.request.openedToMs - 1,
    teamId: input.request.teamId || null,
    assigneeId: input.request.assigneeId || null,
    transportMode: input.request.transport === "all" ? null : input.request.transport
  }
  const warnings: string[] = []
  const lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[] = []
  const feedbackRecords: DashboardTicketFeedbackTelemetryRecord[] = []

  try {
    let lifecycleCursor: string | null = null
    for (let page = 0; page < TELEMETRY_MAX_PAGES; page += 1) {
      const result = await input.runtimeBridge.listLifecycleTelemetry!({
        ...baseQuery,
        eventTypes: ["closed", "reopened"],
        cursor: lifecycleCursor,
        limit: TELEMETRY_PAGE_LIMIT
      })
      warnings.push(...result.warnings)
      if (result.truncated) {
        return {
          state: "truncated" as DashboardAnalyticsHistoryState,
          lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
          feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
          ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
          warnings: [input.t("analytics.telemetry.truncatedWarning"), ...warnings]
        }
      }
      lifecycleRecords.push(...result.items)
      lifecycleCursor = result.nextCursor
      if (!lifecycleCursor) break
      if (lifecycleRecords.length >= TELEMETRY_MAX_RECORDS) {
        return {
          state: "truncated" as DashboardAnalyticsHistoryState,
          lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
          feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
          ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
          warnings: [input.t("analytics.telemetry.scanCeilingWarning"), ...warnings]
        }
      }
    }
    if (lifecycleCursor) {
      return {
        state: "truncated" as DashboardAnalyticsHistoryState,
        lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
        feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
        ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
        warnings: [input.t("analytics.telemetry.scanCeilingWarning"), ...warnings]
      }
    }

    let feedbackCursor: string | null = null
    for (let page = 0; page < TELEMETRY_MAX_PAGES; page += 1) {
      const result = await input.runtimeBridge.listFeedbackTelemetry!({
        ...baseQuery,
        cursor: feedbackCursor,
        limit: TELEMETRY_PAGE_LIMIT
      })
      warnings.push(...result.warnings)
      if (result.truncated) {
        return {
          state: "truncated" as DashboardAnalyticsHistoryState,
          lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
          feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
          ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
          warnings: [input.t("analytics.telemetry.truncatedWarning"), ...warnings]
        }
      }
      feedbackRecords.push(...result.items)
      feedbackCursor = result.nextCursor
      if (!feedbackCursor) break
      if (feedbackRecords.length >= TELEMETRY_MAX_RECORDS) {
        return {
          state: "truncated" as DashboardAnalyticsHistoryState,
          lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
          feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
          ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
          warnings: [input.t("analytics.telemetry.scanCeilingWarning"), ...warnings]
        }
      }
    }
    if (feedbackCursor) {
      return {
        state: "truncated" as DashboardAnalyticsHistoryState,
        lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
        feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
        ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
        warnings: [input.t("analytics.telemetry.scanCeilingWarning"), ...warnings]
      }
    }

    const backlogTicketIds = input.backlogRecords.map((record) => record.ticketId).filter((ticketId): ticketId is string => Boolean(ticketId))
    const ticketSignals = backlogTicketIds.length > 0
      ? await input.runtimeBridge.getTicketTelemetrySignals!(backlogTicketIds)
      : {}

    return {
      state: "available" as DashboardAnalyticsHistoryState,
      lifecycleRecords,
      feedbackRecords,
      ticketSignals,
      warnings
    }
  } catch {
    return {
      state: "unavailable" as DashboardAnalyticsHistoryState,
      lifecycleRecords: [] as DashboardTicketLifecycleTelemetryRecord[],
      feedbackRecords: [] as DashboardTicketFeedbackTelemetryRecord[],
      ticketSignals: {} as Record<string, DashboardTicketTelemetrySignals>,
      warnings: [input.t("analytics.telemetry.readFailureWarning"), ...warnings]
    }
  }
}

function feedbackOutcomeRows(
  records: DashboardTicketFeedbackTelemetryRecord[],
  getKey: (record: DashboardTicketFeedbackTelemetryRecord) => string,
  getLabel: (key: string) => string,
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsFeedbackOutcomeRow[] {
  const groups = new Map<string, DashboardTicketFeedbackTelemetryRecord[]>()
  for (const record of records) {
    const key = getKey(record)
    groups.set(key, [...(groups.get(key) || []), record])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const completed = group.filter((record) => record.status === "completed").length
      const ignored = group.filter((record) => record.status === "ignored").length
      const deliveryFailed = group.filter((record) => record.status === "delivery_failed").length
      const denominator = completed + ignored
      return {
        key,
        label: getLabel(key),
        total: group.length,
        completed,
        ignored,
        deliveryFailed,
        completionRate: rateMetricCell(completed, denominator, t),
        ignoredRate: rateMetricCell(ignored, denominator, t)
      }
    })
}

function ratingRows(
  records: DashboardTicketFeedbackTelemetryRecord[],
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsRatingRow[] {
  const values = new Map<string, { label: string; samples: number[] }>()
  for (const record of records) {
    for (const question of record.questionSummaries) {
      if (question.type !== "rating") continue
      const questionKey = `${question.position}:${question.label}`
      const bucket = values.get(questionKey) || { label: question.label, samples: [] }
      if (question.ratingValue != null) {
        bucket.samples.push(question.ratingValue)
      }
      values.set(questionKey, bucket)
    }
  }

  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([questionKey, bucket]) => {
      const total = bucket.samples.reduce((sum, sample) => sum + sample, 0)
      const average = bucket.samples.length > 0 ? total / bucket.samples.length : null
      const median = medianNumber(bucket.samples)
      return {
        questionKey,
        questionLabel: bucket.label,
        responses: bucket.samples.length,
        averageRating: formatRatingValue(average, t),
        medianRating: formatRatingValue(median, t),
        lowSample: bucket.samples.length > 0 && bucket.samples.length < 5
      }
    })
}

function uniqueTicketCount(records: DashboardTicketLifecycleTelemetryRecord[]) {
  return new Set(records.map((record) => record.ticketId).filter(Boolean)).size
}

function reopenRateRows(
  records: DashboardTicketLifecycleTelemetryRecord[],
  getKey: (record: DashboardTicketLifecycleTelemetryRecord) => string,
  getLabel: (key: string) => string,
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsReopenRateRow[] {
  const groups = new Map<string, DashboardTicketLifecycleTelemetryRecord[]>()
  for (const record of records) {
    const key = getKey(record)
    groups.set(key, [...(groups.get(key) || []), record])
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, group]) => {
      const reopenedTickets = uniqueTicketCount(group.filter((record) => record.eventType === "reopened"))
      const closedTickets = uniqueTicketCount(group.filter((record) => record.eventType === "closed"))
      return {
        key,
        label: getLabel(key),
        reopenedTickets,
        closedTickets,
        reopenRate: rateMetricCell(reopenedTickets, closedTickets, t)
      }
    })
}

function reopenedBacklogRows(
  records: AnalyticsTicketRecord[],
  signals: Record<string, DashboardTicketTelemetrySignals>,
  getKey: (record: AnalyticsTicketRecord) => string,
  getLabel: (key: string) => string,
  t: (key: string, variables?: Record<string, string | number>) => string
): DashboardAnalyticsBacklogRow[] {
  const reopened = records.filter((record) => record.ticketId && signals[record.ticketId]?.hasEverReopened)
  return backlogRows(reopened, getKey, getLabel).map((row) => ({
    ...row,
    detail: t("analytics.telemetry.reopenedBacklogDetail", { count: row.count })
  }))
}

export async function buildDashboardAnalyticsModel(input: {
  basePath: string
  query: Record<string, unknown>
  configService: DashboardConfigService
  runtimeBridge: DashboardRuntimeBridge
  transcriptService: DashboardTranscriptTicketAnalyticsHistoryService | null
  t?: (key: string, variables?: Record<string, string | number>) => string
  now?: number
  qualityReviewHref?: string | null
}): Promise<DashboardAnalyticsModel> {
  const t = input.t || ((key: string) => key)
  const teamLabels = readSupportTeamLabels(input.configService)
  const teamLabel = (teamId: string) => teamLabels.get(teamId) || (teamId === "unknown" ? t("analytics.labels.unknownTeam") : t("analytics.labels.missingTeam", { id: teamId }))
  const assigneeLabel = (assigneeId: string) => assigneeId === "unknown" ? t("analytics.labels.unassigned") : assigneeId
  const request = parseDashboardAnalyticsRequest(input.query, { now: input.now, teamLabel, t })
  const allLiveRecords = input.runtimeBridge.listTickets().map(liveTicketToAnalytics)
  const liveTicketIds = new Set(allLiveRecords.map((record) => record.ticketId).filter((ticketId): ticketId is string => Boolean(ticketId)))
  const liveRecords = allLiveRecords
    .filter((record) => matchesFilters(record, request))
  const backlogRecords = liveRecords.filter((record) => record.open)
  const history = await fetchHistoryRecords({ request, transcriptService: input.transcriptService })
  const telemetry = await fetchTelemetryRecords({ request, runtimeBridge: input.runtimeBridge, backlogRecords, t })
  const deduped = new Map<string, AnalyticsTicketRecord>()
  for (const record of liveRecords.filter((item) => isInWindow(item, request))) {
    deduped.set(record.ticketId || `live:${record.transcriptId || record.creatorId || deduped.size}`, record)
  }
  for (const record of history.records.map(archivedTicketToAnalytics).filter((item) => matchesFilters(item, request) && isInWindow(item, request))) {
    if (record.ticketId && liveTicketIds.has(record.ticketId)) {
      continue
    }
    const key = record.ticketId || `archive:${record.transcriptId}`
    if (!record.ticketId || !deduped.has(record.ticketId)) {
      deduped.set(key, record)
    }
  }

  const cohortRecords = history.state === "available" ? [...deduped.values()] : []
  const firstResponse = collectDurations(cohortRecords, "firstStaffResponseAt")
  const resolution = collectDurations(cohortRecords, "resolvedAt")
  const firstResponseMedian = metricCell(firstResponse.samples, medianDurationMs(firstResponse.samples), firstResponse.missing, t)
  const firstResponseP95 = metricCell(firstResponse.samples, p95DurationMs(firstResponse.samples), firstResponse.missing, t)
  const resolutionMedian = metricCell(resolution.samples, medianDurationMs(resolution.samples), resolution.missing, t)
  const resolutionP95 = metricCell(resolution.samples, p95DurationMs(resolution.samples), resolution.missing, t)

  const cohortUnavailableDetail = history.state === "available"
    ? t("analytics.summary.openedDetail")
    : t("analytics.summary.historyUnavailableDetail")
  const feedbackCompleted = telemetry.feedbackRecords.filter((record) => record.status === "completed").length
  const feedbackIgnored = telemetry.feedbackRecords.filter((record) => record.status === "ignored").length
  const feedbackDeliveryFailed = telemetry.feedbackRecords.filter((record) => record.status === "delivery_failed").length
  const feedbackRateDenominator = feedbackCompleted + feedbackIgnored
  const reopenedTickets = uniqueTicketCount(telemetry.lifecycleRecords.filter((record) => record.eventType === "reopened"))
  const closedTickets = uniqueTicketCount(telemetry.lifecycleRecords.filter((record) => record.eventType === "closed"))
  const telemetryAvailable = telemetry.state === "available"
  const feedbackCompletionRate = rateMetricCell(feedbackCompleted, feedbackRateDenominator, t)
  const feedbackIgnoredRate = rateMetricCell(feedbackIgnored, feedbackRateDenominator, t)
  const reopenRate = rateMetricCell(reopenedTickets, closedTickets, t)
  const unavailableRate = rateMetricCell(0, 0, t)
  const telemetryUnavailableWarning = telemetry.warnings[0] || t("analytics.telemetry.unavailableWarning")
  const historyUnavailableWarning = history.warnings[0] || cohortUnavailableDetail
  const telemetryUnavailableRate = {
    ...unavailableRate,
    detail: telemetryUnavailableWarning
  }
  const firstResponseMedianExport = history.state === "available" ? firstResponseMedian : { ...firstResponseMedian, detail: historyUnavailableWarning }
  const firstResponseP95Export = history.state === "available" ? firstResponseP95 : { ...firstResponseP95, detail: historyUnavailableWarning }
  const resolutionMedianExport = history.state === "available" ? resolutionMedian : { ...resolutionMedian, detail: historyUnavailableWarning }
  const resolutionP95Export = history.state === "available" ? resolutionP95 : { ...resolutionP95, detail: historyUnavailableWarning }
  const openedLabel = t("analytics.summary.opened")
  const backlogLabel = t("analytics.summary.backlog")
  const medianFirstResponseLabel = t("analytics.summary.medianFirstResponse")
  const p95FirstResponseLabel = t("analytics.summary.p95FirstResponse")
  const medianResolutionLabel = t("analytics.summary.medianResolution")
  const p95ResolutionLabel = t("analytics.summary.p95Resolution")
  const feedbackTriggeredLabel = t("analytics.summary.feedbackTriggered")
  const feedbackCompletionRateLabel = t("analytics.summary.feedbackCompletionRate")
  const feedbackIgnoredRateLabel = t("analytics.summary.feedbackIgnoredRate")
  const feedbackDeliveryFailedLabel = t("analytics.summary.feedbackDeliveryFailed")
  const reopenedTicketsLabel = t("analytics.summary.reopenedTickets")
  const reopenRateLabel = t("analytics.summary.reopenRate")
  const openedTicketCount = history.state === "available" ? cohortRecords.length : null
  const feedbackTriggeredCount = telemetryAvailable ? telemetry.feedbackRecords.length : null
  const feedbackDeliveryFailedCount = telemetryAvailable ? feedbackDeliveryFailed : null
  const reopenedTicketCount = telemetryAvailable ? reopenedTickets : null
  const summaryCards = [
    countCard(openedLabel, openedTicketCount, cohortUnavailableDetail, history.state === "available" ? "success" : "muted"),
    countCard(backlogLabel, backlogRecords.length, t("analytics.summary.backlogDetail")),
    summaryMetricCard(medianFirstResponseLabel, firstResponseMedian),
    summaryMetricCard(p95FirstResponseLabel, firstResponseP95),
    summaryMetricCard(medianResolutionLabel, resolutionMedian),
    summaryMetricCard(p95ResolutionLabel, resolutionP95),
    countCard(feedbackTriggeredLabel, feedbackTriggeredCount, t("analytics.telemetry.feedbackTriggeredDetail"), telemetryAvailable ? "success" : "muted"),
    rateCard(feedbackCompletionRateLabel, telemetryAvailable ? feedbackCompletionRate : unavailableRate),
    rateCard(feedbackIgnoredRateLabel, telemetryAvailable ? feedbackIgnoredRate : unavailableRate),
    countCard(feedbackDeliveryFailedLabel, feedbackDeliveryFailedCount, t("analytics.telemetry.feedbackDeliveryFailedDetail"), telemetryAvailable && feedbackDeliveryFailed > 0 ? "warning" : telemetryAvailable ? "success" : "muted"),
    countCard(reopenedTicketsLabel, reopenedTicketCount, t("analytics.telemetry.reopenedTicketsDetail"), telemetryAvailable ? "warning" : "muted"),
    rateCard(reopenRateLabel, telemetryAvailable ? reopenRate : unavailableRate)
  ]
  const exportSummaryCards = [
    countExportSummaryCard("openedTickets", openedLabel, openedTicketCount, history.state === "available" ? null : cohortUnavailableDetail),
    countExportSummaryCard("openBacklog", backlogLabel, backlogRecords.length),
    metricExportSummaryCard("medianFirstResponse", medianFirstResponseLabel, firstResponseMedianExport),
    metricExportSummaryCard("p95FirstResponse", p95FirstResponseLabel, firstResponseP95Export),
    metricExportSummaryCard("medianResolution", medianResolutionLabel, resolutionMedianExport),
    metricExportSummaryCard("p95Resolution", p95ResolutionLabel, resolutionP95Export),
    countExportSummaryCard("feedbackTriggered", feedbackTriggeredLabel, feedbackTriggeredCount, telemetryAvailable ? null : telemetryUnavailableWarning),
    metricExportSummaryCard("feedbackCompletionRate", feedbackCompletionRateLabel, telemetryAvailable ? feedbackCompletionRate : telemetryUnavailableRate),
    metricExportSummaryCard("feedbackIgnoredRate", feedbackIgnoredRateLabel, telemetryAvailable ? feedbackIgnoredRate : telemetryUnavailableRate),
    countExportSummaryCard("feedbackDeliveryFailed", feedbackDeliveryFailedLabel, feedbackDeliveryFailedCount, telemetryAvailable ? null : telemetryUnavailableWarning),
    countExportSummaryCard("reopenedTickets", reopenedTicketsLabel, reopenedTicketCount, telemetryAvailable ? null : telemetryUnavailableWarning),
    metricExportSummaryCard("reopenRate", reopenRateLabel, telemetryAvailable ? reopenRate : telemetryUnavailableRate)
  ]
  const currentHref = buildAnalyticsHref(input.basePath, request)

  return {
    request,
    filterAction: joinBasePath(input.basePath, "admin/analytics"),
    clearFiltersHref: joinBasePath(input.basePath, "admin/analytics"),
    historyState: history.state,
    historyWarnings: history.warnings,
    telemetryState: telemetry.state,
    telemetryWarnings: telemetry.warnings,
    summaryCards,
    exportSummaryCards,
    exportActions: {
      jsonAction: joinBasePath(input.basePath, "admin/analytics/export/json"),
      csvAction: joinBasePath(input.basePath, "admin/analytics/export/csv"),
      returnTo: currentHref
    },
    qualityReviewHref: input.qualityReviewHref || null,
    backlogByTeam: backlogRows(backlogRecords, (record) => record.assignedTeamId || "unknown", teamLabel),
    backlogByAssignee: backlogRows(backlogRecords, (record) => record.assignedStaffUserId || "unknown", assigneeLabel),
    backlogByTransport: backlogRows(backlogRecords, (record) => record.transportMode || "unknown", (key) => transportLabel(key, t)),
    cohortByTeam: history.state === "available" ? groupRows(cohortRecords, (record) => record.assignedTeamId || "unknown", teamLabel, t) : [],
    cohortByTransport: history.state === "available" ? groupRows(cohortRecords, (record) => record.transportMode || "unknown", (key) => transportLabel(key, t), t) : [],
    feedbackByTeam: telemetryAvailable ? feedbackOutcomeRows(telemetry.feedbackRecords, (record) => record.snapshot.assignedTeamId || "unknown", teamLabel, t) : [],
    feedbackByTransport: telemetryAvailable ? feedbackOutcomeRows(telemetry.feedbackRecords, (record) => record.snapshot.transportMode || "unknown", (key) => transportLabel(key, t), t) : [],
    ratingQuestions: telemetryAvailable ? ratingRows(telemetry.feedbackRecords, t) : [],
    reopenRateByTeam: telemetryAvailable ? reopenRateRows(telemetry.lifecycleRecords, (record) => record.snapshot.assignedTeamId || "unknown", teamLabel, t) : [],
    reopenRateByTransport: telemetryAvailable ? reopenRateRows(telemetry.lifecycleRecords, (record) => record.snapshot.transportMode || "unknown", (key) => transportLabel(key, t), t) : [],
    reopenedBacklogByTeam: telemetryAvailable ? reopenedBacklogRows(backlogRecords, telemetry.ticketSignals, (record) => record.assignedTeamId || "unknown", teamLabel, t) : [],
    reopenedBacklogByTransport: telemetryAvailable ? reopenedBacklogRows(backlogRecords, telemetry.ticketSignals, (record) => record.transportMode || "unknown", (key) => transportLabel(key, t), t) : []
  }
}
