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
