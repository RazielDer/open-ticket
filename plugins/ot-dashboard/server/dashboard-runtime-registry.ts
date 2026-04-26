import fs from "fs"
import path from "path"

import { getDashboardPluginAssetKind, type DashboardPluginAssetKind } from "./dashboard-plugin-registry"
import { ODTICKET_PLATFORM_METADATA_DEFAULTS, ODTICKET_PLATFORM_METADATA_IDS } from "../../../src/core/api/openticket/ticket-platform"
import type { DashboardTicketTransportMode } from "./ticket-workbench-types"

const MANAGED_CONFIG_FILES = [
  { id: "general", fileName: "general.json" },
  { id: "options", fileName: "options.json" },
  { id: "panels", fileName: "panels.json" },
  { id: "questions", fileName: "questions.json" },
  { id: "support-teams", fileName: "support-teams.json" },
  { id: "transcripts", fileName: "transcripts.json" }
] as const

const MAX_RECENT_ACTIVITY = 40
const PLUGIN_JSON_IGNORED_DIRS = new Set(["node_modules", "dist", "public", "locales"])

export type DashboardAvailability = "unavailable" | "starting" | "ready" | "degraded"
export type DashboardManagedConfigId = (typeof MANAGED_CONFIG_FILES)[number]["id"]
export type DashboardTicketActivityType = "created" | "closed" | "reopened" | "claimed" | "unclaimed" | "pinned" | "unpinned" | "deleted"
export type DashboardPluginSource = "manifest" | "runtime" | "runtime+manifest"
export type DashboardPluginAssetRootShape = "object" | "array" | "scalar" | "invalid"

export interface DashboardConfigInventoryItem {
  id: DashboardManagedConfigId
  fileName: string
  absolutePath: string
  exists: boolean
  size: number | null
  updatedAt: string | null
}

export interface DashboardRecentTicketActivity {
  id: string
  timestamp: string
  type: DashboardTicketActivityType
  ticketId: string
  optionId: string | null
  actorId: string | null
  label: string
}

export interface DashboardRuntimeSnapshot {
  capturedAt: string
  availability: DashboardAvailability
  processStartTime: string | null
  readyTime: string | null
  checkerSummary: {
    hasResult: boolean
    valid: boolean | null
    errorCount: number
    warningCount: number
    infoCount: number
  }
  pluginSummary: {
    discovered: number
    enabled: number
    executed: number
    crashed: number
    unknownCrashed: number
  }
  configInventory: DashboardConfigInventoryItem[]
  statsSummary: {
    available: boolean
    scopeCount: number
  }
  ticketSummary: {
    available: boolean
    total: number
    open: number
    closed: number
    claimed: number
    pinned: number
    recentActivityCount: number
  }
  warnings: string[]
  recentTicketActivity: DashboardRecentTicketActivity[]
}

export interface DashboardPluginAssetItem {
  relativePath: string
  fileName: string
  absolutePath: string
  size: number | null
  updatedAt: string | null
  kind: DashboardPluginAssetKind
  detectedRootShape: DashboardPluginAssetRootShape
}

export interface DashboardPluginInventoryItem {
  id: string
  directory: string
  pluginRoot: string
  manifestPath: string | null
  hasManifest: boolean
  source: DashboardPluginSource
  name: string
  version: string
  enabled: boolean | null
  executed: boolean | null
  crashed: boolean | null
  crashReason: string | null
  priority: number | null
  author: string
  authors: string[]
  contributors: string[]
  shortDescription: string
  tags: string[]
  supportedVersions: string[]
  assetCount: number
  configEntryPoints: string[]
  editableAssets: DashboardPluginAssetItem[]
  unknownCrashWarning: boolean
}

export interface DashboardPluginDetail extends DashboardPluginInventoryItem {
  longDescription: string
  imageUrl: string
  projectUrl: string
  requiredPlugins: string[]
  incompatiblePlugins: string[]
  npmDependencies: string[]
  missingDependencies: string[]
  missingRequiredPlugins: string[]
  activeIncompatiblePlugins: string[]
  warnings: string[]
}

export interface DashboardTicketRecord {
  id: string
  optionId: string | null
  creatorId: string | null
  transportMode: DashboardTicketTransportMode | null
  channelName: string | null
  transportParentChannelId: string | null
  transportParentMessageId: string | null
  assignedTeamId: string | null
  assignedStaffUserId: string | null
  assignmentStrategy: string | null
  firstStaffResponseAt: number | null
  resolvedAt: number | null
  awaitingUserState: string | null
  awaitingUserSince: number | null
  closeRequestState: string | null
  closeRequestBy: string | null
  closeRequestAt: number | null
  integrationProfileId: string | null
  aiAssistProfileId: string | null
  openedOn: number | null
  closedOn: number | null
  reopenedOn: number | null
  claimedOn: number | null
  pinnedOn: number | null
  claimedBy: string | null
  pinnedBy: string | null
  open: boolean
  closed: boolean
  claimed: boolean
  pinned: boolean
  participantCount: number
  categoryMode: string | null
  channelSuffix: string | null
}

type RuntimeTicket = {
  id?: { value?: string } | string
  option?: { id?: { value?: string } | string } | null
  channel?: { name?: string | null } | null
  channelName?: string | null
  name?: string | null
  get?: (id: string) => { value?: unknown } | null
}

type RuntimeManagerLike<T = unknown> = {
  getAll?: () => T[]
  get?: (id: string) => T | null
  onAdd?: (callback: (data: T, overwritten: boolean) => void) => void
  onChange?: (callback: (data: T) => void) => void
  onRemove?: (callback: (data: T) => void) => void
}

export interface DashboardRuntimeSource {
  processStartupDate?: Date | null
  readyStartupDate?: Date | null
  log?: (message: string, type?: string, details?: Array<{ key: string; value: string; hidden?: boolean }>) => unknown
  plugins?: RuntimeManagerLike<any> & {
    classes?: { get?: (id: string) => unknown | null }
    unknownCrashedPlugins?: Array<{ name?: string; description?: string }>
  }
  checkers?: { lastResult?: { valid: boolean; messages: Array<{ type: string }> } | null }
  stats?: RuntimeManagerLike<any>
  tickets?: RuntimeManagerLike<RuntimeTicket>
}

interface TicketState {
  id: string
  optionId: string | null
  creatorId: string | null
  transportMode: DashboardTicketTransportMode | null
  channelName: string | null
  transportParentChannelId: string | null
  transportParentMessageId: string | null
  assignedTeamId: string | null
  assignedStaffUserId: string | null
  assignmentStrategy: string | null
  firstStaffResponseAt: number | null
  resolvedAt: number | null
  awaitingUserState: string | null
  awaitingUserSince: number | null
  closeRequestState: string | null
  closeRequestBy: string | null
  closeRequestAt: number | null
  integrationProfileId: string | null
  aiAssistProfileId: string | null
  openedOn: number | null
  closedOn: number | null
  reopenedOn: number | null
  claimedOn: number | null
  pinnedOn: number | null
  claimedBy: string | null
  pinnedBy: string | null
  open: boolean
  closed: boolean
  claimed: boolean
  pinned: boolean
  participantCount: number
  categoryMode: string | null
  channelSuffix: string | null
}

const registryState = {
  runtime: null as DashboardRuntimeSource | null,
  ticketStates: new Map<string, TicketState>(),
  recentTicketActivity: [] as DashboardRecentTicketActivity[],
  ticketLoadInProgress: false,
  ticketListenersAttached: false
}
const loggedCategoryCapacityWarnings = new Set<string>()

function toIso(value: Date | number | null | undefined): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function getProjectConfigDir(projectRoot: string) {
  return path.resolve(projectRoot, "config")
}

function safeReaddir(directory: string) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function safeStat(filePath: string) {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}

function safeReadJsonValue(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function safeReadJsonRecord(filePath: string): Record<string, any> | null {
  const value = safeReadJsonValue(filePath)
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, any>
}

function safeGetValue(ticket: RuntimeTicket, id: string) {
  try {
    return ticket.get?.(id)?.value
  } catch {
    return undefined
  }
}

function extractTicketState(ticket: RuntimeTicket): TicketState | null {
  const rawId = typeof ticket.id === "string" ? ticket.id : ticket.id?.value
  const id = String(rawId || "").trim()
  if (!id) return null

  const optionRaw = typeof ticket.option?.id === "string" ? ticket.option.id : ticket.option?.id?.value
  const participants = safeGetValue(ticket, "opendiscord:participants")

  return {
    id,
    optionId: optionRaw ? String(optionRaw) : null,
    creatorId: stringOrNull(safeGetValue(ticket, "opendiscord:opened-by")),
    transportMode: ticketTransportModeOrNull(stringOrDefault(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.transportMode), ODTICKET_PLATFORM_METADATA_DEFAULTS.transportMode)),
    channelName: stringOrNull(ticket.channel?.name) || stringOrNull(ticket.channelName) || stringOrNull(ticket.name),
    transportParentChannelId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId)),
    transportParentMessageId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.transportParentMessageId)),
    assignedTeamId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId)),
    assignedStaffUserId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.assignedStaffUserId)),
    assignmentStrategy: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.assignmentStrategy)),
    firstStaffResponseAt: numberOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.firstStaffResponseAt)),
    resolvedAt: numberOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.resolvedAt)),
    awaitingUserState: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.awaitingUserState)),
    awaitingUserSince: numberOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.awaitingUserSince)),
    closeRequestState: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.closeRequestState)),
    closeRequestBy: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.closeRequestBy)),
    closeRequestAt: numberOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.closeRequestAt)),
    integrationProfileId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.integrationProfileId)),
    aiAssistProfileId: stringOrNull(safeGetValue(ticket, ODTICKET_PLATFORM_METADATA_IDS.aiAssistProfileId)),
    openedOn: numberOrNull(safeGetValue(ticket, "opendiscord:opened-on")),
    closedOn: numberOrNull(safeGetValue(ticket, "opendiscord:closed-on")),
    reopenedOn: numberOrNull(safeGetValue(ticket, "opendiscord:reopened-on")),
    claimedOn: numberOrNull(safeGetValue(ticket, "opendiscord:claimed-on")),
    pinnedOn: numberOrNull(safeGetValue(ticket, "opendiscord:pinned-on")),
    claimedBy: stringOrNull(safeGetValue(ticket, "opendiscord:claimed-by")),
    pinnedBy: stringOrNull(safeGetValue(ticket, "opendiscord:pinned-by")),
    open: Boolean(safeGetValue(ticket, "opendiscord:open")),
    closed: Boolean(safeGetValue(ticket, "opendiscord:closed")),
    claimed: Boolean(safeGetValue(ticket, "opendiscord:claimed")),
    pinned: Boolean(safeGetValue(ticket, "opendiscord:pinned")),
    participantCount: Array.isArray(participants) ? participants.length : 0,
    categoryMode: categoryModeOrNull(safeGetValue(ticket, "opendiscord:category-mode")),
    channelSuffix: stringOrNull(safeGetValue(ticket, "opendiscord:channel-suffix"))
  }
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function stringOrDefault(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function ticketTransportModeOrNull(value: unknown): DashboardTicketTransportMode | null {
  return value === "channel_text" || value === "private_thread" ? value : null
}

function categoryModeOrNull(value: unknown): string | null {
  const normalized = stringOrNull(value)
  return normalized === "backup" ? "overflow" : normalized
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function uniqueStringArray(value: unknown) {
  return stringArray(value)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, values) => values.indexOf(entry) === index)
}

function recordTicketActivity(type: DashboardTicketActivityType, state: TicketState, timestamp: number | null, actorId: string | null) {
  const occurredAt = timestamp ?? Date.now()
  const label = `${capitalize(type)} ticket ${state.id}`
  registryState.recentTicketActivity.unshift({
    id: `${type}:${state.id}:${occurredAt}`,
    timestamp: new Date(occurredAt).toISOString(),
    type,
    ticketId: state.id,
    optionId: state.optionId,
    actorId,
    label
  })
  if (registryState.recentTicketActivity.length > MAX_RECENT_ACTIVITY) {
    registryState.recentTicketActivity.length = MAX_RECENT_ACTIVITY
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function handleTicketAdd(ticket: RuntimeTicket) {
  const next = extractTicketState(ticket)
  if (!next) return
  registryState.ticketStates.set(next.id, next)
  if (registryState.ticketLoadInProgress) return
  recordTicketActivity("created", next, next.openedOn, next.creatorId)
}

function handleTicketChange(ticket: RuntimeTicket) {
  const next = extractTicketState(ticket)
  if (!next) return

  const previous = registryState.ticketStates.get(next.id)
  registryState.ticketStates.set(next.id, next)
  if (!previous || registryState.ticketLoadInProgress) return

  if (next.closedOn != null && next.closedOn !== previous.closedOn) {
    recordTicketActivity("closed", next, next.closedOn, next.creatorId)
    return
  }
  if (next.reopenedOn != null && next.reopenedOn !== previous.reopenedOn) {
    recordTicketActivity("reopened", next, next.reopenedOn, next.creatorId)
    return
  }
  if (next.claimedOn != null && next.claimedOn !== previous.claimedOn) {
    recordTicketActivity("claimed", next, next.claimedOn, next.claimedBy)
    return
  }
  if (previous.claimed && !next.claimed) {
    recordTicketActivity("unclaimed", next, Date.now(), previous.claimedBy)
    return
  }
  if (next.pinnedOn != null && next.pinnedOn !== previous.pinnedOn) {
    recordTicketActivity("pinned", next, next.pinnedOn, next.pinnedBy)
    return
  }
  if (previous.pinned && !next.pinned) {
    recordTicketActivity("unpinned", next, Date.now(), previous.pinnedBy)
  }
}

function handleTicketRemove(ticket: RuntimeTicket) {
  const previous = extractTicketState(ticket) || registryState.ticketStates.get(stringOrNull(typeof ticket.id === "string" ? ticket.id : ticket.id?.value) || "")
  if (!previous) return
  registryState.ticketStates.delete(previous.id)
  if (registryState.ticketLoadInProgress) return
  recordTicketActivity("deleted", previous, Date.now(), previous.creatorId)
}

function attachTicketListeners(runtime: DashboardRuntimeSource) {
  if (registryState.ticketListenersAttached || !runtime.tickets) return
  runtime.tickets.onAdd?.((ticket) => handleTicketAdd(ticket))
  runtime.tickets.onChange?.((ticket) => handleTicketChange(ticket))
  runtime.tickets.onRemove?.((ticket) => handleTicketRemove(ticket))
  registryState.ticketListenersAttached = true
}

function syncTicketStates(runtime: DashboardRuntimeSource | null) {
  registryState.ticketStates.clear()
  for (const ticket of runtime?.tickets?.getAll?.() || []) {
    const state = extractTicketState(ticket)
    if (state) {
      registryState.ticketStates.set(state.id, state)
    }
  }
}

export function registerDashboardRuntime(runtime: DashboardRuntimeSource) {
  registryState.runtime = runtime
  attachTicketListeners(runtime)
  syncTicketStates(runtime)
}

export function beginDashboardTicketLoad() {
  registryState.ticketLoadInProgress = true
}

export function completeDashboardTicketLoad() {
  registryState.ticketLoadInProgress = false
  syncTicketStates(registryState.runtime)
}

export function refreshDashboardRuntimeSnapshot(_reason?: string) {
  if (registryState.runtime) {
    syncTicketStates(registryState.runtime)
  }
}

export function getDashboardRuntimeSource() {
  return registryState.runtime
}

function readConfigInventory(projectRoot: string): DashboardConfigInventoryItem[] {
  const configDir = getProjectConfigDir(projectRoot)
  return MANAGED_CONFIG_FILES.map((definition) => {
    const absolutePath = path.join(configDir, definition.fileName)
    const stats = safeStat(absolutePath)
    return {
      ...definition,
      absolutePath,
      exists: Boolean(stats),
      size: stats?.size ?? null,
      updatedAt: stats?.mtime.toISOString() ?? null
    }
  })
}

function getCheckerSummary(runtime: DashboardRuntimeSource | null) {
  const result = runtime?.checkers?.lastResult
  const messages = result?.messages || []
  return {
    hasResult: Boolean(result),
    valid: result ? Boolean(result.valid) : null,
    errorCount: messages.filter((message) => message?.type === "error").length,
    warningCount: messages.filter((message) => message?.type === "warning").length,
    infoCount: messages.filter((message) => message?.type === "info").length
  }
}

function getPluginSummary(runtime: DashboardRuntimeSource | null) {
  const plugins = runtime?.plugins?.getAll?.() || []
  return {
    discovered: plugins.length,
    enabled: plugins.filter((plugin: any) => plugin?.enabled === true).length,
    executed: plugins.filter((plugin: any) => plugin?.executed === true).length,
    crashed: plugins.filter((plugin: any) => plugin?.crashed === true).length,
    unknownCrashed: Array.isArray(runtime?.plugins?.unknownCrashedPlugins) ? runtime!.plugins!.unknownCrashedPlugins!.length : 0
  }
}

function runtimeConfigArray(runtime: any, id: string) {
  const namespaced = runtime?.configs?.get?.(`opendiscord:${id}`)?.data
  const data = namespaced !== undefined ? namespaced : runtime?.configs?.get?.(id)?.data
  return Array.isArray(data) ? data : []
}

function valuesFromCollection(value: any) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value.values === "function") return Array.from(value.values())
  if (typeof value === "object") return Object.values(value)
  return []
}

function categoryChildCount(category: any) {
  const children = category?.children
  if (typeof children?.cache?.size === "number") return children.cache.size
  if (typeof children?.size === "number") return children.size
  return 0
}

function findCachedCategory(runtime: any, categoryId: string) {
  const guild = runtime?.client?.mainServer
  const channels = guild?.channels?.cache || guild?.channels
  const direct = typeof channels?.get === "function" ? channels.get(categoryId) : null
  if (direct) return direct
  return valuesFromCollection(channels).find((channel: any) => String(channel?.id || "") === categoryId) || null
}

function logCategoryCapacityWarning(runtime: DashboardRuntimeSource | null, warning: string, optionId: string, categoryId: string, childCount: number) {
  if (typeof runtime?.log !== "function") return
  const logKey = `${optionId}:${categoryId}:${childCount}`
  if (loggedCategoryCapacityWarnings.has(logKey)) return
  loggedCategoryCapacityWarnings.add(logKey)
  runtime.log(warning, "warning", [
    { key: "option", value: optionId },
    { key: "categoryid", value: categoryId, hidden: true },
    { key: "children", value: String(childCount) }
  ])
}

function collectCategoryCapacityWarnings(runtime: DashboardRuntimeSource | null) {
  const warnings: string[] = []
  const runtimeAny = runtime as any
  for (const option of runtimeConfigArray(runtimeAny, "options")) {
    if (String(option?.type || "") !== "ticket") continue
    if (String(option?.channel?.transportMode || "channel_text") === "private_thread") continue
    const optionId = String(option?.id || "").trim() || "unknown"
    const primary = String(option?.channel?.category || "").trim()
    const hasOverflowCategories = Array.isArray(option?.channel?.overflowCategories)
    const overflow = hasOverflowCategories
      ? uniqueStringArray(option?.channel?.overflowCategories)
      : uniqueStringArray(option?.channel?.backupCategory ? [option.channel.backupCategory] : [])
    const seen = new Set<string>()
    for (const categoryId of [primary, ...overflow]) {
      if (!categoryId || seen.has(categoryId)) continue
      seen.add(categoryId)
      const category = findCachedCategory(runtimeAny, categoryId)
      const count = categoryChildCount(category)
      if (category && count >= 45) {
        const warning = `Ticket option ${optionId} category ${categoryId} is near Discord channel capacity (${count}/50).`
        warnings.push(warning)
        logCategoryCapacityWarning(runtime, warning, optionId, categoryId, count)
      }
    }
  }
  return warnings
}

function getTicketSummary() {
  const tickets = Array.from(registryState.ticketStates.values())
  return {
    available: Boolean(registryState.runtime?.tickets),
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.open).length,
    closed: tickets.filter((ticket) => ticket.closed).length,
    claimed: tickets.filter((ticket) => ticket.claimed).length,
    pinned: tickets.filter((ticket) => ticket.pinned).length,
    recentActivityCount: registryState.recentTicketActivity.length
  }
}

function getWarnings(runtime: DashboardRuntimeSource | null, checkerSummary: ReturnType<typeof getCheckerSummary>, pluginSummary: ReturnType<typeof getPluginSummary>) {
  const warnings: string[] = []
  if (!runtime) {
    warnings.push("Open Ticket runtime is not registered with the dashboard registry.")
    return warnings
  }
  if (!runtime.readyStartupDate) {
    warnings.push("Open Ticket is still starting; runtime data may be partial.")
  }
  if (checkerSummary.hasResult && checkerSummary.valid === false) {
    warnings.push("The latest config checker result is invalid.")
  }
  if (pluginSummary.crashed > 0 || pluginSummary.unknownCrashed > 0) {
    warnings.push("One or more plugins are currently crashed or unavailable.")
  }
  warnings.push(...collectCategoryCapacityWarnings(runtime))
  return warnings
}

export function getDashboardRuntimeSnapshot(options: { projectRoot?: string } = {}): DashboardRuntimeSnapshot {
  const projectRoot = options.projectRoot || process.cwd()
  const runtime = registryState.runtime
  const checkerSummary = getCheckerSummary(runtime)
  const pluginSummary = getPluginSummary(runtime)
  const ticketSummary = getTicketSummary()
  const warnings = getWarnings(runtime, checkerSummary, pluginSummary)
  const availability: DashboardAvailability = !runtime
    ? "unavailable"
    : !runtime.readyStartupDate
      ? "starting"
      : warnings.length > 0
        ? "degraded"
        : "ready"

  return {
    capturedAt: new Date().toISOString(),
    availability,
    processStartTime: toIso(runtime?.processStartupDate || null),
    readyTime: toIso(runtime?.readyStartupDate || null),
    checkerSummary,
    pluginSummary,
    configInventory: readConfigInventory(projectRoot),
    statsSummary: {
      available: Boolean(runtime?.stats),
      scopeCount: runtime?.stats?.getAll?.().length || 0
    },
    ticketSummary,
    warnings,
    recentTicketActivity: [...registryState.recentTicketActivity]
  }
}

function detectJsonRootShape(filePath: string): DashboardPluginAssetRootShape {
  const value = safeReadJsonValue(filePath)
  if (value === null && safeStat(filePath)) {
    return "invalid"
  }
  if (Array.isArray(value)) return "array"
  if (value && typeof value === "object") return "object"
  return "scalar"
}

function dependencyInstalled(id: string) {
  try {
    require.resolve(id)
    return true
  } catch {
    return false
  }
}

function extractRuntimePluginId(plugin: any) {
  return String(plugin?.id?.value || plugin?.dir || "").trim()
}

function extractRuntimePluginDirectory(plugin: any) {
  return String(plugin?.dir || plugin?.id?.value || "").trim()
}

function mapRuntimePlugins(runtime: DashboardRuntimeSource | null) {
  const byId = new Map<string, any>()
  const byDirectory = new Map<string, any>()

  for (const plugin of runtime?.plugins?.getAll?.() || []) {
    const id = extractRuntimePluginId(plugin)
    const directory = extractRuntimePluginDirectory(plugin)
    if (id) byId.set(id, plugin)
    if (directory) byDirectory.set(directory, plugin)
  }

  return { byId, byDirectory }
}

function discoverPluginAssets(pluginId: string, pluginRoot: string, currentPath = pluginRoot, result: DashboardPluginAssetItem[] = []) {
  for (const entry of safeReaddir(currentPath)) {
    if (entry.name.startsWith(".")) continue
    const absolutePath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      if (PLUGIN_JSON_IGNORED_DIRS.has(entry.name)) continue
      discoverPluginAssets(pluginId, pluginRoot, absolutePath, result)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.endsWith(".json")) continue
    if (entry.name === "plugin.json") continue

    const relativePath = path.relative(pluginRoot, absolutePath).replace(/\\/g, "/")
    const stats = safeStat(absolutePath)
    result.push({
      relativePath,
      fileName: entry.name,
      absolutePath,
      size: stats?.size ?? null,
      updatedAt: stats?.mtime.toISOString() ?? null,
      kind: getDashboardPluginAssetKind(pluginId, relativePath),
      detectedRootShape: detectJsonRootShape(absolutePath)
    })
  }

  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

function matchesUnknownCrash(runtime: DashboardRuntimeSource | null, directory: string, manifest: Record<string, any> | null) {
  const name = String(manifest?.name || directory)
  const description = String(manifest?.details?.shortDescription || "")
  return (runtime?.plugins?.unknownCrashedPlugins || []).some((item) => {
    const unknownName = String(item?.name || "")
    const unknownDescription = String(item?.description || "")
    return unknownName === name || unknownName === directory || (description.length > 0 && unknownDescription === description)
  })
}

function getMissingDependencies(runtimePlugin: any, manifest: Record<string, any> | null) {
  if (typeof runtimePlugin?.dependenciesInstalled === "function") {
    try {
      return runtimePlugin.dependenciesInstalled().map(String)
    } catch {}
  }
  return stringArray(manifest?.npmDependencies).filter((dependency) => !dependencyInstalled(dependency))
}

function getMissingRequiredPlugins(runtime: DashboardRuntimeSource | null, runtimePlugin: any, manifest: Record<string, any> | null) {
  if (typeof runtimePlugin?.pluginsInstalled === "function") {
    try {
      return runtimePlugin.pluginsInstalled(runtime?.plugins).map(String)
    } catch {}
  }
  return stringArray(manifest?.requiredPlugins).filter((pluginId) => runtime?.plugins?.get?.(pluginId)?.enabled !== true)
}

function getActiveIncompatiblePlugins(runtime: DashboardRuntimeSource | null, runtimePlugin: any, manifest: Record<string, any> | null) {
  if (typeof runtimePlugin?.pluginsIncompatible === "function") {
    try {
      return runtimePlugin.pluginsIncompatible(runtime?.plugins).map(String)
    } catch {}
  }
  return stringArray(manifest?.incompatiblePlugins).filter((pluginId) => runtime?.plugins?.get?.(pluginId)?.enabled === true)
}

function buildPluginWarnings(detail: {
  crashed: boolean | null
  crashReason: string | null
  unknownCrashWarning: boolean
  missingDependencies: string[]
  missingRequiredPlugins: string[]
  activeIncompatiblePlugins: string[]
}) {
  const warnings: string[] = []
  if (detail.crashed) {
    warnings.push(detail.crashReason ? `Runtime reports this plugin as crashed (${detail.crashReason}).` : "Runtime reports this plugin as crashed.")
  }
  if (detail.unknownCrashWarning) {
    warnings.push("This plugin matches an entry in the runtime unknown-crashed plugin list.")
  }
  if (detail.missingDependencies.length > 0) {
    warnings.push(`Missing npm dependencies: ${detail.missingDependencies.join(", ")}`)
  }
  if (detail.missingRequiredPlugins.length > 0) {
    warnings.push(`Missing required plugins: ${detail.missingRequiredPlugins.join(", ")}`)
  }
  if (detail.activeIncompatiblePlugins.length > 0) {
    warnings.push(`Enabled incompatible plugins: ${detail.activeIncompatiblePlugins.join(", ")}`)
  }
  return warnings
}

function buildDashboardPluginDetail(projectRoot: string, directory: string, manifest: Record<string, any> | null, runtimePlugin: any, runtime: DashboardRuntimeSource | null): DashboardPluginDetail {
  const pluginRoot = path.resolve(projectRoot, "plugins", directory)
  const manifestPath = manifest ? path.join(pluginRoot, "plugin.json") : null
  const pluginId = String(manifest?.id || extractRuntimePluginId(runtimePlugin) || directory)
  const author = String(manifest?.details?.author || runtimePlugin?.details?.author || "")
  const contributors = stringArray(manifest?.details?.contributors || runtimePlugin?.details?.contributors)
  const authors = [author, ...contributors].filter(Boolean)
  const editableAssets = fs.existsSync(pluginRoot) ? discoverPluginAssets(pluginId, pluginRoot) : []
  const missingDependencies = getMissingDependencies(runtimePlugin, manifest)
  const missingRequiredPlugins = getMissingRequiredPlugins(runtime, runtimePlugin, manifest)
  const activeIncompatiblePlugins = getActiveIncompatiblePlugins(runtime, runtimePlugin, manifest)
  const unknownCrashWarning = matchesUnknownCrash(runtime, directory, manifest)

  const detail: DashboardPluginDetail = {
    id: pluginId,
    directory,
    pluginRoot,
    manifestPath,
    hasManifest: Boolean(manifest),
    source: manifest && runtimePlugin ? "runtime+manifest" : manifest ? "manifest" : "runtime",
    name: String(manifest?.name || runtimePlugin?.name || directory),
    version: String(manifest?.version || runtimePlugin?.version?.toString?.() || ""),
    enabled: typeof runtimePlugin?.enabled === "boolean" ? runtimePlugin.enabled : typeof manifest?.enabled === "boolean" ? manifest.enabled : null,
    executed: typeof runtimePlugin?.executed === "boolean" ? runtimePlugin.executed : null,
    crashed: typeof runtimePlugin?.crashed === "boolean" ? runtimePlugin.crashed : null,
    crashReason: runtimePlugin?.crashReason ? String(runtimePlugin.crashReason) : null,
    priority: typeof runtimePlugin?.priority === "number" ? runtimePlugin.priority : typeof manifest?.priority === "number" ? manifest.priority : null,
    author,
    authors,
    contributors,
    shortDescription: String(manifest?.details?.shortDescription || runtimePlugin?.details?.shortDescription || ""),
    tags: stringArray(manifest?.details?.tags || runtimePlugin?.details?.tags),
    supportedVersions: stringArray(manifest?.supportedVersions),
    assetCount: editableAssets.length,
    configEntryPoints: editableAssets.map((asset) => asset.relativePath),
    editableAssets,
    unknownCrashWarning,
    longDescription: String(manifest?.details?.longDescription || ""),
    imageUrl: String(manifest?.details?.imageUrl || ""),
    projectUrl: String(manifest?.details?.projectUrl || ""),
    requiredPlugins: stringArray(manifest?.requiredPlugins),
    incompatiblePlugins: stringArray(manifest?.incompatiblePlugins),
    npmDependencies: stringArray(manifest?.npmDependencies),
    missingDependencies,
    missingRequiredPlugins,
    activeIncompatiblePlugins,
    warnings: []
  }

  detail.warnings = buildPluginWarnings(detail)
  return detail
}

function collectDashboardPlugins(projectRoot: string) {
  const runtime = registryState.runtime
  const pluginsDir = path.resolve(projectRoot, "plugins")
  const runtimePlugins = mapRuntimePlugins(runtime)
  const items: DashboardPluginDetail[] = []
  const seenDirectories = new Set<string>()

  for (const entry of safeReaddir(pluginsDir)) {
    if (!entry.isDirectory()) continue
    const directory = entry.name
    const pluginRoot = path.join(pluginsDir, directory)
    const manifest = safeReadJsonRecord(path.join(pluginRoot, "plugin.json"))
    const runtimePlugin = runtimePlugins.byId.get(String(manifest?.id || directory)) || runtimePlugins.byDirectory.get(directory) || null
    items.push(buildDashboardPluginDetail(projectRoot, directory, manifest, runtimePlugin, runtime))
    seenDirectories.add(directory)
  }

  for (const plugin of runtime?.plugins?.getAll?.() || []) {
    const directory = extractRuntimePluginDirectory(plugin)
    if (!directory || seenDirectories.has(directory)) continue
    items.push(buildDashboardPluginDetail(projectRoot, directory, null, plugin, runtime))
  }

  return items.sort((left, right) => left.id.localeCompare(right.id))
}

export function listDashboardPlugins(options: { projectRoot?: string } = {}): DashboardPluginInventoryItem[] {
  const projectRoot = options.projectRoot || process.cwd()
  return collectDashboardPlugins(projectRoot)
}

export function getDashboardPluginDetail(options: { projectRoot?: string; pluginId: string }): DashboardPluginDetail | null {
  const projectRoot = options.projectRoot || process.cwd()
  const requestedId = String(options.pluginId || "").trim()
  if (!requestedId) return null

  return collectDashboardPlugins(projectRoot).find((plugin) => plugin.id === requestedId || plugin.directory === requestedId) || null
}

export function listDashboardTickets(): DashboardTicketRecord[] {
  return Array.from(registryState.ticketStates.values())
    .map((ticket) => ({
      id: ticket.id,
      optionId: ticket.optionId,
      creatorId: ticket.creatorId,
      transportMode: ticket.transportMode,
      channelName: ticket.channelName,
      transportParentChannelId: ticket.transportParentChannelId,
      transportParentMessageId: ticket.transportParentMessageId,
      assignedTeamId: ticket.assignedTeamId,
      assignedStaffUserId: ticket.assignedStaffUserId,
      assignmentStrategy: ticket.assignmentStrategy,
      firstStaffResponseAt: ticket.firstStaffResponseAt,
      resolvedAt: ticket.resolvedAt,
      awaitingUserState: ticket.awaitingUserState,
      awaitingUserSince: ticket.awaitingUserSince,
      closeRequestState: ticket.closeRequestState,
      closeRequestBy: ticket.closeRequestBy,
      closeRequestAt: ticket.closeRequestAt,
      integrationProfileId: ticket.integrationProfileId,
      aiAssistProfileId: ticket.aiAssistProfileId,
      openedOn: ticket.openedOn,
      closedOn: ticket.closedOn,
      reopenedOn: ticket.reopenedOn,
      claimedOn: ticket.claimedOn,
      pinnedOn: ticket.pinnedOn,
      claimedBy: ticket.claimedBy,
      pinnedBy: ticket.pinnedBy,
      open: ticket.open,
      closed: ticket.closed,
      claimed: ticket.claimed,
      pinned: ticket.pinned,
      participantCount: ticket.participantCount,
      categoryMode: ticket.categoryMode,
      channelSuffix: ticket.channelSuffix
    }))
    .sort((left, right) => {
      const leftOpened = left.openedOn || 0
      const rightOpened = right.openedOn || 0
      return rightOpened - leftOpened
    })
}

export function clearDashboardRuntimeRegistry() {
  registryState.runtime = null
  registryState.ticketStates.clear()
  registryState.recentTicketActivity = []
  registryState.ticketLoadInProgress = false
  registryState.ticketListenersAttached = false
  loggedCategoryCapacityWarnings.clear()
}
