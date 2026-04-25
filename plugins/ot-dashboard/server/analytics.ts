import type { DashboardConfigService } from "./config-service"
import { joinBasePath } from "./dashboard-config"
import type { DashboardSummaryCardInput, DashboardTone } from "./control-center"
import type { DashboardRuntimeBridge } from "./runtime-bridge"
import type { DashboardTicketRecord } from "./dashboard-runtime-registry"
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

export interface DashboardAnalyticsTableRow {
  key: string
  label: string
  count: number
  firstResponse: DashboardAnalyticsMetricCell
  resolution: DashboardAnalyticsMetricCell
  missingFirstResponse: number
  missingResolution: number
}

export interface DashboardAnalyticsBacklogRow {
  key: string
  label: string
  count: number
  detail: string
}

export interface DashboardAnalyticsModel {
  request: DashboardAnalyticsRequest
  filterAction: string
  clearFiltersHref: string
  historyState: DashboardAnalyticsHistoryState
  historyWarnings: string[]
  summaryCards: DashboardSummaryCardInput[]
  backlogByTeam: DashboardAnalyticsBacklogRow[]
  backlogByAssignee: DashboardAnalyticsBacklogRow[]
  backlogByTransport: DashboardAnalyticsBacklogRow[]
  cohortByTeam: DashboardAnalyticsTableRow[]
  cohortByTransport: DashboardAnalyticsTableRow[]
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
      return {
        key,
        label: getLabel(key),
        count: group.length,
        firstResponse: metricCell(firstResponse.samples, medianDurationMs(firstResponse.samples), firstResponse.missing, t),
        resolution: metricCell(resolution.samples, medianDurationMs(resolution.samples), resolution.missing, t),
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

export async function buildDashboardAnalyticsModel(input: {
  basePath: string
  query: Record<string, unknown>
  configService: DashboardConfigService
  runtimeBridge: DashboardRuntimeBridge
  transcriptService: DashboardTranscriptTicketAnalyticsHistoryService | null
  t?: (key: string, variables?: Record<string, string | number>) => string
  now?: number
}): Promise<DashboardAnalyticsModel> {
  const t = input.t || ((key: string) => key)
  const teamLabels = readSupportTeamLabels(input.configService)
  const teamLabel = (teamId: string) => teamLabels.get(teamId) || (teamId === "unknown" ? t("analytics.labels.unknownTeam") : t("analytics.labels.missingTeam", { id: teamId }))
  const assigneeLabel = (assigneeId: string) => assigneeId === "unknown" ? t("analytics.labels.unassigned") : assigneeId
  const request = parseDashboardAnalyticsRequest(input.query, { now: input.now, teamLabel, t })
  const liveRecords = input.runtimeBridge.listTickets()
    .map(liveTicketToAnalytics)
    .filter((record) => matchesFilters(record, request))
  const backlogRecords = liveRecords.filter((record) => record.open)
  const history = await fetchHistoryRecords({ request, transcriptService: input.transcriptService })
  const deduped = new Map<string, AnalyticsTicketRecord>()
  for (const record of liveRecords.filter((item) => isInWindow(item, request))) {
    deduped.set(record.ticketId || `live:${record.transcriptId || record.creatorId || deduped.size}`, record)
  }
  for (const record of history.records.map(archivedTicketToAnalytics).filter((item) => matchesFilters(item, request) && isInWindow(item, request))) {
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

  return {
    request,
    filterAction: joinBasePath(input.basePath, "admin/analytics"),
    clearFiltersHref: joinBasePath(input.basePath, "admin/analytics"),
    historyState: history.state,
    historyWarnings: history.warnings,
    summaryCards: [
      countCard(t("analytics.summary.opened"), history.state === "available" ? cohortRecords.length : null, cohortUnavailableDetail, history.state === "available" ? "success" : "muted"),
      countCard(t("analytics.summary.backlog"), backlogRecords.length, t("analytics.summary.backlogDetail")),
      summaryMetricCard(t("analytics.summary.medianFirstResponse"), firstResponseMedian),
      summaryMetricCard(t("analytics.summary.p95FirstResponse"), firstResponseP95),
      summaryMetricCard(t("analytics.summary.medianResolution"), resolutionMedian),
      summaryMetricCard(t("analytics.summary.p95Resolution"), resolutionP95)
    ],
    backlogByTeam: backlogRows(backlogRecords, (record) => record.assignedTeamId || "unknown", teamLabel),
    backlogByAssignee: backlogRows(backlogRecords, (record) => record.assignedStaffUserId || "unknown", assigneeLabel),
    backlogByTransport: backlogRows(backlogRecords, (record) => record.transportMode || "unknown", (key) => transportLabel(key, t)),
    cohortByTeam: history.state === "available" ? groupRows(cohortRecords, (record) => record.assignedTeamId || "unknown", teamLabel, t) : [],
    cohortByTransport: history.state === "available" ? groupRows(cohortRecords, (record) => record.transportMode || "unknown", (key) => transportLabel(key, t), t) : []
  }
}
