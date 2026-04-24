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
  type DashboardTicketAssignableStaffChoice,
  type DashboardTicketDetailRecord,
  type DashboardTicketEscalationTargetChoice,
  type DashboardTicketMoveTargetChoice,
  type DashboardTicketParticipantChoice,
  type DashboardTicketProviderLock,
  type DashboardTicketPriorityChoice,
  type DashboardTicketTransferCandidateChoice,
  type DashboardTicketTransportMode
} from "./ticket-workbench-types"

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
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isDashboardTicketActionId(value: string): value is DashboardTicketActionId {
  return (DASHBOARD_TICKET_ACTION_IDS as readonly string[]).includes(value)
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

function runtimeOptionSupportTeamId(option: any) {
  return normalizeString(runtimeDataValue(option, "opendiscord:routing-support-team") || option?.routing?.supportTeamId)
}

function runtimeOptionEscalationTargetIds(option: any) {
  return normalizeStringArray(runtimeDataValue(option, "opendiscord:routing-escalation-targets") || option?.routing?.escalationTargetOptionIds)
}

function runtimeOptionTransportMode(option: any) {
  return normalizeTransport(runtimeDataValue(option, "opendiscord:channel-transport-mode") || option?.channel?.transportMode)
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

function buildMoveTargetChoices(runtime: any, currentOptionId: string | null, currentTeamId: string | null, ticketTransport: DashboardTicketTransportMode): DashboardTicketMoveTargetChoice[] {
  const targets: DashboardTicketMoveTargetChoice[] = []
  const options = runtime?.options?.getAll?.() || runtimeConfigArray(runtime, "options")
  for (const option of options) {
    const optionId = runtimeEntityId(option) || normalizeString(option?.id)
    if (!optionId || optionId === currentOptionId) continue
    if (normalizeString(option?.type) && normalizeString(option?.type) !== "ticket") continue
    const targetTransport = runtimeOptionTransportMode(option)
    if (targetTransport !== ticketTransport) continue
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

function invalidTicketStateReason(ticket: DashboardTicketRecord, action: DashboardTicketActionId) {
  if (action === "claim" && (!ticket.open || ticket.claimed)) return "Ticket is already claimed or not open."
  if (action === "unclaim" && (!ticket.open || !ticket.claimed)) return "Ticket is not currently claimed."
  if (action === "assign" && (!ticket.open || ticket.closed)) return "Ticket is not open."
  if (action === "escalate" && (!ticket.open || ticket.closed)) return "Ticket is not open."
  if (["move", "transfer", "add-participant", "remove-participant", "set-priority", "set-topic"].includes(action) && (!ticket.open || ticket.closed)) return "Ticket is not open."
  if (action === "close" && (!ticket.open || ticket.closed)) return "Ticket is already closed."
  if (action === "reopen" && !ticket.closed) return "Ticket is not closed."
  return null
}

function runtimeTicketWorkflowLockReason(runtimeTicket: any, action: DashboardTicketActionId) {
  if (action === "refresh") return null
  return runtimeDataValue(runtimeTicket, "opendiscord:busy") === true
    ? "Ticket is busy in an existing Open Ticket workflow."
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
}) {
  if (input.action === "assign") {
    if (!input.owningTeamId) return "This ticket route has no owning support team."
    if (input.assignableStaff.length < 1) return "This ticket route has no eligible support-team members."
  }
  if (input.action === "escalate" && input.escalationTargets.length < 1) {
    return "This ticket route has no same-transport escalation targets."
  }
  if (input.action === "move" && input.moveTargets.length < 1) {
    return "This ticket route has no same-owner same-transport move targets. Use escalate for ownership-transfer routes."
  }
  if (input.action === "transfer" && input.transferCandidates.length < 1) {
    return "No eligible new creator users are available."
  }
  if (input.action === "add-participant" && !input.participantChoices.some((choice) => !choice.present)) {
    return "No eligible users are available to add."
  }
  if (input.action === "remove-participant" && !input.participantChoices.some((choice) => choice.present && choice.userId !== input.currentCreatorId)) {
    return "No user participants are available to remove."
  }
  if (input.action === "set-priority" && input.priorityChoices.length < 1) {
    return "No priority choices are available."
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
}) {
  const locked = new Set(input.providerLock?.lockedActions || [])
  const availability: Record<DashboardTicketActionId, DashboardTicketActionAvailability> = {} as Record<DashboardTicketActionId, DashboardTicketActionAvailability>

  for (const action of DASHBOARD_TICKET_ACTION_IDS) {
    const runtimeRequired = action !== "refresh"
    if (runtimeRequired && (!input.context?.runtime || !input.context.guild || !input.context.channel || !input.context.user)) {
      availability[action] = disabledAvailability("The Open Ticket runtime could not resolve the ticket, channel, guild, or actor.")
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
        availability[action] = disabledAvailability(permission.reason || "Open Ticket denied this action.")
        continue
      }
    }

    if (locked.has(action)) {
      availability[action] = disabledAvailability("Locked by provider.")
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
      currentCreatorId: input.currentCreatorId
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

async function getRuntimeTicketDetail(runtimeBridge: DashboardRuntimeBridge, ticketId: string, actorUserId = ""): Promise<DashboardTicketDetailRecord | null> {
  const normalizedTicketId = normalizeString(ticketId)
  if (!normalizedTicketId) return null

  const ticket = runtimeBridge.listTickets().find((candidate) => candidate.id === normalizedTicketId) || null
  if (!ticket) return null

  const runtime = runtimeBridge.getRuntimeSource?.() as any
  const runtimeTicket = getRuntimeTicket(runtime, ticket.id)
  const option = runtimeTicket?.option || runtimeOptionById(runtime, ticket.optionId || "")
  const panel = runtimePanelForOption(runtime, ticket.optionId)
  const panelId = normalizeString(panel?.id) || null
  const owningTeamId = ticket.assignedTeamId || runtimeOptionSupportTeamId(option) || null
  const team = runtimeSupportTeamById(runtime, owningTeamId)
  const ticketTransport = normalizeTransport(ticket.transportMode)
  const guild = await resolveRuntimeActionGuild(runtimeBridge, runtime)
  const context = normalizeString(actorUserId)
    ? await resolveRuntimeActionContext(runtimeBridge, ticket.id, actorUserId)
    : null
  const providerLock = await resolveProviderLock(runtimeBridge, ticket.id)
  const assignableStaff = await buildAssignableStaffChoices(runtimeBridge, runtime, guild, owningTeamId)
  const escalationTargets = buildEscalationTargetChoices(runtime, option, ticketTransport)
  const moveTargets = buildMoveTargetChoices(runtime, ticket.optionId, owningTeamId, ticketTransport)
  const transferCandidates = await buildTransferCandidateChoices(runtime, guild, ticket.creatorId)
  const participantChoices = await buildParticipantChoices(runtime, guild, runtimeTicket, ticket.creatorId)
  const priorityLevelValue = runtimeDataValue(runtimeTicket, "opendiscord:priority")
  const priorityLevel = typeof priorityLevelValue === "number" ? priorityLevelValue : Number.isFinite(Number(priorityLevelValue)) ? Number(priorityLevelValue) : null
  const currentPriority = priorityLevel !== null ? runtime?.priorities?.getFromPriorityLevel?.(priorityLevel) : null
  const priorityChoices = buildPriorityChoices(runtime, priorityLevel)
  const topic = normalizeString(runtimeDataValue(runtimeTicket, "opendiscord:topic")) || null
  const originalApplicantUserId = resolveOriginalApplicantUserId(runtimeTicket, ticket.creatorId)
  const originalApplicantLabel = originalApplicantUserId === ticket.creatorId
    ? unknownUserLabel(originalApplicantUserId)
    : unknownUserLabel(originalApplicantUserId)
  const creatorTransferWarning = originalApplicantUserId && ticket.creatorId && originalApplicantUserId !== ticket.creatorId
    ? `Original applicant authority remains with ${originalApplicantLabel}; the current creator is ${unknownUserLabel(ticket.creatorId)}.`
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
    currentCreatorId: ticket.creatorId
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
    providerLock
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
    reason: result?.hasPerms ? null : "The acting dashboard user does not have the required Open Ticket permission."
  }
}

async function runRuntimeTicketAction(runtimeBridge: DashboardRuntimeBridge, input: DashboardTicketActionRequest): Promise<DashboardTicketActionResult> {
  const ticketId = normalizeString(input.ticketId)
  const action = normalizeString(input.action)
  const actorUserId = normalizeString(input.actorUserId)
  if (!ticketId || !isDashboardTicketActionId(action) || !actorUserId) {
    return ticketActionWarning("The ticket action request is incomplete.", ticketId)
  }

  if (action === "refresh") {
    return ticketActionSuccess("Ticket detail refreshed.", ticketId)
  }

  const detail = await getRuntimeTicketDetail(runtimeBridge, ticketId, actorUserId)
  if (!detail) {
    return ticketActionWarning("Ticket is missing or no longer tracked.", ticketId)
  }

  const availability = detail.actionAvailability[action]
  if (!availability.enabled) {
    return ticketActionWarning(availability.reason || "This ticket action is unavailable.", ticketId)
  }

  const context = await resolveRuntimeActionContext(runtimeBridge, ticketId, actorUserId)
  if (!context.runtime || !context.guild || !context.ticket || !context.channel || !context.user) {
    return ticketActionDanger("The Open Ticket runtime could not resolve the ticket, channel, guild, or actor.", ticketId)
  }

  const permission = await checkRuntimeTicketActionPermission(context, action)
  if (!permission.allowed) {
    return ticketActionWarning(permission.reason || "Open Ticket denied this action.", ticketId)
  }

  try {
    const reason = normalizeString(input.reason) || null
    if (action === "assign") {
      const assigneeUserId = normalizeString(input.assigneeUserId)
      if (!assigneeUserId) {
        return ticketActionWarning("Choose an assignee before assigning this ticket.", ticketId)
      }
      if (!detail.assignableStaff.some((choice) => choice.userId === assigneeUserId)) {
        return ticketActionWarning("Selected assignee is not eligible for the owning support team.", ticketId)
      }
      if (detail.ticket.claimed && detail.ticket.claimedBy && detail.ticket.claimedBy !== assigneeUserId) {
        return ticketActionWarning("This ticket is currently claimed by another staff member. Unclaim it before assigning a different staff member.", ticketId)
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
      return ticketActionSuccess("Ticket assignee updated.", ticketId)
    }

    if (action === "escalate") {
      const targetOptionId = normalizeString(input.targetOptionId)
      if (!detail.escalationTargets.some((choice) => choice.optionId === targetOptionId)) {
        return ticketActionWarning("Choose a route-scoped same-transport escalation target before escalating this ticket.", ticketId)
      }
      const targetOption = targetOptionId ? context.runtime.options?.get?.(targetOptionId) : null
      if (!targetOption) {
        return ticketActionWarning("Choose a valid escalation target before escalating this ticket.", ticketId)
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
      return ticketActionSuccess("Ticket escalated.", movedTicketId)
    }

    if (action === "move") {
      const targetOptionId = normalizeString(input.targetOptionId)
      if (!detail.moveTargets.some((choice) => choice.optionId === targetOptionId)) {
        return ticketActionWarning("Choose a same-owner same-transport move target before moving this ticket.", ticketId)
      }
      const targetOption = targetOptionId ? runtimeOptionById(context.runtime, targetOptionId) : null
      if (!targetOption) {
        return ticketActionWarning("Choose a valid move target before moving this ticket.", ticketId)
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
      return ticketActionSuccess("Ticket moved.", ticketId)
    }

    if (action === "transfer") {
      const newCreatorUserId = normalizeString(input.newCreatorUserId)
      if (!detail.transferCandidates.some((choice) => choice.userId === newCreatorUserId)) {
        return ticketActionWarning("Choose a different eligible creator before transferring this ticket.", ticketId)
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
      return ticketActionSuccess("Ticket creator transferred.", ticketId)
    }

    if (action === "add-participant" || action === "remove-participant") {
      const participantUserId = normalizeString(input.participantUserId)
      const selected = detail.participantChoices.find((choice) => choice.userId === participantUserId)
      if (!selected) {
        return ticketActionWarning("Choose a valid user participant before updating this ticket.", ticketId)
      }
      if (action === "add-participant" && selected.present) {
        return ticketActionWarning("Selected user is already a participant.", ticketId)
      }
      if (action === "remove-participant") {
        if (!selected.present) return ticketActionWarning("Selected user is not a participant.", ticketId)
        if (selected.userId === detail.ticket.creatorId) return ticketActionWarning("The current ticket creator cannot be removed as a participant.", ticketId)
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
      return ticketActionSuccess(action === "add-participant" ? "Ticket participant added." : "Ticket participant removed.", ticketId)
    }

    if (action === "set-priority") {
      const priorityId = normalizeString(input.priorityId)
      if (!detail.priorityChoices.some((choice) => choice.priorityId === priorityId)) {
        return ticketActionWarning("Choose a valid priority before updating this ticket.", ticketId)
      }
      const newPriority = resolvePriorityChoice(context.runtime, priorityId)
      if (!newPriority) {
        return ticketActionWarning("Choose a configured Open Ticket priority before updating this ticket.", ticketId)
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
      return ticketActionSuccess("Ticket priority updated.", ticketId)
    }

    if (action === "set-topic") {
      const topic = normalizeString(input.topic)
      if (!topic) {
        return ticketActionWarning("Enter a ticket topic before updating this ticket.", ticketId)
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
      return ticketActionSuccess("Ticket topic updated.", ticketId)
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
    return ticketActionSuccess(`Ticket ${action} action completed.`, ticketId)
  } catch (error) {
    return ticketActionDanger(error instanceof Error ? error.message : "Ticket action failed.", ticketId)
  }
}

export function supportsTicketWorkbenchReads(runtimeBridge: DashboardRuntimeBridge) {
  return typeof runtimeBridge.listTickets === "function"
}

export function supportsTicketWorkbenchWrites(runtimeBridge: DashboardRuntimeBridge) {
  return typeof runtimeBridge.runTicketAction === "function"
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
