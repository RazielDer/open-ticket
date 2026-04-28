import { formatDate, type DashboardSummaryCardInput, type DashboardTone } from "./control-center"
import type { DashboardConfigService } from "./config-service"
import type { DashboardTicketRecord } from "./dashboard-runtime-registry"
import { joinBasePath } from "./dashboard-config"
import type { DashboardRuntimeBridge } from "./runtime-bridge"
import { supportsTicketTelemetryReads } from "./runtime-bridge"
import { buildFallbackTicketDetail } from "./ticket-workbench"
import type {
  DashboardTicketDetailRecord,
  DashboardTicketFeedbackStoredStatus,
  DashboardTicketFeedbackTelemetryRecord,
  DashboardTicketLifecycleTelemetryRecord,
  DashboardQualityReviewCaseDetailRecord,
  DashboardQualityReviewCaseSignal,
  DashboardQualityReviewCaseSummary,
  DashboardQualityReviewRawFeedbackRecord,
  DashboardQualityReviewRawFeedbackStatus,
  DashboardQualityReviewState,
  DashboardTicketTelemetrySignals,
  DashboardTicketTelemetrySnapshot,
  DashboardTicketTransportMode
} from "./ticket-workbench-types"

export const QUALITY_REVIEW_WINDOWS = ["7d", "30d", "90d", "custom"] as const
export const QUALITY_REVIEW_SIGNALS = ["all", "feedback", "reopened"] as const
export const QUALITY_REVIEW_FEEDBACK_FILTERS = ["all", "completed", "ignored", "delivery_failed"] as const
export const QUALITY_REVIEW_REOPENED_FILTERS = ["all", "ever", "never"] as const
export const QUALITY_REVIEW_STATUS_FILTERS = ["all", "open", "closed"] as const
export const QUALITY_REVIEW_TRANSPORT_FILTERS = ["all", "channel_text", "private_thread"] as const
export const QUALITY_REVIEW_STATE_FILTERS = ["active", "unreviewed", "in_review", "resolved", "all"] as const
export const QUALITY_REVIEW_RAW_FEEDBACK_FILTERS = ["all", "available", "partial", "expired", "none"] as const
export const QUALITY_REVIEW_SORTS = ["signal-desc", "signal-asc", "opened-desc", "opened-asc"] as const
export const QUALITY_REVIEW_LIMITS = [10, 25, 50, 100] as const

export type DashboardQualityReviewWindow = (typeof QUALITY_REVIEW_WINDOWS)[number]
export type DashboardQualityReviewSignal = (typeof QUALITY_REVIEW_SIGNALS)[number]
export type DashboardQualityReviewFeedbackFilter = (typeof QUALITY_REVIEW_FEEDBACK_FILTERS)[number]
export type DashboardQualityReviewReopenedFilter = (typeof QUALITY_REVIEW_REOPENED_FILTERS)[number]
export type DashboardQualityReviewStatusFilter = (typeof QUALITY_REVIEW_STATUS_FILTERS)[number]
export type DashboardQualityReviewTransportFilter = (typeof QUALITY_REVIEW_TRANSPORT_FILTERS)[number]
export type DashboardQualityReviewStateFilter = (typeof QUALITY_REVIEW_STATE_FILTERS)[number]
export type DashboardQualityReviewRawFeedbackFilter = (typeof QUALITY_REVIEW_RAW_FEEDBACK_FILTERS)[number]
export type DashboardQualityReviewSort = (typeof QUALITY_REVIEW_SORTS)[number]
export type DashboardQualityReviewSignalKind = "feedback" | "reopened"

export interface DashboardQualityReviewQuery {
  window: DashboardQualityReviewWindow
  from: string
  to: string
  fromMs: number
  toMs: number
  signal: DashboardQualityReviewSignal
  feedback: DashboardQualityReviewFeedbackFilter
  reopened: DashboardQualityReviewReopenedFilter
  status: DashboardQualityReviewStatusFilter
  teamId: string
  assigneeId: string
  transport: DashboardQualityReviewTransportFilter
  reviewState: DashboardQualityReviewStateFilter
  ownerId: string
  rawFeedback: DashboardQualityReviewRawFeedbackFilter
  q: string
  sort: DashboardQualityReviewSort
  limit: number
  page: number
  windowOptions: DashboardQualityReviewWindow[]
  signalOptions: Array<{ value: DashboardQualityReviewSignal; label: string }>
  feedbackOptions: Array<{ value: DashboardQualityReviewFeedbackFilter; label: string }>
  reopenedOptions: Array<{ value: DashboardQualityReviewReopenedFilter; label: string }>
  statusOptions: Array<{ value: DashboardQualityReviewStatusFilter; label: string }>
  transportOptions: Array<{ value: DashboardQualityReviewTransportFilter; label: string }>
  reviewStateOptions: Array<{ value: DashboardQualityReviewStateFilter; label: string }>
  ownerOptions: Array<{ value: string; label: string }>
  rawFeedbackOptions: Array<{ value: DashboardQualityReviewRawFeedbackFilter; label: string }>
  sortOptions: Array<{ value: DashboardQualityReviewSort; label: string }>
  limitOptions: number[]
  activeFilters: Array<{ label: string; value: string }>
}

export interface DashboardQualityReviewSummary {
  ticketsInReview: number
  completedFeedback: number
  ignoredFeedback: number
  deliveryFailed: number
  reopenedTickets: number
}

export interface DashboardQualityReviewRecord {
  ticketId: string
  live: boolean
  resourceName: string | null
  openedAt: number | null
  currentStatus: "open" | "closed"
  transportMode: DashboardTicketTransportMode | null
  teamId: string | null
  teamLabel: string
  assigneeUserId: string | null
  assigneeLabel: string
  creatorUserId: string | null
  creatorLabel: string
  optionId: string | null
  optionLabel: string
  latestFeedbackStatus: DashboardTicketFeedbackStoredStatus | "none"
  reopenCount: number
  lastReopenedAt: number | null
  reviewCase: DashboardQualityReviewCaseSummary
  matchedSignalKinds: DashboardQualityReviewSignalKind[]
  latestMatchedSignalAt: number
}

export interface DashboardQualityReviewDetailRecord {
  ticketId: string
  liveTicket: DashboardTicketDetailRecord | null
  historicalSummary: DashboardQualityReviewRecord
  latestFeedbackSession: DashboardTicketFeedbackTelemetryRecord | null
  feedbackHistory: DashboardTicketFeedbackTelemetryRecord[]
  reopenEvents: DashboardTicketLifecycleTelemetryRecord[]
  lifecycleEvents: DashboardTicketLifecycleTelemetryRecord[]
  reviewCase: DashboardQualityReviewCaseDetailRecord
  completedAnsweredFeedbackSessionIds: string[]
  matchedWindowEventIds: string[]
  telemetryWarning: string | null
}

export interface DashboardQualityReviewListItem {
  record: DashboardQualityReviewRecord
  detailHref: string
  statusBadge: { label: string; tone: DashboardTone }
  feedbackBadge: { label: string; tone: DashboardTone }
  reviewStateBadge: { label: string; tone: DashboardTone }
  rawFeedbackBadge: { label: string; tone: DashboardTone }
  reopenBadge: { label: string; tone: DashboardTone } | null
  transportLabel: string
  openedLabel: string
  latestSignalLabel: string
  matchedSignalLabel: string
  searchText: string
}

export interface DashboardQualityReviewListModel {
  available: boolean
  warningMessage: string
  telemetryWarningMessage: string
  filterAction: string
  clearFiltersHref: string
  currentHref: string
  request: DashboardQualityReviewQuery
  summary: DashboardQualityReviewSummary
  summaryCards: DashboardSummaryCardInput[]
  total: number
  pageStart: number
  pageEnd: number
  previousHref: string | null
  nextHref: string | null
  pageLinks: Array<{ page: number; href: string; active: boolean }>
  supportTeams: Array<{ id: string; label: string }>
  items: DashboardQualityReviewListItem[]
}

export interface DashboardQualityReviewDetailModel {
  available: boolean
  warningMessage: string
  backHref: string
  currentHref: string
  ticketWorkbenchHref: string | null
  detailRecord: DashboardQualityReviewDetailRecord | null
  summaryCards: DashboardSummaryCardInput[]
  facts: Array<{ label: string; value: string }>
  latestFeedbackFacts: Array<{ label: string; value: string }>
  ratingRows: Array<{ label: string; value: string; answered: boolean }>
  adjudicationFacts: Array<{ label: string; value: string }>
  canManage: boolean
  stateActionHref: string
  assignOwnerActionHref: string
  clearOwnerActionHref: string
  addNoteActionHref: string
  ownerChoices: Array<{ value: string; label: string }>
  rawFeedbackSessions: DashboardQualityReviewRawFeedbackSessionModel[]
  feedbackRows: Array<{ id: string; status: string; triggeredAt: string; completedAt: string; matched: boolean }>
  reopenRows: Array<{ id: string; occurredAt: string; actor: string; matched: boolean }>
  lifecycleRows: Array<{ id: string; type: string; occurredAt: string; actor: string; matched: boolean }>
}

export interface DashboardQualityReviewRawFeedbackSessionModel {
  sessionId: string
  statusLabel: string
  statusTone: DashboardTone
  capturedAt: string
  expiresAt: string
  warnings: string[]
  answers: Array<{
    position: number
    type: string
    label: string
    answered: boolean
    value: string
    assets: Array<{
      assetId: string
      fileName: string
      contentType: string
      byteSize: string
      status: string
      reason: string
      downloadHref: string | null
    }>
  }>
}

interface ConfigRecord {
  id?: unknown
  name?: unknown
  options?: unknown
  routing?: {
    supportTeamId?: unknown
  }
}

interface QualityTelemetryCollection<T> {
  items: T[]
  warnings: string[]
  truncated: boolean
  available: boolean
}

interface QualityReviewRecordWithMatches {
  record: DashboardQualityReviewRecord
  matchedFeedback: DashboardTicketFeedbackTelemetryRecord[]
  matchedReopens: DashboardTicketLifecycleTelemetryRecord[]
  allWindowFeedback: DashboardTicketFeedbackTelemetryRecord[]
  allWindowReopens: DashboardTicketLifecycleTelemetryRecord[]
}

const DEFAULT_WINDOW: DashboardQualityReviewWindow = "30d"
const WINDOW_DAYS: Record<Exclude<DashboardQualityReviewWindow, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
}
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TELEMETRY_PAGE_LIMIT = 500
const TELEMETRY_MAX_PAGES = 20
const DETAIL_FEEDBACK_LIMIT = 50
const DETAIL_LIFECYCLE_LIMIT = 100
const HISTORY_TRUNCATED_WARNING = "History truncated at review workspace limit"

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : []
}

function enumOrDefault<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  const normalized = normalizeString(value)
  return values.includes(normalized) ? normalized as T[number] : fallback
}

function limitOrDefault(value: unknown) {
  const parsed = Number(value)
  return (QUALITY_REVIEW_LIMITS as readonly number[]).includes(parsed) ? parsed : 25
}

function pageOrDefault(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

function dateInput(value: number) {
  return new Date(value).toISOString().slice(0, 10)
}

function parseDateStart(value: unknown) {
  const normalized = normalizeString(value)
  if (!DATE_PATTERN.test(normalized)) return null
  const parsed = Date.parse(`${normalized}T00:00:00.000Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDateEnd(value: unknown) {
  const normalized = normalizeString(value)
  if (!DATE_PATTERN.test(normalized)) return null
  const parsed = Date.parse(`${normalized}T23:59:59.999Z`)
  return Number.isFinite(parsed) ? parsed : null
}

function defaultWindowRange(now: number) {
  return {
    fromMs: now - WINDOW_DAYS[DEFAULT_WINDOW] * 24 * 60 * 60 * 1000,
    toMs: now
  }
}

function resolveWindow(query: Record<string, unknown>, now: number) {
  const requestedWindow = enumOrDefault(query.window, QUALITY_REVIEW_WINDOWS, DEFAULT_WINDOW)
  if (requestedWindow === "custom") {
    const fromMs = parseDateStart(query.from)
    const toMs = parseDateEnd(query.to)
    if (fromMs !== null && toMs !== null && fromMs <= toMs) {
      return {
        window: "custom" as const,
        fromMs,
        toMs,
        from: dateInput(fromMs),
        to: dateInput(toMs)
      }
    }
  } else {
    const fromMs = now - WINDOW_DAYS[requestedWindow] * 24 * 60 * 60 * 1000
    return {
      window: requestedWindow,
      fromMs,
      toMs: now,
      from: dateInput(fromMs),
      to: dateInput(now)
    }
  }

  const fallback = defaultWindowRange(now)
  return {
    window: DEFAULT_WINDOW,
    fromMs: fallback.fromMs,
    toMs: fallback.toMs,
    from: dateInput(fallback.fromMs),
    to: dateInput(fallback.toMs)
  }
}

function signalLabel(value: DashboardQualityReviewSignal) {
  switch (value) {
    case "feedback": return "Feedback"
    case "reopened": return "Reopened"
    default: return "All signals"
  }
}

function feedbackLabel(value: DashboardQualityReviewFeedbackFilter | DashboardTicketFeedbackStoredStatus | "none") {
  switch (value) {
    case "completed": return "Completed feedback"
    case "ignored": return "Ignored feedback"
    case "delivery_failed": return "Delivery failed"
    case "none": return "No feedback"
    default: return "All feedback"
  }
}

function reopenedLabel(value: DashboardQualityReviewReopenedFilter) {
  switch (value) {
    case "ever": return "Reopened in window"
    case "never": return "No reopen in window"
    default: return "Any reopen state"
  }
}

function statusLabel(value: DashboardQualityReviewStatusFilter | "open" | "closed") {
  switch (value) {
    case "open": return "Open"
    case "closed": return "Closed"
    default: return "All statuses"
  }
}

function transportLabel(value: DashboardQualityReviewTransportFilter | DashboardTicketTransportMode | null) {
  switch (value) {
    case "channel_text": return "Channel text"
    case "private_thread": return "Private thread"
    case "all": return "All transports"
    default: return "Unknown transport"
  }
}

function reviewStateLabel(value: DashboardQualityReviewStateFilter | DashboardQualityReviewState) {
  switch (value) {
    case "unreviewed": return "Unreviewed"
    case "in_review": return "In review"
    case "resolved": return "Resolved"
    case "all": return "All review states"
    default: return "Active review"
  }
}

function reviewStateBadge(state: DashboardQualityReviewState) {
  switch (state) {
    case "resolved":
      return { label: "Resolved", tone: "success" as DashboardTone }
    case "in_review":
      return { label: "In review", tone: "warning" as DashboardTone }
    default:
      return { label: "Unreviewed", tone: "muted" as DashboardTone }
  }
}

function rawFeedbackLabel(value: DashboardQualityReviewRawFeedbackFilter | DashboardQualityReviewRawFeedbackStatus) {
  switch (value) {
    case "available": return "Raw feedback available"
    case "partial": return "Partial raw feedback"
    case "expired": return "Raw feedback expired"
    case "none": return "Raw feedback not captured"
    default: return "All raw feedback"
  }
}

function rawFeedbackBadge(status: DashboardQualityReviewRawFeedbackStatus) {
  switch (status) {
    case "available":
      return { label: "Raw feedback available", tone: "success" as DashboardTone }
    case "partial":
      return { label: "Partial raw feedback", tone: "warning" as DashboardTone }
    case "expired":
      return { label: "Raw feedback expired", tone: "muted" as DashboardTone }
    default:
      return { label: "Raw feedback not captured", tone: "muted" as DashboardTone }
  }
}

function sortLabel(value: DashboardQualityReviewSort) {
  switch (value) {
    case "signal-asc": return "Oldest signal first"
    case "opened-desc": return "Newest opened first"
    case "opened-asc": return "Oldest opened first"
    default: return "Recent signal first"
  }
}

function buildActiveFilters(query: Omit<DashboardQualityReviewQuery, "activeFilters">) {
  const filters: Array<{ label: string; value: string }> = []
  if (query.window !== DEFAULT_WINDOW) filters.push({ label: "Window", value: query.window === "custom" ? `${query.from} to ${query.to}` : query.window })
  if (query.signal !== "all") filters.push({ label: "Signal", value: signalLabel(query.signal) })
  if (query.feedback !== "all") filters.push({ label: "Feedback", value: feedbackLabel(query.feedback) })
  if (query.reopened !== "all") filters.push({ label: "Reopened", value: reopenedLabel(query.reopened) })
  if (query.status !== "all") filters.push({ label: "Status", value: statusLabel(query.status) })
  if (query.transport !== "all") filters.push({ label: "Transport", value: transportLabel(query.transport) })
  if (query.reviewState !== "active") filters.push({ label: "Review state", value: reviewStateLabel(query.reviewState) })
  if (query.ownerId) filters.push({ label: "Owner", value: query.ownerId === "me" ? "Me" : query.ownerId === "unassigned" ? "Unassigned" : query.ownerId })
  if (query.rawFeedback !== "all") filters.push({ label: "Raw feedback", value: rawFeedbackLabel(query.rawFeedback) })
  if (query.teamId) filters.push({ label: "Team", value: query.teamId })
  if (query.assigneeId) filters.push({ label: "Assignee", value: query.assigneeId })
  if (query.q) filters.push({ label: "Search", value: query.q })
  if (query.sort !== "signal-desc") filters.push({ label: "Sort", value: sortLabel(query.sort) })
  if (query.limit !== 25) filters.push({ label: "Rows", value: String(query.limit) })
  return filters
}

export function parseDashboardQualityReviewQuery(
  query: Record<string, unknown>,
  options: { now?: number } = {}
): DashboardQualityReviewQuery {
  const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now()
  const windowRange = resolveWindow(query, now)
  const signal = enumOrDefault(query.signal, QUALITY_REVIEW_SIGNALS, "all")
  const feedback = enumOrDefault(query.feedback, QUALITY_REVIEW_FEEDBACK_FILTERS, "all")
  let reopened = enumOrDefault(query.reopened, QUALITY_REVIEW_REOPENED_FILTERS, "all")
  if (signal === "reopened" && reopened === "never") {
    reopened = "all"
  }

  const parsed = {
    ...windowRange,
    signal,
    feedback,
    reopened,
    status: enumOrDefault(query.status, QUALITY_REVIEW_STATUS_FILTERS, "all"),
    teamId: normalizeString(query.teamId),
    assigneeId: normalizeString(query.assigneeId),
    transport: enumOrDefault(query.transport, QUALITY_REVIEW_TRANSPORT_FILTERS, "all"),
    reviewState: enumOrDefault(query.reviewState, QUALITY_REVIEW_STATE_FILTERS, "active"),
    ownerId: normalizeString(query.ownerId),
    rawFeedback: enumOrDefault(query.rawFeedback, QUALITY_REVIEW_RAW_FEEDBACK_FILTERS, "all"),
    q: normalizeString(query.q),
    sort: enumOrDefault(query.sort, QUALITY_REVIEW_SORTS, "signal-desc"),
    limit: limitOrDefault(query.limit),
    page: pageOrDefault(query.page),
    windowOptions: [...QUALITY_REVIEW_WINDOWS],
    signalOptions: QUALITY_REVIEW_SIGNALS.map((value) => ({ value, label: signalLabel(value) })),
    feedbackOptions: QUALITY_REVIEW_FEEDBACK_FILTERS.map((value) => ({ value, label: feedbackLabel(value) })),
    reopenedOptions: QUALITY_REVIEW_REOPENED_FILTERS.map((value) => ({ value, label: reopenedLabel(value) })),
    statusOptions: QUALITY_REVIEW_STATUS_FILTERS.map((value) => ({ value, label: statusLabel(value) })),
    transportOptions: QUALITY_REVIEW_TRANSPORT_FILTERS.map((value) => ({ value, label: transportLabel(value) })),
    reviewStateOptions: QUALITY_REVIEW_STATE_FILTERS.map((value) => ({ value, label: reviewStateLabel(value) })),
    ownerOptions: [
      { value: "", label: "Any owner" },
      { value: "me", label: "Assigned to me" },
      { value: "unassigned", label: "Unassigned" }
    ],
    rawFeedbackOptions: QUALITY_REVIEW_RAW_FEEDBACK_FILTERS.map((value) => ({ value, label: rawFeedbackLabel(value) })),
    sortOptions: QUALITY_REVIEW_SORTS.map((value) => ({ value, label: sortLabel(value) })),
    limitOptions: [...QUALITY_REVIEW_LIMITS]
  }

  return {
    ...parsed,
    activeFilters: buildActiveFilters(parsed)
  }
}

function appendQualityReviewQuery(href: string, request: DashboardQualityReviewQuery, page = request.page) {
  const url = new URL(`http://dashboard.local${href}`)
  const entries: Record<string, string | number> = {
    window: request.window,
    signal: request.signal,
    feedback: request.feedback,
    reopened: request.reopened,
    status: request.status,
    transport: request.transport,
    reviewState: request.reviewState,
    rawFeedback: request.rawFeedback,
    sort: request.sort,
    limit: request.limit,
    page
  }
  if (request.window === "custom") {
    entries.from = request.from
    entries.to = request.to
  }
  if (request.teamId) entries.teamId = request.teamId
  if (request.assigneeId) entries.assigneeId = request.assigneeId
  if (request.ownerId) entries.ownerId = request.ownerId
  if (request.q) entries.q = request.q
  for (const [key, value] of Object.entries(entries)) {
    url.searchParams.set(key, String(value))
  }
  return `${url.pathname}${url.search}`
}

function buildQualityReviewHref(basePath: string, request: DashboardQualityReviewQuery, page = request.page) {
  return appendQualityReviewQuery(joinBasePath(basePath, "admin/quality-review"), request, page)
}

function buildQualityReviewDetailHref(basePath: string, request: DashboardQualityReviewQuery, ticketId: string, returnTo: string) {
  const href = appendQualityReviewQuery(joinBasePath(basePath, `admin/quality-review/${encodeURIComponent(ticketId)}`), request)
  return `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}`
}

export function sanitizeQualityReviewReturnTo(basePath: string, candidate: unknown) {
  const fallback = joinBasePath(basePath, "admin/quality-review")
  if (typeof candidate !== "string" || candidate.length === 0) return fallback
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://") || candidate.includes("\\")) return fallback
  if (basePath !== "/" && !candidate.startsWith(basePath)) return fallback
  const rawPath = candidate.split(/[?#]/, 1)[0]
  for (const segment of rawPath.split("/")) {
    let decoded = segment
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return fallback
    }
    if (decoded === "." || decoded === ".." || decoded.includes("\\")) return fallback
  }

  const normalizedBasePath = basePath === "/" ? "" : basePath
  const root = `${normalizedBasePath}/admin/quality-review`
  if (candidate === root) return candidate
  if (candidate.startsWith(`${root}?`)) return candidate
  if (candidate.startsWith(`${root}/`)) return candidate
  return fallback
}

function readConfigArray(configService: DashboardConfigService, id: "options" | "panels" | "support-teams") {
  try {
    const value = configService.readManagedJson<ConfigRecord[]>(id)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function labelFromRecord(record: ConfigRecord | null | undefined, fallback: string) {
  return normalizeString(record?.name) || normalizeString(record?.id) || fallback
}

function buildConfigLookups(configService: DashboardConfigService) {
  const options = readConfigArray(configService, "options")
  const panels = readConfigArray(configService, "panels")
  const supportTeams = readConfigArray(configService, "support-teams")
  const optionById = new Map<string, ConfigRecord>()
  const teamById = new Map<string, ConfigRecord>()
  const panelForOption = new Map<string, ConfigRecord>()

  for (const option of options) {
    const id = normalizeString(option.id)
    if (id) optionById.set(id, option)
  }

  for (const team of supportTeams) {
    const id = normalizeString(team.id)
    if (id) teamById.set(id, team)
  }

  for (const panel of panels) {
    for (const optionId of asStringArray(panel.options)) {
      if (!panelForOption.has(optionId)) {
        panelForOption.set(optionId, panel)
      }
    }
  }

  return {
    optionById,
    teamById,
    panelForOption,
    supportTeams: supportTeams
      .map((team) => ({ id: normalizeString(team.id), label: labelFromRecord(team, normalizeString(team.id) || "Unknown team") }))
      .filter((team) => team.id)
  }
}

function resolveOptionLabel(optionById: Map<string, ConfigRecord>, optionId: string | null) {
  if (!optionId) return "Unknown option"
  const option = optionById.get(optionId)
  return option ? labelFromRecord(option, "Unknown option") : "Unknown option"
}

function resolveTeamLabel(teamById: Map<string, ConfigRecord>, teamId: string | null) {
  if (!teamId) return "Unknown team"
  const team = teamById.get(teamId)
  return team ? labelFromRecord(team, "Unknown team") : "Unknown team"
}

function unknownAssigneeLabel(userId: string | null) {
  return userId ? `Unknown assignee (${userId})` : "Unknown assignee"
}

function unknownCreatorLabel(userId: string | null) {
  return userId ? `Unknown creator (${userId})` : "Unknown creator"
}

function normalizeTransport(value: unknown): DashboardTicketTransportMode | null {
  return value === "channel_text" || value === "private_thread" ? value : null
}

function feedbackEventTime(record: DashboardTicketFeedbackTelemetryRecord) {
  return record.completedAt || record.triggeredAt
}

function completedAnsweredFeedback(records: DashboardTicketFeedbackTelemetryRecord[]) {
  return records
    .filter((record) => record.status === "completed")
    .filter((record) => record.questionSummaries.some((question) => question.answered))
    .sort((left, right) => feedbackEventTime(right) - feedbackEventTime(left) || left.sessionId.localeCompare(right.sessionId))
}

function latestCompletedAnsweredSessionId(records: DashboardTicketFeedbackTelemetryRecord[]) {
  return completedAnsweredFeedback(records)[0]?.sessionId || null
}

function inRange(value: number | null | undefined, request: DashboardQualityReviewQuery) {
  return typeof value === "number" && Number.isFinite(value) && value >= request.fromMs && value <= request.toMs
}

function snapshotForTicket(
  ticketId: string,
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[],
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
): DashboardTicketTelemetrySnapshot | null {
  const feedback = feedbackRecords
    .filter((record) => record.ticketId === ticketId)
    .sort((left, right) => feedbackEventTime(right) - feedbackEventTime(left))[0]
  if (feedback) return feedback.snapshot

  const lifecycle = lifecycleRecords
    .filter((record) => record.ticketId === ticketId)
    .sort((left, right) => right.occurredAt - left.occurredAt)[0]
  return lifecycle?.snapshot || null
}

function earliestTelemetryTime(
  ticketId: string,
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[],
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
) {
  const times = [
    ...feedbackRecords.filter((record) => record.ticketId === ticketId).map(feedbackEventTime),
    ...lifecycleRecords.filter((record) => record.ticketId === ticketId).map((record) => record.occurredAt)
  ].filter((value) => Number.isFinite(value))
  return times.length ? Math.min(...times) : null
}

function latestTelemetryTime(
  ticketId: string,
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[],
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[],
  fallback: number
) {
  const times = [
    ...feedbackRecords.filter((record) => record.ticketId === ticketId).map(feedbackEventTime),
    ...lifecycleRecords.filter((record) => record.ticketId === ticketId).map((record) => record.occurredAt)
  ].filter((value) => Number.isFinite(value))
  return times.length ? Math.max(...times) : fallback
}

function syntheticReviewCase(input: {
  ticketId: string
  firstKnownAt: number | null
  lastSignalAt: number
  latestCompletedAnsweredSessionId: string | null
}): DashboardQualityReviewCaseSummary {
  return {
    ticketId: input.ticketId,
    stored: false,
    state: "unreviewed",
    ownerUserId: null,
    ownerLabel: "Unassigned",
    createdAt: input.firstKnownAt || input.lastSignalAt,
    updatedAt: input.firstKnownAt || input.lastSignalAt,
    resolvedAt: null,
    lastSignalAt: input.lastSignalAt,
    noteCount: 0,
    rawFeedbackStatus: "none",
    latestRawFeedbackSessionId: null
  }
}

function buildCaseSignals(records: QualityReviewRecordWithMatches[]): DashboardQualityReviewCaseSignal[] {
  return records.map((item) => {
    const feedbackRecords = item.allWindowFeedback
    const lifecycleRecords = item.allWindowReopens
    return {
      ticketId: item.record.ticketId,
      firstKnownAt: item.record.openedAt,
      lastSignalAt: item.record.latestMatchedSignalAt,
      latestCompletedAnsweredSessionId: latestCompletedAnsweredSessionId(feedbackRecords)
    }
  })
}

function statusBadge(status: "open" | "closed") {
  return status === "open"
    ? { label: "Open", tone: "success" as DashboardTone }
    : { label: "Closed", tone: "muted" as DashboardTone }
}

function feedbackBadge(status: DashboardTicketFeedbackStoredStatus | "none") {
  switch (status) {
    case "completed":
      return { label: "Completed feedback", tone: "success" as DashboardTone }
    case "ignored":
      return { label: "Ignored feedback", tone: "warning" as DashboardTone }
    case "delivery_failed":
      return { label: "Delivery failed", tone: "danger" as DashboardTone }
    default:
      return { label: "No feedback", tone: "muted" as DashboardTone }
  }
}

function displayRecordWithTelemetrySignals(
  record: DashboardQualityReviewRecord,
  signal: DashboardTicketTelemetrySignals | null | undefined
): DashboardQualityReviewRecord {
  if (!signal) return record
  const latestFeedbackStatus = signal.latestFeedbackStatus === "none"
    ? record.latestFeedbackStatus
    : signal.latestFeedbackStatus
  const reopenCount = Math.max(record.reopenCount, Number.isFinite(signal.reopenCount) ? signal.reopenCount : 0)
  const lastReopenedAt = signal.lastReopenedAt == null
    ? record.lastReopenedAt
    : Math.max(record.lastReopenedAt || 0, signal.lastReopenedAt)

  return {
    ...record,
    latestFeedbackStatus,
    reopenCount,
    lastReopenedAt
  }
}

function matchedSignalLabel(kinds: DashboardQualityReviewSignalKind[]) {
  if (kinds.includes("feedback") && kinds.includes("reopened")) return "Feedback and reopen"
  if (kinds.includes("feedback")) return "Feedback"
  if (kinds.includes("reopened")) return "Reopened"
  return "Matched"
}

function recordSearchText(record: DashboardQualityReviewRecord) {
  return [
    record.ticketId,
    record.resourceName || "",
    record.creatorUserId || "",
    record.creatorLabel,
    record.assigneeUserId || "",
    record.assigneeLabel,
    record.teamId || "",
    record.teamLabel,
    record.optionId || "",
    record.optionLabel,
    record.transportMode || "",
    record.currentStatus,
    record.reviewCase.state,
    record.reviewCase.ownerUserId || "",
    record.reviewCase.ownerLabel,
    record.reviewCase.rawFeedbackStatus
  ].join(" ").toLowerCase()
}

function matchesFilters(record: DashboardQualityReviewRecord, request: DashboardQualityReviewQuery, actorUserId = "") {
  if (request.status !== "all" && record.currentStatus !== request.status) return false
  if (request.transport !== "all" && record.transportMode !== request.transport) return false
  if (request.reviewState === "active" && record.reviewCase.state === "resolved") return false
  if (request.reviewState !== "active" && request.reviewState !== "all" && record.reviewCase.state !== request.reviewState) return false
  if (request.ownerId === "me" && (!actorUserId || record.reviewCase.ownerUserId !== actorUserId)) return false
  if (request.ownerId === "unassigned" && record.reviewCase.ownerUserId) return false
  if (request.ownerId && request.ownerId !== "me" && request.ownerId !== "unassigned" && record.reviewCase.ownerUserId !== request.ownerId) return false
  if (request.rawFeedback !== "all" && record.reviewCase.rawFeedbackStatus !== request.rawFeedback) return false
  if (request.teamId && record.teamId !== request.teamId) return false
  if (request.assigneeId && record.assigneeUserId !== request.assigneeId) return false
  if (request.q && !recordSearchText(record).includes(request.q.toLowerCase())) return false
  return true
}

function matchesTelemetryFilters(record: DashboardQualityReviewRecord, request: DashboardQualityReviewQuery) {
  if (request.status !== "all" && record.currentStatus !== request.status) return false
  if (request.transport !== "all" && record.transportMode !== request.transport) return false
  if (request.teamId && record.teamId !== request.teamId) return false
  if (request.assigneeId && record.assigneeUserId !== request.assigneeId) return false
  return true
}

function sortReviewRecords(records: QualityReviewRecordWithMatches[], sort: DashboardQualityReviewSort) {
  return [...records].sort((left, right) => {
    switch (sort) {
      case "signal-asc":
        return left.record.latestMatchedSignalAt - right.record.latestMatchedSignalAt || left.record.ticketId.localeCompare(right.record.ticketId)
      case "opened-desc":
        return (right.record.openedAt || 0) - (left.record.openedAt || 0) || left.record.ticketId.localeCompare(right.record.ticketId)
      case "opened-asc":
        return (left.record.openedAt || 0) - (right.record.openedAt || 0) || left.record.ticketId.localeCompare(right.record.ticketId)
      default:
        return right.record.latestMatchedSignalAt - left.record.latestMatchedSignalAt || left.record.ticketId.localeCompare(right.record.ticketId)
    }
  })
}

function buildReviewRecord(input: {
  ticketId: string
  liveTicket: DashboardTicketRecord | null
  snapshot: DashboardTicketTelemetrySnapshot | null
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[]
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
  request: DashboardQualityReviewQuery
  configService: DashboardConfigService
}): QualityReviewRecordWithMatches | null {
  const { ticketId, liveTicket, snapshot, request } = input
  const lookups = buildConfigLookups(input.configService)
  const allWindowFeedback = input.feedbackRecords
    .filter((record) => record.ticketId === ticketId && inRange(feedbackEventTime(record), request))
    .sort((left, right) => feedbackEventTime(right) - feedbackEventTime(left) || left.sessionId.localeCompare(right.sessionId))
  const allWindowReopens = input.lifecycleRecords
    .filter((record) => record.ticketId === ticketId && record.eventType === "reopened" && inRange(record.occurredAt, request))
    .sort((left, right) => right.occurredAt - left.occurredAt || left.recordId.localeCompare(right.recordId))
  const matchedFeedback = request.feedback === "all"
    ? allWindowFeedback
    : allWindowFeedback.filter((record) => record.status === request.feedback)

  let matchedReopens = allWindowReopens
  if (request.reopened === "never") {
    matchedReopens = []
  } else if (request.reopened === "ever") {
    matchedReopens = allWindowReopens.length > 0 ? allWindowReopens : []
  }

  const feedbackQualifies = request.signal !== "reopened" && matchedFeedback.length > 0
  const reopenedQualifies = request.signal !== "feedback" && request.reopened !== "never" && matchedReopens.length > 0
  const neverReopenedQualifies = request.reopened === "never" && request.signal !== "reopened" && matchedFeedback.length > 0 && allWindowReopens.length === 0

  if (!feedbackQualifies && !reopenedQualifies && !neverReopenedQualifies) {
    return null
  }

  const matchedSignalKinds: DashboardQualityReviewSignalKind[] = []
  if (feedbackQualifies || neverReopenedQualifies) matchedSignalKinds.push("feedback")
  if (reopenedQualifies) matchedSignalKinds.push("reopened")
  const matchedTimes = [
    ...((feedbackQualifies || neverReopenedQualifies) ? matchedFeedback.map(feedbackEventTime) : []),
    ...(reopenedQualifies ? matchedReopens.map((record) => record.occurredAt) : [])
  ].filter((value) => Number.isFinite(value))

  const optionId = normalizeString(liveTicket?.optionId) || normalizeString(snapshot?.optionId) || null
  const teamId = normalizeString(liveTicket?.assignedTeamId) || normalizeString(snapshot?.assignedTeamId) || null
  const assigneeUserId = normalizeString(liveTicket?.assignedStaffUserId) || normalizeString(snapshot?.assignedStaffUserId) || null
  const creatorUserId = normalizeString(liveTicket?.creatorId) || normalizeString(snapshot?.creatorUserId) || null
  const transportMode = normalizeTransport(liveTicket?.transportMode) || normalizeTransport(snapshot?.transportMode)
  const openedAt = liveTicket?.openedOn || earliestTelemetryTime(ticketId, input.feedbackRecords, input.lifecycleRecords)
  const currentStatus = liveTicket ? liveTicket.open && !liveTicket.closed ? "open" : "closed" : "closed"
  const resourceName = normalizeString(liveTicket?.channelName) || normalizeString(liveTicket?.channelSuffix) || null
  const latestFeedbackStatus = allWindowFeedback[0]?.status || "none"
  const lastReopenedAt = allWindowReopens[0]?.occurredAt || null
  const record: DashboardQualityReviewRecord = {
    ticketId,
    live: Boolean(liveTicket),
    resourceName,
    openedAt,
    currentStatus,
    transportMode,
    teamId,
    teamLabel: resolveTeamLabel(lookups.teamById, teamId),
    assigneeUserId,
    assigneeLabel: unknownAssigneeLabel(assigneeUserId),
    creatorUserId,
    creatorLabel: unknownCreatorLabel(creatorUserId),
    optionId,
    optionLabel: resolveOptionLabel(lookups.optionById, optionId),
    latestFeedbackStatus,
    reopenCount: allWindowReopens.length,
    lastReopenedAt,
    reviewCase: syntheticReviewCase({
      ticketId,
      firstKnownAt: openedAt,
      lastSignalAt: matchedTimes.length ? Math.max(...matchedTimes) : (openedAt || request.fromMs),
      latestCompletedAnsweredSessionId: latestCompletedAnsweredSessionId(allWindowFeedback)
    }),
    matchedSignalKinds,
    latestMatchedSignalAt: matchedTimes.length ? Math.max(...matchedTimes) : (openedAt || request.fromMs)
  }

  if (!matchesTelemetryFilters(record, request)) {
    return null
  }

  return {
    record,
    matchedFeedback: (feedbackQualifies || neverReopenedQualifies) ? matchedFeedback : [],
    matchedReopens: reopenedQualifies ? matchedReopens : [],
    allWindowFeedback,
    allWindowReopens
  }
}

function buildSummary(records: QualityReviewRecordWithMatches[]): DashboardQualityReviewSummary {
  const completedFeedback = records.reduce((sum, item) => sum + item.matchedFeedback.filter((record) => record.status === "completed").length, 0)
  const ignoredFeedback = records.reduce((sum, item) => sum + item.matchedFeedback.filter((record) => record.status === "ignored").length, 0)
  const deliveryFailed = records.reduce((sum, item) => sum + item.matchedFeedback.filter((record) => record.status === "delivery_failed").length, 0)
  const reopenedTickets = new Set(records.filter((item) => item.matchedReopens.length > 0).map((item) => item.record.ticketId)).size
  return {
    ticketsInReview: records.length,
    completedFeedback,
    ignoredFeedback,
    deliveryFailed,
    reopenedTickets
  }
}

function buildSummaryCards(summary: DashboardQualityReviewSummary): DashboardSummaryCardInput[] {
  return [
    { label: "Tickets In Review", value: String(summary.ticketsInReview), detail: "Tickets with selected review signals", tone: summary.ticketsInReview > 0 ? "success" : "muted" },
    { label: "Completed Feedback", value: String(summary.completedFeedback), detail: "Completed feedback sessions in scope", tone: summary.completedFeedback > 0 ? "success" : "muted" },
    { label: "Ignored Feedback", value: String(summary.ignoredFeedback), detail: "Ignored feedback sessions in scope", tone: summary.ignoredFeedback > 0 ? "warning" : "muted" },
    { label: "Delivery Failed", value: String(summary.deliveryFailed), detail: "Feedback delivery failures in scope", tone: summary.deliveryFailed > 0 ? "danger" : "muted" },
    { label: "Reopened Tickets", value: String(summary.reopenedTickets), detail: "Tickets reopened in scope", tone: summary.reopenedTickets > 0 ? "warning" : "muted" }
  ]
}

function unavailableListModel(basePath: string, query: DashboardQualityReviewQuery, currentHref: string, configService: DashboardConfigService, warningMessage: string): DashboardQualityReviewListModel {
  const summary = buildSummary([])
  return {
    available: false,
    warningMessage,
    telemetryWarningMessage: "",
    filterAction: joinBasePath(basePath, "admin/quality-review"),
    clearFiltersHref: joinBasePath(basePath, "admin/quality-review"),
    currentHref,
    request: query,
    summary,
    summaryCards: buildSummaryCards(summary),
    total: 0,
    pageStart: 0,
    pageEnd: 0,
    previousHref: null,
    nextHref: null,
    pageLinks: [{ page: 1, href: buildQualityReviewHref(basePath, query, 1), active: true }],
    supportTeams: buildConfigLookups(configService).supportTeams,
    items: []
  }
}

async function collectFeedbackTelemetry(
  runtimeBridge: DashboardRuntimeBridge,
  query: Parameters<NonNullable<DashboardRuntimeBridge["listFeedbackTelemetry"]>>[0],
  maxPages = TELEMETRY_MAX_PAGES,
  pageLimit = TELEMETRY_PAGE_LIMIT
): Promise<QualityTelemetryCollection<DashboardTicketFeedbackTelemetryRecord>> {
  if (!runtimeBridge.listFeedbackTelemetry) return { items: [], warnings: ["Ticket telemetry reads are unavailable."], truncated: false, available: false }
  const items: DashboardTicketFeedbackTelemetryRecord[] = []
  const warnings: string[] = []
  let cursor: string | null = null
  let truncated = false

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const result = await runtimeBridge.listFeedbackTelemetry({ ...query, cursor, limit: pageLimit })
      items.push(...result.items)
      warnings.push(...result.warnings)
      truncated = truncated || result.truncated
      if (!result.nextCursor) break
      cursor = result.nextCursor
      if (page === maxPages - 1) truncated = true
    }
  } catch {
    return { items: [], warnings: ["Ticket feedback telemetry could not be read."], truncated: false, available: false }
  }

  return { items, warnings, truncated, available: true }
}

async function collectLifecycleTelemetry(
  runtimeBridge: DashboardRuntimeBridge,
  query: Parameters<NonNullable<DashboardRuntimeBridge["listLifecycleTelemetry"]>>[0],
  maxPages = TELEMETRY_MAX_PAGES,
  pageLimit = TELEMETRY_PAGE_LIMIT
): Promise<QualityTelemetryCollection<DashboardTicketLifecycleTelemetryRecord>> {
  if (!runtimeBridge.listLifecycleTelemetry) return { items: [], warnings: ["Ticket telemetry reads are unavailable."], truncated: false, available: false }
  const items: DashboardTicketLifecycleTelemetryRecord[] = []
  const warnings: string[] = []
  let cursor: string | null = null
  let truncated = false

  try {
    for (let page = 0; page < maxPages; page += 1) {
      const result = await runtimeBridge.listLifecycleTelemetry({ ...query, cursor, limit: pageLimit })
      items.push(...result.items)
      warnings.push(...result.warnings)
      truncated = truncated || result.truncated
      if (!result.nextCursor) break
      cursor = result.nextCursor
      if (page === maxPages - 1) truncated = true
    }
  } catch {
    return { items: [], warnings: ["Ticket lifecycle telemetry could not be read."], truncated: false, available: false }
  }

  return { items, warnings, truncated, available: true }
}

function uniqueWarnings(...warningSets: string[][]) {
  return [...new Set(warningSets.flat().map(normalizeString).filter(Boolean))]
}

export async function buildDashboardQualityReviewListModel(input: {
  basePath: string
  projectRoot: string
  currentHref: string
  query: Record<string, unknown>
  configService: DashboardConfigService
  runtimeBridge: DashboardRuntimeBridge
  actorUserId?: string
  now?: number
}): Promise<DashboardQualityReviewListModel> {
  const request = parseDashboardQualityReviewQuery(input.query, { now: input.now })
  const currentHref = input.currentHref || buildQualityReviewHref(input.basePath, request)
  if (!supportsTicketTelemetryReads(input.runtimeBridge)) {
    return unavailableListModel(
      input.basePath,
      request,
      currentHref,
      input.configService,
      "Ticket telemetry reads are unavailable; the quality-review workspace cannot build a review queue."
    )
  }

  const snapshot = input.runtimeBridge.getSnapshot(input.projectRoot)
  const liveTickets = snapshot.ticketSummary.available === true ? input.runtimeBridge.listTickets() : []
  const liveById = new Map(liveTickets.map((ticket) => [ticket.id, ticket]))
  const [feedback, lifecycle] = await Promise.all([
    collectFeedbackTelemetry(input.runtimeBridge, {
      since: request.fromMs,
      until: request.toMs,
      statuses: request.feedback === "all" ? undefined : [request.feedback]
    }),
    collectLifecycleTelemetry(input.runtimeBridge, {
      since: request.fromMs,
      until: request.toMs,
      eventTypes: ["reopened"]
    })
  ])

  if (!feedback.available || !lifecycle.available) {
    return unavailableListModel(
      input.basePath,
      request,
      currentHref,
      input.configService,
      uniqueWarnings(feedback.warnings, lifecycle.warnings)[0] || "Ticket telemetry reads are unavailable; the quality-review workspace cannot build a review queue."
    )
  }

  const ids = new Set<string>()
  feedback.items.forEach((record) => ids.add(record.ticketId))
  lifecycle.items.forEach((record) => ids.add(record.ticketId))

  const telemetryRecords = sortReviewRecords([...ids].map((ticketId) => buildReviewRecord({
    ticketId,
    liveTicket: liveById.get(ticketId) || null,
    snapshot: snapshotForTicket(ticketId, feedback.items, lifecycle.items),
    feedbackRecords: feedback.items,
    lifecycleRecords: lifecycle.items,
    request,
    configService: input.configService
  })).filter((record): record is QualityReviewRecordWithMatches => Boolean(record)), request.sort)
  const qualityReviewWarnings: string[] = []
  let records = telemetryRecords
  if (input.runtimeBridge.listQualityReviewCases && telemetryRecords.length > 0) {
    try {
      const caseResult = await input.runtimeBridge.listQualityReviewCases({ tickets: buildCaseSignals(telemetryRecords) }, normalizeString(input.actorUserId))
      qualityReviewWarnings.push(...caseResult.warnings)
      const caseByTicket = new Map(caseResult.cases.map((reviewCase) => [reviewCase.ticketId, reviewCase]))
      records = telemetryRecords.map((item) => ({
        ...item,
        record: {
          ...item.record,
          reviewCase: caseByTicket.get(item.record.ticketId) || item.record.reviewCase
        }
      }))
    } catch {
      qualityReviewWarnings.push("Quality review cases could not be read.")
    }
  }
  records = records.filter((item) => matchesFilters(item.record, request, normalizeString(input.actorUserId)))

  const totalPages = Math.max(1, Math.ceil(records.length / request.limit))
  const page = Math.min(request.page, totalPages)
  const startIndex = (page - 1) * request.limit
  const pageRecords = records.slice(startIndex, startIndex + request.limit)
  let visibleSignals: Record<string, DashboardTicketTelemetrySignals> = {}
  if (pageRecords.length > 0 && input.runtimeBridge.getTicketTelemetrySignals) {
    visibleSignals = await input.runtimeBridge.getTicketTelemetrySignals(pageRecords.map((item) => item.record.ticketId)).catch(() => ({}))
  }

  const summary = buildSummary(records)
  const telemetryWarnings = uniqueWarnings(feedback.warnings, lifecycle.warnings)
  telemetryWarnings.push(...uniqueWarnings(qualityReviewWarnings))
  if (feedback.truncated || lifecycle.truncated) {
    telemetryWarnings.push("Ticket telemetry exceeded the quality-review scan ceiling; results may be incomplete.")
  }

  return {
    available: true,
    warningMessage: "",
    telemetryWarningMessage: telemetryWarnings[0] || "",
    filterAction: joinBasePath(input.basePath, "admin/quality-review"),
    clearFiltersHref: joinBasePath(input.basePath, "admin/quality-review"),
    currentHref,
    request: { ...request, page },
    summary,
    summaryCards: buildSummaryCards(summary),
    total: records.length,
    pageStart: records.length > 0 ? startIndex + 1 : 0,
    pageEnd: startIndex + pageRecords.length,
    previousHref: page > 1 ? buildQualityReviewHref(input.basePath, request, page - 1) : null,
    nextHref: page < totalPages ? buildQualityReviewHref(input.basePath, request, page + 1) : null,
    pageLinks: Array.from({ length: totalPages }, (_item, index) => index + 1)
      .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
      .map((pageNumber) => ({
        page: pageNumber,
        href: buildQualityReviewHref(input.basePath, request, pageNumber),
        active: pageNumber === page
      })),
    supportTeams: buildConfigLookups(input.configService).supportTeams,
    items: pageRecords.map((item) => {
      const record = displayRecordWithTelemetrySignals(item.record, visibleSignals[item.record.ticketId])
      return {
        record,
        detailHref: buildQualityReviewDetailHref(input.basePath, request, record.ticketId, currentHref),
        statusBadge: statusBadge(record.currentStatus),
        feedbackBadge: feedbackBadge(record.latestFeedbackStatus),
        reviewStateBadge: reviewStateBadge(record.reviewCase.state),
        rawFeedbackBadge: rawFeedbackBadge(record.reviewCase.rawFeedbackStatus),
        reopenBadge: record.reopenCount > 0
          ? { label: `Reopened x${record.reopenCount}`, tone: "warning" as DashboardTone }
          : null,
        transportLabel: transportLabel(record.transportMode),
        openedLabel: formatDate(record.openedAt),
        latestSignalLabel: formatDate(record.latestMatchedSignalAt),
        matchedSignalLabel: matchedSignalLabel(record.matchedSignalKinds),
        searchText: recordSearchText(record)
      }
    })
  }
}

function buildStandaloneRecord(input: {
  ticketId: string
  liveTicket: DashboardTicketRecord | null
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[]
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
  request: DashboardQualityReviewQuery
  configService: DashboardConfigService
}) {
  const record = buildReviewRecord({
    ...input,
    snapshot: snapshotForTicket(input.ticketId, input.feedbackRecords, input.lifecycleRecords)
  })
  if (record) return record.record

  const lookups = buildConfigLookups(input.configService)
  const snapshot = snapshotForTicket(input.ticketId, input.feedbackRecords, input.lifecycleRecords)
  const optionId = normalizeString(input.liveTicket?.optionId) || normalizeString(snapshot?.optionId) || null
  const teamId = normalizeString(input.liveTicket?.assignedTeamId) || normalizeString(snapshot?.assignedTeamId) || null
  const assigneeUserId = normalizeString(input.liveTicket?.assignedStaffUserId) || normalizeString(snapshot?.assignedStaffUserId) || null
  const creatorUserId = normalizeString(input.liveTicket?.creatorId) || normalizeString(snapshot?.creatorUserId) || null
  const transportMode = normalizeTransport(input.liveTicket?.transportMode) || normalizeTransport(snapshot?.transportMode)
  const allFeedback = input.feedbackRecords
    .filter((item) => item.ticketId === input.ticketId)
    .sort((left, right) => feedbackEventTime(right) - feedbackEventTime(left))
  const allReopens = input.lifecycleRecords
    .filter((item) => item.ticketId === input.ticketId && item.eventType === "reopened")
    .sort((left, right) => right.occurredAt - left.occurredAt)
  const openedAt = input.liveTicket?.openedOn || earliestTelemetryTime(input.ticketId, input.feedbackRecords, input.lifecycleRecords)
  const latestSignal = Math.max(
    ...[
      ...allFeedback.map(feedbackEventTime),
      ...input.lifecycleRecords.filter((item) => item.ticketId === input.ticketId).map((item) => item.occurredAt),
      openedAt || input.request.fromMs
    ]
  )
  return {
    ticketId: input.ticketId,
    live: Boolean(input.liveTicket),
    resourceName: normalizeString(input.liveTicket?.channelName) || normalizeString(input.liveTicket?.channelSuffix) || null,
    openedAt,
    currentStatus: input.liveTicket ? input.liveTicket.open && !input.liveTicket.closed ? "open" as const : "closed" as const : "closed" as const,
    transportMode,
    teamId,
    teamLabel: resolveTeamLabel(lookups.teamById, teamId),
    assigneeUserId,
    assigneeLabel: unknownAssigneeLabel(assigneeUserId),
    creatorUserId,
    creatorLabel: unknownCreatorLabel(creatorUserId),
    optionId,
    optionLabel: resolveOptionLabel(lookups.optionById, optionId),
    latestFeedbackStatus: allFeedback[0]?.status || "none" as const,
    reopenCount: allReopens.length,
    lastReopenedAt: allReopens[0]?.occurredAt || null,
    reviewCase: syntheticReviewCase({
      ticketId: input.ticketId,
      firstKnownAt: openedAt,
      lastSignalAt: latestSignal,
      latestCompletedAnsweredSessionId: latestCompletedAnsweredSessionId(allFeedback)
    }),
    matchedSignalKinds: [] as DashboardQualityReviewSignalKind[],
    latestMatchedSignalAt: latestSignal
  }
}

function defaultCaseDetailFromSummary(summary: DashboardQualityReviewCaseSummary): DashboardQualityReviewCaseDetailRecord {
  return {
    ...summary,
    notes: [],
    rawFeedback: []
  }
}

function rawFeedbackBySession(records: DashboardQualityReviewRawFeedbackRecord[]) {
  return new Map(records.map((record) => [record.sessionId, record]))
}

function rawAnswerValue(answer: DashboardQualityReviewRawFeedbackRecord["answers"][number]) {
  if (!answer.answered) return "No answer"
  if (answer.type === "text") return answer.textValue || ""
  if (answer.type === "rating") return answer.ratingValue === null ? "Unavailable" : String(answer.ratingValue)
  if (answer.type === "choice") return answer.choiceLabel || (answer.choiceIndex === null ? "Unavailable" : String(answer.choiceIndex))
  return answer.assets.length > 0 ? `${answer.assets.length} mirrored asset${answer.assets.length === 1 ? "" : "s"}` : "No mirrored asset"
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 1) return "0 B"
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function buildRawAssetHref(basePath: string, ticketId: string, sessionId: string, assetId: string) {
  return joinBasePath(basePath, `admin/quality-review/${encodeURIComponent(ticketId)}/feedback/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(assetId)}`)
}

function buildRawFeedbackSessionModels(input: {
  basePath: string
  ticketId: string
  feedbackHistory: DashboardTicketFeedbackTelemetryRecord[]
  reviewCase: DashboardQualityReviewCaseDetailRecord
  canManage: boolean
}): DashboardQualityReviewRawFeedbackSessionModel[] {
  const completedSessionOrder = new Map(completedAnsweredFeedback(input.feedbackHistory).map((session, index) => [session.sessionId, index]))
  return [...input.reviewCase.rawFeedback]
    .sort((left, right) => {
      const leftOrder = completedSessionOrder.get(left.sessionId)
      const rightOrder = completedSessionOrder.get(right.sessionId)
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
      }
      return right.capturedAt - left.capturedAt || left.sessionId.localeCompare(right.sessionId)
    })
    .map((raw) => {
    const badge = rawFeedbackBadge(raw.storageStatus)
    return {
      sessionId: raw.sessionId,
      statusLabel: badge.label,
      statusTone: badge.tone,
      capturedAt: formatDate(raw.capturedAt),
      expiresAt: formatDate(raw.retentionExpiresAt),
      warnings: raw.warnings,
      answers: raw.answers.map((answer) => ({
        position: answer.position,
        type: answer.type,
        label: answer.label,
        answered: answer.answered,
        value: rawAnswerValue(answer),
        assets: answer.assets.map((asset) => ({
          assetId: asset.assetId,
          fileName: asset.fileName,
          contentType: asset.contentType || "application/octet-stream",
          byteSize: formatBytes(asset.byteSize),
          status: asset.captureStatus,
          reason: asset.reason || "",
          downloadHref: input.canManage && asset.captureStatus === "mirrored"
            ? buildRawAssetHref(input.basePath, input.ticketId, raw.sessionId, asset.assetId)
            : null
        }))
      }))
    }
  })
}

export async function buildDashboardQualityReviewDetailModel(input: {
  basePath: string
  projectRoot: string
  ticketId: string
  actorUserId: string
  currentHref: string
  returnTo: unknown
  query: Record<string, unknown>
  configService: DashboardConfigService
  runtimeBridge: DashboardRuntimeBridge
  ticketWorkbenchAccessible?: boolean
  canManage?: boolean
  ownerChoices?: Array<{ value: string; label: string }>
  now?: number
}): Promise<DashboardQualityReviewDetailModel> {
  const request = parseDashboardQualityReviewQuery(input.query, { now: input.now })
  const backHref = sanitizeQualityReviewReturnTo(input.basePath, input.returnTo)
  const currentHref = input.currentHref || joinBasePath(input.basePath, `admin/quality-review/${encodeURIComponent(input.ticketId)}`)
  const actionHref = (actionId: string) => joinBasePath(input.basePath, `admin/quality-review/${encodeURIComponent(input.ticketId)}/actions/${actionId}`)
  const baseEmpty = {
    adjudicationFacts: [] as Array<{ label: string; value: string }>,
    canManage: Boolean(input.canManage),
    stateActionHref: actionHref("set-state"),
    assignOwnerActionHref: actionHref("assign-owner"),
    clearOwnerActionHref: actionHref("clear-owner"),
    addNoteActionHref: actionHref("add-note"),
    ownerChoices: input.ownerChoices || [],
    rawFeedbackSessions: [] as DashboardQualityReviewRawFeedbackSessionModel[]
  }
  if (!supportsTicketTelemetryReads(input.runtimeBridge)) {
    return {
      available: false,
      warningMessage: "Ticket telemetry reads are unavailable; the quality-review detail cannot be loaded.",
      backHref,
      currentHref,
      ticketWorkbenchHref: null,
      detailRecord: null,
      summaryCards: buildSummaryCards(buildSummary([])),
      facts: [],
      latestFeedbackFacts: [],
      ratingRows: [],
      ...baseEmpty,
      feedbackRows: [],
      reopenRows: [],
      lifecycleRows: []
    }
  }

  const snapshot = input.runtimeBridge.getSnapshot(input.projectRoot)
  const liveTicket = snapshot.ticketSummary.available === true
    ? input.runtimeBridge.listTickets().find((ticket) => ticket.id === input.ticketId) || null
    : null
  const [feedbackCollection, lifecycleCollection] = await Promise.all([
    collectFeedbackTelemetry(input.runtimeBridge, { ticketId: input.ticketId, order: "desc" }, 1, DETAIL_FEEDBACK_LIMIT),
    collectLifecycleTelemetry(input.runtimeBridge, { ticketId: input.ticketId, order: "desc" }, 1, DETAIL_LIFECYCLE_LIMIT)
  ])

  if (!feedbackCollection.available || !lifecycleCollection.available) {
    return {
      available: false,
      warningMessage: uniqueWarnings(feedbackCollection.warnings, lifecycleCollection.warnings)[0] || "Ticket telemetry reads are unavailable; the quality-review detail cannot be loaded.",
      backHref,
      currentHref,
      ticketWorkbenchHref: null,
      detailRecord: null,
      summaryCards: buildSummaryCards(buildSummary([])),
      facts: [],
      latestFeedbackFacts: [],
      ratingRows: [],
      ...baseEmpty,
      feedbackRows: [],
      reopenRows: [],
      lifecycleRows: []
    }
  }

  const allFeedback = feedbackCollection.items
    .filter((record) => record.ticketId === input.ticketId)
    .sort((left, right) => feedbackEventTime(right) - feedbackEventTime(left) || left.sessionId.localeCompare(right.sessionId))
  const allLifecycle = lifecycleCollection.items
    .filter((record) => record.ticketId === input.ticketId)
    .sort((left, right) => right.occurredAt - left.occurredAt || left.recordId.localeCompare(right.recordId))
  if (!liveTicket && allFeedback.length < 1 && allLifecycle.length < 1) {
    return {
      available: true,
      warningMessage: "",
      backHref,
      currentHref,
      ticketWorkbenchHref: null,
      detailRecord: null,
      summaryCards: buildSummaryCards(buildSummary([])),
      facts: [],
      latestFeedbackFacts: [],
      ratingRows: [],
      ...baseEmpty,
      feedbackRows: [],
      reopenRows: [],
      lifecycleRows: []
    }
  }
  const loadedFeedback = allFeedback.slice(0, DETAIL_FEEDBACK_LIMIT)
  const loadedLifecycle = allLifecycle.slice(0, DETAIL_LIFECYCLE_LIMIT)
  let historicalSummary = buildStandaloneRecord({
    ticketId: input.ticketId,
    liveTicket,
    feedbackRecords: allFeedback,
    lifecycleRecords: allLifecycle,
    request,
    configService: input.configService
  })

  let liveDetail: DashboardTicketDetailRecord | null = null
  if (liveTicket && typeof input.runtimeBridge.getTicketDetail === "function") {
    liveDetail = await input.runtimeBridge.getTicketDetail(input.ticketId, input.actorUserId).catch(() => null)
  }
  if (!liveDetail && liveTicket) {
    liveDetail = buildFallbackTicketDetail({ ticket: liveTicket, configService: input.configService })
  }

  const matchedWindowEventIds = [
    ...allFeedback.filter((record) => inRange(feedbackEventTime(record), request)).map((record) => record.sessionId),
    ...allLifecycle.filter((record) => record.eventType === "reopened" && inRange(record.occurredAt, request)).map((record) => record.recordId)
  ]
  let reviewCase = defaultCaseDetailFromSummary(historicalSummary.reviewCase)
  if (typeof input.runtimeBridge.getQualityReviewCase === "function") {
    const loaded = await input.runtimeBridge.getQualityReviewCase(input.ticketId, input.actorUserId).catch(() => null)
    if (loaded) {
      reviewCase = loaded
      historicalSummary = {
        ...historicalSummary,
        reviewCase
      }
    }
  }
  const matchedSet = new Set(matchedWindowEventIds)
  const telemetryWarning = allFeedback.length > DETAIL_FEEDBACK_LIMIT || allLifecycle.length > DETAIL_LIFECYCLE_LIMIT || feedbackCollection.truncated || lifecycleCollection.truncated
    ? HISTORY_TRUNCATED_WARNING
    : null
  const latestFeedbackSession = loadedFeedback[0] || null
  const reopenEvents = loadedLifecycle.filter((record) => record.eventType === "reopened")
  const detailRecord: DashboardQualityReviewDetailRecord = {
    ticketId: input.ticketId,
    liveTicket: liveDetail,
    historicalSummary,
    latestFeedbackSession,
    feedbackHistory: loadedFeedback,
    reopenEvents,
    lifecycleEvents: loadedLifecycle,
    reviewCase,
    completedAnsweredFeedbackSessionIds: completedAnsweredFeedback(loadedFeedback).map((record) => record.sessionId),
    matchedWindowEventIds,
    telemetryWarning
  }

  const facts = [
    { label: "Status", value: statusLabel(historicalSummary.currentStatus) },
    { label: "Route", value: historicalSummary.optionLabel },
    { label: "Team", value: historicalSummary.teamLabel },
    { label: "Assignee", value: historicalSummary.assigneeLabel },
    { label: "Creator", value: historicalSummary.creatorLabel },
    { label: "Transport", value: transportLabel(historicalSummary.transportMode) },
    { label: "Opened", value: formatDate(historicalSummary.openedAt) }
  ]
  const latestFeedbackFacts = latestFeedbackSession
    ? [
        { label: "Status", value: feedbackLabel(latestFeedbackSession.status) },
        { label: "Triggered", value: formatDate(latestFeedbackSession.triggeredAt) },
        { label: "Completed", value: formatDate(latestFeedbackSession.completedAt) },
        { label: "Respondent", value: normalizeString(latestFeedbackSession.respondentUserId) || "Unknown respondent" }
      ]
    : []
  const adjudicationFacts = [
    { label: "Review state", value: reviewStateLabel(reviewCase.state) },
    { label: "Owner", value: reviewCase.ownerLabel },
    { label: "Notes", value: String(reviewCase.noteCount) },
    { label: "Raw feedback", value: rawFeedbackLabel(reviewCase.rawFeedbackStatus) },
    { label: "Last signal", value: formatDate(reviewCase.lastSignalAt) },
    { label: "Resolved", value: formatDate(reviewCase.resolvedAt) }
  ]

  return {
    available: true,
    warningMessage: "",
    backHref,
    currentHref,
    ticketWorkbenchHref: input.ticketWorkbenchAccessible && liveTicket
      ? `${joinBasePath(input.basePath, `admin/tickets/${encodeURIComponent(input.ticketId)}`)}?returnTo=${encodeURIComponent(currentHref)}`
      : null,
    detailRecord,
    summaryCards: buildSummaryCards({
      ticketsInReview: 1,
      completedFeedback: loadedFeedback.filter((record) => record.status === "completed").length,
      ignoredFeedback: loadedFeedback.filter((record) => record.status === "ignored").length,
      deliveryFailed: loadedFeedback.filter((record) => record.status === "delivery_failed").length,
      reopenedTickets: reopenEvents.length > 0 ? 1 : 0
    }),
    facts,
    latestFeedbackFacts,
    ratingRows: (latestFeedbackSession?.questionSummaries || [])
      .filter((question) => question.type === "rating")
      .map((question) => ({
        label: question.label,
        value: question.ratingValue === null ? "Unavailable" : String(question.ratingValue),
        answered: question.ratingValue !== null
      })),
    adjudicationFacts,
    canManage: Boolean(input.canManage),
    stateActionHref: actionHref("set-state"),
    assignOwnerActionHref: actionHref("assign-owner"),
    clearOwnerActionHref: actionHref("clear-owner"),
    addNoteActionHref: actionHref("add-note"),
    ownerChoices: input.ownerChoices || [],
    rawFeedbackSessions: buildRawFeedbackSessionModels({
      basePath: input.basePath,
      ticketId: input.ticketId,
      feedbackHistory: loadedFeedback,
      reviewCase,
      canManage: Boolean(input.canManage)
    }),
    feedbackRows: loadedFeedback.map((record) => ({
      id: record.sessionId,
      status: feedbackLabel(record.status),
      triggeredAt: formatDate(record.triggeredAt),
      completedAt: formatDate(record.completedAt),
      matched: matchedSet.has(record.sessionId)
    })),
    reopenRows: reopenEvents.map((record) => ({
      id: record.recordId,
      occurredAt: formatDate(record.occurredAt),
      actor: normalizeString(record.actorUserId) || "Unknown actor",
      matched: matchedSet.has(record.recordId)
    })),
    lifecycleRows: loadedLifecycle.map((record) => ({
      id: record.recordId,
      type: record.eventType,
      occurredAt: formatDate(record.occurredAt),
      actor: normalizeString(record.actorUserId) || "Unknown actor",
      matched: matchedSet.has(record.recordId)
    }))
  }
}
