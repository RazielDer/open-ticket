import { joinBasePath } from "./dashboard-config"
import { formatDate, type DashboardTone } from "./control-center"
import type { DashboardConfigService } from "./config-service"
import type { DashboardTicketRecord } from "./dashboard-runtime-registry"
import type { DashboardI18n } from "./i18n"
import type {
  DashboardTicketActionAvailability,
  DashboardTicketActionId,
  DashboardTicketDetailRecord,
  DashboardTicketEscalationTargetChoice,
  DashboardTicketProviderLock,
  DashboardTicketTransportMode
} from "./ticket-workbench-types"
import { DASHBOARD_TICKET_ACTION_IDS } from "./ticket-workbench-types"

export const TICKET_WORKBENCH_STATUS_FILTERS = ["all", "open", "closed", "claimed", "unclaimed"] as const
export const TICKET_WORKBENCH_TRANSPORT_FILTERS = ["all", "channel_text", "private_thread"] as const
export const TICKET_WORKBENCH_SORTS = ["opened-desc", "opened-asc", "activity-desc", "activity-asc"] as const
export const TICKET_WORKBENCH_LIMITS = [10, 25, 50, 100] as const

type TicketWorkbenchTranslator = DashboardI18n["t"]

export type TicketWorkbenchStatusFilter = (typeof TICKET_WORKBENCH_STATUS_FILTERS)[number]
export type TicketWorkbenchTransportFilter = (typeof TICKET_WORKBENCH_TRANSPORT_FILTERS)[number]
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
  teamId: string
  assigneeId: string
  optionId: string
  panelId: string
  creatorId: string
  sort: TicketWorkbenchSort
  limit: number
  page: number
  statusOptions: Array<{ value: TicketWorkbenchStatusFilter; label: string }>
  transportOptions: Array<{ value: TicketWorkbenchTransportFilter; label: string }>
  sortOptions: Array<{ value: TicketWorkbenchSort; label: string }>
  limitOptions: number[]
}

export interface TicketWorkbenchListModel {
  available: boolean
  warningMessage: string
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
  options: Array<{ id: string; label: string }>
  panels: Array<{ id: string; label: string }>
  supportTeams: Array<{ id: string; label: string }>
  items: Array<{
    id: string
    optionLabel: string
    panelLabel: string
    creatorLabel: string
    teamLabel: string
    assigneeLabel: string
    transportLabel: string
    statusBadge: { label: string; tone: DashboardTone }
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
  textName: "topic" | null
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
    teamId: request.teamId,
    assigneeId: request.assigneeId,
    optionId: request.optionId,
    panelId: request.panelId,
    creatorId: request.creatorId,
    sort: request.sort === "activity-desc" ? "" : request.sort,
    limit: request.limit === 25 ? "" : request.limit,
    page
  })
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
    teamId: normalizeString(query.teamId),
    assigneeId: normalizeString(query.assigneeId),
    optionId: normalizeString(query.optionId),
    panelId: normalizeString(query.panelId),
    creatorId: normalizeString(query.creatorId),
    sort: enumOrDefault(query.sort, TICKET_WORKBENCH_SORTS, "activity-desc"),
    limit,
    page: intOrDefault(query.page, 1),
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
    sortOptions: [
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
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function buildConfigLookups(configService: DashboardConfigService) {
  const options = readConfigArray(configService, "options")
  const panels = readConfigArray(configService, "panels")
  const supportTeams = readConfigArray(configService, "support-teams")

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

  return { options, panels, supportTeams, optionById, panelById, teamById, panelForOption }
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

function applyListFilters(
  tickets: DashboardTicketRecord[],
  request: TicketWorkbenchListRequest,
  lookups: ReturnType<typeof buildConfigLookups>
) {
  const q = request.q.toLowerCase()
  return tickets.filter((ticket) => {
    const panel = resolvePanelMapping(lookups.panelForOption, ticket.optionId)
    const optionLabel = resolveOptionLabel(lookups.optionById, ticket.optionId)
    const teamLabel = resolveTeamLabel(lookups.teamById, ticket.assignedTeamId)
    const assigneeLabel = unknownUserLabel(ticket.assignedStaffUserId)
    const creatorLabel = unknownUserLabel(ticket.creatorId)

    if (request.status === "open" && !ticket.open) return false
    if (request.status === "closed" && !ticket.closed) return false
    if (request.status === "claimed" && !ticket.claimed) return false
    if (request.status === "unclaimed" && ticket.claimed) return false
    if (request.transport !== "all" && ticket.transportMode !== request.transport) return false
    if (request.teamId && ticket.assignedTeamId !== request.teamId) return false
    if (request.assigneeId && ticket.assignedStaffUserId !== request.assigneeId) return false
    if (request.optionId && ticket.optionId !== request.optionId) return false
    if (request.panelId && panel.panelId !== request.panelId) return false
    if (request.creatorId && ticket.creatorId !== request.creatorId) return false

    if (!q) return true
    return [
      ticket.id,
      ticket.optionId || "",
      optionLabel,
      panel.panelId || "",
      panel.panelLabel,
      ticket.creatorId || "",
      creatorLabel,
      ticket.assignedTeamId || "",
      teamLabel,
      ticket.assignedStaffUserId || "",
      assigneeLabel
    ].join(" ").toLowerCase().includes(q)
  })
}

function sortTickets(tickets: DashboardTicketRecord[], sort: TicketWorkbenchSort) {
  const sorted = [...tickets]
  sorted.sort((left, right) => {
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
  if (request.teamId) filters.push({ label: "Team", value: resolveTeamLabel(lookups.teamById, request.teamId) })
  if (request.assigneeId) filters.push({ label: "Assignee", value: unknownUserLabel(request.assigneeId) })
  if (request.optionId) filters.push({ label: "Option", value: resolveOptionLabel(lookups.optionById, request.optionId) })
  if (request.panelId) filters.push({ label: "Panel", value: labelFromRecord(lookups.panelById.get(request.panelId), `Missing panel (${request.panelId})`) })
  if (request.creatorId) filters.push({ label: "Creator", value: unknownUserLabel(request.creatorId) })
  if (request.sort !== "activity-desc") filters.push({ label: "Sort", value: request.sort })
  if (request.limit !== 25) filters.push({ label: "Rows", value: String(request.limit) })
  return filters
}

export function buildTicketWorkbenchListModel(input: {
  basePath: string
  currentHref: string
  request: TicketWorkbenchListRequest
  tickets: DashboardTicketRecord[]
  configService: DashboardConfigService
  readsSupported: boolean
  warningMessage?: string
}): TicketWorkbenchListModel {
  const lookups = buildConfigLookups(input.configService)
  const normalizedTickets = input.tickets.map((ticket) => ({
    ...ticket,
    transportMode: normalizeTransport(ticket.transportMode) || null
  }))
  const filtered = sortTickets(applyListFilters(normalizedTickets, input.request, lookups), input.request.sort)
  const totalPages = Math.max(1, Math.ceil(filtered.length / input.request.limit))
  const page = Math.min(input.request.page, totalPages)
  const startIndex = (page - 1) * input.request.limit
  const pageItems = filtered.slice(startIndex, startIndex + input.request.limit)
  const currentHref = input.currentHref || buildPageHref(input.basePath, input.request, page)

  return {
    available: input.readsSupported,
    warningMessage: input.warningMessage || "",
    filterAction: joinBasePath(input.basePath, "admin/tickets"),
    clearFiltersHref: joinBasePath(input.basePath, "admin/tickets"),
    currentHref,
    request: {
      ...input.request,
      page
    },
    total: filtered.length,
    unfilteredTotal: normalizedTickets.length,
    pageStart: filtered.length > 0 ? startIndex + 1 : 0,
    pageEnd: startIndex + pageItems.length,
    previousHref: page > 1 ? buildPageHref(input.basePath, input.request, page - 1) : null,
    nextHref: page < totalPages ? buildPageHref(input.basePath, input.request, page + 1) : null,
    pageLinks: Array.from({ length: totalPages }, (_item, index) => index + 1)
      .slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5)
      .map((pageNumber) => ({
        page: pageNumber,
        href: buildPageHref(input.basePath, input.request, pageNumber),
        active: pageNumber === page
      })),
    activeFilters: buildActiveFilters(input.request, lookups),
    filteredSummary: {
      cards: [
        { label: "Visible", value: String(filtered.length), tone: filtered.length > 0 ? "success" : "muted" },
        { label: "Open", value: String(filtered.filter((ticket) => ticket.open).length), tone: "warning" },
        { label: "Private threads", value: String(filtered.filter((ticket) => ticket.transportMode === "private_thread").length), tone: "muted" },
        { label: "Claimed", value: String(filtered.filter((ticket) => ticket.claimed).length), tone: "success" }
      ]
    },
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
    items: pageItems.map((ticket) => {
      const panel = resolvePanelMapping(lookups.panelForOption, ticket.optionId)
      const optionLabel = resolveOptionLabel(lookups.optionById, ticket.optionId)
      const teamLabel = resolveTeamLabel(lookups.teamById, ticket.assignedTeamId)
      const assigneeLabel = unknownUserLabel(ticket.assignedStaffUserId)
      const creatorLabel = unknownUserLabel(ticket.creatorId)
      const detailHref = `${joinBasePath(input.basePath, `admin/tickets/${encodeURIComponent(ticket.id)}`)}?returnTo=${encodeURIComponent(currentHref)}`
      return {
        id: ticket.id,
        optionLabel,
        panelLabel: panel.panelLabel,
        creatorLabel,
        teamLabel,
        assigneeLabel,
        transportLabel: transportLabel(ticket.transportMode),
        statusBadge: statusBadge(ticket),
        openedLabel: formatDate(ticket.openedOn),
        activityLabel: formatDate(activityTime(ticket) || null),
        detailHref,
        searchText: [
          ticket.id,
          optionLabel,
          panel.panelLabel,
          creatorLabel,
          teamLabel,
          assigneeLabel,
          ticket.transportMode || ""
        ].join(" ").toLowerCase()
      }
    })
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
    providerLock
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
  "set-topic"
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
}): TicketWorkbenchDetailModel {
  const t = input.t || ((key: string) => key)
  const backHref = sanitizeTicketWorkbenchReturnTo(input.basePath, input.returnTo)
  const detailHref = joinBasePath(input.basePath, `admin/tickets/${encodeURIComponent(input.detail?.ticket.id || input.ticketId)}`)
  const returnToQuery = `returnTo=${encodeURIComponent(backHref)}`
  const detail = input.detail
    ? {
        ...input.detail,
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
        { label: t("tickets.detail.facts.participants"), value: String(detail.ticket.participantCount) }
      ]
    : []
  const summaryCards = detail
    ? [
        { label: t("tickets.detail.summary.state"), value: statusBadge(detail.ticket).label, detail: detail.ticket.open ? t("tickets.detail.summary.ticketOpen") : t("tickets.detail.summary.ticketNotOpen"), tone: statusBadge(detail.ticket).tone },
        { label: t("tickets.detail.summary.route"), value: detail.optionLabel || t("tickets.detail.missingOption"), detail: detail.panelLabel || t("tickets.detail.missingPanel"), tone: "muted" as DashboardTone },
        { label: t("tickets.detail.facts.assignee"), value: detail.assigneeLabel || t("tickets.detail.unassigned"), detail: detail.teamLabel || t("tickets.detail.noTeam"), tone: detail.ticket.assignedStaffUserId ? "success" as DashboardTone : "warning" as DashboardTone },
        { label: t("tickets.detail.facts.transport"), value: transportLabel(detail.ticket.transportMode), detail: detail.ticket.transportParentChannelId || t("tickets.detail.noParentChannelRecorded"), tone: "muted" as DashboardTone }
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
          textName: action === "set-topic" ? "topic" as const : null,
          textValue: action === "set-topic" ? detail.topic || "" : "",
          textLabel: action === "set-topic" ? t("tickets.detail.facts.topic") : null,
          textPlaceholder: action === "set-topic" ? t("tickets.detail.actions.topicPlaceholder") : null,
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
    facts,
    summaryCards,
    actionForms: actionForms.filter((form) => !ADVANCED_TICKET_ACTIONS.has(form.action)),
    advancedActionForms: actionForms.filter((form) => ADVANCED_TICKET_ACTIONS.has(form.action)),
    deferredActions: [
      t("tickets.detail.deferredActions.pinUnpinRename")
    ]
  }
}
