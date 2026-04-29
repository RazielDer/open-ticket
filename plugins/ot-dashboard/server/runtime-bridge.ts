import crypto from "node:crypto"

import {
  getDashboardPluginDetail,
  getDashboardRuntimeSource,
  getDashboardRuntimeSnapshot,
  listDashboardPlugins,
  listDashboardTickets,
  type DashboardPluginDetail,
  type DashboardPluginInventoryItem,
  type DashboardRuntimeSource,
  type DashboardRuntimeSnapshot,
  type DashboardTicketRecord
} from "./dashboard-runtime-registry"
import {
  DASHBOARD_TICKET_ACTION_IDS,
  type DashboardTicketActionAvailability,
  type DashboardTicketActionId,
  type DashboardTicketActionRequest,
  type DashboardTicketActionResult,
  type DashboardTicketAiAssistAction,
  type DashboardTicketAiAssistRequest,
  type DashboardTicketAiAssistResult,
  type DashboardTicketAiAssistSummary,
  type DashboardTicketAssignableStaffChoice,
  type DashboardTicketDetailRecord,
  type DashboardTicketEscalationTargetChoice,
  type DashboardTicketFeedbackQuestionSummary,
  type DashboardTicketFeedbackStoredStatus,
  type DashboardTicketFeedbackTelemetryQuery,
  type DashboardTicketFeedbackTelemetryRecord,
  type DashboardTicketFeedbackTelemetryResult,
  type DashboardTicketMoveTargetChoice,
  type DashboardTicketParticipantChoice,
  type DashboardTicketProviderLockedActionId,
  type DashboardTicketProviderLock,
  type DashboardTicketQueueSummary,
  type DashboardTicketIntegrationSummary,
  type DashboardTicketLifecycleTelemetryQuery,
  type DashboardTicketLifecycleTelemetryRecord,
  type DashboardTicketLifecycleTelemetryResult,
  type DashboardTicketPriorityChoice,
  type DashboardTicketTelemetrySignals,
  type DashboardTicketTelemetrySnapshot,
  type DashboardTicketTransferCandidateChoice,
  type DashboardTicketTransportMode,
  type DashboardTicketWorkbenchViewMutationRequest,
  type DashboardTicketWorkbenchViewMutationResult,
  type DashboardTicketWorkbenchViewRecord,
  type DashboardQualityReviewActionRequest,
  type DashboardQualityReviewActionResult,
  type DashboardQualityReviewAssetResult,
  type DashboardQualityReviewCaseDetailRecord,
  type DashboardQualityReviewCaseListResult,
  type DashboardQualityReviewCaseQuery,
  type DashboardQualityReviewCaseSignal,
  type DashboardQualityReviewCaseSummary,
  type DashboardQualityReviewNotificationStatus,
  type DashboardQualityReviewNoteAdjustmentRecord,
  type DashboardQualityReviewQueueSummary,
  type DashboardQualityReviewRawFeedbackRecord,
  type DashboardQualityReviewRawFeedbackStatus,
  type DashboardQualityReviewResolutionOutcome,
  type DashboardQualityReviewState
} from "./ticket-workbench-types"
import {
  buildQualityReviewQueueSummary,
  projectQualityReviewQueueFields
} from "./quality-review-queue"
import {
  buildTicketQueueSummary,
  TICKET_QUEUE_OWNED_ANCHOR_EVENT_TYPES
} from "./ticket-workbench"

export interface DashboardRuntimeGuildMember {
  guildId: string
  userId: string
  username: string
  globalName: string | null
  displayName: string | null
  avatarUrl: string | null
  roleIds: string[]
}

export interface DashboardRuntimeBridge {
  getSnapshot: (projectRoot: string) => DashboardRuntimeSnapshot
  listPlugins: (projectRoot: string) => DashboardPluginInventoryItem[]
  getPluginDetail: (projectRoot: string, pluginId: string) => DashboardPluginDetail | null
  listTickets: () => DashboardTicketRecord[]
  getTicketDetail?: (ticketId: string, actorUserId: string) => Promise<DashboardTicketDetailRecord | null>
  runTicketAction?: (input: DashboardTicketActionRequest) => Promise<DashboardTicketActionResult>
  runTicketAiAssist?: (input: DashboardTicketAiAssistRequest) => Promise<DashboardTicketAiAssistResult>
  listLifecycleTelemetry?: (query: DashboardTicketLifecycleTelemetryQuery) => Promise<DashboardTicketLifecycleTelemetryResult>
  listFeedbackTelemetry?: (query: DashboardTicketFeedbackTelemetryQuery) => Promise<DashboardTicketFeedbackTelemetryResult>
  getTicketTelemetrySignals?: (ticketIds: string[]) => Promise<Record<string, DashboardTicketTelemetrySignals>>
  getTicketQueueSummary?: (input: { actorUserId: string; now?: number }) => Promise<DashboardTicketQueueSummary | null>
  listTicketWorkbenchViews?: (actorUserId: string) => Promise<DashboardTicketWorkbenchViewRecord[]>
  getTicketWorkbenchView?: (viewId: string, actorUserId: string) => Promise<DashboardTicketWorkbenchViewRecord | null>
  createTicketWorkbenchView?: (input: DashboardTicketWorkbenchViewMutationRequest) => Promise<DashboardTicketWorkbenchViewMutationResult>
  updateTicketWorkbenchView?: (input: DashboardTicketWorkbenchViewMutationRequest & { viewId: string }) => Promise<DashboardTicketWorkbenchViewMutationResult>
  deleteTicketWorkbenchView?: (input: { viewId: string; actorUserId: string; actorIsAdmin: boolean }) => Promise<DashboardTicketWorkbenchViewMutationResult>
  listQualityReviewCases?: (query: DashboardQualityReviewCaseQuery, actorUserId: string) => Promise<DashboardQualityReviewCaseListResult>
  getQualityReviewCase?: (ticketId: string, actorUserId: string) => Promise<DashboardQualityReviewCaseDetailRecord | null>
  getQualityReviewQueueSummary?: (input: { actorUserId: string; now?: number }) => Promise<DashboardQualityReviewQueueSummary | null>
  getQualityReviewNotificationStatus?: (input?: { ticketId?: string | null; now?: number }) => Promise<DashboardQualityReviewNotificationStatus | null>
  runQualityReviewAction?: (input: DashboardQualityReviewActionRequest) => Promise<DashboardQualityReviewActionResult>
  resolveQualityReviewAsset?: (ticketId: string, sessionId: string, assetId: string, actorUserId: string) => Promise<DashboardQualityReviewAssetResult>
  resolveQualityReviewOwnerLabel?: (userId: string) => Promise<string>
  getRuntimeSource?: () => DashboardRuntimeSource | null
  resolveGuildMember?: (userId: string) => Promise<DashboardRuntimeGuildMember | null>
  getGuildId?: () => string | null
}

export const defaultDashboardRuntimeBridge: DashboardRuntimeBridge = {
  getSnapshot(projectRoot) {
    return getDashboardRuntimeSnapshot({ projectRoot })
  },
  listPlugins(projectRoot) {
    return listDashboardPlugins({ projectRoot })
  },
  getPluginDetail(projectRoot, pluginId) {
    return getDashboardPluginDetail({ projectRoot, pluginId })
  },
  listTickets() {
    return listDashboardTickets()
  },
  async getTicketDetail(ticketId, actorUserId) {
    return await getRuntimeTicketDetail(defaultDashboardRuntimeBridge, ticketId, actorUserId)
  },
  async runTicketAction(input) {
    return await runRuntimeTicketAction(defaultDashboardRuntimeBridge, input)
  },
  async runTicketAiAssist(input) {
    return await runRuntimeTicketAiAssist(defaultDashboardRuntimeBridge, input)
  },
  async listLifecycleTelemetry(query) {
    return await listRuntimeLifecycleTelemetry(defaultDashboardRuntimeBridge, query)
  },
  async listFeedbackTelemetry(query) {
    return await listRuntimeFeedbackTelemetry(defaultDashboardRuntimeBridge, query)
  },
  async getTicketTelemetrySignals(ticketIds) {
    return await getRuntimeTicketTelemetrySignals(defaultDashboardRuntimeBridge, ticketIds)
  },
  async getTicketQueueSummary(input) {
    return await getRuntimeTicketQueueSummary(defaultDashboardRuntimeBridge, input)
  },
  async listTicketWorkbenchViews(actorUserId) {
    return await listRuntimeTicketWorkbenchViews(defaultDashboardRuntimeBridge, actorUserId)
  },
  async getTicketWorkbenchView(viewId, actorUserId) {
    return await getRuntimeTicketWorkbenchView(defaultDashboardRuntimeBridge, viewId, actorUserId)
  },
  async createTicketWorkbenchView(input) {
    return await createRuntimeTicketWorkbenchView(defaultDashboardRuntimeBridge, input)
  },
  async updateTicketWorkbenchView(input) {
    return await updateRuntimeTicketWorkbenchView(defaultDashboardRuntimeBridge, input)
  },
  async deleteTicketWorkbenchView(input) {
    return await deleteRuntimeTicketWorkbenchView(defaultDashboardRuntimeBridge, input)
  },
  async listQualityReviewCases(query, actorUserId) {
    return await listRuntimeQualityReviewCases(defaultDashboardRuntimeBridge, query, actorUserId)
  },
  async getQualityReviewCase(ticketId, actorUserId) {
    return await getRuntimeQualityReviewCase(defaultDashboardRuntimeBridge, ticketId, actorUserId)
  },
  async getQualityReviewQueueSummary(input) {
    return await getRuntimeQualityReviewQueueSummary(defaultDashboardRuntimeBridge, input)
  },
  async getQualityReviewNotificationStatus(input) {
    return await getRuntimeQualityReviewNotificationStatus(defaultDashboardRuntimeBridge, input)
  },
  async runQualityReviewAction(input) {
    return await runRuntimeQualityReviewAction(defaultDashboardRuntimeBridge, input)
  },
  async resolveQualityReviewAsset(ticketId, sessionId, assetId, actorUserId) {
    return await resolveRuntimeQualityReviewAsset(defaultDashboardRuntimeBridge, ticketId, sessionId, assetId, actorUserId)
  },
  getRuntimeSource() {
    return getDashboardRuntimeSource()
  },
  getGuildId() {
    return getDashboardRuntimeGuildId(defaultDashboardRuntimeBridge)
  },
  async resolveGuildMember(userId) {
    return await resolveDashboardRuntimeGuildMember(defaultDashboardRuntimeBridge, userId)
  }
}

interface DashboardRuntimeAuthSource extends DashboardRuntimeSource {
  client?: {
    mainServer?: {
      id?: string
    } | null
    fetchGuild?: (guildId: string) => Promise<{
      id?: string
    } | null>
    fetchGuildMember?: (guildId: string | { id?: string } | null, userId: string) => Promise<any>
  }
  configs?: {
    get?: (id: string) => {
      data?: Record<string, unknown>
    } | null
  }
  databases?: {
    get?: (id: string) => {
      get?: (category: string, key: string) => unknown | Promise<unknown>
      set?: (category: string, key: string, value: unknown) => unknown | Promise<unknown>
      delete?: (category: string, key: string) => unknown | Promise<unknown>
      getCategory?: (category: string) => Array<{ key: string; value: unknown }> | undefined | Promise<Array<{ key: string; value: unknown }> | undefined>
    } | null
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function stringOrNull(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized || null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

const TICKET_WORKBENCH_VIEWS_CATEGORY = "opendiscord:ticket-workbench:views"
const TICKET_WORKBENCH_VIEW_NAME_MAX_LENGTH = 80

function ticketWorkbenchViewResult(
  ok: boolean,
  status: DashboardTicketWorkbenchViewMutationResult["status"],
  message: string,
  view: DashboardTicketWorkbenchViewRecord | null = null
): DashboardTicketWorkbenchViewMutationResult {
  return { ok, status, message, view }
}

function normalizeViewQuery(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const query: Record<string, string> = {}
  for (const [key, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeString(rawValue)
    if (normalized) query[key] = normalized
  }
  return query
}

function normalizeTicketWorkbenchViewRecord(key: string, value: unknown): DashboardTicketWorkbenchViewRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const viewId = normalizeString(record.viewId) || normalizeString(key)
  const scope = record.scope === "shared" ? "shared" : record.scope === "private" ? "private" : null
  const ownerUserId = normalizeString(record.ownerUserId)
  const name = normalizeString(record.name)
  const createdAt = numberOrNull(record.createdAt) || 0
  const updatedAt = numberOrNull(record.updatedAt) || createdAt
  if (!viewId || !scope || !ownerUserId || !name || name.length > TICKET_WORKBENCH_VIEW_NAME_MAX_LENGTH) return null
  return {
    viewId,
    scope,
    ownerUserId,
    name,
    query: normalizeViewQuery(record.query),
    createdAt,
    updatedAt
  }
}

function canReadTicketWorkbenchView(view: DashboardTicketWorkbenchViewRecord, actorUserId: string) {
  return view.scope === "shared" || view.ownerUserId === actorUserId
}

function canWriteTicketWorkbenchView(view: DashboardTicketWorkbenchViewRecord, actorUserId: string, actorIsAdmin: boolean) {
  if (view.scope === "private") return view.ownerUserId === actorUserId
  return actorIsAdmin
}

function getTicketWorkbenchViewDatabase(runtimeBridge: DashboardRuntimeBridge) {
  const runtime = runtimeBridge.getRuntimeSource?.() as DashboardRuntimeAuthSource | null
  return runtime?.databases?.get?.("opendiscord:global") || null
}

function normalizeTicketWorkbenchViewName(name: unknown) {
  const normalized = normalizeString(name)
  return normalized.length > TICKET_WORKBENCH_VIEW_NAME_MAX_LENGTH ? "" : normalized
}

function buildTicketWorkbenchViewRecord(input: DashboardTicketWorkbenchViewMutationRequest, viewId: string, now: number, existing?: DashboardTicketWorkbenchViewRecord | null): DashboardTicketWorkbenchViewRecord | null {
  const actorUserId = normalizeString(input.actorUserId)
  const name = normalizeTicketWorkbenchViewName(input.name)
  const scope = input.scope === "shared" ? "shared" : "private"
  if (!actorUserId || !name) return null
  if (scope === "shared" && !input.actorIsAdmin) return null
  const ownerUserId = scope === "shared"
    ? actorUserId
    : normalizeString(input.ownerUserId) || actorUserId
  if (ownerUserId !== actorUserId && !input.actorIsAdmin) return null
  return {
    viewId,
    scope,
    ownerUserId,
    name,
    query: normalizeViewQuery(input.query),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }
}

const ticketAvailabilityReasons = {
  busyWorkflow: "tickets.detail.availability.busyWorkflow",
  lockedByProvider: "tickets.detail.availability.lockedByProvider",
  ticketAlreadyClaimedOrNotOpen: "tickets.detail.availability.ticketAlreadyClaimedOrNotOpen",
  ticketNotCurrentlyClaimed: "tickets.detail.availability.ticketNotCurrentlyClaimed",
  ticketNotOpen: "tickets.detail.availability.ticketNotOpen",
  ticketAlreadyClosed: "tickets.detail.availability.ticketAlreadyClosed",
  ticketNotClosed: "tickets.detail.availability.ticketNotClosed",
  runtimeContextMissing: "tickets.detail.availability.runtimeContextMissing",
  permissionDenied: "tickets.detail.availability.permissionDenied",
  noOwningSupportTeam: "tickets.detail.availability.noOwningSupportTeam",
  noEligibleSupportMembers: "tickets.detail.availability.noEligibleSupportMembers",
  noSameTransportEscalationTargets: "tickets.detail.availability.noSameTransportEscalationTargets",
  noSameOwnerMoveTargets: "tickets.detail.availability.noSameOwnerMoveTargets",
  noEligibleNewCreators: "tickets.detail.availability.noEligibleNewCreators",
  noEligibleAddUsers: "tickets.detail.availability.noEligibleAddUsers",
  noParticipantsToRemove: "tickets.detail.availability.noParticipantsToRemove",
  noPriorityChoices: "tickets.detail.availability.noPriorityChoices",
  workflowDisabled: "tickets.detail.availability.workflowDisabled",
  closeRequestPending: "tickets.detail.availability.closeRequestPending",
  closeRequestMissing: "tickets.detail.availability.closeRequestMissing",
  awaitingUserActive: "tickets.detail.availability.awaitingUserActive",
  awaitingUserMissing: "tickets.detail.availability.awaitingUserMissing",
  pinUnsupportedTransport: "tickets.detail.availability.pinUnsupportedTransport",
  ticketAlreadyPinned: "tickets.detail.availability.ticketAlreadyPinned",
  ticketNotPinned: "tickets.detail.availability.ticketNotPinned",
  renameUnavailable: "tickets.detail.availability.renameUnavailable"
} as const

const ticketActionResults = {
  requestIncomplete: "tickets.detail.actionResults.requestIncomplete",
  refreshSuccess: "tickets.detail.actionResults.refreshSuccess",
  missingTicket: "tickets.detail.actionResults.missingTicket",
  unavailable: "tickets.detail.actionResults.unavailable",
  runtimeContextMissing: "tickets.detail.actionResults.runtimeContextMissing",
  permissionDenied: "tickets.detail.actionResults.permissionDenied",
  assignMissingAssignee: "tickets.detail.actionResults.assignMissingAssignee",
  assignIneligibleAssignee: "tickets.detail.actionResults.assignIneligibleAssignee",
  assignClaimedByOther: "tickets.detail.actionResults.assignClaimedByOther",
  assignSuccess: "tickets.detail.actionResults.assignSuccess",
  escalateMissingTarget: "tickets.detail.actionResults.escalateMissingTarget",
  escalateInvalidTarget: "tickets.detail.actionResults.escalateInvalidTarget",
  escalateSuccess: "tickets.detail.actionResults.escalateSuccess",
  moveMissingTarget: "tickets.detail.actionResults.moveMissingTarget",
  moveInvalidTarget: "tickets.detail.actionResults.moveInvalidTarget",
  moveSuccess: "tickets.detail.actionResults.moveSuccess",
  transferMissingCreator: "tickets.detail.actionResults.transferMissingCreator",
  transferSuccess: "tickets.detail.actionResults.transferSuccess",
  participantInvalidUser: "tickets.detail.actionResults.participantInvalidUser",
  participantAlreadyPresent: "tickets.detail.actionResults.participantAlreadyPresent",
  participantNotPresent: "tickets.detail.actionResults.participantNotPresent",
  participantCreatorRemoveDenied: "tickets.detail.actionResults.participantCreatorRemoveDenied",
  participantAddSuccess: "tickets.detail.actionResults.participantAddSuccess",
  participantRemoveSuccess: "tickets.detail.actionResults.participantRemoveSuccess",
  priorityInvalid: "tickets.detail.actionResults.priorityInvalid",
  priorityUnconfigured: "tickets.detail.actionResults.priorityUnconfigured",
  prioritySuccess: "tickets.detail.actionResults.prioritySuccess",
  topicMissing: "tickets.detail.actionResults.topicMissing",
  topicSuccess: "tickets.detail.actionResults.topicSuccess",
  approveCloseRequestSuccess: "tickets.detail.actionResults.approveCloseRequestSuccess",
  dismissCloseRequestSuccess: "tickets.detail.actionResults.dismissCloseRequestSuccess",
  setAwaitingUserSuccess: "tickets.detail.actionResults.setAwaitingUserSuccess",
  clearAwaitingUserSuccess: "tickets.detail.actionResults.clearAwaitingUserSuccess",
  pinSuccess: "tickets.detail.actionResults.pinSuccess",
  unpinSuccess: "tickets.detail.actionResults.unpinSuccess",
  renameMissingName: "tickets.detail.actionResults.renameMissingName",
  renameSuccess: "tickets.detail.actionResults.renameSuccess",
  aiAssistSuccess: "tickets.detail.actionResults.aiAssistSuccess",
  genericSuccess: "tickets.detail.actionResults.genericSuccess",
  genericFailure: "tickets.detail.actionResults.genericFailure"
} as const

function isDashboardTicketActionId(value: string): value is DashboardTicketActionId {
  return (DASHBOARD_TICKET_ACTION_IDS as readonly string[]).includes(value)
}

function isDashboardTicketAiAssistAction(value: string): value is DashboardTicketAiAssistAction {
  return value === "summarize" || value === "answerFaq" || value === "suggestReply"
}

function ticketActionWarning(message: string, ticketId?: string): DashboardTicketActionResult {
  return {
    ok: false,
    status: "warning",
    message,
    ...(ticketId ? { ticketId } : {})
  }
}

function ticketActionDanger(message: string, ticketId?: string): DashboardTicketActionResult {
  return {
    ok: false,
    status: "danger",
    message,
    ...(ticketId ? { ticketId } : {})
  }
}

function ticketActionSuccess(message: string, ticketId?: string): DashboardTicketActionResult {
  return {
    ok: true,
    status: "success",
    message,
    ...(ticketId ? { ticketId } : {})
  }
}

function ticketAiAssistResult(input: {
  ok: boolean
  outcome: DashboardTicketAiAssistResult["outcome"]
  action: DashboardTicketAiAssistAction
  message: string
  ticketId?: string
  profileId?: string | null
  providerId?: string | null
  confidence?: DashboardTicketAiAssistResult["confidence"]
  summary?: string | null
  answer?: string | null
  draft?: string | null
  citations?: DashboardTicketAiAssistResult["citations"]
  warnings?: string[]
  degradedReason?: string | null
}): DashboardTicketAiAssistResult {
  return {
    ok: input.ok,
    outcome: input.outcome,
    action: input.action,
    message: input.message,
    profileId: input.profileId ?? null,
    providerId: input.providerId ?? null,
    confidence: input.confidence ?? null,
    summary: input.summary ?? null,
    answer: input.answer ?? null,
    draft: input.draft ?? null,
    citations: input.citations ?? [],
    warnings: input.warnings ?? [],
    degradedReason: input.degradedReason ?? null,
    ...(input.ticketId ? { ticketId: input.ticketId } : {})
  }
}

function unknownUserLabel(userId: string | null) {
  return userId ? `Unknown user (${userId})` : "Unassigned"
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => normalizeString(entry)).filter(Boolean))]
    : []
}

function normalizeTransport(value: unknown): DashboardTicketTransportMode {
  return value === "private_thread" ? "private_thread" : "channel_text"
}

function normalizeTransportOrNull(value: unknown): DashboardTicketTransportMode | null {
  return value === "channel_text" || value === "private_thread" ? value : null
}

function runtimeDataValue(source: any, id: string) {
  if (!source || typeof source.get !== "function") return undefined
  if (typeof source.exists === "function" && !source.exists(id)) return undefined
  return source.get(id)?.value
}

function runtimeEntityId(entity: any) {
  return normalizeString(entity?.id?.value || entity?.id)
}

function runtimeEntityLabel(entity: any, fallback: string) {
  return normalizeString(entity?.name?.value || entity?.name || entity?.label) || fallback
}

function runtimeConfigData(runtime: any, id: string) {
  const namespaced = runtime?.configs?.get?.(`opendiscord:${id}`)?.data
  if (namespaced !== undefined) return namespaced
  return runtime?.configs?.get?.(id)?.data
}

function runtimeConfigArray(runtime: any, id: string) {
  const data = runtimeConfigData(runtime, id)
  return Array.isArray(data) ? data : []
}

function runtimeOptionById(runtime: any, optionId: string) {
  const fromRegistry = runtime?.options?.get?.(optionId)
  if (fromRegistry) return fromRegistry
  return runtimeConfigArray(runtime, "options").find((option) => normalizeString(option?.id) === optionId) || null
}

function runtimeExecutableOptionById(runtime: any, optionId: string) {
  const option = runtime?.options?.get?.(optionId) || null
  return option && typeof option.get === "function" ? option : null
}

function runtimeOptionSupportTeamId(option: any) {
  return normalizeString(runtimeDataValue(option, "opendiscord:routing-support-team") || option?.routing?.supportTeamId)
}

function runtimeOptionEscalationTargetIds(option: any) {
  return normalizeStringArray(runtimeDataValue(option, "opendiscord:routing-escalation-targets") || option?.routing?.escalationTargetOptionIds)
}

function runtimeOptionTransportMode(option: any) {
  return normalizeTransport(runtimeDataValue(option, "opendiscord:channel-transport-mode") || option?.channel?.transportMode)
}

function runtimeOptionThreadParentChannelId(option: any) {
  return normalizeString(runtimeDataValue(option, "opendiscord:channel-thread-parent") || option?.channel?.threadParentChannel) || null
}

function runtimeBoolean(value: unknown) {
  return value === true || value === "true"
}

function runtimeOptionWorkflowPolicy(option: any) {
  return {
    closeRequestEnabled: runtimeBoolean(
      runtimeDataValue(option, "opendiscord:workflow-close-request-enabled")
        ?? option?.workflow?.closeRequest?.enabled
    ),
    awaitingUserEnabled: runtimeBoolean(
      runtimeDataValue(option, "opendiscord:workflow-awaiting-user-enabled")
        ?? option?.workflow?.awaitingUser?.enabled
    )
  }
}

function runtimePanelForOption(runtime: any, optionId: string | null) {
  if (!optionId) return null
  return runtimeConfigArray(runtime, "panels").find((panel) => normalizeStringArray(panel?.options).includes(optionId)) || null
}

function runtimeSupportTeamById(runtime: any, teamId: string | null) {
  if (!teamId) return null
  return runtimeConfigArray(runtime, "support-teams").find((team) => normalizeString(team?.id) === teamId) || null
}

function valuesFromCollection(value: any) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value.values === "function") return Array.from(value.values())
  if (typeof value === "object") return Object.values(value)
  return []
}

async function collectRuntimeGuildMembers(guild: any) {
  let members = guild?.members?.cache
  if (typeof guild?.members?.fetch === "function") {
    members = await guild.members.fetch().catch(() => members)
  }
  return valuesFromCollection(members)
}

function runtimeMemberUserId(member: any) {
  return normalizeString(member?.user?.id || member?.id)
}

function runtimeMemberLabel(member: any, userId: string) {
  return normalizeString(member?.displayName || member?.nickname || member?.user?.globalName || member?.user?.username || member?.username) || unknownUserLabel(userId)
}

async function buildAssignableStaffChoices(runtimeBridge: DashboardRuntimeBridge, runtime: any, guild: any, teamId: string | null): Promise<DashboardTicketAssignableStaffChoice[]> {
  const team = runtimeSupportTeamById(runtime, teamId)
  const teamRoleIds = new Set(normalizeStringArray(team?.roleIds))
  if (!guild || teamRoleIds.size < 1) return []

  const choices: DashboardTicketAssignableStaffChoice[] = []
  const seen = new Set<string>()
  for (const member of await collectRuntimeGuildMembers(guild)) {
    const userId = runtimeMemberUserId(member)
    if (!userId || seen.has(userId) || Boolean(member?.user?.bot || member?.bot)) continue
    const memberRoleIds = extractRoleIds(member)
    if (!memberRoleIds.some((roleId) => teamRoleIds.has(roleId))) continue
    seen.add(userId)
    choices.push({ userId, label: runtimeMemberLabel(member, userId) })
  }

  if (choices.length < 1 && runtimeBridge.resolveGuildMember && teamRoleIds.size > 0) {
    return []
  }

  return choices.sort((left, right) => left.label.localeCompare(right.label) || left.userId.localeCompare(right.userId))
}

function buildEscalationTargetChoices(runtime: any, option: any, ticketTransport: DashboardTicketTransportMode): DashboardTicketEscalationTargetChoice[] {
  const targets: DashboardTicketEscalationTargetChoice[] = []
  for (const targetId of runtimeOptionEscalationTargetIds(option)) {
    const target = runtimeOptionById(runtime, targetId)
    const targetTransport = runtimeOptionTransportMode(target)
    if (targetTransport !== ticketTransport) continue
    const panel = runtimePanelForOption(runtime, targetId)
    const panelId = normalizeString(panel?.id) || null
    targets.push({
      optionId: targetId,
      optionLabel: target ? runtimeEntityLabel(target, targetId) : `Missing option (${targetId})`,
      panelId,
      panelLabel: panelId ? runtimeEntityLabel(panel, panelId) : "Missing panel",
      transportMode: targetTransport
    })
  }
  return targets
}

function buildMoveTargetChoices(
  runtime: any,
  currentOptionId: string | null,
  currentTeamId: string | null,
  ticketTransport: DashboardTicketTransportMode,
  ticketParentChannelId: string | null
): DashboardTicketMoveTargetChoice[] {
  const targets: DashboardTicketMoveTargetChoice[] = []
  if (typeof runtime?.options?.getAll !== "function" || typeof runtime?.options?.get !== "function") {
    return targets
  }
  const options = runtime.options.getAll()
  for (const option of options) {
    const optionId = runtimeEntityId(option) || normalizeString(option?.id)
    if (!optionId || optionId === currentOptionId) continue
    if (normalizeString(option?.type) && normalizeString(option?.type) !== "ticket") continue
    const targetTransport = runtimeOptionTransportMode(option)
    if (targetTransport !== ticketTransport) continue
    if (ticketTransport === "private_thread" && runtimeOptionThreadParentChannelId(option) !== ticketParentChannelId) continue
    const targetTeamId = runtimeOptionSupportTeamId(option) || null
    if ((currentTeamId || null) !== (targetTeamId || null)) continue
    const panel = runtimePanelForOption(runtime, optionId)
    const panelId = normalizeString(panel?.id) || null
    const team = runtimeSupportTeamById(runtime, targetTeamId)
    targets.push({
      optionId,
      optionLabel: runtimeEntityLabel(option, optionId),
      panelId,
      panelLabel: panelId ? runtimeEntityLabel(panel, panelId) : "Missing panel",
      transportMode: targetTransport,
      teamId: targetTeamId,
      teamLabel: targetTeamId ? team ? runtimeEntityLabel(team, targetTeamId) : `Missing team (${targetTeamId})` : "No team"
    })
  }
  return targets.sort((left, right) => left.optionLabel.localeCompare(right.optionLabel) || left.optionId.localeCompare(right.optionId))
}

function runtimeTicketParticipants(runtimeTicket: any): Array<{ type: string; id: string }> {
  const value = runtimeDataValue(runtimeTicket, "opendiscord:participants")
  return Array.isArray(value)
    ? value.map((participant) => ({ type: normalizeString(participant?.type), id: normalizeString(participant?.id) })).filter((participant) => participant.type && participant.id)
    : []
}

function resolveOriginalApplicantUserId(runtimeTicket: any, currentCreatorId: string | null) {
  const previousCreators = normalizeStringArray(runtimeDataValue(runtimeTicket, "opendiscord:previous-creators"))
  return previousCreators[0] || currentCreatorId || null
}

async function resolveManagedRecordApplicantUserId(runtime: any, ticketId: string) {
  const formsService = runtime?.plugins?.classes?.get?.("ot-ticket-forms:service")
  if (!formsService || typeof formsService.listTicketDrafts !== "function") {
    return null
  }

  try {
    const drafts = await formsService.listTicketDrafts()
    if (!Array.isArray(drafts)) return null
    const draft = drafts.find((candidate) => (
      normalizeString(candidate?.ticketChannelId) === ticketId
      && normalizeString(candidate?.applicantDiscordUserId)
      && candidate?.answerTarget === "ticket_managed_record"
    ))
    return normalizeString(draft?.applicantDiscordUserId) || null
  } catch {
    return null
  }
}

async function buildTransferCandidateChoices(runtime: any, guild: any, currentCreatorId: string | null): Promise<DashboardTicketTransferCandidateChoice[]> {
  if (!guild) return []
  const choices: DashboardTicketTransferCandidateChoice[] = []
  const seen = new Set<string>()
  for (const member of await collectRuntimeGuildMembers(guild)) {
    const userId = runtimeMemberUserId(member)
    if (!userId || userId === currentCreatorId || seen.has(userId) || Boolean(member?.user?.bot || member?.bot)) continue
    seen.add(userId)
    choices.push({ userId, label: runtimeMemberLabel(member, userId) })
  }
  return choices.sort((left, right) => left.label.localeCompare(right.label) || left.userId.localeCompare(right.userId))
}

async function buildParticipantChoices(runtime: any, guild: any, runtimeTicket: any, currentCreatorId: string | null): Promise<DashboardTicketParticipantChoice[]> {
  const present = new Set<string>()
  if (currentCreatorId) present.add(currentCreatorId)
  for (const participant of runtimeTicketParticipants(runtimeTicket)) {
    if (participant.type === "user") present.add(participant.id)
  }

  const choices = new Map<string, DashboardTicketParticipantChoice>()
  const addChoice = (userId: string, label: string, isPresent: boolean) => {
    if (!userId) return
    const existing = choices.get(userId)
    choices.set(userId, {
      userId,
      label: existing?.label && !existing.label.startsWith("Unknown user") ? existing.label : label,
      present: Boolean(existing?.present || isPresent)
    })
  }

  for (const userId of present) {
    addChoice(userId, unknownUserLabel(userId), true)
  }

  if (guild) {
    for (const member of await collectRuntimeGuildMembers(guild)) {
      const userId = runtimeMemberUserId(member)
      if (!userId || Boolean(member?.user?.bot || member?.bot)) continue
      addChoice(userId, runtimeMemberLabel(member, userId), present.has(userId))
    }
  }

  return [...choices.values()].sort((left, right) => {
    if (left.present !== right.present) return left.present ? -1 : 1
    return left.label.localeCompare(right.label) || left.userId.localeCompare(right.userId)
  })
}

function runtimePriorityId(priority: any) {
  return normalizeString(priority?.rawName || priority?.id?.value || priority?.id || String(priority?.priority ?? ""))
}

function runtimePriorityLabel(priority: any, fallback: string) {
  if (typeof priority?.renderDisplayName === "function") return normalizeString(priority.renderDisplayName()) || fallback
  return normalizeString(priority?.displayName || priority?.rawName || priority?.name) || fallback
}

function buildPriorityChoices(runtime: any, currentPriorityLevel: number | null): DashboardTicketPriorityChoice[] {
  const priorities = runtime?.priorities?.getAll?.() || []
  const choices: DashboardTicketPriorityChoice[] = []
  const seen = new Set<string>()
  for (const priority of priorities) {
    const priorityId = runtimePriorityId(priority)
    if (!priorityId || seen.has(priorityId)) continue
    seen.add(priorityId)
    choices.push({ priorityId, label: runtimePriorityLabel(priority, priorityId) })
  }
  if (currentPriorityLevel !== null) {
    const currentPriority = runtime?.priorities?.getFromPriorityLevel?.(currentPriorityLevel)
    const currentPriorityId = runtimePriorityId(currentPriority) || String(currentPriorityLevel)
    if (currentPriorityId && !seen.has(currentPriorityId)) {
      choices.unshift({ priorityId: currentPriorityId, label: currentPriority ? runtimePriorityLabel(currentPriority, currentPriorityId) : `Priority ${currentPriorityLevel}` })
    }
  }
  return choices.sort((left, right) => left.label.localeCompare(right.label) || left.priorityId.localeCompare(right.priorityId))
}

function resolvePriorityChoice(runtime: any, priorityId: string) {
  return (runtime?.priorities?.getAll?.() || []).find((priority: any) => (
    runtimePriorityId(priority) === priorityId
    || normalizeString(priority?.rawName) === priorityId
    || normalizeString(priority?.id?.value) === priorityId
    || String(priority?.priority ?? "") === priorityId
  )) || null
}

async function resolveRuntimeUser(context: Awaited<ReturnType<typeof resolveRuntimeActionContext>>, userId: string) {
  const discordUser = typeof context.runtime?.client?.client?.users?.fetch === "function"
    ? await context.runtime.client.client.users.fetch(userId).catch(() => null)
    : null
  if (discordUser) return discordUser
  const fetchedUser = typeof context.runtime?.client?.fetchUser === "function"
    ? await context.runtime.client.fetchUser(userId).catch(() => null)
    : null
  return fetchedUser || { id: userId, username: userId, displayName: userId }
}

function disabledAvailability(reason: string): DashboardTicketActionAvailability {
  return { enabled: false, reason }
}

function enabledAvailability(): DashboardTicketActionAvailability {
  return { enabled: true, reason: null }
}

function getRuntimeAction(runtime: any, actionId: string) {
  try {
    return runtime?.actions?.get?.(actionId) || null
  } catch {
    return null
  }
}

function missingRuntimeTicketActionReason(runtime: any, action: DashboardTicketActionId) {
  if (action !== "pin" && action !== "unpin" && action !== "rename") return null
  const runtimeActionId = `opendiscord:${action}-ticket`
  const runtimeAction = getRuntimeAction(runtime, runtimeActionId)
  if (runtimeAction && typeof runtimeAction.run === "function") return null
  return action === "rename"
    ? ticketAvailabilityReasons.renameUnavailable
    : "tickets.detail.availability.genericUnavailable"
}

function invalidTicketStateReason(ticket: DashboardTicketRecord, action: DashboardTicketActionId) {
  if (action === "claim" && (!ticket.open || ticket.claimed)) return ticketAvailabilityReasons.ticketAlreadyClaimedOrNotOpen
  if (action === "unclaim" && (!ticket.open || !ticket.claimed)) return ticketAvailabilityReasons.ticketNotCurrentlyClaimed
  if (action === "assign" && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if (action === "escalate" && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if (["move", "transfer", "add-participant", "remove-participant", "set-priority", "set-topic"].includes(action) && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if ((action === "pin" || action === "unpin" || action === "rename") && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if ((action === "pin" || action === "unpin") && ticket.transportMode !== "channel_text") return ticketAvailabilityReasons.pinUnsupportedTransport
  if (action === "pin" && ticket.pinned) return ticketAvailabilityReasons.ticketAlreadyPinned
  if (action === "unpin" && !ticket.pinned) return ticketAvailabilityReasons.ticketNotPinned
  if ((action === "approve-close-request" || action === "dismiss-close-request") && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if ((action === "approve-close-request" || action === "dismiss-close-request") && ticket.closeRequestState !== "requested") return ticketAvailabilityReasons.closeRequestMissing
  if (action === "set-awaiting-user" && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if (action === "set-awaiting-user" && ticket.closeRequestState === "requested") return ticketAvailabilityReasons.closeRequestPending
  if (action === "set-awaiting-user" && ticket.awaitingUserState) return ticketAvailabilityReasons.awaitingUserActive
  if (action === "clear-awaiting-user" && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketNotOpen
  if (action === "clear-awaiting-user" && !ticket.awaitingUserState) return ticketAvailabilityReasons.awaitingUserMissing
  if (action === "close" && (!ticket.open || ticket.closed)) return ticketAvailabilityReasons.ticketAlreadyClosed
  if (action === "reopen" && !ticket.closed) return ticketAvailabilityReasons.ticketNotClosed
  return null
}

function runtimeTicketWorkflowLockReason(runtimeTicket: any, action: DashboardTicketActionId) {
  if (action === "refresh") return null
  return runtimeDataValue(runtimeTicket, "opendiscord:busy") === true
    ? ticketAvailabilityReasons.busyWorkflow
    : null
}

function routeConstraintReason(input: {
  action: DashboardTicketActionId
  owningTeamId: string | null
  assignableStaff: DashboardTicketAssignableStaffChoice[]
  escalationTargets: DashboardTicketEscalationTargetChoice[]
  moveTargets: DashboardTicketMoveTargetChoice[]
  transferCandidates: DashboardTicketTransferCandidateChoice[]
  participantChoices: DashboardTicketParticipantChoice[]
  priorityChoices: DashboardTicketPriorityChoice[]
  currentCreatorId: string | null
  workflowPolicy: ReturnType<typeof runtimeOptionWorkflowPolicy>
}) {
  if (input.action === "assign") {
    if (!input.owningTeamId) return ticketAvailabilityReasons.noOwningSupportTeam
    if (input.assignableStaff.length < 1) return ticketAvailabilityReasons.noEligibleSupportMembers
  }
  if (input.action === "escalate" && input.escalationTargets.length < 1) {
    return ticketAvailabilityReasons.noSameTransportEscalationTargets
  }
  if (input.action === "move" && input.moveTargets.length < 1) {
    return ticketAvailabilityReasons.noSameOwnerMoveTargets
  }
  if (input.action === "transfer" && input.transferCandidates.length < 1) {
    return ticketAvailabilityReasons.noEligibleNewCreators
  }
  if (input.action === "add-participant" && !input.participantChoices.some((choice) => !choice.present)) {
    return ticketAvailabilityReasons.noEligibleAddUsers
  }
  if (input.action === "remove-participant" && !input.participantChoices.some((choice) => choice.present && choice.userId !== input.currentCreatorId)) {
    return ticketAvailabilityReasons.noParticipantsToRemove
  }
  if (input.action === "set-priority" && input.priorityChoices.length < 1) {
    return ticketAvailabilityReasons.noPriorityChoices
  }
  if ((input.action === "approve-close-request" || input.action === "dismiss-close-request") && !input.workflowPolicy.closeRequestEnabled) {
    return ticketAvailabilityReasons.workflowDisabled
  }
  if (input.action === "set-awaiting-user" && !input.workflowPolicy.awaitingUserEnabled) {
    return ticketAvailabilityReasons.workflowDisabled
  }
  return null
}

async function buildRuntimeActionAvailability(input: {
  runtimeBridge: DashboardRuntimeBridge
  context: Awaited<ReturnType<typeof resolveRuntimeActionContext>> | null
  runtimeTicket: any
  ticket: DashboardTicketRecord
  providerLock: DashboardTicketProviderLock | null
  owningTeamId: string | null
  assignableStaff: DashboardTicketAssignableStaffChoice[]
  escalationTargets: DashboardTicketEscalationTargetChoice[]
  moveTargets: DashboardTicketMoveTargetChoice[]
  transferCandidates: DashboardTicketTransferCandidateChoice[]
  participantChoices: DashboardTicketParticipantChoice[]
  priorityChoices: DashboardTicketPriorityChoice[]
  currentCreatorId: string | null
  workflowPolicy: ReturnType<typeof runtimeOptionWorkflowPolicy>
}) {
  const locked = new Set(input.providerLock?.lockedActions || [])
  const availability: Record<DashboardTicketActionId, DashboardTicketActionAvailability> = {} as Record<DashboardTicketActionId, DashboardTicketActionAvailability>

  for (const action of DASHBOARD_TICKET_ACTION_IDS) {
    const runtimeRequired = action !== "refresh"
    if (runtimeRequired && (!input.context?.runtime || !input.context.guild || !input.context.channel || !input.context.user)) {
      availability[action] = disabledAvailability(ticketAvailabilityReasons.runtimeContextMissing)
      continue
    }

    const missingActionReason = runtimeRequired && input.context?.runtime
      ? missingRuntimeTicketActionReason(input.context.runtime, action)
      : null
    if (missingActionReason) {
      availability[action] = disabledAvailability(missingActionReason)
      continue
    }

    const invalidStateReason = invalidTicketStateReason(input.ticket, action)
    if (invalidStateReason) {
      availability[action] = disabledAvailability(invalidStateReason)
      continue
    }

    if (runtimeRequired && input.context) {
      const permission = await checkRuntimeTicketActionPermission(input.context, action)
      if (!permission.allowed) {
        availability[action] = disabledAvailability(permission.reason || ticketAvailabilityReasons.permissionDenied)
        continue
      }
    }

    if (locked.has(action)) {
      availability[action] = disabledAvailability(ticketAvailabilityReasons.lockedByProvider)
      continue
    }

    const workflowReason = runtimeTicketWorkflowLockReason(input.runtimeTicket, action)
    if (workflowReason) {
      availability[action] = disabledAvailability(workflowReason)
      continue
    }

    const routeReason = routeConstraintReason({
      action,
      owningTeamId: input.owningTeamId,
      assignableStaff: input.assignableStaff,
      escalationTargets: input.escalationTargets,
      moveTargets: input.moveTargets,
      transferCandidates: input.transferCandidates,
      participantChoices: input.participantChoices,
      priorityChoices: input.priorityChoices,
      currentCreatorId: input.currentCreatorId,
      workflowPolicy: input.workflowPolicy
    })
    if (routeReason) {
      availability[action] = disabledAvailability(routeReason)
      continue
    }

    availability[action] = enabledAvailability()
  }

  return availability
}

async function resolveProviderLock(runtimeBridge: DashboardRuntimeBridge, ticketId: string): Promise<DashboardTicketProviderLock | null> {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const bridgeService = runtime?.plugins?.classes?.get?.("ot-eotfs-bridge:service")
  if (!bridgeService || typeof bridgeService.getDashboardTicketLockState !== "function") {
    return null
  }

  try {
    return await bridgeService.getDashboardTicketLockState(ticketId)
  } catch {
    return null
  }
}

function normalizeProviderLockedActions(value: unknown): DashboardTicketProviderLockedActionId[] {
  if (!Array.isArray(value)) return []
  return value
    .map((action) => normalizeString(action))
    .filter((action): action is DashboardTicketProviderLockedActionId => Boolean(action))
}

async function resolveIntegrationSummary(runtimeBridge: DashboardRuntimeBridge, ticketId: string): Promise<DashboardTicketIntegrationSummary | null> {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const service = runtime?.plugins?.classes?.get?.("opendiscord:ticket-integration-service")
  if (!service || typeof service.getTicketIntegrationSummary !== "function") return null
  const ticket = getRuntimeTicket(runtime, ticketId)
  if (!ticket) return null

  try {
    const guild = await resolveRuntimeActionGuild(runtimeBridge, runtime)
    const channel = guild && runtime?.client
      ? await (
        runtime.client.fetchGuildTextBasedChannel?.(guild, ticketId)
        || runtime.client.fetchGuildTextChannel?.(guild, ticketId)
        || Promise.resolve(null)
      ).catch(() => null)
      : null
    const summary = await service.getTicketIntegrationSummary({ ticket, channel, guild })
    if (!summary) return null
    return {
      profileId: normalizeString(summary.profileId),
      providerId: normalizeString(summary.providerId),
      label: normalizeString(summary.label) || normalizeString(summary.profileId) || "Ticket integration",
      state: summary.state == "ready" || summary.state == "degraded" || summary.state == "locked" || summary.state == "unavailable" ? summary.state : "ready",
      summary: normalizeString(summary.summary) || null,
      degradedReason: normalizeString(summary.degradedReason) || null,
      lockedTicketActions: normalizeProviderLockedActions(summary.lockedTicketActions)
    }
  } catch {
    return null
  }
}

async function resolveAiAssistSummary(runtimeBridge: DashboardRuntimeBridge, ticketId: string): Promise<DashboardTicketAiAssistSummary | null> {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const service = runtime?.plugins?.classes?.get?.("ot-ai-assist:service")
  if (!service || typeof service.getTicketAiAssistSummary !== "function") return null
  const ticket = getRuntimeTicket(runtime, ticketId)
  if (!ticket) return null

  try {
    const guild = await resolveRuntimeActionGuild(runtimeBridge, runtime)
    const channel = guild && runtime?.client
      ? await (
        runtime.client.fetchGuildTextBasedChannel?.(guild, ticketId)
        || runtime.client.fetchGuildTextChannel?.(guild, ticketId)
        || Promise.resolve(null)
      ).catch(() => null)
      : null
    const summary = await service.getTicketAiAssistSummary({ ticket, channel, guild })
    if (!summary) return null
    return {
      profileId: normalizeString(summary.profileId),
      providerId: normalizeString(summary.providerId),
      label: normalizeString(summary.label) || normalizeString(summary.profileId) || "AI assist",
      available: summary.available === true,
      actions: Array.isArray(summary.actions)
        ? summary.actions.map((action: unknown) => normalizeString(action)).filter(isDashboardTicketAiAssistAction)
        : [],
      reason: normalizeString(summary.reason) || null
    }
  } catch {
    return null
  }
}

const TELEMETRY_SERVICE_ID = "ot-telemetry:service"
const TELEMETRY_DEFAULT_LIMIT = 200
const TELEMETRY_MAX_LIMIT = 500

function defaultTicketTelemetrySignals(): DashboardTicketTelemetrySignals {
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

function telemetryUnavailableResult<T>(message = "Ticket telemetry reads are unavailable.") {
  return {
    items: [] as T[],
    nextCursor: null,
    truncated: false,
    warnings: [message]
  }
}

function getRuntimeTelemetryService(runtimeBridge: DashboardRuntimeBridge) {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  try {
    return runtime?.plugins?.classes?.get?.(TELEMETRY_SERVICE_ID) || null
  } catch {
    return null
  }
}

function hasRuntimeTelemetryService(runtimeBridge: DashboardRuntimeBridge) {
  const service = getRuntimeTelemetryService(runtimeBridge)
  return Boolean(
    service
    && typeof service.listLifecycleHistory === "function"
    && typeof service.listFeedbackHistory === "function"
  )
}

function normalizeTelemetryLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return TELEMETRY_DEFAULT_LIMIT
  return Math.min(TELEMETRY_MAX_LIMIT, Math.floor(value))
}

function normalizeTelemetryCursor(value: unknown) {
  const normalized = normalizeString(value)
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function pageTelemetryItems<T>(items: T[], query: { cursor?: string | null; limit?: number }) {
  const offset = normalizeTelemetryCursor(query.cursor)
  const limit = normalizeTelemetryLimit(query.limit)
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    items: page,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
    truncated: false,
    warnings: [] as string[]
  }
}

function normalizeTelemetrySnapshot(value: any): DashboardTicketTelemetrySnapshot {
  return {
    creatorUserId: stringOrNull(value?.creatorUserId),
    optionId: stringOrNull(value?.optionId),
    transportMode: normalizeTransportOrNull(value?.transportMode),
    assignedTeamId: stringOrNull(value?.assignedTeamId),
    assignedStaffUserId: stringOrNull(value?.assignedStaffUserId),
    assignmentStrategy: stringOrNull(value?.assignmentStrategy),
    integrationProfileId: stringOrNull(value?.integrationProfileId),
    aiAssistProfileId: stringOrNull(value?.aiAssistProfileId),
    closeRequestState: stringOrNull(value?.closeRequestState),
    awaitingUserState: stringOrNull(value?.awaitingUserState),
    firstStaffResponseAt: numberOrNull(value?.firstStaffResponseAt),
    resolvedAt: numberOrNull(value?.resolvedAt),
    closed: value?.closed === true
  }
}

function normalizeLifecycleTelemetryRecord(value: any): DashboardTicketLifecycleTelemetryRecord | null {
  const recordId = normalizeString(value?.recordId)
  const ticketId = normalizeString(value?.ticketId)
  const eventType = normalizeString(value?.eventType)
  const occurredAt = numberOrNull(value?.occurredAt)
  if (!recordId || !ticketId || !eventType || occurredAt == null) return null
  return {
    recordId,
    ticketId,
    eventType,
    occurredAt,
    actorUserId: stringOrNull(value?.actorUserId),
    snapshot: normalizeTelemetrySnapshot(value?.snapshot),
    previousSnapshot: value?.previousSnapshot ? normalizeTelemetrySnapshot(value.previousSnapshot) : null
  }
}

function normalizeFeedbackStatus(value: unknown): DashboardTicketFeedbackStoredStatus | null {
  return value === "completed" || value === "ignored" || value === "delivery_failed" ? value : null
}

function normalizeFeedbackQuestionType(value: unknown): DashboardTicketFeedbackQuestionSummary["type"] {
  if (value === "rating" || value === "image" || value === "attachment" || value === "choice") return value
  return "text"
}

function normalizeFeedbackQuestionSummary(value: any): DashboardTicketFeedbackQuestionSummary | null {
  const position = numberOrNull(value?.position)
  if (position == null) return null
  return {
    position,
    type: normalizeFeedbackQuestionType(value?.type),
    label: normalizeString(value?.label),
    answered: value?.answered === true,
    ratingValue: numberOrNull(value?.ratingValue),
    choiceIndex: numberOrNull(value?.choiceIndex),
    choiceLabel: stringOrNull(value?.choiceLabel)
  }
}

function normalizeFeedbackTelemetryRecord(value: any): DashboardTicketFeedbackTelemetryRecord | null {
  const sessionId = normalizeString(value?.sessionId)
  const ticketId = normalizeString(value?.ticketId)
  const triggeredAt = numberOrNull(value?.triggeredAt)
  const status = normalizeFeedbackStatus(value?.status)
  if (!sessionId || !ticketId || triggeredAt == null || !status) return null
  return {
    sessionId,
    ticketId,
    triggerMode: value?.triggerMode === "delete" || value?.triggerMode === "first-close-only" ? value.triggerMode : "close",
    triggeredAt,
    completedAt: numberOrNull(value?.completedAt),
    status,
    respondentUserId: stringOrNull(value?.respondentUserId),
    closeCountAtTrigger: typeof value?.closeCountAtTrigger === "number" && Number.isFinite(value.closeCountAtTrigger) ? Math.max(0, Math.floor(value.closeCountAtTrigger)) : 0,
    snapshot: normalizeTelemetrySnapshot(value?.snapshot),
    questionSummaries: Array.isArray(value?.questionSummaries)
      ? value.questionSummaries.map(normalizeFeedbackQuestionSummary).filter((summary: DashboardTicketFeedbackQuestionSummary | null): summary is DashboardTicketFeedbackQuestionSummary => Boolean(summary))
      : []
  }
}

function telemetrySnapshotMatches(
  snapshot: DashboardTicketTelemetrySnapshot,
  query: {
    teamId?: string | null
    assigneeId?: string | null
    transportMode?: DashboardTicketTransportMode | null
  }
) {
  const teamId = stringOrNull(query.teamId)
  const assigneeId = stringOrNull(query.assigneeId)
  const transportMode = normalizeTransportOrNull(query.transportMode)
  if (teamId && snapshot.assignedTeamId !== teamId) return false
  if (assigneeId && snapshot.assignedStaffUserId !== assigneeId) return false
  if (transportMode && snapshot.transportMode !== transportMode) return false
  return true
}

async function listRuntimeLifecycleTelemetry(
  runtimeBridge: DashboardRuntimeBridge,
  query: DashboardTicketLifecycleTelemetryQuery = {}
): Promise<DashboardTicketLifecycleTelemetryResult> {
  const service = getRuntimeTelemetryService(runtimeBridge)
  if (!service || typeof service.listLifecycleHistory !== "function") {
    return telemetryUnavailableResult<DashboardTicketLifecycleTelemetryRecord>()
  }

  try {
    const eventTypes = new Set(Array.isArray(query.eventTypes) ? query.eventTypes.map(normalizeString).filter(Boolean) : [])
    const ticketId = normalizeString(query.ticketId)
    const records = (await service.listLifecycleHistory({
      since: numberOrNull(query.since),
      until: numberOrNull(query.until),
      ticketId: ticketId || undefined
    }) as unknown[])
      .map(normalizeLifecycleTelemetryRecord)
      .filter((record): record is DashboardTicketLifecycleTelemetryRecord => Boolean(record))
      .filter((record) => !ticketId || record.ticketId === ticketId)
      .filter((record) => eventTypes.size < 1 || eventTypes.has(record.eventType))
      .filter((record) => telemetrySnapshotMatches(record.snapshot, query))
      .sort((left, right) => (
        query.order === "desc"
          ? right.occurredAt - left.occurredAt || left.recordId.localeCompare(right.recordId)
          : left.occurredAt - right.occurredAt || left.recordId.localeCompare(right.recordId)
      ))

    return pageTelemetryItems(records, query)
  } catch {
    return telemetryUnavailableResult<DashboardTicketLifecycleTelemetryRecord>("Ticket lifecycle telemetry could not be read.")
  }
}

async function listRuntimeFeedbackTelemetry(
  runtimeBridge: DashboardRuntimeBridge,
  query: DashboardTicketFeedbackTelemetryQuery = {}
): Promise<DashboardTicketFeedbackTelemetryResult> {
  const service = getRuntimeTelemetryService(runtimeBridge)
  if (!service || typeof service.listFeedbackHistory !== "function") {
    return telemetryUnavailableResult<DashboardTicketFeedbackTelemetryRecord>()
  }

  try {
    const statuses = new Set(Array.isArray(query.statuses) ? query.statuses.map(normalizeFeedbackStatus).filter((status): status is DashboardTicketFeedbackStoredStatus => Boolean(status)) : [])
    const ticketId = normalizeString(query.ticketId)
    const records = (await service.listFeedbackHistory({
      since: numberOrNull(query.since),
      until: numberOrNull(query.until),
      ticketId: ticketId || undefined
    }) as unknown[])
      .map(normalizeFeedbackTelemetryRecord)
      .filter((record): record is DashboardTicketFeedbackTelemetryRecord => Boolean(record))
      .filter((record) => !ticketId || record.ticketId === ticketId)
      .filter((record) => statuses.size < 1 || statuses.has(record.status))
      .filter((record) => telemetrySnapshotMatches(record.snapshot, query))
      .sort((left, right) => (
        query.order === "desc"
          ? right.triggeredAt - left.triggeredAt || left.sessionId.localeCompare(right.sessionId)
          : left.triggeredAt - right.triggeredAt || left.sessionId.localeCompare(right.sessionId)
      ))

    return pageTelemetryItems(records, query)
  } catch {
    return telemetryUnavailableResult<DashboardTicketFeedbackTelemetryRecord>("Ticket feedback telemetry could not be read.")
  }
}

async function getRuntimeTicketTelemetrySignals(
  runtimeBridge: DashboardRuntimeBridge,
  ticketIds: string[]
): Promise<Record<string, DashboardTicketTelemetrySignals>> {
  const ids = [...new Set(ticketIds.map(normalizeString).filter(Boolean))]
  const signals = Object.fromEntries(ids.map((ticketId) => [ticketId, defaultTicketTelemetrySignals()])) as Record<string, DashboardTicketTelemetrySignals>
  if (ids.length < 1) return signals

  const service = getRuntimeTelemetryService(runtimeBridge)
  if (!service || typeof service.listLifecycleHistory !== "function" || typeof service.listFeedbackHistory !== "function") {
    return signals
  }

  const idSet = new Set(ids)
  try {
    const lifecycleRecords = (await service.listLifecycleHistory({}) as unknown[])
      .map(normalizeLifecycleTelemetryRecord)
      .filter((record): record is DashboardTicketLifecycleTelemetryRecord => record !== null && idSet.has(record.ticketId))
    const feedbackRecords = (await service.listFeedbackHistory({}) as unknown[])
      .map(normalizeFeedbackTelemetryRecord)
      .filter((record): record is DashboardTicketFeedbackTelemetryRecord => record !== null && idSet.has(record.ticketId))

    for (const record of lifecycleRecords) {
      if (record.eventType !== "reopened") continue
      const current = signals[record.ticketId] || defaultTicketTelemetrySignals()
      signals[record.ticketId] = {
        ...current,
        hasEverReopened: true,
        reopenCount: current.reopenCount + 1,
        lastReopenedAt: current.lastReopenedAt == null ? record.occurredAt : Math.max(current.lastReopenedAt, record.occurredAt)
      }
    }

    for (const record of feedbackRecords) {
      const current = signals[record.ticketId] || defaultTicketTelemetrySignals()
      if (current.latestFeedbackTriggeredAt != null && current.latestFeedbackTriggeredAt > record.triggeredAt) {
        continue
      }
      signals[record.ticketId] = {
        ...current,
        latestFeedbackStatus: record.status,
        latestFeedbackTriggeredAt: record.triggeredAt,
        latestFeedbackCompletedAt: record.completedAt,
        latestRatings: record.questionSummaries
          .filter((question) => question.type === "rating")
          .map((question) => ({
            questionKey: `${question.position}:${question.label}`,
            label: question.label,
            value: question.ratingValue
          }))
      }
    }
  } catch {
    return signals
  }

  return signals
}

async function getRuntimeTicketQueueSummary(
  runtimeBridge: DashboardRuntimeBridge,
  input: { actorUserId: string; now?: number }
): Promise<DashboardTicketQueueSummary | null> {
  let tickets: DashboardTicketRecord[] = []
  try {
    tickets = typeof runtimeBridge.listTickets === "function" ? runtimeBridge.listTickets() : []
  } catch {
    return buildTicketQueueSummary([], { unavailableReason: "Ticket queue inventory could not be read.", now: input.now })
  }

  const service = getRuntimeTelemetryService(runtimeBridge)
  if (!service || typeof service.listLifecycleHistory !== "function") {
    return buildTicketQueueSummary(tickets, {
      lifecycleAvailable: false,
      unavailableReason: "Ticket lifecycle telemetry reads are unavailable.",
      now: input.now
    })
  }

  try {
    const ownedEvents = new Set<string>(TICKET_QUEUE_OWNED_ANCHOR_EVENT_TYPES)
    const lifecycleRecords = (await service.listLifecycleHistory({}) as unknown[])
      .map(normalizeLifecycleTelemetryRecord)
      .filter((record): record is DashboardTicketLifecycleTelemetryRecord => (
        record !== null && ownedEvents.has(record.eventType)
      ))
    return buildTicketQueueSummary(tickets, {
      lifecycleRecords,
      lifecycleAvailable: true,
      now: input.now
    })
  } catch {
    return buildTicketQueueSummary(tickets, {
      lifecycleAvailable: false,
      unavailableReason: "Ticket lifecycle telemetry could not be read.",
      now: input.now
    })
  }
}

async function listRuntimeTicketWorkbenchViews(runtimeBridge: DashboardRuntimeBridge, actorUserId: string): Promise<DashboardTicketWorkbenchViewRecord[]> {
  const normalizedActor = normalizeString(actorUserId)
  if (!normalizedActor) return []
  const database = getTicketWorkbenchViewDatabase(runtimeBridge)
  if (!database || typeof database.getCategory !== "function") return []
  const records = await database.getCategory(TICKET_WORKBENCH_VIEWS_CATEGORY)
  return (Array.isArray(records) ? records : [])
    .map((entry) => normalizeTicketWorkbenchViewRecord(entry.key, entry.value))
    .filter((entry): entry is DashboardTicketWorkbenchViewRecord => Boolean(entry && canReadTicketWorkbenchView(entry, normalizedActor)))
    .sort((left, right) => left.name.localeCompare(right.name) || left.viewId.localeCompare(right.viewId))
}

async function getRuntimeTicketWorkbenchView(runtimeBridge: DashboardRuntimeBridge, viewId: string, actorUserId: string): Promise<DashboardTicketWorkbenchViewRecord | null> {
  const normalizedViewId = normalizeString(viewId)
  const normalizedActor = normalizeString(actorUserId)
  if (!normalizedViewId || !normalizedActor) return null
  const database = getTicketWorkbenchViewDatabase(runtimeBridge)
  if (!database || typeof database.get !== "function") return null
  const value = await database.get(TICKET_WORKBENCH_VIEWS_CATEGORY, normalizedViewId)
  const record = normalizeTicketWorkbenchViewRecord(normalizedViewId, value)
  return record && canReadTicketWorkbenchView(record, normalizedActor) ? record : null
}

async function createRuntimeTicketWorkbenchView(runtimeBridge: DashboardRuntimeBridge, input: DashboardTicketWorkbenchViewMutationRequest): Promise<DashboardTicketWorkbenchViewMutationResult> {
  const database = getTicketWorkbenchViewDatabase(runtimeBridge)
  if (!database || typeof database.set !== "function") {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.unavailable")
  }
  const now = Date.now()
  const viewId = `twv_${crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : crypto.randomBytes(16).toString("hex")}`
  const record = buildTicketWorkbenchViewRecord(input, viewId, now)
  if (!record) {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.validationFailed")
  }
  await database.set(TICKET_WORKBENCH_VIEWS_CATEGORY, record.viewId, record)
  return ticketWorkbenchViewResult(true, "success", "tickets.page.savedViews.created", record)
}

async function updateRuntimeTicketWorkbenchView(runtimeBridge: DashboardRuntimeBridge, input: DashboardTicketWorkbenchViewMutationRequest & { viewId: string }): Promise<DashboardTicketWorkbenchViewMutationResult> {
  const database = getTicketWorkbenchViewDatabase(runtimeBridge)
  if (!database || typeof database.get !== "function" || typeof database.set !== "function") {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.unavailable")
  }
  const viewId = normalizeString(input.viewId)
  const actorUserId = normalizeString(input.actorUserId)
  const existing = normalizeTicketWorkbenchViewRecord(viewId, await database.get(TICKET_WORKBENCH_VIEWS_CATEGORY, viewId))
  if (!existing || !canWriteTicketWorkbenchView(existing, actorUserId, input.actorIsAdmin)) {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.viewUnavailable")
  }
  if (input.scope === "shared" && !input.actorIsAdmin) {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.sharedWriteDenied")
  }
  const record = buildTicketWorkbenchViewRecord(input, viewId, Date.now(), existing)
  if (!record) {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.validationFailed")
  }
  await database.set(TICKET_WORKBENCH_VIEWS_CATEGORY, record.viewId, record)
  return ticketWorkbenchViewResult(true, "success", "tickets.page.savedViews.updated", record)
}

async function deleteRuntimeTicketWorkbenchView(
  runtimeBridge: DashboardRuntimeBridge,
  input: { viewId: string; actorUserId: string; actorIsAdmin: boolean }
): Promise<DashboardTicketWorkbenchViewMutationResult> {
  const database = getTicketWorkbenchViewDatabase(runtimeBridge)
  if (!database || typeof database.get !== "function" || typeof database.delete !== "function") {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.unavailable")
  }
  const viewId = normalizeString(input.viewId)
  const actorUserId = normalizeString(input.actorUserId)
  const existing = normalizeTicketWorkbenchViewRecord(viewId, await database.get(TICKET_WORKBENCH_VIEWS_CATEGORY, viewId))
  if (!existing || !canWriteTicketWorkbenchView(existing, actorUserId, input.actorIsAdmin)) {
    return ticketWorkbenchViewResult(false, "warning", "tickets.page.savedViews.viewUnavailable")
  }
  await database.delete(TICKET_WORKBENCH_VIEWS_CATEGORY, viewId)
  return ticketWorkbenchViewResult(true, "success", "tickets.page.savedViews.deleted", existing)
}

const QUALITY_REVIEW_SERVICE_ID = "ot-quality-review:service"

function getRuntimeQualityReviewService(runtimeBridge: DashboardRuntimeBridge) {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  try {
    return runtime?.plugins?.classes?.get?.(QUALITY_REVIEW_SERVICE_ID) || null
  } catch {
    return null
  }
}

function feedbackTelemetryTime(record: DashboardTicketFeedbackTelemetryRecord) {
  return record.completedAt || record.triggeredAt
}

function completedAnsweredSessionId(records: DashboardTicketFeedbackTelemetryRecord[]) {
  const latest = records
    .filter((record) => record.status === "completed")
    .filter((record) => record.questionSummaries.some((question) => question.answered))
    .sort((left, right) => feedbackTelemetryTime(right) - feedbackTelemetryTime(left) || left.sessionId.localeCompare(right.sessionId))[0]
  return latest?.sessionId || null
}

async function buildRuntimeQualityReviewSignal(
  runtimeBridge: DashboardRuntimeBridge,
  ticketId: string
): Promise<DashboardQualityReviewCaseSignal> {
  const normalizedTicketId = normalizeString(ticketId)
  const signal: DashboardQualityReviewCaseSignal = {
    ticketId: normalizedTicketId,
    firstKnownAt: null,
    lastSignalAt: null,
    latestCompletedAnsweredSessionId: null
  }
  if (!normalizedTicketId || !hasRuntimeTelemetryService(runtimeBridge)) return signal

  try {
    const [feedback, lifecycle] = await Promise.all([
      listRuntimeFeedbackTelemetry(runtimeBridge, { ticketId: normalizedTicketId, order: "desc", limit: TELEMETRY_MAX_LIMIT }),
      listRuntimeLifecycleTelemetry(runtimeBridge, { ticketId: normalizedTicketId, order: "desc", limit: TELEMETRY_MAX_LIMIT })
    ])
    const feedbackTimes = feedback.items.map(feedbackTelemetryTime)
    const lifecycleTimes = lifecycle.items.map((record) => record.occurredAt)
    const times = [...feedbackTimes, ...lifecycleTimes].filter((value) => Number.isFinite(value))
    signal.firstKnownAt = times.length ? Math.min(...times) : null
    signal.lastSignalAt = times.length ? Math.max(...times) : null
    signal.latestCompletedAnsweredSessionId = completedAnsweredSessionId(feedback.items)
  } catch {
    return signal
  }

  return signal
}

function normalizeQualityReviewState(value: unknown): DashboardQualityReviewState {
  return value === "in_review" || value === "resolved" ? value : "unreviewed"
}

function normalizeQualityReviewResolutionOutcome(value: unknown): DashboardQualityReviewResolutionOutcome | null {
  return value === "action_taken" || value === "coaching_needed" || value === "dismissed" || value === "no_action_needed"
    ? value
    : null
}

function normalizeRawFeedbackStatus(value: unknown): DashboardQualityReviewRawFeedbackStatus {
  return value === "available" || value === "partial" || value === "expired" ? value : "none"
}

async function resolveRuntimeUserLabel(runtimeBridge: DashboardRuntimeBridge, userId: string | null) {
  const normalizedUserId = normalizeString(userId)
  if (!normalizedUserId) return "Unassigned"
  if (typeof runtimeBridge.resolveQualityReviewOwnerLabel === "function") {
    const ownerLabel = await runtimeBridge.resolveQualityReviewOwnerLabel(normalizedUserId).catch(() => "")
    const normalizedOwnerLabel = normalizeString(ownerLabel)
    if (normalizedOwnerLabel) return normalizedOwnerLabel
  }
  const member = runtimeBridge.resolveGuildMember
    ? await runtimeBridge.resolveGuildMember(normalizedUserId).catch(() => null)
    : null
  return member ? runtimeMemberLabel(member, normalizedUserId) : `Unknown owner (${normalizedUserId})`
}

function normalizeQualityReviewNoteAdjustment(value: any): DashboardQualityReviewNoteAdjustmentRecord | null {
  if (!value || typeof value !== "object") return null
  const mode = value.mode === "corrected" || value.mode === "redacted" ? value.mode : null
  const adjustmentId = normalizeString(value.adjustmentId)
  const noteId = normalizeString(value.noteId)
  const ticketId = normalizeString(value.ticketId)
  if (!mode || !adjustmentId || !noteId || !ticketId) return null
  return {
    adjustmentId,
    noteId,
    ticketId,
    mode,
    actorUserId: normalizeString(value.actorUserId) || "unknown",
    actorLabel: normalizeString(value.actorLabel) || normalizeString(value.actorUserId) || "Unknown actor",
    createdAt: numberOrNull(value.createdAt) || 0,
    reason: normalizeString(value.reason),
    replacementBody: mode === "corrected" ? stringOrNull(value.replacementBody) : null
  }
}

function normalizeQualityReviewRawFeedback(value: any): DashboardQualityReviewRawFeedbackRecord | null {
  if (!value || typeof value !== "object") return null
  const storageStatus = normalizeRawFeedbackStatus(value.storageStatus)
  if (storageStatus === "none") return null
  return {
    sessionId: normalizeString(value.sessionId),
    ticketId: normalizeString(value.ticketId),
    capturedAt: numberOrNull(value.capturedAt) || 0,
    retentionExpiresAt: numberOrNull(value.retentionExpiresAt) || 0,
    storageStatus,
    warnings: Array.isArray(value.warnings) ? value.warnings.map(normalizeString).filter(Boolean) : [],
    answers: Array.isArray(value.answers) ? value.answers.map((answer: any, index: number) => ({
      position: numberOrNull(answer?.position) || index + 1,
      type: answer?.type === "rating" || answer?.type === "image" || answer?.type === "attachment" || answer?.type === "choice" ? answer.type : "text",
      label: normalizeString(answer?.label),
      answered: answer?.answered === true,
      textValue: stringOrNull(answer?.textValue),
      ratingValue: numberOrNull(answer?.ratingValue),
      choiceIndex: numberOrNull(answer?.choiceIndex),
      choiceLabel: stringOrNull(answer?.choiceLabel),
      assets: Array.isArray(answer?.assets) ? answer.assets.map((asset: any) => ({
        assetId: normalizeString(asset?.assetId),
        fileName: normalizeString(asset?.fileName),
        contentType: stringOrNull(asset?.contentType),
        byteSize: numberOrNull(asset?.byteSize) || 0,
        relativePath: stringOrNull(asset?.relativePath),
        captureStatus: asset?.captureStatus === "mirrored" || asset?.captureStatus === "expired" ? asset.captureStatus : "failed",
        reason: stringOrNull(asset?.reason)
      })).filter((asset: any) => asset.assetId) : []
    })) : []
  }
}

async function normalizeQualityReviewCaseSummary(
  runtimeBridge: DashboardRuntimeBridge,
  value: any,
  options: { actorUserId?: string | null; now?: number } = {}
): Promise<DashboardQualityReviewCaseSummary | null> {
  const ticketId = normalizeString(value?.ticketId)
  if (!ticketId) return null
  const ownerUserId = stringOrNull(value?.ownerUserId)
  return projectQualityReviewQueueFields({
    ticketId,
    stored: value?.stored === true,
    state: normalizeQualityReviewState(value?.state),
    ownerUserId,
    ownerLabel: await resolveRuntimeUserLabel(runtimeBridge, ownerUserId),
    createdAt: numberOrNull(value?.createdAt) || 0,
    updatedAt: numberOrNull(value?.updatedAt) || 0,
    resolvedAt: numberOrNull(value?.resolvedAt),
    resolutionOutcome: normalizeQualityReviewState(value?.state) === "resolved" ? normalizeQualityReviewResolutionOutcome(value?.resolutionOutcome) : null,
    resolvedByUserId: normalizeQualityReviewState(value?.state) === "resolved" ? stringOrNull(value?.resolvedByUserId) : null,
    lastSignalAt: numberOrNull(value?.lastSignalAt) || 0,
    noteCount: numberOrNull(value?.noteCount) || 0,
    noteAdjustmentCount: numberOrNull(value?.noteAdjustmentCount) || 0,
    rawFeedbackStatus: normalizeRawFeedbackStatus(value?.rawFeedbackStatus),
    latestRawFeedbackSessionId: stringOrNull(value?.latestRawFeedbackSessionId)
  }, options)
}

async function normalizeQualityReviewCaseDetail(
  runtimeBridge: DashboardRuntimeBridge,
  value: any,
  options: { actorUserId?: string | null; now?: number } = {}
): Promise<DashboardQualityReviewCaseDetailRecord | null> {
  const summary = await normalizeQualityReviewCaseSummary(runtimeBridge, value, options)
  if (!summary) return null
  return {
    ...summary,
    notes: Array.isArray(value?.notes) ? value.notes.map((note: any) => ({
      noteId: normalizeString(note?.noteId),
      ticketId: normalizeString(note?.ticketId),
      authorUserId: normalizeString(note?.authorUserId),
      authorLabel: normalizeString(note?.authorLabel) || normalizeString(note?.authorUserId) || "Unknown author",
      createdAt: numberOrNull(note?.createdAt) || 0,
      body: normalizeString(note?.body),
      latestAdjustment: normalizeQualityReviewNoteAdjustment(note?.latestAdjustment),
      adjustmentHistory: Array.isArray(note?.adjustmentHistory)
        ? note.adjustmentHistory.map(normalizeQualityReviewNoteAdjustment).filter((record: DashboardQualityReviewNoteAdjustmentRecord | null): record is DashboardQualityReviewNoteAdjustmentRecord => Boolean(record))
        : []
    })).filter((note: any) => note.noteId && note.ticketId) : [],
    rawFeedback: Array.isArray(value?.rawFeedback)
      ? value.rawFeedback.map(normalizeQualityReviewRawFeedback).filter((record: DashboardQualityReviewRawFeedbackRecord | null): record is DashboardQualityReviewRawFeedbackRecord => Boolean(record))
      : []
  }
}

async function listRuntimeQualityReviewCases(
  runtimeBridge: DashboardRuntimeBridge,
  query: DashboardQualityReviewCaseQuery,
  actorUserId: string
): Promise<DashboardQualityReviewCaseListResult> {
  const service = getRuntimeQualityReviewService(runtimeBridge)
  if (!service || typeof service.listDashboardQualityReviewCases !== "function") {
    return { cases: [], warnings: ["Quality review service is unavailable."] }
  }

  try {
    const result = await service.listDashboardQualityReviewCases(query)
    const cases = await Promise.all((Array.isArray(result?.cases) ? result.cases : []).map((record: any) => normalizeQualityReviewCaseSummary(runtimeBridge, record, { actorUserId })))
    return {
      cases: cases.filter((record): record is DashboardQualityReviewCaseSummary => Boolean(record)),
      warnings: Array.isArray(result?.warnings) ? result.warnings.map(normalizeString).filter(Boolean) : []
    }
  } catch {
    return { cases: [], warnings: ["Quality review cases could not be read."] }
  }
}

function buildQualityReviewSignalsFromTelemetry(input: {
  feedbackRecords: DashboardTicketFeedbackTelemetryRecord[]
  lifecycleRecords: DashboardTicketLifecycleTelemetryRecord[]
}): DashboardQualityReviewCaseSignal[] {
  const ticketIds = new Set<string>()
  input.feedbackRecords.forEach((record) => ticketIds.add(record.ticketId))
  input.lifecycleRecords.forEach((record) => ticketIds.add(record.ticketId))

  return [...ticketIds].map((ticketId) => {
    const feedback = input.feedbackRecords.filter((record) => record.ticketId === ticketId)
    const lifecycle = input.lifecycleRecords.filter((record) => record.ticketId === ticketId)
    const times = [
      ...feedback.map(feedbackTelemetryTime),
      ...lifecycle.map((record) => record.occurredAt)
    ].filter((value) => Number.isFinite(value))
    return {
      ticketId,
      firstKnownAt: times.length ? Math.min(...times) : null,
      lastSignalAt: times.length ? Math.max(...times) : null,
      latestCompletedAnsweredSessionId: completedAnsweredSessionId(feedback)
    }
  })
}

async function getRuntimeQualityReviewQueueSummary(
  runtimeBridge: DashboardRuntimeBridge,
  input: { actorUserId: string; now?: number }
): Promise<DashboardQualityReviewQueueSummary | null> {
  const telemetryService = getRuntimeTelemetryService(runtimeBridge)
  if (!telemetryService || typeof telemetryService.listLifecycleHistory !== "function" || typeof telemetryService.listFeedbackHistory !== "function") {
    return buildQualityReviewQueueSummary([], { unavailableReason: "Ticket telemetry reads are unavailable." })
  }

  const qualityReviewService = getRuntimeQualityReviewService(runtimeBridge)
  if (!qualityReviewService || typeof qualityReviewService.listDashboardQualityReviewCases !== "function") {
    return buildQualityReviewQueueSummary([], { unavailableReason: "Quality review service is unavailable." })
  }

  try {
    const [feedbackRecords, lifecycleRecords] = await Promise.all([
      Promise.resolve(telemetryService.listFeedbackHistory({})).then((records: unknown) => (Array.isArray(records) ? records : [])
        .map(normalizeFeedbackTelemetryRecord)
        .filter((record): record is DashboardTicketFeedbackTelemetryRecord => Boolean(record))),
      Promise.resolve(telemetryService.listLifecycleHistory({})).then((records: unknown) => (Array.isArray(records) ? records : [])
        .map(normalizeLifecycleTelemetryRecord)
        .filter((record): record is DashboardTicketLifecycleTelemetryRecord => Boolean(record)))
    ])
    const signals = buildQualityReviewSignalsFromTelemetry({ feedbackRecords, lifecycleRecords })
    const result = await qualityReviewService.listDashboardQualityReviewCases({ tickets: signals })
    const cases = await Promise.all((Array.isArray(result?.cases) ? result.cases : []).map((record: any) => normalizeQualityReviewCaseSummary(runtimeBridge, record, input)))
    return buildQualityReviewQueueSummary(
      cases.filter((record): record is DashboardQualityReviewCaseSummary => Boolean(record)),
      {
        actorUserId: input.actorUserId,
        now: input.now,
        unavailableReason: Array.isArray(result?.warnings) ? result.warnings.map(normalizeString).filter(Boolean)[0] || null : null
      }
    )
  } catch {
    return buildQualityReviewQueueSummary([], { unavailableReason: "Quality review queue summary could not be read." })
  }
}

function normalizeQualityReviewNotificationStatus(value: any): DashboardQualityReviewNotificationStatus | null {
  if (!value || typeof value !== "object") return null
  const ticketReminder = value.ticketReminder && typeof value.ticketReminder === "object"
    ? {
        ticketId: normalizeString(value.ticketReminder.ticketId),
        lastReminderAt: numberOrNull(value.ticketReminder.lastReminderAt),
        lastReminderCaseUpdatedAt: numberOrNull(value.ticketReminder.lastReminderCaseUpdatedAt),
        lastReminderOverdueKind: value.ticketReminder.lastReminderOverdueKind === "unreviewed" || value.ticketReminder.lastReminderOverdueKind === "in_review"
          ? value.ticketReminder.lastReminderOverdueKind
          : null
      }
    : null
  return {
    notificationsEnabled: value.notificationsEnabled === true,
    digestEnabled: value.digestEnabled === true,
    deliveryChannelCount: numberOrNull(value.deliveryChannelCount) || 0,
    configuredTargetCount: numberOrNull(value.configuredTargetCount),
    validTargetCount: numberOrNull(value.validTargetCount),
    lastDeliveryError: stringOrNull(value.lastDeliveryError),
    unavailableReason: stringOrNull(value.unavailableReason),
    remindersSentToday: numberOrNull(value.remindersSentToday) || 0,
    lastDigestAt: numberOrNull(value.lastDigestAt),
    lastDigestDate: stringOrNull(value.lastDigestDate),
    lastDigestCount: numberOrNull(value.lastDigestCount) || 0,
    digestDeliveredToday: value.digestDeliveredToday === true,
    ticketReminder: ticketReminder?.ticketId ? ticketReminder : null,
    ticketReminderCooldownUntil: numberOrNull(value.ticketReminderCooldownUntil)
  }
}

async function getRuntimeQualityReviewNotificationStatus(
  runtimeBridge: DashboardRuntimeBridge,
  input: { ticketId?: string | null; now?: number } = {}
): Promise<DashboardQualityReviewNotificationStatus | null> {
  const service = getRuntimeQualityReviewService(runtimeBridge)
  if (!service || typeof service.getDashboardQualityReviewNotificationStatus !== "function") return null

  try {
    return normalizeQualityReviewNotificationStatus(await service.getDashboardQualityReviewNotificationStatus(input))
  } catch {
    return null
  }
}

async function getRuntimeQualityReviewCase(
  runtimeBridge: DashboardRuntimeBridge,
  ticketId: string,
  actorUserId: string
): Promise<DashboardQualityReviewCaseDetailRecord | null> {
  const service = getRuntimeQualityReviewService(runtimeBridge)
  if (!service || typeof service.getDashboardQualityReviewCase !== "function") return null

  try {
    const signal = await buildRuntimeQualityReviewSignal(runtimeBridge, ticketId)
    return await normalizeQualityReviewCaseDetail(runtimeBridge, await service.getDashboardQualityReviewCase(ticketId, signal), { actorUserId })
  } catch {
    return null
  }
}

async function runRuntimeQualityReviewAction(
  runtimeBridge: DashboardRuntimeBridge,
  input: DashboardQualityReviewActionRequest
): Promise<DashboardQualityReviewActionResult> {
  const service = getRuntimeQualityReviewService(runtimeBridge)
  if (!service || typeof service.runDashboardQualityReviewAction !== "function") {
    return { ok: false, status: "warning", message: "Quality review service is unavailable." }
  }

  try {
    const signal = await buildRuntimeQualityReviewSignal(runtimeBridge, input.ticketId)
    const actorLabel = await resolveRuntimeUserLabel(runtimeBridge, input.actorUserId)
    const result = await service.runDashboardQualityReviewAction({
      ...input,
      actorLabel,
      firstKnownAt: signal.firstKnownAt,
      lastSignalAt: signal.lastSignalAt,
      resolutionOutcome: normalizeQualityReviewResolutionOutcome(input.resolutionOutcome),
      noteId: stringOrNull(input.noteId),
      reason: stringOrNull(input.reason),
      replacementBody: input.action === "correct-note" ? stringOrNull(input.replacementBody) : null
    })
    return {
      ok: result?.ok === true,
      status: result?.status === "success" || result?.status === "danger" ? result.status : "warning",
      message: normalizeString(result?.message) || "Quality review action completed.",
      warnings: Array.isArray(result?.warnings) ? result.warnings.map(normalizeString).filter(Boolean) : []
    }
  } catch (error) {
    return {
      ok: false,
      status: "danger",
      message: error instanceof Error ? error.message : "Quality review action failed."
    }
  }
}

async function resolveRuntimeQualityReviewAsset(
  runtimeBridge: DashboardRuntimeBridge,
  ticketId: string,
  sessionId: string,
  assetId: string,
  _actorUserId: string
): Promise<DashboardQualityReviewAssetResult> {
  const service = getRuntimeQualityReviewService(runtimeBridge)
  if (!service || typeof service.resolveQualityReviewAsset !== "function") {
    return {
      status: "missing",
      filePath: null,
      fileName: null,
      contentType: null,
      byteSize: 0,
      message: "Quality review service is unavailable."
    }
  }

  try {
    const result = await service.resolveQualityReviewAsset(ticketId, sessionId, assetId)
    return {
      status: result?.status === "available" || result?.status === "expired" ? result.status : "missing",
      filePath: stringOrNull(result?.filePath),
      fileName: stringOrNull(result?.fileName),
      contentType: stringOrNull(result?.contentType),
      byteSize: numberOrNull(result?.byteSize) || 0,
      message: normalizeString(result?.message) || "Quality review asset lookup completed."
    }
  } catch {
    return {
      status: "missing",
      filePath: null,
      fileName: null,
      contentType: null,
      byteSize: 0,
      message: "Quality review asset could not be read."
    }
  }
}

async function getRuntimeTicketDetail(runtimeBridge: DashboardRuntimeBridge, ticketId: string, actorUserId = ""): Promise<DashboardTicketDetailRecord | null> {
  const normalizedTicketId = normalizeString(ticketId)
  if (!normalizedTicketId) return null

  const ticket = runtimeBridge.listTickets().find((candidate) => candidate.id === normalizedTicketId) || null
  if (!ticket) return null

  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const runtimeTicket = getRuntimeTicket(runtime, ticket.id)
  const option = runtimeTicket?.option || runtimeOptionById(runtime, ticket.optionId || "")
  const workflowPolicy = runtimeOptionWorkflowPolicy(option)
  const panel = runtimePanelForOption(runtime, ticket.optionId)
  const panelId = normalizeString(panel?.id) || null
  const owningTeamId = ticket.assignedTeamId || runtimeOptionSupportTeamId(option) || null
  const team = runtimeSupportTeamById(runtime, owningTeamId)
  const ticketTransport = normalizeTransport(ticket.transportMode)
  const guild = await resolveRuntimeActionGuild(runtimeBridge, runtime)
  const context = normalizeString(actorUserId)
    ? await resolveRuntimeActionContext(runtimeBridge, ticket.id, actorUserId)
    : null
  const integration = await resolveIntegrationSummary(runtimeBridge, ticket.id)
  const aiAssist = await resolveAiAssistSummary(runtimeBridge, ticket.id)
  const providerLock = integration
    ? {
      providerId: integration.providerId,
      title: integration.label,
      message: integration.degradedReason || integration.summary || "Ticket integration controls locked actions for this ticket.",
      lockedActions: integration.lockedTicketActions
    }
    : await resolveProviderLock(runtimeBridge, ticket.id)
  const assignableStaff = await buildAssignableStaffChoices(runtimeBridge, runtime, guild, owningTeamId)
  const escalationTargets = buildEscalationTargetChoices(runtime, option, ticketTransport)
  const moveTargets = buildMoveTargetChoices(runtime, ticket.optionId, owningTeamId, ticketTransport, ticket.transportParentChannelId)
  const transferCandidates = await buildTransferCandidateChoices(runtime, guild, ticket.creatorId)
  const participantChoices = await buildParticipantChoices(runtime, guild, runtimeTicket, ticket.creatorId)
  const priorityLevelValue = runtimeDataValue(runtimeTicket, "opendiscord:priority")
  const priorityLevel = typeof priorityLevelValue === "number" ? priorityLevelValue : Number.isFinite(Number(priorityLevelValue)) ? Number(priorityLevelValue) : null
  const currentPriority = priorityLevel !== null ? runtime?.priorities?.getFromPriorityLevel?.(priorityLevel) : null
  const priorityChoices = buildPriorityChoices(runtime, priorityLevel)
  const topic = normalizeString(runtimeDataValue(runtimeTicket, "opendiscord:topic")) || null
  const originalApplicantUserId = await resolveManagedRecordApplicantUserId(runtime, ticket.id)
    || resolveOriginalApplicantUserId(runtimeTicket, ticket.creatorId)
  const originalApplicantLabel = originalApplicantUserId === ticket.creatorId
    ? unknownUserLabel(originalApplicantUserId)
    : unknownUserLabel(originalApplicantUserId)
  const creatorTransferWarning = originalApplicantUserId && ticket.creatorId && originalApplicantUserId !== ticket.creatorId
    ? "tickets.detail.warnings.creatorTransfer"
    : null
  const telemetry = hasRuntimeTelemetryService(runtimeBridge)
    ? (await getRuntimeTicketTelemetrySignals(runtimeBridge, [ticket.id]))[ticket.id] || defaultTicketTelemetrySignals()
    : null
  const actionAvailability = await buildRuntimeActionAvailability({
    runtimeBridge,
    context,
    runtimeTicket,
    ticket,
    providerLock,
    owningTeamId,
    assignableStaff,
    escalationTargets,
    moveTargets,
    transferCandidates,
    participantChoices,
    priorityChoices,
    currentCreatorId: ticket.creatorId,
    workflowPolicy
  })

  return {
    ticket: {
      ...ticket,
      assignedTeamId: owningTeamId,
      transportMode: ticketTransport
    },
    panelId,
    panelLabel: panelId ? runtimeEntityLabel(panel, panelId) : "Missing panel",
    optionLabel: option ? runtimeEntityLabel(option, ticket.optionId || "Missing option") : ticket.optionId ? `Missing option (${ticket.optionId})` : null,
    creatorLabel: unknownUserLabel(ticket.creatorId),
    teamLabel: owningTeamId ? team ? runtimeEntityLabel(team, owningTeamId) : `Missing team (${owningTeamId})` : null,
    assigneeLabel: unknownUserLabel(ticket.assignedStaffUserId),
    priorityId: currentPriority ? runtimePriorityId(currentPriority) : priorityLevel !== null ? String(priorityLevel) : null,
    priorityLabel: currentPriority ? runtimePriorityLabel(currentPriority, runtimePriorityId(currentPriority)) : priorityLevel !== null ? `Priority ${priorityLevel}` : null,
    topic,
    originalApplicantUserId,
    originalApplicantLabel,
    creatorTransferWarning,
    participantLabels: participantChoices.filter((choice) => choice.present).map((choice) => choice.label),
    actionAvailability,
    assignableStaff,
    escalationTargets,
    moveTargets,
    transferCandidates,
    participantChoices,
    priorityChoices,
    providerLock,
    integration,
    aiAssist,
    telemetry
  }
}

function getRuntimeTicket(runtime: any, ticketId: string) {
  return runtime?.tickets?.get?.(ticketId)
    || runtime?.tickets?.getAll?.()?.find?.((ticket: any) => {
      const rawId = typeof ticket?.id === "string" ? ticket.id : ticket?.id?.value
      return rawId === ticketId
    })
    || null
}

async function resolveRuntimeActionGuild(runtimeBridge: DashboardRuntimeBridge, runtime: any) {
  const client = runtime?.client
  if (!client) return null
  if (client.mainServer?.id) return client.mainServer

  const guildId = getDashboardRuntimeGuildId(runtimeBridge)
  if (!guildId || typeof client.fetchGuild !== "function") return null
  return await client.fetchGuild(guildId).catch(() => null)
}

async function resolveRuntimeActionContext(runtimeBridge: DashboardRuntimeBridge, ticketId: string, actorUserId: string) {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const guild = await resolveRuntimeActionGuild(runtimeBridge, runtime)
  const ticket = getRuntimeTicket(runtime, ticketId)
  const client = runtime?.client
  const channel = guild && client
    ? await (
      client.fetchGuildTextBasedChannel?.(guild, ticketId)
      || client.fetchGuildTextChannel?.(guild, ticketId)
      || Promise.resolve(null)
    ).catch(() => null)
    : null
  const member = guild && client?.fetchGuildMember
    ? await client.fetchGuildMember(guild, actorUserId).catch(() => null)
    : null
  const user = member?.user
    || await client?.client?.users?.fetch?.(actorUserId).catch(() => null)
    || null

  return { runtime, guild, ticket, channel, member, user }
}

function actionPermissionKey(action: DashboardTicketActionId) {
  if (action === "assign") return "claim"
  if (action === "add-participant") return "add"
  if (action === "remove-participant") return "remove"
  if (action === "set-priority") return "priority"
  if (action === "set-topic") return "topic"
  if (
    action === "approve-close-request"
    || action === "dismiss-close-request"
    || action === "set-awaiting-user"
    || action === "clear-awaiting-user"
  ) return "close"
  return action
}

async function checkRuntimeTicketActionPermission(context: Awaited<ReturnType<typeof resolveRuntimeActionContext>>, action: DashboardTicketActionId) {
  const permissionMode = context.runtime?.configs?.get?.("opendiscord:general")?.data?.system?.permissions?.[actionPermissionKey(action)]
  if (!context.runtime?.permissions?.checkCommandPerms || !permissionMode) {
    return { allowed: true, reason: null as string | null }
  }

  const result = await context.runtime.permissions.checkCommandPerms(
    permissionMode,
    "support",
    context.user,
    context.member,
    context.channel,
    context.guild
  )
  return {
    allowed: Boolean(result?.hasPerms),
    reason: result?.hasPerms ? null : ticketActionResults.permissionDenied
  }
}

async function runRuntimeTicketAction(runtimeBridge: DashboardRuntimeBridge, input: DashboardTicketActionRequest): Promise<DashboardTicketActionResult> {
  const ticketId = normalizeString(input.ticketId)
  const action = normalizeString(input.action)
  const actorUserId = normalizeString(input.actorUserId)
  if (!ticketId || !isDashboardTicketActionId(action) || !actorUserId) {
    return ticketActionWarning(ticketActionResults.requestIncomplete, ticketId)
  }

  if (action === "refresh") {
    return ticketActionSuccess(ticketActionResults.refreshSuccess, ticketId)
  }

  const detail = await getRuntimeTicketDetail(runtimeBridge, ticketId, actorUserId)
  if (!detail) {
    return ticketActionWarning(ticketActionResults.missingTicket, ticketId)
  }

  const availability = detail.actionAvailability[action]
  if (!availability.enabled) {
    return ticketActionWarning(availability.reason || ticketActionResults.unavailable, ticketId)
  }

  const context = await resolveRuntimeActionContext(runtimeBridge, ticketId, actorUserId)
  if (!context.runtime || !context.guild || !context.ticket || !context.channel || !context.user) {
    return ticketActionDanger(ticketActionResults.runtimeContextMissing, ticketId)
  }

  const permission = await checkRuntimeTicketActionPermission(context, action)
  if (!permission.allowed) {
    return ticketActionWarning(permission.reason || ticketActionResults.permissionDenied, ticketId)
  }

  try {
    const reason = normalizeString(input.reason) || null
    if (
      action === "approve-close-request"
      || action === "dismiss-close-request"
      || action === "set-awaiting-user"
      || action === "clear-awaiting-user"
    ) {
      const resultKeys = {
        "approve-close-request": ticketActionResults.approveCloseRequestSuccess,
        "dismiss-close-request": ticketActionResults.dismissCloseRequestSuccess,
        "set-awaiting-user": ticketActionResults.setAwaitingUserSuccess,
        "clear-awaiting-user": ticketActionResults.clearAwaitingUserSuccess
      } as const
      await context.runtime.actions.get(`opendiscord:${action}`).run("dashboard", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        member: context.member,
        ticket: context.ticket,
        reason
      })
      return ticketActionSuccess(resultKeys[action], ticketId)
    }

    if (action === "assign") {
      const assigneeUserId = normalizeString(input.assigneeUserId)
      if (!assigneeUserId) {
        return ticketActionWarning(ticketActionResults.assignMissingAssignee, ticketId)
      }
      if (!detail.assignableStaff.some((choice) => choice.userId === assigneeUserId)) {
        return ticketActionWarning(ticketActionResults.assignIneligibleAssignee, ticketId)
      }
      if (detail.ticket.claimed && detail.ticket.claimedBy && detail.ticket.claimedBy !== assigneeUserId) {
        return ticketActionWarning(ticketActionResults.assignClaimedByOther, ticketId)
      }
      await context.runtime.actions.get("opendiscord:assign-ticket").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        assigneeUserId
      })
      return ticketActionSuccess(ticketActionResults.assignSuccess, ticketId)
    }

    if (action === "escalate") {
      const targetOptionId = normalizeString(input.targetOptionId)
      if (!detail.escalationTargets.some((choice) => choice.optionId === targetOptionId)) {
        return ticketActionWarning(ticketActionResults.escalateMissingTarget, ticketId)
      }
      const targetOption = targetOptionId ? context.runtime.options?.get?.(targetOptionId) : null
      if (!targetOption) {
        return ticketActionWarning(ticketActionResults.escalateInvalidTarget, ticketId)
      }
      await context.runtime.actions.get("opendiscord:escalate-ticket").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        data: targetOption
      })
      const movedTicketId = normalizeString(typeof context.ticket.id === "string" ? context.ticket.id : context.ticket.id?.value) || ticketId
      return ticketActionSuccess(ticketActionResults.escalateSuccess, movedTicketId)
    }

    if (action === "move") {
      const targetOptionId = normalizeString(input.targetOptionId)
      if (!detail.moveTargets.some((choice) => choice.optionId === targetOptionId)) {
        return ticketActionWarning(ticketActionResults.moveMissingTarget, ticketId)
      }
      const targetOption = targetOptionId ? runtimeExecutableOptionById(context.runtime, targetOptionId) : null
      if (!targetOption) {
        return ticketActionWarning(ticketActionResults.moveInvalidTarget, ticketId)
      }
      await context.runtime.actions.get("opendiscord:move-ticket").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        data: targetOption
      })
      return ticketActionSuccess(ticketActionResults.moveSuccess, ticketId)
    }

    if (action === "transfer") {
      const newCreatorUserId = normalizeString(input.newCreatorUserId)
      if (!detail.transferCandidates.some((choice) => choice.userId === newCreatorUserId)) {
        return ticketActionWarning(ticketActionResults.transferMissingCreator, ticketId)
      }
      const newCreator = await resolveRuntimeUser(context, newCreatorUserId)
      await context.runtime.actions.get("opendiscord:transfer-ticket").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        newCreator
      })
      return ticketActionSuccess(ticketActionResults.transferSuccess, ticketId)
    }

    if (action === "add-participant" || action === "remove-participant") {
      const participantUserId = normalizeString(input.participantUserId)
      const selected = detail.participantChoices.find((choice) => choice.userId === participantUserId)
      if (!selected) {
        return ticketActionWarning(ticketActionResults.participantInvalidUser, ticketId)
      }
      if (action === "add-participant" && selected.present) {
        return ticketActionWarning(ticketActionResults.participantAlreadyPresent, ticketId)
      }
      if (action === "remove-participant") {
        if (!selected.present) return ticketActionWarning(ticketActionResults.participantNotPresent, ticketId)
        if (selected.userId === detail.ticket.creatorId) return ticketActionWarning(ticketActionResults.participantCreatorRemoveDenied, ticketId)
      }
      const targetUser = await resolveRuntimeUser(context, participantUserId)
      await context.runtime.actions.get(action === "add-participant" ? "opendiscord:add-ticket-user" : "opendiscord:remove-ticket-user").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        data: targetUser
      })
      return ticketActionSuccess(action === "add-participant" ? ticketActionResults.participantAddSuccess : ticketActionResults.participantRemoveSuccess, ticketId)
    }

    if (action === "set-priority") {
      const priorityId = normalizeString(input.priorityId)
      if (!detail.priorityChoices.some((choice) => choice.priorityId === priorityId)) {
        return ticketActionWarning(ticketActionResults.priorityInvalid, ticketId)
      }
      const newPriority = resolvePriorityChoice(context.runtime, priorityId)
      if (!newPriority) {
        return ticketActionWarning(ticketActionResults.priorityUnconfigured, ticketId)
      }
      await context.runtime.actions.get("opendiscord:update-ticket-priority").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        newPriority
      })
      return ticketActionSuccess(ticketActionResults.prioritySuccess, ticketId)
    }

    if (action === "set-topic") {
      const topic = normalizeString(input.topic)
      if (!topic) {
        return ticketActionWarning(ticketActionResults.topicMissing, ticketId)
      }
      await context.runtime.actions.get("opendiscord:update-ticket-topic").run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        newTopic: topic
      })
      return ticketActionSuccess(ticketActionResults.topicSuccess, ticketId)
    }

    if (action === "pin" || action === "unpin") {
      const runtimeAction = getRuntimeAction(context.runtime, `opendiscord:${action}-ticket`)
      if (!runtimeAction || typeof runtimeAction.run !== "function") {
        return ticketActionWarning(ticketActionResults.unavailable, ticketId)
      }
      await runtimeAction.run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true
      })
      return ticketActionSuccess(action === "pin" ? ticketActionResults.pinSuccess : ticketActionResults.unpinSuccess, ticketId)
    }

    if (action === "rename") {
      const renameName = normalizeString(input.renameName)
      if (!renameName) {
        return ticketActionWarning(ticketActionResults.renameMissingName, ticketId)
      }
      const runtimeAction = getRuntimeAction(context.runtime, "opendiscord:rename-ticket")
      if (!runtimeAction || typeof runtimeAction.run !== "function") {
        return ticketActionWarning(ticketActionResults.unavailable, ticketId)
      }
      await runtimeAction.run("other", {
        guild: context.guild,
        channel: context.channel,
        user: context.user,
        ticket: context.ticket,
        reason,
        sendMessage: true,
        data: renameName
      })
      return ticketActionSuccess(ticketActionResults.renameSuccess, ticketId)
    }

    const runtimeActionId = `opendiscord:${action}-ticket`
    await context.runtime.actions.get(runtimeActionId).run("other", {
      guild: context.guild,
      channel: context.channel,
      user: context.user,
      ticket: context.ticket,
      reason,
      sendMessage: true
    })
    return ticketActionSuccess(ticketActionResults.genericSuccess, ticketId)
  } catch (error) {
    return ticketActionDanger(error instanceof Error ? error.message : ticketActionResults.genericFailure, ticketId)
  }
}

async function checkRuntimeTicketAiAssistPermission(context: Awaited<ReturnType<typeof resolveRuntimeActionContext>>) {
  const permissionMode = context.runtime?.configs?.get?.("opendiscord:general")?.data?.system?.permissions?.close
  if (!context.runtime?.permissions?.checkCommandPerms || !permissionMode) {
    return { allowed: true, reason: null as string | null }
  }

  const result = await context.runtime.permissions.checkCommandPerms(
    permissionMode,
    "support",
    context.user,
    context.member,
    context.channel,
    context.guild
  )
  return {
    allowed: Boolean(result?.hasPerms),
    reason: result?.hasPerms ? null : ticketActionResults.permissionDenied
  }
}

async function runRuntimeTicketAiAssist(runtimeBridge: DashboardRuntimeBridge, input: DashboardTicketAiAssistRequest): Promise<DashboardTicketAiAssistResult> {
  const ticketId = normalizeString(input.ticketId)
  const action = normalizeString(input.action)
  const actorUserId = normalizeString(input.actorUserId)
  if (!ticketId || !isDashboardTicketAiAssistAction(action) || !actorUserId) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "unavailable",
      action: isDashboardTicketAiAssistAction(action) ? action : "summarize",
      message: ticketActionResults.requestIncomplete,
      ticketId
    })
  }

  const detail = await getRuntimeTicketDetail(runtimeBridge, ticketId, actorUserId)
  if (!detail) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "unavailable",
      action,
      message: ticketActionResults.missingTicket,
      ticketId
    })
  }

  if (!detail.ticket.open || detail.ticket.closed) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "unavailable",
      action,
      message: ticketActionResults.unavailable,
      ticketId,
      profileId: detail.aiAssist?.profileId ?? null,
      providerId: detail.aiAssist?.providerId ?? null,
      degradedReason: ticketAvailabilityReasons.ticketNotOpen
    })
  }

  if (!detail.aiAssist?.available || !detail.aiAssist.actions.includes(action)) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "unavailable",
      action,
      message: ticketActionResults.unavailable,
      ticketId,
      profileId: detail.aiAssist?.profileId ?? null,
      providerId: detail.aiAssist?.providerId ?? null,
      degradedReason: detail.aiAssist?.reason || null
    })
  }

  const context = await resolveRuntimeActionContext(runtimeBridge, ticketId, actorUserId)
  if (!context.runtime || !context.guild || !context.ticket || !context.channel || !context.user) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "provider-error",
      action,
      message: ticketActionResults.runtimeContextMissing,
      ticketId,
      profileId: detail.aiAssist.profileId,
      providerId: detail.aiAssist.providerId
    })
  }

  const permission = await checkRuntimeTicketAiAssistPermission(context)
  if (!permission.allowed) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "denied",
      action,
      message: permission.reason || ticketActionResults.permissionDenied,
      ticketId,
      profileId: detail.aiAssist.profileId,
      providerId: detail.aiAssist.providerId
    })
  }

  const service = context.runtime.plugins?.classes?.get?.("ot-ai-assist:service")
  if (!service || typeof service.runTicketAiAssist !== "function") {
    return ticketAiAssistResult({
      ok: false,
      outcome: "unavailable",
      action,
      message: ticketActionResults.unavailable,
      ticketId,
      profileId: detail.aiAssist.profileId,
      providerId: detail.aiAssist.providerId
    })
  }

  try {
    const result = await service.runTicketAiAssist({
      ticket: context.ticket,
      channel: context.channel,
      guild: context.guild,
      actorUser: context.user,
      action,
      source: "dashboard",
      prompt: action === "answerFaq" ? normalizeString(input.prompt) || null : null,
      instructions: action === "suggestReply" ? normalizeString(input.instructions) || null : null
    })

    return ticketAiAssistResult({
      ok: result?.outcome === "success",
      outcome: ["success", "unavailable", "busy", "low-confidence", "provider-error", "denied"].includes(result?.outcome) ? result.outcome : "provider-error",
      action,
      message: result?.outcome === "success" ? ticketActionResults.aiAssistSuccess : result?.degradedReason || ticketActionResults.unavailable,
      ticketId,
      profileId: normalizeString(result?.profileId) || detail.aiAssist.profileId,
      providerId: normalizeString(result?.providerId) || detail.aiAssist.providerId,
      confidence: result?.confidence === "high" || result?.confidence === "medium" || result?.confidence === "low" ? result.confidence : null,
      summary: normalizeString(result?.summary) || null,
      answer: normalizeString(result?.answer) || null,
      draft: normalizeString(result?.draft) || null,
      citations: Array.isArray(result?.citations) ? result.citations : [],
      warnings: Array.isArray(result?.warnings) ? result.warnings.map((warning: unknown) => normalizeString(warning)).filter(Boolean) : [],
      degradedReason: normalizeString(result?.degradedReason) || null
    })
  } catch (error) {
    return ticketAiAssistResult({
      ok: false,
      outcome: "provider-error",
      action,
      message: error instanceof Error ? error.message : ticketActionResults.genericFailure,
      ticketId,
      profileId: detail.aiAssist.profileId,
      providerId: detail.aiAssist.providerId
    })
  }
}

export function supportsTicketWorkbenchReads(runtimeBridge: DashboardRuntimeBridge) {
  return typeof runtimeBridge.listTickets === "function"
}

export function supportsTicketWorkbenchWrites(runtimeBridge: DashboardRuntimeBridge) {
  return typeof runtimeBridge.runTicketAction === "function"
}

export function supportsTicketTelemetryReads(runtimeBridge: DashboardRuntimeBridge) {
  const hasBridgeMethods = (
    typeof runtimeBridge.listLifecycleTelemetry === "function"
    && typeof runtimeBridge.listFeedbackTelemetry === "function"
    && typeof runtimeBridge.getTicketTelemetrySignals === "function"
  )
  if (!hasBridgeMethods) return false
  return runtimeBridge === defaultDashboardRuntimeBridge ? hasRuntimeTelemetryService(runtimeBridge) : true
}

export function supportsTicketQueueTelemetryReads(runtimeBridge: DashboardRuntimeBridge) {
  if (typeof runtimeBridge.listLifecycleTelemetry !== "function") return false
  return runtimeBridge === defaultDashboardRuntimeBridge ? hasRuntimeTelemetryService(runtimeBridge) : true
}

function buildDiscordAvatarUrl(userId: string, avatarHash: unknown) {
  const normalizedAvatar = normalizeString(avatarHash)
  if (!normalizedAvatar) {
    return null
  }

  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(userId)}/${encodeURIComponent(normalizedAvatar)}.png?size=256`
}

function extractRoleIds(member: any) {
  const values: string[] = []
  const seen = new Set<string>()
  const addValue = (candidate: unknown) => {
    const normalized = normalizeString(
      typeof candidate === "object" && candidate !== null
        ? (candidate as { id?: unknown }).id
        : candidate
    )
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    values.push(normalized)
  }

  if (Array.isArray(member?._roles)) {
    member._roles.forEach(addValue)
  }

  const cache = member?.roles?.cache
  if (cache?.values && typeof cache.values === "function") {
    for (const role of cache.values()) {
      addValue(role)
    }
  } else if (Array.isArray(cache)) {
    cache.forEach(addValue)
  }

  return values
}

async function resolveRuntimeGuild(runtimeBridge: DashboardRuntimeBridge) {
  const runtime = runtimeBridge.getRuntimeSource?.() as DashboardRuntimeAuthSource | null
  const client = runtime?.client
  if (!client) {
    return null
  }

  if (client.mainServer?.id) {
    return client.mainServer
  }

  const configuredGuildId = normalizeString(runtime?.configs?.get?.("opendiscord:general")?.data?.serverId)
  if (!configuredGuildId || typeof client.fetchGuild !== "function") {
    return null
  }

  return await client.fetchGuild(configuredGuildId)
}

export function getDashboardRuntimeGuildId(runtimeBridge: DashboardRuntimeBridge) {
  if (typeof runtimeBridge.getGuildId === "function" && runtimeBridge !== defaultDashboardRuntimeBridge) {
    const resolved = normalizeString(runtimeBridge.getGuildId())
    if (resolved) {
      return resolved
    }
  }

  const runtime = runtimeBridge.getRuntimeSource?.() as DashboardRuntimeAuthSource | null
  const mainServerId = normalizeString(runtime?.client?.mainServer?.id)
  if (mainServerId) {
    return mainServerId
  }

  return normalizeString(runtime?.configs?.get?.("opendiscord:general")?.data?.serverId) || null
}

export async function resolveDashboardRuntimeGuildMember(
  runtimeBridge: DashboardRuntimeBridge,
  userId: string
): Promise<DashboardRuntimeGuildMember | null> {
  const normalizedUserId = normalizeString(userId)
  if (!normalizedUserId) {
    return null
  }

  if (typeof runtimeBridge.resolveGuildMember === "function" && runtimeBridge !== defaultDashboardRuntimeBridge) {
    return await runtimeBridge.resolveGuildMember(normalizedUserId)
  }

  const runtime = runtimeBridge.getRuntimeSource?.() as DashboardRuntimeAuthSource | null
  const client = runtime?.client
  if (!client || typeof client.fetchGuildMember !== "function") {
    return null
  }

  const guild = await resolveRuntimeGuild(runtimeBridge)
  const guildId = normalizeString(guild?.id || client.mainServer?.id)
  if (!guildId) {
    return null
  }

  const member = await client.fetchGuildMember(guild, normalizedUserId)
  if (!member) {
    return null
  }

  const username = normalizeString(member.user?.username || member.username)
  if (!username) {
    return null
  }

  const avatarUrl = typeof member.displayAvatarURL === "function"
    ? member.displayAvatarURL({ extension: "png", size: 256 })
    : buildDiscordAvatarUrl(normalizedUserId, member.user?.avatar || member.avatar)

  return {
    guildId,
    userId: normalizedUserId,
    username,
    globalName: normalizeString(member.user?.globalName || member.user?.global_name) || null,
    displayName: normalizeString(member.displayName || member.nickname || member.user?.displayName) || null,
    avatarUrl: normalizeString(avatarUrl) || null,
    roleIds: extractRoleIds(member)
  }
}
