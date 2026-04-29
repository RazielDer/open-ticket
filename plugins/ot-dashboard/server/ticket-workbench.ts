import { joinBasePath } from "./dashboard-config"
import { formatDate, type DashboardTone } from "./control-center"
import type { DashboardConfigService } from "./config-service"
import type { DashboardTicketRecord } from "./dashboard-runtime-registry"
import type { DashboardI18n } from "./i18n"
import type {
  DashboardTicketActionAvailability,
  DashboardTicketActionId,
  DashboardTicketBulkActionId,
  DashboardTicketDetailRecord,
  DashboardTicketEscalationTargetChoice,
  DashboardTicketFeedbackStatus,
  DashboardTicketLifecycleTelemetryRecord,
  DashboardTicketProviderLock,
  DashboardTicketQueueAttention,
  DashboardTicketQueueFacts,
  DashboardTicketQueueState,
  DashboardTicketQueueSummary,
  DashboardTicketTeamQueueSummary,
  DashboardTicketTelemetrySignals,
  DashboardTicketTransportMode,
  DashboardTicketWorkbenchSavedViewSummary,
  DashboardPreparedExportReleaseModel,
  DashboardTicketWorkbenchViewRecord
} from "./ticket-workbench-types"
import { DASHBOARD_TICKET_ACTION_IDS } from "./ticket-workbench-types"

export const TICKET_WORKBENCH_STATUS_FILTERS = ["all", "open", "closed", "claimed", "unclaimed"] as const
export const TICKET_WORKBENCH_TRANSPORT_FILTERS = ["all", "channel_text", "private_thread"] as const
export const TICKET_WORKBENCH_FEEDBACK_FILTERS = ["all", "completed", "ignored", "delivery_failed", "none"] as const
export const TICKET_WORKBENCH_REOPENED_FILTERS = ["all", "ever", "never"] as const
export const TICKET_WORKBENCH_QUEUE_STATE_FILTERS = ["all", "waiting_staff", "owned", "awaiting_user", "close_requested", "resolved"] as const
export const TICKET_WORKBENCH_ATTENTION_FILTERS = ["all", "first-response", "unassigned", "stale-owner", "close-request", "awaiting-user"] as const
export const TICKET_WORKBENCH_SORTS = ["queue-priority", "activity-desc", "activity-asc", "opened-desc", "opened-asc"] as const
export const TICKET_WORKBENCH_LIMITS = [10, 25, 50, 100] as const
export const TICKET_QUEUE_OWNED_ANCHOR_EVENT_TYPES = ["claimed", "assigned", "unclaimed", "unassigned", "escalated"] as const
export const TICKET_WORKBENCH_UNASSIGNED_TEAM_ID = "__unassigned"
const TICKET_WORKBENCH_TEAM_DEPTH_DEGRADED_REASON = "tickets.page.teamDepthDegraded"
export const TICKET_WORKBENCH_SAVED_VIEW_QUERY_KEYS = [
  "q",
  "status",
  "transport",
  "feedback",
  "reopened",
  "queueState",
  "attention",
  "teamId",
  "assigneeId",
  "optionId",
  "panelId",
  "creatorId",
  "sort",
  "limit"
] as const

type TicketWorkbenchTranslator = DashboardI18n["t"]

export type TicketWorkbenchStatusFilter = (typeof TICKET_WORKBENCH_STATUS_FILTERS)[number]
export type TicketWorkbenchTransportFilter = (typeof TICKET_WORKBENCH_TRANSPORT_FILTERS)[number]
export type TicketWorkbenchFeedbackFilter = (typeof TICKET_WORKBENCH_FEEDBACK_FILTERS)[number]
export type TicketWorkbenchReopenedFilter = (typeof TICKET_WORKBENCH_REOPENED_FILTERS)[number]
export type TicketWorkbenchQueueStateFilter = (typeof TICKET_WORKBENCH_QUEUE_STATE_FILTERS)[number]
export type TicketWorkbenchAttentionFilter = (typeof TICKET_WORKBENCH_ATTENTION_FILTERS)[number]
export type TicketWorkbenchSort = (typeof TICKET_WORKBENCH_SORTS)[number]

interface ConfigRecord {
  id?: unknown
  name?: unknown
  type?: unknown
  options?: unknown
  channel?: {
    transportMode?: unknown
  }
  routing?: {
    supportTeamId?: unknown
    escalationTargetOptionIds?: unknown
  }
}

export interface TicketWorkbenchListRequest {
  q: string
  status: TicketWorkbenchStatusFilter
  transport: TicketWorkbenchTransportFilter
  feedback: TicketWorkbenchFeedbackFilter
  reopened: TicketWorkbenchReopenedFilter
  queueState: TicketWorkbenchQueueStateFilter
  attention: TicketWorkbenchAttentionFilter
  teamId: string
  assigneeId: string
  optionId: string
  panelId: string
  creatorId: string
  sort: TicketWorkbenchSort
  limit: number
  page: number
  viewId: string
  statusOptions: Array<{ value: TicketWorkbenchStatusFilter; label: string }>
  transportOptions: Array<{ value: TicketWorkbenchTransportFilter; label: string }>
  feedbackOptions: Array<{ value: TicketWorkbenchFeedbackFilter; label: string }>
  reopenedOptions: Array<{ value: TicketWorkbenchReopenedFilter; label: string }>
  queueStateOptions: Array<{ value: TicketWorkbenchQueueStateFilter; label: string }>
  attentionOptions: Array<{ value: TicketWorkbenchAttentionFilter; label: string }>
  sortOptions: Array<{ value: TicketWorkbenchSort; label: string }>
  limitOptions: number[]
}

export interface TicketWorkbenchExportRow {
  ticketId: string
  resourceName: string
  closed: boolean
  claimed: boolean
  transportMode: DashboardTicketTransportMode | null
  panelId: string | null
  panelLabel: string
  optionId: string | null
  optionLabel: string
  creatorUserId: string | null
  creatorLabel: string
  assignedTeamId: string | null
  teamLabel: string
  assignedStaffUserId: string | null
  assigneeLabel: string
  telemetryAvailable: boolean
  latestFeedbackStatus: DashboardTicketFeedbackStatus | null
  reopenCount: number | null
  lastReopenedAt: number | null
}

export interface TicketWorkbenchListModel {
  available: boolean
  warningMessage: string
  telemetryWarningMessage: string
  queueWarningMessage: string
  filterAction: string
  clearFiltersHref: string
  currentHref: string
  request: TicketWorkbenchListRequest
  total: number
  unfilteredTotal: number
  pageStart: number
  pageEnd: number
  previousHref: string | null
  nextHref: string | null
  pageLinks: Array<{ page: number; href: string; active: boolean }>
  activeFilters: Array<{ label: string; value: string }>
  filteredSummary: {
    cards: Array<{ label: string; value: string; tone: DashboardTone }>
  }
  bulkActions: {
    returnTo: string
    claimSelfAction: string
    unclaimAction: string
    closeAction: string
    reopenAction: string
  } | null
  exportActions: {
    jsonAction: string
    csvAction: string
    action: string
    returnTo: string
    release: DashboardPreparedExportReleaseModel | null
  }
  qualityReviewHref: string | null
  savedViews: {
    available: boolean
    createAction: string
    activeView: DashboardTicketWorkbenchSavedViewSummary | null
    privateViews: DashboardTicketWorkbenchSavedViewSummary[]
    sharedViews: DashboardTicketWorkbenchSavedViewSummary[]
    currentQuery: Record<string, string>
    canManageShared: boolean
    unavailableMessage: string
  }
  teamQueueSummaries: DashboardTicketTeamQueueSummary[]
  options: Array<{ id: string; label: string }>
  panels: Array<{ id: string; label: string }>
  supportTeams: Array<{ id: string; label: string }>
  exportRows: TicketWorkbenchExportRow[]
  allExportRows: TicketWorkbenchExportRow[]
  items: Array<{
    id: string
    optionLabel: string
    panelLabel: string
    creatorLabel: string
    teamLabel: string
    assigneeLabel: string
    transportLabel: string
    channelNameLabel: string
    statusBadge: { label: string; tone: DashboardTone }
    queueStateBadge: { label: string; tone: DashboardTone }
    attentionBadges: Array<{ label: string; tone: DashboardTone }>
    queueAnchorLabel: string
    feedbackBadge: { label: string; tone: DashboardTone } | null
    reopenBadge: { label: string; tone: DashboardTone } | null
    openedLabel: string
    activityLabel: string
    detailHref: string
    searchText: string
  }>
}

export interface TicketWorkbenchActionForm {
  action: DashboardTicketActionId
  title: string
  body: string
  actionHref: string
  availability: DashboardTicketActionAvailability
  needsReason: boolean
  choices: Array<{ value: string; label: string }>
  choiceName: "assigneeUserId" | "targetOptionId" | "newCreatorUserId" | "participantUserId" | "priorityId" | null
  choiceLabel: string | null
  textName: "topic" | "renameName" | null
  textValue: string
  textLabel: string | null
  textPlaceholder: string | null
  buttonVariant: "primary" | "secondary" | "danger"
}

export interface TicketWorkbenchDetailModel {
  available: boolean
  warningMessage: string
  backHref: string
  listHref: string
  writesSupported: boolean
  detail: DashboardTicketDetailRecord | null
  exportAction: string
  exportRelease: DashboardPreparedExportReleaseModel | null
  facts: Array<{ label: string; value: string }>
  summaryCards: Array<{ label: string; value: string; detail: string; tone?: DashboardTone }>
  actionForms: TicketWorkbenchActionForm[]
  advancedActionForms: TicketWorkbenchActionForm[]
  deferredActions: string[]
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter(Boolean)
    : []
}

function normalizeTransport(value: unknown): DashboardTicketTransportMode | null {
  return value === "channel_text" || value === "private_thread" ? value : null
}

function isDashboardTicketActionId(value: string): value is DashboardTicketActionId {
  return (DASHBOARD_TICKET_ACTION_IDS as readonly string[]).includes(value)
}

export function parseDashboardTicketActionId(value: unknown): DashboardTicketActionId | null {
  const normalized = normalizeString(value)
  return isDashboardTicketActionId(normalized) ? normalized : null
}

export function parseDashboardTicketBulkActionId(value: unknown): DashboardTicketBulkActionId | null {
  const normalized = normalizeString(value)
  return normalized === "claim-self" || normalized === "unclaim" || normalized === "close" || normalized === "reopen"
    ? normalized
    : null
}

function enumOrDefault<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  const normalized = normalizeString(value)
  return values.includes(normalized) ? normalized as T[number] : fallback
}

function intOrDefault(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
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

function buildPageHref(basePath: string, request: TicketWorkbenchListRequest, page: number) {
  return appendQuery(joinBasePath(basePath, "admin/tickets"), {
    q: request.q,
    status: request.status === "all" ? "" : request.status,
    transport: request.transport === "all" ? "" : request.transport,
    feedback: request.feedback === "all" ? "" : request.feedback,
    reopened: request.reopened === "all" ? "" : request.reopened,
    queueState: request.queueState === "all" ? "" : request.queueState,
    attention: request.attention === "all" ? "" : request.attention,
    teamId: request.teamId,
    assigneeId: request.assigneeId,
    optionId: request.optionId,
    panelId: request.panelId,
    creatorId: request.creatorId,
    sort: request.sort === "queue-priority" ? "" : request.sort,
    limit: request.limit === 25 ? "" : request.limit,
    viewId: request.viewId,
    page
  })
}

export function buildTicketWorkbenchSavedViewHref(basePath: string, view: DashboardTicketWorkbenchViewRecord) {
  return appendQuery(joinBasePath(basePath, "admin/tickets"), {
    ...view.query,
    viewId: view.viewId,
    page: 1
  })
}

export function removeTicketWorkbenchViewIdFromHref(href: string) {
  const url = new URL(`http://dashboard.local${href}`)
  url.searchParams.delete("viewId")
  return `${url.pathname}${url.search}`
}

export function sanitizeTicketWorkbenchReturnTo(basePath: string, candidate: unknown) {
  const fallback = joinBasePath(basePath, "admin/tickets")
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
  const workbenchRoot = `${normalizedBasePath}/admin/tickets`
  if (candidate === workbenchRoot) return candidate
  if (candidate.startsWith(`${workbenchRoot}?`)) return candidate
  if (candidate.startsWith(`${workbenchRoot}/`)) return candidate
  return fallback
}

export function parseTicketWorkbenchListRequest(query: Record<string, unknown>): TicketWorkbenchListRequest {
  const limitCandidate = intOrDefault(query.limit, 25)
  const limit = TICKET_WORKBENCH_LIMITS.includes(limitCandidate as any) ? limitCandidate : 25

  return {
    q: normalizeString(query.q),
    status: enumOrDefault(query.status, TICKET_WORKBENCH_STATUS_FILTERS, "all"),
    transport: enumOrDefault(query.transport, TICKET_WORKBENCH_TRANSPORT_FILTERS, "all"),
    feedback: enumOrDefault(query.feedback, TICKET_WORKBENCH_FEEDBACK_FILTERS, "all"),
    reopened: enumOrDefault(query.reopened, TICKET_WORKBENCH_REOPENED_FILTERS, "all"),
    queueState: enumOrDefault(query.queueState, TICKET_WORKBENCH_QUEUE_STATE_FILTERS, "all"),
    attention: enumOrDefault(query.attention, TICKET_WORKBENCH_ATTENTION_FILTERS, "all"),
    teamId: normalizeString(query.teamId),
    assigneeId: normalizeString(query.assigneeId),
    optionId: normalizeString(query.optionId),
    panelId: normalizeString(query.panelId),
    creatorId: normalizeString(query.creatorId),
    sort: enumOrDefault(query.sort, TICKET_WORKBENCH_SORTS, "queue-priority"),
    limit,
    page: intOrDefault(query.page, 1),
    viewId: normalizeString(query.viewId),
    statusOptions: [
      { value: "all", label: "All" },
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
      { value: "claimed", label: "Claimed" },
      { value: "unclaimed", label: "Unclaimed" }
    ],
    transportOptions: [
      { value: "all", label: "All transports" },
      { value: "channel_text", label: "Channel tickets" },
      { value: "private_thread", label: "Private threads" }
    ],
    feedbackOptions: [
      { value: "all", label: "All feedback" },
      { value: "completed", label: "Feedback complete" },
      { value: "ignored", label: "Feedback ignored" },
      { value: "delivery_failed", label: "Feedback failed" },
      { value: "none", label: "No feedback" }
    ],
    reopenedOptions: [
      { value: "all", label: "All reopen history" },
      { value: "ever", label: "Ever reopened" },
      { value: "never", label: "Never reopened" }
    ],
    queueStateOptions: [
      { value: "all", label: "All queue states" },
      { value: "waiting_staff", label: "Waiting on staff" },
      { value: "owned", label: "Owned" },
      { value: "awaiting_user", label: "Awaiting user" },
      { value: "close_requested", label: "Close requested" },
      { value: "resolved", label: "Resolved" }
    ],
    attentionOptions: [
      { value: "all", label: "All attention" },
      { value: "first-response", label: "First response overdue" },
      { value: "unassigned", label: "Unassigned" },
      { value: "stale-owner", label: "Stale owner" },
      { value: "close-request", label: "Close request overdue" },
      { value: "awaiting-user", label: "Awaiting user" }
    ],
    sortOptions: [
      { value: "queue-priority", label: "Queue priority" },
      { value: "activity-desc", label: "Recent activity first" },
      { value: "activity-asc", label: "Oldest activity first" },
      { value: "opened-desc", label: "Newest opened first" },
      { value: "opened-asc", label: "Oldest opened first" }
    ],
    limitOptions: [...TICKET_WORKBENCH_LIMITS]
  }
}

function readConfigArray(configService: DashboardConfigService, id: "options" | "panels" | "support-teams") {
  try {
    const value = configService.readManagedJson<ConfigRecord[]>(id)
    return {
      records: Array.isArray(value) ? value : [],
      unavailable: false
    }
  } catch {
    return {
      records: [],
      unavailable: true
    }
  }
}

function buildConfigLookups(configService: DashboardConfigService) {
  const optionsRead = readConfigArray(configService, "options")
  const panelsRead = readConfigArray(configService, "panels")
  const supportTeamsRead = readConfigArray(configService, "support-teams")
  const options = optionsRead.records
  const panels = panelsRead.records
  const supportTeams = supportTeamsRead.records

  const optionById = new Map<string, ConfigRecord>()
  const panelById = new Map<string, ConfigRecord>()
  const teamById = new Map<string, ConfigRecord>()
  const panelForOption = new Map<string, ConfigRecord>()

  for (const option of options) {
    const id = normalizeString(option.id)
    if (id) optionById.set(id, option)
  }

  for (const panel of panels) {
    const id = normalizeString(panel.id)
    if (id) panelById.set(id, panel)
    for (const optionId of asStringArray(panel.options)) {
      if (!panelForOption.has(optionId)) {
        panelForOption.set(optionId, panel)
      }
    }
  }

  for (const team of supportTeams) {
    const id = normalizeString(team.id)
    if (id) teamById.set(id, team)
  }

  return {
    options,
    panels,
    supportTeams,
    optionById,
    panelById,
    teamById,
    panelForOption,
    unavailable: {
      options: optionsRead.unavailable,
      panels: panelsRead.unavailable,
      supportTeams: supportTeamsRead.unavailable
    }
  }
}

function labelFromRecord(record: ConfigRecord | null | undefined, fallback: string) {
  return normalizeString(record?.name) || normalizeString(record?.id) || fallback
}

function resolveOptionLabel(optionById: Map<string, ConfigRecord>, optionId: string | null) {
  if (!optionId) return "Missing option"
  const option = optionById.get(optionId)
  return option ? labelFromRecord(option, optionId) : `Missing option (${optionId})`
}

function resolveTeamLabel(teamById: Map<string, ConfigRecord>, teamId: string | null) {
  if (!teamId) return "No team"
  const team = teamById.get(teamId)
  return team ? labelFromRecord(team, teamId) : `Missing team (${teamId})`
}

function resolvePanelMapping(panelForOption: Map<string, ConfigRecord>, optionId: string | null) {
  const panel = optionId ? panelForOption.get(optionId) : null
  const panelId = normalizeString(panel?.id) || null
  return {
    panelId,
    panelLabel: panelId ? labelFromRecord(panel, panelId) : "Missing panel"
  }
}

function unknownUserLabel(userId: string | null) {
  return userId ? `Unknown user (${userId})` : "Unassigned"
}

function transportLabel(mode: string | null) {
  if (mode === "private_thread") return "Private thread"
  if (mode === "channel_text") return "Channel"
  return "Unknown transport"
}

function statusBadge(ticket: DashboardTicketRecord): { label: string; tone: DashboardTone } {
  if (ticket.closed) return { label: "Closed", tone: "muted" }
  if (ticket.claimed) return { label: "Claimed", tone: "success" }
  if (ticket.open) return { label: "Open", tone: "warning" }
  return { label: "Unknown", tone: "muted" }
}

function defaultTelemetrySignals(): DashboardTicketTelemetrySignals {
  return {
    hasEverReopened: false,
    reopenCount: 0,
    lastReopenedAt: null,
    latestFeedbackStatus: "none",
    latestFeedbackTriggeredAt: null,
    latestFeedbackCompletedAt: null,
    latestRatings: []
  }
}

function hasQueryValue(query: Record<string, unknown>, key: string) {
  const value = query[key]
  if (Array.isArray(value)) return value.some((entry) => normalizeString(entry))
  return normalizeString(value).length > 0
}

export function ticketWorkbenchSavedQueryFromRequest(request: TicketWorkbenchListRequest): Record<string, string> {
  const query: Record<string, string> = {}
  if (request.q) query.q = request.q
  if (request.status !== "all") query.status = request.status
  if (request.transport !== "all") query.transport = request.transport
  if (request.feedback !== "all") query.feedback = request.feedback
  if (request.reopened !== "all") query.reopened = request.reopened
  if (request.queueState !== "all") query.queueState = request.queueState
  if (request.attention !== "all") query.attention = request.attention
  if (request.teamId) query.teamId = request.teamId
  if (request.assigneeId) query.assigneeId = request.assigneeId
  if (request.optionId) query.optionId = request.optionId
  if (request.panelId) query.panelId = request.panelId
  if (request.creatorId) query.creatorId = request.creatorId
  if (request.sort !== "queue-priority") query.sort = request.sort
  if (request.limit !== 25) query.limit = String(request.limit)
  return query
}

export function normalizeTicketWorkbenchSavedViewQuery(query: Record<string, unknown>): Record<string, string> {
  const request = parseTicketWorkbenchListRequest(query)
  const normalized: Record<string, string> = {}
  if (hasQueryValue(query, "q") && request.q) normalized.q = request.q
  if (hasQueryValue(query, "status")) normalized.status = request.status
  if (hasQueryValue(query, "transport")) normalized.transport = request.transport
  if (hasQueryValue(query, "feedback")) normalized.feedback = request.feedback
  if (hasQueryValue(query, "reopened")) normalized.reopened = request.reopened
  if (hasQueryValue(query, "queueState")) normalized.queueState = request.queueState
  if (hasQueryValue(query, "attention")) normalized.attention = request.attention
  if (hasQueryValue(query, "teamId") && request.teamId) normalized.teamId = request.teamId
  if (hasQueryValue(query, "assigneeId") && request.assigneeId) normalized.assigneeId = request.assigneeId
  if (hasQueryValue(query, "optionId") && request.optionId) normalized.optionId = request.optionId
  if (hasQueryValue(query, "panelId") && request.panelId) normalized.panelId = request.panelId
  if (hasQueryValue(query, "creatorId") && request.creatorId) normalized.creatorId = request.creatorId
  if (hasQueryValue(query, "sort")) normalized.sort = request.sort
  if (hasQueryValue(query, "limit")) normalized.limit = String(request.limit)
  return normalized
}

function ticketTelemetrySignal(signals: Record<string, DashboardTicketTelemetrySignals> | undefined, ticketId: string) {
  return signals?.[ticketId] || defaultTelemetrySignals()
}

function feedbackBadge(status: DashboardTicketFeedbackStatus): { label: string; tone: DashboardTone } {
  if (status === "completed") return { label: "Feedback complete", tone: "success" }
  if (status === "ignored") return { label: "Feedback ignored", tone: "warning" }
  if (status === "delivery_failed") return { label: "Feedback failed", tone: "danger" }
  return { label: "No feedback", tone: "muted" }
}

function activityTime(ticket: DashboardTicketRecord) {
  return Math.max(
    ticket.resolvedAt || 0,
    ticket.reopenedOn || 0,
    ticket.closedOn || 0,
    ticket.claimedOn || 0,
    ticket.pinnedOn || 0,
    ticket.openedOn || 0
  )
}

const HOUR_MS = 60 * 60 * 1000
export const TICKET_QUEUE_FIRST_RESPONSE_OVERDUE_MS = 24 * HOUR_MS
export const TICKET_QUEUE_STALE_OWNER_MS = 72 * HOUR_MS
export const TICKET_QUEUE_CLOSE_REQUEST_OVERDUE_MS = 24 * HOUR_MS

function nowOrDefault(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now()
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isTicketQueueOwnedAnchorEvent(value: string) {
  return (TICKET_QUEUE_OWNED_ANCHOR_EVENT_TYPES as readonly string[]).includes(value)
}

function ticketHasStaffOwner(ticket: DashboardTicketRecord) {
  return Boolean(normalizeString(ticket.assignedStaffUserId) || (ticket.claimed ? normalizeString(ticket.claimedBy) : ""))
}

export function deriveDashboardTicketQueueState(ticket: DashboardTicketRecord): DashboardTicketQueueState {
  if (ticket.closed) return "resolved"
  if (ticket.closeRequestState === "requested") return "close_requested"
  if (ticket.awaitingUserState === "waiting" || ticket.awaitingUserState === "reminded") return "awaiting_user"
  if (ticket.open && ticket.firstStaffResponseAt == null) return "waiting_staff"
  return "owned"
}

function latestOwnedAnchorForTicket(
  ticketId: string,
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
) {
  let latest: number | null = null
  for (const record of lifecycleRecords) {
    if (record.ticketId !== ticketId || !isTicketQueueOwnedAnchorEvent(record.eventType)) continue
    if (latest == null || record.occurredAt > latest) {
      latest = record.occurredAt
    }
  }
  return latest
}

function queueAnchorForTicket(
  ticket: DashboardTicketRecord,
  queueState: DashboardTicketQueueState,
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
) {
  if (queueState === "waiting_staff") return finiteNumberOrNull(ticket.openedOn)
  if (queueState === "owned") {
    const anchors = [
      finiteNumberOrNull(ticket.firstStaffResponseAt),
      latestOwnedAnchorForTicket(ticket.id, lifecycleRecords),
      finiteNumberOrNull(ticket.openedOn)
    ].filter((value): value is number => value != null)
    return anchors.length ? Math.max(...anchors) : null
  }
  if (queueState === "awaiting_user") return finiteNumberOrNull(ticket.awaitingUserSince)
  if (queueState === "close_requested") return finiteNumberOrNull(ticket.closeRequestAt)
  return null
}

function isAtLeastAge(anchor: number | null, now: number, thresholdMs: number) {
  return anchor != null && now - anchor >= thresholdMs
}

export function projectDashboardTicketQueueFacts(
  ticket: DashboardTicketRecord,
  input: {
    lifecycleRecords?: DashboardTicketLifecycleTelemetryRecord[]
    lifecycleAvailable?: boolean
    unavailableReason?: string | null
    now?: number
  } = {}
): DashboardTicketQueueFacts {
  const now = nowOrDefault(input.now)
  const lifecycleRecords = Array.isArray(input.lifecycleRecords) ? input.lifecycleRecords : []
  const lifecycleAvailable = input.lifecycleAvailable !== false
  const unavailableReason = normalizeString(input.unavailableReason) || null
  const queueState = deriveDashboardTicketQueueState(ticket)
  const queueAnchorAt = queueAnchorForTicket(ticket, queueState, lifecycleRecords)
  const firstResponseOverdue = queueState === "waiting_staff" && isAtLeastAge(finiteNumberOrNull(ticket.openedOn), now, TICKET_QUEUE_FIRST_RESPONSE_OVERDUE_MS)
  const unassignedAttention = (queueState === "waiting_staff" || queueState === "owned") && !ticketHasStaffOwner(ticket)
  const staleOwner = lifecycleAvailable && queueState === "owned" && isAtLeastAge(queueAnchorAt, now, TICKET_QUEUE_STALE_OWNER_MS)
  const closeRequestAttention = queueState === "close_requested" && isAtLeastAge(finiteNumberOrNull(ticket.closeRequestAt), now, TICKET_QUEUE_CLOSE_REQUEST_OVERDUE_MS)
  const awaitingUserAttention = queueState === "awaiting_user"
  const attention: DashboardTicketQueueAttention[] = []
  if (firstResponseOverdue) attention.push("first-response")
  if (unassignedAttention) attention.push("unassigned")
  if (staleOwner) attention.push("stale-owner")
  if (closeRequestAttention) attention.push("close-request")
  if (awaitingUserAttention) attention.push("awaiting-user")

  return {
    ticketId: ticket.id,
    queueState,
    queueAnchorAt,
    attention,
    firstResponseOverdue,
    unassignedAttention,
    staleOwner,
    closeRequestAttention,
    awaitingUserAttention,
    unavailableReason
  }
}

export function buildDashboardTicketQueueFactsMap(
  tickets: DashboardTicketRecord[],
  input: {
    lifecycleRecords?: DashboardTicketLifecycleTelemetryRecord[]
    lifecycleAvailable?: boolean
    unavailableReason?: string | null
    now?: number
  } = {}
) {
  return Object.fromEntries(tickets.map((ticket) => [
    ticket.id,
    projectDashboardTicketQueueFacts(ticket, input)
  ])) as Record<string, DashboardTicketQueueFacts>
}

export function buildTicketQueueSummary(
  tickets: DashboardTicketRecord[],
  input: {
    lifecycleRecords?: DashboardTicketLifecycleTelemetryRecord[]
    lifecycleAvailable?: boolean
    unavailableReason?: string | null
    now?: number
  } = {}
): DashboardTicketQueueSummary {
  const facts = Object.values(buildDashboardTicketQueueFactsMap(tickets, input))
  const active = facts.filter((item) => item.queueState !== "resolved")
  return {
    activeCount: active.length,
    waitingStaffCount: active.filter((item) => item.queueState === "waiting_staff").length,
    firstResponseOverdueCount: active.filter((item) => item.firstResponseOverdue).length,
    unassignedCount: active.filter((item) => item.unassignedAttention).length,
    staleOwnerCount: active.filter((item) => item.staleOwner).length,
    closeRequestCount: active.filter((item) => item.closeRequestAttention).length,
    awaitingUserCount: active.filter((item) => item.awaitingUserAttention).length,
    unavailableReason: normalizeString(input.unavailableReason) || null
  }
}

function queueStateBadge(state: DashboardTicketQueueState): { label: string; tone: DashboardTone } {
  if (state === "waiting_staff") return { label: "Waiting on staff", tone: "warning" }
  if (state === "owned") return { label: "Owned", tone: "success" }
  if (state === "awaiting_user") return { label: "Awaiting user", tone: "muted" }
  if (state === "close_requested") return { label: "Close requested", tone: "warning" }
  return { label: "Resolved", tone: "muted" }
}

function attentionBadge(attention: DashboardTicketQueueAttention): { label: string; tone: DashboardTone } {
  if (attention === "first-response") return { label: "First response overdue", tone: "danger" }
  if (attention === "unassigned") return { label: "Unassigned", tone: "warning" }
  if (attention === "stale-owner") return { label: "Stale owner", tone: "warning" }
  if (attention === "close-request") return { label: "Close request overdue", tone: "warning" }
  return { label: "Awaiting user", tone: "muted" }
}

function applyListFilters(
  tickets: DashboardTicketRecord[],
  request: TicketWorkbenchListRequest,
  lookups: ReturnType<typeof buildConfigLookups>,
  telemetrySignals: Record<string, DashboardTicketTelemetrySignals>,
  telemetrySupported: boolean,
  queueFacts: Record<string, DashboardTicketQueueFacts>
) {
  const q = request.q.toLowerCase()
  return tickets.filter((ticket) => {
    const panel = resolvePanelMapping(lookups.panelForOption, ticket.optionId)
    const optionLabel = resolveOptionLabel(lookups.optionById, ticket.optionId)
    const teamLabel = resolveTeamLabel(lookups.teamById, ticket.assignedTeamId)
    const assigneeLabel = unknownUserLabel(ticket.assignedStaffUserId)
    const creatorLabel = unknownUserLabel(ticket.creatorId)
    const telemetry = ticketTelemetrySignal(telemetrySignals, ticket.id)
    const queue = queueFacts[ticket.id]

    if (request.status === "open" && !ticket.open) return false
    if (request.status === "closed" && !ticket.closed) return false
    if (request.status === "claimed" && !ticket.claimed) return false
    if (request.status === "unclaimed" && ticket.claimed) return false
    if (request.transport !== "all" && ticket.transportMode !== request.transport) return false
    if (request.teamId === TICKET_WORKBENCH_UNASSIGNED_TEAM_ID) {
      if (ticket.assignedTeamId && (lookups.unavailable.supportTeams || lookups.teamById.has(ticket.assignedTeamId))) return false
    } else if (request.teamId && ticket.assignedTeamId !== request.teamId) return false
    if (request.assigneeId && ticket.assignedStaffUserId !== request.assigneeId) return false
    if (request.optionId && ticket.optionId !== request.optionId) return false
    if (request.panelId && panel.panelId !== request.panelId) return false
    if (request.creatorId && ticket.creatorId !== request.creatorId) return false
    if (telemetrySupported && request.feedback !== "all" && telemetry.latestFeedbackStatus !== request.feedback) return false
    if (telemetrySupported && request.reopened === "ever" && !telemetry.hasEverReopened) return false
    if (telemetrySupported && request.reopened === "never" && telemetry.hasEverReopened) return false
    if (request.queueState !== "all" && queue?.queueState !== request.queueState) return false
    if (request.attention !== "all" && !queue?.attention.includes(request.attention)) return false

    if (!q) return true
    return [
      ticket.id,
      ticket.optionId || "",
      optionLabel,
      ticket.channelName || "",
      ticket.channelSuffix || "",
      panel.panelId || "",
      panel.panelLabel,
      ticket.creatorId || "",
      creatorLabel,
      ticket.assignedTeamId || "",
      teamLabel,
      ticket.assignedStaffUserId || "",
      assigneeLabel,
      queue?.queueState || "",
      ...(queue?.attention || [])
    ].join(" ").toLowerCase().includes(q)
  })
}

function ticketQueuePriorityRank(facts: DashboardTicketQueueFacts) {
  if (facts.firstResponseOverdue) return 0
  if (facts.unassignedAttention) return 1
  if (facts.staleOwner) return 2
  if (facts.closeRequestAttention) return 3
  if (facts.awaitingUserAttention) return 4
  if (facts.queueState !== "resolved") return 5
  return 6
}

function compareQueuePriorityTickets(
  left: DashboardTicketRecord,
  right: DashboardTicketRecord,
  queueFacts: Record<string, DashboardTicketQueueFacts>
) {
  const leftFacts = queueFacts[left.id] || projectDashboardTicketQueueFacts(left)
  const rightFacts = queueFacts[right.id] || projectDashboardTicketQueueFacts(right)
  const leftRank = ticketQueuePriorityRank(leftFacts)
  const rightRank = ticketQueuePriorityRank(rightFacts)
  if (leftRank !== rightRank) return leftRank - rightRank

  const leftAnchor = leftFacts.queueAnchorAt
  const rightAnchor = rightFacts.queueAnchorAt
  if (leftRank >= 0 && leftRank <= 4) {
    const leftValue = leftAnchor == null ? Number.POSITIVE_INFINITY : leftAnchor
    const rightValue = rightAnchor == null ? Number.POSITIVE_INFINITY : rightAnchor
    if (leftValue !== rightValue) return leftValue - rightValue
  } else if (leftRank === 5) {
    const leftValue = leftAnchor == null ? Number.NEGATIVE_INFINITY : leftAnchor
    const rightValue = rightAnchor == null ? Number.NEGATIVE_INFINITY : rightAnchor
    if (leftValue !== rightValue) return rightValue - leftValue
  }

  const leftActivity = activityTime(left)
  const rightActivity = activityTime(right)
  if (leftActivity !== rightActivity) return rightActivity - leftActivity
  return left.id.localeCompare(right.id)
}

function sortTickets(
  tickets: DashboardTicketRecord[],
  sort: TicketWorkbenchSort,
  queueFacts: Record<string, DashboardTicketQueueFacts>
) {
  const sorted = [...tickets]
  sorted.sort((left, right) => {
    if (sort === "queue-priority") {
      return compareQueuePriorityTickets(left, right, queueFacts)
    }
    const leftValue = sort.startsWith("opened") ? left.openedOn || 0 : activityTime(left)
    const rightValue = sort.startsWith("opened") ? right.openedOn || 0 : activityTime(right)
    return sort.endsWith("asc") ? leftValue - rightValue : rightValue - leftValue
  })
  return sorted
}

function buildActiveFilters(request: TicketWorkbenchListRequest, lookups: ReturnType<typeof buildConfigLookups>) {
  const filters: Array<{ label: string; value: string }> = []
  if (request.q) filters.push({ label: "Search", value: request.q })
  if (request.status !== "all") filters.push({ label: "Status", value: request.status })
  if (request.transport !== "all") filters.push({ label: "Transport", value: transportLabel(request.transport) })
  if (request.feedback !== "all") filters.push({ label: "Feedback", value: feedbackBadge(request.feedback).label })
  if (request.reopened !== "all") filters.push({ label: "Reopened", value: request.reopened === "ever" ? "Ever reopened" : "Never reopened" })
  if (request.queueState !== "all") filters.push({ label: "Queue", value: queueStateBadge(request.queueState).label })
  if (request.attention !== "all") filters.push({ label: "Attention", value: attentionBadge(request.attention).label })
  if (request.teamId) {
    filters.push({
      label: "Team",
      value: request.teamId === TICKET_WORKBENCH_UNASSIGNED_TEAM_ID
        ? "Unassigned/no team"
        : lookups.unavailable.supportTeams && request.teamId
          ? `Team unavailable (${request.teamId})`
          : resolveTeamLabel(lookups.teamById, request.teamId)
    })
  }
  if (request.assigneeId) filters.push({ label: "Assignee", value: unknownUserLabel(request.assigneeId) })
  if (request.optionId) filters.push({ label: "Option", value: resolveOptionLabel(lookups.optionById, request.optionId) })
  if (request.panelId) filters.push({ label: "Panel", value: labelFromRecord(lookups.panelById.get(request.panelId), `Missing panel (${request.panelId})`) })
  if (request.creatorId) filters.push({ label: "Creator", value: unknownUserLabel(request.creatorId) })
  if (request.sort !== "queue-priority") filters.push({ label: "Sort", value: request.sort })
  if (request.limit !== 25) filters.push({ label: "Rows", value: String(request.limit) })
  return filters
}

function buildTeamQueueSummaries(
  basePath: string,
  tickets: DashboardTicketRecord[],
  lookups: ReturnType<typeof buildConfigLookups>,
  queueFacts: Record<string, DashboardTicketQueueFacts>
): DashboardTicketTeamQueueSummary[] {
  const buckets = new Map<string | null, {
    teamId: string | null
    teamLabel: string
    tickets: DashboardTicketRecord[]
  }>()
  const supportTeamsUnavailable = lookups.unavailable.supportTeams

  for (const ticket of tickets) {
    const configuredTeamId = normalizeString(ticket.assignedTeamId)
    const teamId = configuredTeamId && (supportTeamsUnavailable || lookups.teamById.has(configuredTeamId)) ? configuredTeamId : null
    const teamLabel = teamId
      ? supportTeamsUnavailable && !lookups.teamById.has(teamId)
        ? `Team unavailable (${teamId})`
        : resolveTeamLabel(lookups.teamById, teamId)
      : "Unassigned/no team"
    const current = buckets.get(teamId) || { teamId, teamLabel, tickets: [] }
    current.tickets.push(ticket)
    buckets.set(teamId, current)
  }

  return [...buckets.values()]
    .map((bucket) => {
      const facts = bucket.tickets
        .map((ticket) => queueFacts[ticket.id] || projectDashboardTicketQueueFacts(ticket))
      const active = facts.filter((item) => item.queueState !== "resolved")
      const anchors = active
        .map((item) => item.queueAnchorAt)
        .filter((value): value is number => value != null)
      const oldestQueueAnchorAt = anchors.length ? Math.min(...anchors) : null
      return {
        teamId: bucket.teamId,
        teamLabel: bucket.teamLabel,
        activeCount: active.length,
        waitingStaffCount: active.filter((item) => item.queueState === "waiting_staff").length,
        ownedCount: active.filter((item) => item.queueState === "owned").length,
        attentionCount: active.filter((item) => item.attention.length > 0).length,
        firstResponseOverdueCount: active.filter((item) => item.firstResponseOverdue).length,
        unassignedCount: active.filter((item) => item.unassignedAttention).length,
        staleOwnerCount: active.filter((item) => item.staleOwner).length,
        closeRequestCount: active.filter((item) => item.closeRequestAttention).length,
        awaitingUserCount: active.filter((item) => item.awaitingUserAttention).length,
        oldestQueueAnchorAt,
        oldestQueueAnchorLabel: formatDate(oldestQueueAnchorAt),
        viewHref: appendQuery(joinBasePath(basePath, "admin/tickets"), {
          teamId: bucket.teamId || TICKET_WORKBENCH_UNASSIGNED_TEAM_ID,
          sort: "queue-priority",
          page: 1
        }),
        unavailableReason: supportTeamsUnavailable && bucket.teamId ? TICKET_WORKBENCH_TEAM_DEPTH_DEGRADED_REASON : null
      }
    })
    .filter((summary) => summary.activeCount > 0)
    .sort((left, right) => right.activeCount - left.activeCount || left.teamLabel.localeCompare(right.teamLabel))
}

function buildSavedViewSummaries(input: {
  basePath: string
  views?: DashboardTicketWorkbenchViewRecord[]
  activeViewId?: string
  actorUserId?: string
  canManageShared?: boolean
}) {
  const activeViewId = normalizeString(input.activeViewId)
  const actorUserId = normalizeString(input.actorUserId)
  const canManageShared = input.canManageShared === true
  const summaries = (input.views || [])
    .map((view): DashboardTicketWorkbenchSavedViewSummary => {
      const ownerCanWrite = view.scope === "private" && view.ownerUserId === actorUserId
      const sharedCanWrite = view.scope === "shared" && canManageShared
      return {
        viewId: view.viewId,
        scope: view.scope,
        ownerUserId: view.ownerUserId,
        name: view.name,
        query: view.query,
        applyHref: buildTicketWorkbenchSavedViewHref(input.basePath, view),
        updateAction: joinBasePath(input.basePath, `admin/tickets/views/${encodeURIComponent(view.viewId)}/update`),
        deleteAction: joinBasePath(input.basePath, `admin/tickets/views/${encodeURIComponent(view.viewId)}/delete`),
        active: view.viewId === activeViewId,
        canUpdate: ownerCanWrite || sharedCanWrite,
        canDelete: ownerCanWrite || sharedCanWrite
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.viewId.localeCompare(right.viewId))
  return {
    activeView: summaries.find((view) => view.active) || null,
    privateViews: summaries.filter((view) => view.scope === "private"),
    sharedViews: summaries.filter((view) => view.scope === "shared")
  }
}

export function buildTicketWorkbenchListModel(input: {
  basePath: string
  currentHref: string
  request: TicketWorkbenchListRequest
  tickets: DashboardTicketRecord[]
  configService: DashboardConfigService
  readsSupported: boolean
  telemetrySupported?: boolean
  telemetrySignals?: Record<string, DashboardTicketTelemetrySignals>
  telemetryFilterSignals?: Record<string, DashboardTicketTelemetrySignals>
  queueLifecycleRecords?: DashboardTicketLifecycleTelemetryRecord[]
  queueTelemetryAvailable?: boolean
  warningMessage?: string
  telemetryWarningMessage?: string
  queueWarningMessage?: string
  now?: number
  writesSupported?: boolean
  qualityReviewHref?: string | null
  savedViews?: DashboardTicketWorkbenchViewRecord[]
  actorUserId?: string
  canManageSharedViews?: boolean
  savedViewsAvailable?: boolean
  savedViewsUnavailableMessage?: string
  exportId?: string | null
}): TicketWorkbenchListModel {
  const lookups = buildConfigLookups(input.configService)
  const telemetrySupported = input.readsSupported && input.telemetrySupported === true
  const queueWarningMessage = normalizeString(input.queueWarningMessage)
  const effectiveRequest = telemetrySupported
    ? input.request
    : { ...input.request, feedback: "all" as const, reopened: "all" as const }
  const normalizedTickets = input.tickets.map((ticket) => ({
    ...ticket,
    transportMode: normalizeTransport(ticket.transportMode) || null
  }))
  const telemetrySignals = input.telemetrySignals || {}
  const telemetryFilterSignals = input.telemetryFilterSignals || telemetrySignals
  const queueFacts = buildDashboardTicketQueueFactsMap(normalizedTickets, {
    lifecycleRecords: input.queueLifecycleRecords || [],
    lifecycleAvailable: input.queueTelemetryAvailable !== false,
    unavailableReason: queueWarningMessage || null,
    now: input.now
  })
  const filtered = sortTickets(
    applyListFilters(normalizedTickets, effectiveRequest, lookups, telemetryFilterSignals, telemetrySupported, queueFacts),
    effectiveRequest.sort,
    queueFacts
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / effectiveRequest.limit))
  const page = Math.min(effectiveRequest.page, totalPages)
  const startIndex = (page - 1) * effectiveRequest.limit
  const pageItems = filtered.slice(startIndex, startIndex + effectiveRequest.limit)
  const currentHref = input.currentHref || buildPageHref(input.basePath, effectiveRequest, page)
  const buildRow = (ticket: DashboardTicketRecord) => {
    const panel = resolvePanelMapping(lookups.panelForOption, ticket.optionId)
    const optionLabel = resolveOptionLabel(lookups.optionById, ticket.optionId)
    const teamLabel = resolveTeamLabel(lookups.teamById, ticket.assignedTeamId)
    const assigneeLabel = unknownUserLabel(ticket.assignedStaffUserId)
    const creatorLabel = unknownUserLabel(ticket.creatorId)
    const channelNameLabel = normalizeString(ticket.channelName) || normalizeString(ticket.channelSuffix) || ticket.id
    const detailHref = `${joinBasePath(input.basePath, `admin/tickets/${encodeURIComponent(ticket.id)}`)}?returnTo=${encodeURIComponent(currentHref)}`
    const telemetry = ticketTelemetrySignal(telemetrySignals, ticket.id)
    const queue = queueFacts[ticket.id] || projectDashboardTicketQueueFacts(ticket, { now: input.now })
    return {
      item: {
        id: ticket.id,
        optionLabel,
        panelLabel: panel.panelLabel,
        creatorLabel,
        teamLabel,
        assigneeLabel,
        transportLabel: transportLabel(ticket.transportMode),
        channelNameLabel,
        statusBadge: statusBadge(ticket),
        queueStateBadge: queueStateBadge(queue.queueState),
        attentionBadges: queue.attention.map(attentionBadge),
        queueAnchorLabel: formatDate(queue.queueAnchorAt),
        feedbackBadge: telemetrySupported ? feedbackBadge(telemetry.latestFeedbackStatus) : null,
        reopenBadge: telemetrySupported && telemetry.reopenCount > 0 ? { label: `Reopened x${telemetry.reopenCount}`, tone: "warning" as DashboardTone } : null,
        openedLabel: formatDate(ticket.openedOn),
        activityLabel: formatDate(activityTime(ticket) || null),
        detailHref,
        searchText: [
          ticket.id,
          channelNameLabel,
          optionLabel,
          panel.panelLabel,
          creatorLabel,
          teamLabel,
          assigneeLabel,
          ticket.transportMode || "",
          queue.queueState,
          ...queue.attention,
          telemetrySupported ? telemetry.latestFeedbackStatus : "",
          telemetrySupported && telemetry.hasEverReopened ? "reopened" : ""
        ].join(" ").toLowerCase()
      },
      exportRow: {
        ticketId: ticket.id,
        resourceName: channelNameLabel,
        closed: ticket.closed,
        claimed: ticket.claimed,
        transportMode: ticket.transportMode,
        panelId: panel.panelId || null,
        panelLabel: panel.panelLabel,
        optionId: normalizeString(ticket.optionId) || null,
        optionLabel,
        creatorUserId: normalizeString(ticket.creatorId) || null,
        creatorLabel,
        assignedTeamId: normalizeString(ticket.assignedTeamId) || null,
        teamLabel,
        assignedStaffUserId: normalizeString(ticket.assignedStaffUserId) || null,
        assigneeLabel,
        telemetryAvailable: telemetrySupported,
        latestFeedbackStatus: telemetrySupported ? telemetry.latestFeedbackStatus : null,
        reopenCount: telemetrySupported ? telemetry.reopenCount : null,
        lastReopenedAt: telemetrySupported ? telemetry.lastReopenedAt : null
      }
    }
  }
  const pageRows = pageItems.map(buildRow)
  const allRows = filtered.map(buildRow)
  const savedViewSummaries = buildSavedViewSummaries({
    basePath: input.basePath,
    views: input.savedViews || [],
    activeViewId: effectiveRequest.viewId,
    actorUserId: input.actorUserId,
    canManageShared: input.canManageSharedViews
  })

  return {
    available: input.readsSupported,
    warningMessage: input.warningMessage || "",
    telemetryWarningMessage: input.telemetryWarningMessage || "",
    queueWarningMessage,
    filterAction: joinBasePath(input.basePath, "admin/tickets"),
    clearFiltersHref: joinBasePath(input.basePath, "admin/tickets"),
    currentHref,
    request: {
      ...effectiveRequest,
      page
    },
    total: filtered.length,
    unfilteredTotal: normalizedTickets.length,
    pageStart: filtered.length > 0 ? startIndex + 1 : 0,
    pageEnd: startIndex + pageItems.length,
    previousHref: page > 1 ? buildPageHref(input.basePath, effectiveRequest, page - 1) : null,
    nextHref: page < totalPages ? buildPageHref(input.basePath, effectiveRequest, page + 1) : null,
    pageLinks: Array.from({ length: totalPages }, (_item, index) => index + 1)
      .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
      .map((pageNumber) => ({
        page: pageNumber,
        href: buildPageHref(input.basePath, effectiveRequest, pageNumber),
        active: pageNumber === page
      })),
    activeFilters: buildActiveFilters(effectiveRequest, lookups),
    filteredSummary: {
      cards: [
        { label: "Visible", value: String(filtered.length), tone: filtered.length > 0 ? "success" : "muted" },
        { label: "Open", value: String(filtered.filter((ticket) => ticket.open).length), tone: "warning" },
        { label: "Attention", value: String(filtered.filter((ticket) => (queueFacts[ticket.id]?.attention.length || 0) > 0).length), tone: filtered.some((ticket) => (queueFacts[ticket.id]?.attention.length || 0) > 0) ? "warning" : "muted" },
        { label: "Private threads", value: String(filtered.filter((ticket) => ticket.transportMode === "private_thread").length), tone: "muted" },
        { label: "Claimed", value: String(filtered.filter((ticket) => ticket.claimed).length), tone: "success" }
      ]
    },
    bulkActions: input.readsSupported && input.writesSupported
      ? {
          returnTo: currentHref,
          claimSelfAction: joinBasePath(input.basePath, "admin/tickets/bulk/claim-self"),
          unclaimAction: joinBasePath(input.basePath, "admin/tickets/bulk/unclaim"),
          closeAction: joinBasePath(input.basePath, "admin/tickets/bulk/close"),
          reopenAction: joinBasePath(input.basePath, "admin/tickets/bulk/reopen")
        }
      : null,
    exportActions: {
      jsonAction: joinBasePath(input.basePath, "admin/tickets/export/json"),
      csvAction: joinBasePath(input.basePath, "admin/tickets/export/csv"),
      action: joinBasePath(input.basePath, "admin/tickets/export"),
      returnTo: currentHref,
      release: input.exportId
        ? {
            exportId: input.exportId,
            href: joinBasePath(input.basePath, `admin/exports/${encodeURIComponent(input.exportId)}`),
            label: "Download prepared export"
          }
        : null
    },
    qualityReviewHref: input.qualityReviewHref || null,
    savedViews: {
      available: input.savedViewsAvailable !== false,
      createAction: joinBasePath(input.basePath, "admin/tickets/views/create"),
      activeView: savedViewSummaries.activeView,
      privateViews: savedViewSummaries.privateViews,
      sharedViews: savedViewSummaries.sharedViews,
      currentQuery: ticketWorkbenchSavedQueryFromRequest({ ...effectiveRequest, page }),
      canManageShared: input.canManageSharedViews === true,
      unavailableMessage: input.savedViewsUnavailableMessage || ""
    },
    teamQueueSummaries: buildTeamQueueSummaries(input.basePath, normalizedTickets, lookups, queueFacts),
    options: lookups.options
      .filter((option) => normalizeString(option.type) === "ticket")
      .map((option) => ({ id: normalizeString(option.id), label: labelFromRecord(option, normalizeString(option.id)) }))
      .filter((option) => option.id),
    panels: lookups.panels
      .map((panel) => ({ id: normalizeString(panel.id), label: labelFromRecord(panel, normalizeString(panel.id)) }))
      .filter((panel) => panel.id),
    supportTeams: lookups.supportTeams
      .map((team) => ({ id: normalizeString(team.id), label: labelFromRecord(team, normalizeString(team.id)) }))
      .filter((team) => team.id),
    exportRows: pageRows.map((row) => row.exportRow),
    allExportRows: allRows.map((row) => row.exportRow),
    items: pageRows.map((row) => row.item)
  }
}

function availability(enabled: boolean, reason: string | null = null): DashboardTicketActionAvailability {
  return { enabled, reason: enabled ? null : reason || "tickets.detail.availability.genericUnavailable" }
}

export function translateTicketWorkbenchMessage(
  t: TicketWorkbenchTranslator,
  message: string | null | undefined,
  params?: Record<string, string | number>
) {
  if (!message) return ""
  return message.startsWith("tickets.detail.") ? t(message, params) : message
}

export function buildFallbackTicketDetail(input: {
  ticket: DashboardTicketRecord
  configService: DashboardConfigService
  providerLock?: DashboardTicketProviderLock | null
  integration?: DashboardTicketDetailRecord["integration"] | null
  aiAssist?: DashboardTicketDetailRecord["aiAssist"] | null
  telemetry?: DashboardTicketTelemetrySignals | null
}): DashboardTicketDetailRecord {
  const lookups = buildConfigLookups(input.configService)
  const panel = resolvePanelMapping(lookups.panelForOption, input.ticket.optionId)
  const option = input.ticket.optionId ? lookups.optionById.get(input.ticket.optionId) : null
  const currentRouteTeamId = normalizeString(option?.routing?.supportTeamId)
  const targetIds = asStringArray(option?.routing?.escalationTargetOptionIds)
  const transport = normalizeTransport(input.ticket.transportMode) || "channel_text"
  const escalationTargets: DashboardTicketEscalationTargetChoice[] = targetIds.map((targetId) => {
    const target = lookups.optionById.get(targetId)
    const targetPanel = resolvePanelMapping(lookups.panelForOption, targetId)
    return {
      optionId: targetId,
      optionLabel: target ? labelFromRecord(target, targetId) : `Missing option (${targetId})`,
      panelId: targetPanel.panelId,
      panelLabel: targetPanel.panelLabel,
      transportMode: normalizeTransport(target?.channel?.transportMode) || transport
    }
  })
  const providerLock = input.providerLock || null
  const locked = new Set(providerLock?.lockedActions || [])
  const assignRouteTeamId = input.ticket.assignedTeamId || currentRouteTeamId
  const optionWorkflow = (option as any)?.workflow
  const workflowPolicy = {
    closeRequestEnabled: Boolean(optionWorkflow?.closeRequest?.enabled),
    awaitingUserEnabled: Boolean(optionWorkflow?.awaitingUser?.enabled)
  }
  const actions: Record<DashboardTicketActionId, DashboardTicketActionAvailability> = {
    claim: availability(Boolean(input.ticket.open && !input.ticket.claimed && !locked.has("claim")), locked.has("claim") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketAlreadyClaimedOrNotOpen"),
    unclaim: availability(Boolean(input.ticket.open && input.ticket.claimed && !locked.has("unclaim")), locked.has("unclaim") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketNotCurrentlyClaimed"),
    assign: availability(Boolean(assignRouteTeamId && !locked.has("assign")), locked.has("assign") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.noOwningSupportTeam"),
    escalate: availability(Boolean(escalationTargets.length > 0 && !locked.has("escalate")), locked.has("escalate") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.noEscalationTargets"),
    move: availability(false, locked.has("move") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.runtimeOptionsUnavailable"),
    transfer: availability(false, locked.has("transfer") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.runtimeGuildMembersUnavailable"),
    "add-participant": availability(false, locked.has("add-participant") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.runtimeGuildMembersUnavailable"),
    "remove-participant": availability(false, locked.has("remove-participant") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.runtimeParticipantsUnavailable"),
    "set-priority": availability(false, locked.has("set-priority") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.runtimePrioritiesUnavailable"),
    "set-topic": availability(Boolean(input.ticket.open && !input.ticket.closed && !locked.has("set-topic")), locked.has("set-topic") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketNotOpen"),
    "approve-close-request": availability(
      Boolean(input.ticket.open && !input.ticket.closed && input.ticket.closeRequestState === "requested" && workflowPolicy.closeRequestEnabled && !locked.has("approve-close-request")),
      locked.has("approve-close-request")
        ? "tickets.detail.availability.lockedByProvider"
        : !workflowPolicy.closeRequestEnabled
          ? "tickets.detail.availability.workflowDisabled"
          : input.ticket.closeRequestState === "requested"
            ? "tickets.detail.availability.ticketNotOpen"
            : "tickets.detail.availability.closeRequestMissing"
    ),
    "dismiss-close-request": availability(
      Boolean(input.ticket.open && !input.ticket.closed && input.ticket.closeRequestState === "requested" && workflowPolicy.closeRequestEnabled && !locked.has("dismiss-close-request")),
      locked.has("dismiss-close-request")
        ? "tickets.detail.availability.lockedByProvider"
        : !workflowPolicy.closeRequestEnabled
          ? "tickets.detail.availability.workflowDisabled"
          : input.ticket.closeRequestState === "requested"
            ? "tickets.detail.availability.ticketNotOpen"
            : "tickets.detail.availability.closeRequestMissing"
    ),
    "set-awaiting-user": availability(
      Boolean(input.ticket.open && !input.ticket.closed && !input.ticket.closeRequestState && !input.ticket.awaitingUserState && workflowPolicy.awaitingUserEnabled && !locked.has("set-awaiting-user")),
      locked.has("set-awaiting-user")
        ? "tickets.detail.availability.lockedByProvider"
        : !workflowPolicy.awaitingUserEnabled
          ? "tickets.detail.availability.workflowDisabled"
          : input.ticket.closeRequestState === "requested"
            ? "tickets.detail.availability.closeRequestPending"
            : input.ticket.awaitingUserState
              ? "tickets.detail.availability.awaitingUserActive"
              : "tickets.detail.availability.ticketNotOpen"
    ),
    "clear-awaiting-user": availability(
      Boolean(input.ticket.open && !input.ticket.closed && input.ticket.awaitingUserState && !locked.has("clear-awaiting-user")),
      locked.has("clear-awaiting-user")
        ? "tickets.detail.availability.lockedByProvider"
        : input.ticket.awaitingUserState
          ? "tickets.detail.availability.ticketNotOpen"
          : "tickets.detail.availability.awaitingUserMissing"
    ),
    pin: availability(
      Boolean(input.ticket.open && !input.ticket.closed && transport === "channel_text" && !input.ticket.pinned && !locked.has("pin")),
      locked.has("pin")
        ? "tickets.detail.availability.lockedByProvider"
        : transport !== "channel_text"
          ? "tickets.detail.availability.pinUnsupportedTransport"
          : input.ticket.pinned
            ? "tickets.detail.availability.ticketAlreadyPinned"
            : "tickets.detail.availability.ticketNotOpen"
    ),
    unpin: availability(
      Boolean(input.ticket.open && !input.ticket.closed && transport === "channel_text" && input.ticket.pinned && !locked.has("unpin")),
      locked.has("unpin")
        ? "tickets.detail.availability.lockedByProvider"
        : transport !== "channel_text"
          ? "tickets.detail.availability.pinUnsupportedTransport"
          : !input.ticket.pinned
            ? "tickets.detail.availability.ticketNotPinned"
            : "tickets.detail.availability.ticketNotOpen"
    ),
    rename: availability(
      Boolean(input.ticket.open && !input.ticket.closed && !locked.has("rename")),
      locked.has("rename") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketNotOpen"
    ),
    close: availability(Boolean(input.ticket.open && !input.ticket.closed && !locked.has("close")), locked.has("close") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketAlreadyClosed"),
    reopen: availability(Boolean(input.ticket.closed && !locked.has("reopen")), locked.has("reopen") ? "tickets.detail.availability.lockedByProvider" : "tickets.detail.availability.ticketNotClosed"),
    refresh: availability(!locked.has("refresh"), locked.has("refresh") ? "tickets.detail.availability.lockedByProvider" : null)
  }

  return {
    ticket: {
      ...input.ticket,
      transportMode: normalizeTransport(input.ticket.transportMode) || null
    },
    panelId: panel.panelId,
    panelLabel: panel.panelLabel,
    optionLabel: resolveOptionLabel(lookups.optionById, input.ticket.optionId),
    creatorLabel: unknownUserLabel(input.ticket.creatorId),
    teamLabel: resolveTeamLabel(lookups.teamById, input.ticket.assignedTeamId || currentRouteTeamId || null),
    assigneeLabel: unknownUserLabel(input.ticket.assignedStaffUserId),
    priorityId: null,
    priorityLabel: null,
    topic: null,
    originalApplicantUserId: input.ticket.creatorId,
    originalApplicantLabel: unknownUserLabel(input.ticket.creatorId),
    creatorTransferWarning: null,
    participantLabels: [`${input.ticket.participantCount} participant(s)`],
    actionAvailability: actions,
    assignableStaff: [],
    escalationTargets,
    moveTargets: [],
    transferCandidates: [],
    participantChoices: [],
    priorityChoices: [],
    providerLock,
    integration: input.integration || null,
    aiAssist: input.aiAssist || null,
    telemetry: input.telemetry || null
  }
}

function actionCopy(t: TicketWorkbenchTranslator, action: DashboardTicketActionId) {
  const key = action.replace(/-/g, "_")
  switch (action) {
    case "claim":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "primary" as const, needsReason: true }
    case "unclaim":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "assign":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "primary" as const, needsReason: true }
    case "escalate":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "move":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "transfer":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "primary" as const, needsReason: true }
    case "add-participant":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "remove-participant":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "danger" as const, needsReason: true }
    case "set-priority":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "set-topic":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: false }
    case "approve-close-request":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "danger" as const, needsReason: true }
    case "dismiss-close-request":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "set-awaiting-user":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "primary" as const, needsReason: true }
    case "clear-awaiting-user":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "pin":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "unpin":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "rename":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "secondary" as const, needsReason: true }
    case "close":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "danger" as const, needsReason: true }
    case "reopen":
      return { title: t(`tickets.detail.actionCopy.${key}.title`), body: t(`tickets.detail.actionCopy.${key}.body`), variant: "primary" as const, needsReason: true }
    default:
      return { title: t("tickets.detail.actionCopy.refresh.title"), body: t("tickets.detail.actionCopy.refresh.body"), variant: "secondary" as const, needsReason: false }
  }
}

const ADVANCED_TICKET_ACTIONS = new Set<DashboardTicketActionId>([
  "move",
  "transfer",
  "add-participant",
  "remove-participant",
  "set-priority",
  "set-topic",
  "rename",
  "approve-close-request",
  "dismiss-close-request",
  "set-awaiting-user",
  "clear-awaiting-user"
])

function actionChoices(t: TicketWorkbenchTranslator, detail: DashboardTicketDetailRecord, action: DashboardTicketActionId) {
  switch (action) {
    case "assign":
      return detail.assignableStaff.map((choice) => ({ value: choice.userId, label: choice.label }))
    case "escalate":
      return detail.escalationTargets.map((choice) => ({ value: choice.optionId, label: choice.optionLabel }))
    case "move":
      return detail.moveTargets.map((choice) => ({ value: choice.optionId, label: `${choice.optionLabel} (${choice.teamLabel || t("tickets.detail.noTeam")})` }))
    case "transfer":
      return detail.transferCandidates.map((choice) => ({ value: choice.userId, label: choice.label }))
    case "add-participant":
      return detail.participantChoices.filter((choice) => !choice.present).map((choice) => ({ value: choice.userId, label: choice.label }))
    case "remove-participant":
      return detail.participantChoices.filter((choice) => choice.present && choice.userId !== detail.ticket.creatorId).map((choice) => ({ value: choice.userId, label: choice.label }))
    case "set-priority":
      return detail.priorityChoices.map((choice) => ({ value: choice.priorityId, label: choice.label }))
    default:
      return []
  }
}

function actionChoiceName(action: DashboardTicketActionId): TicketWorkbenchActionForm["choiceName"] {
  if (action === "assign") return "assigneeUserId"
  if (action === "escalate" || action === "move") return "targetOptionId"
  if (action === "transfer") return "newCreatorUserId"
  if (action === "add-participant" || action === "remove-participant") return "participantUserId"
  if (action === "set-priority") return "priorityId"
  return null
}

function actionChoiceLabel(t: TicketWorkbenchTranslator, action: DashboardTicketActionId) {
  if (action === "assign") return t("tickets.detail.actions.assigneeLabel")
  if (action === "escalate") return t("tickets.detail.actions.escalationTargetLabel")
  if (action === "move") return t("tickets.detail.actions.moveTargetLabel")
  if (action === "transfer") return t("tickets.detail.actions.newCreatorLabel")
  if (action === "add-participant" || action === "remove-participant") return t("tickets.detail.actions.participantLabel")
  if (action === "set-priority") return t("tickets.detail.facts.priority")
  return null
}

export function buildTicketWorkbenchDetailModel(input: {
  basePath: string
  returnTo: unknown
  ticketId: string
  detail: DashboardTicketDetailRecord | null
  writesSupported: boolean
  readsSupported: boolean
  warningMessage?: string
  t?: TicketWorkbenchTranslator
  exportId?: string | null
}): TicketWorkbenchDetailModel {
  const t = input.t || ((key: string) => key)
  const backHref = sanitizeTicketWorkbenchReturnTo(input.basePath, input.returnTo)
  const detailHref = joinBasePath(input.basePath, `admin/tickets/${encodeURIComponent(input.detail?.ticket.id || input.ticketId)}`)
  const returnToQuery = `returnTo=${encodeURIComponent(backHref)}`
  const detail = input.detail
    ? {
        ...input.detail,
        telemetry: input.detail.telemetry || null,
        creatorTransferWarning: translateTicketWorkbenchMessage(t, input.detail.creatorTransferWarning, {
          originalApplicant: input.detail.originalApplicantLabel || unknownUserLabel(input.detail.originalApplicantUserId),
          currentCreator: input.detail.creatorLabel || unknownUserLabel(input.detail.ticket.creatorId)
        }) || null,
        actionAvailability: Object.fromEntries(DASHBOARD_TICKET_ACTION_IDS.map((action) => {
          const actionAvailability = input.detail?.actionAvailability[action] || availability(false)
          return [
            action,
            {
              ...actionAvailability,
              reason: actionAvailability.enabled ? null : translateTicketWorkbenchMessage(t, actionAvailability.reason) || null
            }
          ]
        })) as DashboardTicketDetailRecord["actionAvailability"]
      }
    : null
  const facts = detail
    ? [
        { label: t("tickets.detail.facts.ticketId"), value: detail.ticket.id },
        { label: t("tickets.detail.facts.option"), value: detail.optionLabel || t("tickets.detail.missingOption") },
        { label: t("tickets.detail.facts.panel"), value: detail.panelLabel || t("tickets.detail.missingPanel") },
        { label: t("tickets.detail.facts.creator"), value: detail.creatorLabel || unknownUserLabel(detail.ticket.creatorId) },
        { label: t("tickets.detail.facts.originalApplicant"), value: detail.originalApplicantLabel || unknownUserLabel(detail.originalApplicantUserId) },
        { label: t("tickets.detail.facts.team"), value: detail.teamLabel || resolveTeamLabel(new Map(), detail.ticket.assignedTeamId) },
        { label: t("tickets.detail.facts.assignee"), value: detail.assigneeLabel || unknownUserLabel(detail.ticket.assignedStaffUserId) },
        { label: t("tickets.detail.facts.transport"), value: transportLabel(detail.ticket.transportMode) },
        { label: t("tickets.detail.facts.priority"), value: detail.priorityLabel || t("common.unavailable") },
        { label: t("tickets.detail.facts.topic"), value: detail.topic || t("tickets.detail.noTopicRecorded") },
        { label: t("tickets.detail.facts.closeRequest"), value: detail.ticket.closeRequestState || t("tickets.detail.noWorkflowState") },
        { label: t("tickets.detail.facts.awaitingUser"), value: detail.ticket.awaitingUserState || t("tickets.detail.noWorkflowState") },
        { label: t("tickets.detail.facts.participants"), value: String(detail.ticket.participantCount) }
      ]
    : []
  const summaryCards = detail
    ? [
        { label: t("tickets.detail.summary.state"), value: statusBadge(detail.ticket).label, detail: detail.ticket.open ? t("tickets.detail.summary.ticketOpen") : t("tickets.detail.summary.ticketNotOpen"), tone: statusBadge(detail.ticket).tone },
        { label: t("tickets.detail.summary.route"), value: detail.optionLabel || t("tickets.detail.missingOption"), detail: detail.panelLabel || t("tickets.detail.missingPanel"), tone: "muted" as DashboardTone },
        { label: t("tickets.detail.facts.assignee"), value: detail.assigneeLabel || t("tickets.detail.unassigned"), detail: detail.teamLabel || t("tickets.detail.noTeam"), tone: detail.ticket.assignedStaffUserId ? "success" as DashboardTone : "warning" as DashboardTone },
        { label: t("tickets.detail.facts.transport"), value: transportLabel(detail.ticket.transportMode), detail: detail.ticket.transportParentChannelId || t("tickets.detail.noParentChannelRecorded"), tone: "muted" as DashboardTone },
        { label: t("tickets.detail.telemetry.feedbackStatus"), value: detail.telemetry ? feedbackBadge(detail.telemetry.latestFeedbackStatus).label : t("common.unavailable"), detail: detail.telemetry?.latestFeedbackTriggeredAt ? formatDate(detail.telemetry.latestFeedbackTriggeredAt) : t("tickets.detail.telemetry.noFeedbackSession"), tone: detail.telemetry ? feedbackBadge(detail.telemetry.latestFeedbackStatus).tone : "muted" as DashboardTone },
        { label: t("tickets.detail.telemetry.reopenCount"), value: detail.telemetry ? String(detail.telemetry.reopenCount) : t("common.unavailable"), detail: detail.telemetry?.lastReopenedAt ? formatDate(detail.telemetry.lastReopenedAt) : t("tickets.detail.telemetry.noReopenRecorded"), tone: detail.telemetry && detail.telemetry.reopenCount > 0 ? "warning" as DashboardTone : "muted" as DashboardTone }
      ]
    : []
  const providerLocked = new Set(detail?.providerLock?.lockedActions || [])
  const actionForms = detail
    ? DASHBOARD_TICKET_ACTION_IDS.map((action) => {
        const copy = actionCopy(t, action)
        const baseAvailability = detail.actionAvailability[action] || availability(false)
        const disabledByWrites = action !== "refresh" && !input.writesSupported
        const providerLockedReason = providerLocked.has(action) ? t("tickets.detail.availability.lockedByProvider") : null
        const effectiveAvailability = disabledByWrites
          ? availability(false, t("tickets.detail.availability.writesUnavailable"))
          : providerLockedReason
            ? availability(false, providerLockedReason)
            : baseAvailability
        return {
          action,
          title: copy.title,
          body: copy.body,
          actionHref: `${detailHref}/actions/${action}?${returnToQuery}`,
          availability: effectiveAvailability,
          needsReason: copy.needsReason,
          choices: actionChoices(t, detail, action),
          choiceName: actionChoiceName(action),
          choiceLabel: actionChoiceLabel(t, action),
          textName: action === "set-topic" ? "topic" as const : action === "rename" ? "renameName" as const : null,
          textValue: action === "set-topic" ? detail.topic || "" : action === "rename" ? detail.ticket.channelName || detail.ticket.channelSuffix || "" : "",
          textLabel: action === "set-topic" ? t("tickets.detail.facts.topic") : action === "rename" ? t("tickets.detail.actions.renameNameLabel") : null,
          textPlaceholder: action === "set-topic" ? t("tickets.detail.actions.topicPlaceholder") : action === "rename" ? t("tickets.detail.actions.renameNamePlaceholder") : null,
          buttonVariant: copy.variant
        }
      })
    : []

  return {
    available: input.readsSupported,
    warningMessage: input.warningMessage || "",
    backHref,
    listHref: joinBasePath(input.basePath, "admin/tickets"),
    writesSupported: input.writesSupported,
    detail,
    exportAction: `${detailHref}/export`,
    exportRelease: input.exportId
      ? {
          exportId: input.exportId,
          href: joinBasePath(input.basePath, `admin/exports/${encodeURIComponent(input.exportId)}`),
          label: "Download prepared export"
        }
      : null,
    facts,
    summaryCards,
    actionForms: actionForms.filter((form) => !ADVANCED_TICKET_ACTIONS.has(form.action)),
    advancedActionForms: actionForms.filter((form) => ADVANCED_TICKET_ACTIONS.has(form.action)),
    deferredActions: []
  }
}
