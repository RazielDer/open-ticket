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
  type DashboardTicketProviderLock,
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
}) {
  if (input.action === "assign") {
    if (!input.owningTeamId) return "This ticket route has no owning support team."
    if (input.assignableStaff.length < 1) return "This ticket route has no eligible support-team members."
  }
  if (input.action === "escalate" && input.escalationTargets.length < 1) {
    return "This ticket route has no same-transport escalation targets."
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
      escalationTargets: input.escalationTargets
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
  const actionAvailability = await buildRuntimeActionAvailability({
    runtimeBridge,
    context,
    runtimeTicket,
    ticket,
    providerLock,
    owningTeamId,
    assignableStaff,
    escalationTargets
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
    participantLabels: [`${ticket.participantCount} participant(s)`],
    actionAvailability,
    assignableStaff,
    escalationTargets,
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
  return action === "assign" ? "claim" : action
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
