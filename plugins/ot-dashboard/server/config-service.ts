import fs from "fs"
import path from "path"

import type { ManagedConfigDefinition, ManagedConfigId } from "./config-registry"
import { getManagedConfig, MANAGED_CONFIGS } from "./config-registry"
import {
  normalizeDashboardPublicBaseUrl,
  type DashboardConfig
} from "./dashboard-config"
import { getTicketPlatformRuntimeApi } from "../../../src/core/api/openticket/ticket-platform"
import {
  assertOneOf,
  EMOJI_STYLES,
  OPTION_BUTTON_COLORS,
  OPTION_CHANNEL_SUFFIXES,
  OPTION_TYPES,
  PANEL_DESCRIBE_LAYOUTS,
  PANEL_DROPDOWN_OPTION_TYPE,
  QUESTION_ID_MAX_LENGTH,
  QUESTION_ID_MIN_LENGTH,
  QUESTION_ID_REGEX,
  QUESTION_LENGTH_MAX,
  QUESTION_LENGTH_MIN,
  QUESTION_NAME_MAX_LENGTH,
  QUESTION_NAME_MIN_LENGTH,
  QUESTION_PLACEHOLDER_MAX_LENGTH,
  QUESTION_TYPES,
  ROLE_MODES,
  STATUS_MODES,
  STATUS_TYPES,
  SUPPORT_TEAM_ASSIGNMENT_STRATEGIES,
  TRANSCRIPT_FILE_MODES,
  TRANSCRIPT_MODES,
  TRANSCRIPT_TEXT_LAYOUTS
} from "./dashboard-contract"

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return patch as T
  }

  if (isPlainObject(base) && isPlainObject(patch)) {
    const output: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      if (isPlainObject(output[key]) && isPlainObject(value)) {
        output[key] = deepMerge(output[key] as Record<string, unknown>, value)
      } else {
        output[key] = value
      }
    }
    return output as T
  }

  return patch as T
}

function slugify(value: string): string {
  return String(value || "item")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item"
}

function ensureNumber(input: unknown, fallback: number): number {
  const parsed = Number(input)
  return Number.isFinite(parsed) ? parsed : fallback
}

function ensureBoolean(input: unknown): boolean {
  return input === true || input === "true" || input === "on" || input === "1"
}

function ensureString(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
}

function generateWorkspaceRecordId(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`
}

const INTEGRATION_SECRET_REDACTION = "__OPEN_TICKET_REDACTED_SECRET__"

interface DashboardTranscriptHtmlStyleDraftShape {
  background: {
    enableCustomBackground: boolean
    backgroundColor: string
    backgroundImage: string
  }
  header: {
    enableCustomHeader: boolean
    backgroundColor: string
    decoColor: string
    textColor: string
  }
  stats: {
    enableCustomStats: boolean
    backgroundColor: string
    keyTextColor: string
    valueTextColor: string
    hideBackgroundColor: string
    hideTextColor: string
  }
  favicon: {
    enableCustomFavicon: boolean
    imageUrl: string
  }
}

const LOCKED_DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE: DashboardTranscriptHtmlStyleDraftShape = {
  background: {
    enableCustomBackground: false,
    backgroundColor: "#313338",
    backgroundImage: ""
  },
  header: {
    enableCustomHeader: false,
    backgroundColor: "#1e1f22",
    decoColor: "#5865f2",
    textColor: "#f2f3f5"
  },
  stats: {
    enableCustomStats: false,
    backgroundColor: "#2b2d31",
    keyTextColor: "#b5bac1",
    valueTextColor: "#f2f3f5",
    hideBackgroundColor: "#404249",
    hideTextColor: "#dbdee1"
  },
  favicon: {
    enableCustomFavicon: false,
    imageUrl: ""
  }
}

function cloneLockedDiscordDefaultTranscriptHtmlStyle(): DashboardTranscriptHtmlStyleDraftShape {
  return {
    background: {
      ...LOCKED_DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE.background
    },
    header: {
      ...LOCKED_DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE.header
    },
    stats: {
      ...LOCKED_DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE.stats
    },
    favicon: {
      ...LOCKED_DISCORD_DEFAULT_TRANSCRIPT_HTML_STYLE.favicon
    }
  }
}

const DISCORD_ROLE_ID_REGEX = /^\d{17,20}$/

type DashboardGeneralFormValidationCode =
  | "GLOBAL_ADMINS_INVALID_JSON"
  | "GLOBAL_ADMINS_NOT_ARRAY"
  | "GLOBAL_ADMINS_NUMBER"
  | "GLOBAL_ADMINS_EMPTY_STRING"
  | "GLOBAL_ADMINS_NON_STRING"
  | "GLOBAL_ADMINS_INVALID_ROLE_ID"

class DashboardGeneralFormValidationError extends Error {
  readonly field: "globalAdmins"
  readonly code: DashboardGeneralFormValidationCode

  constructor(code: DashboardGeneralFormValidationCode, message: string) {
    super(message)
    this.name = "DashboardGeneralFormValidationError"
    this.field = "globalAdmins"
    this.code = code
  }
}

export function isDashboardGeneralFormValidationError(error: unknown): error is DashboardGeneralFormValidationError {
  return error instanceof DashboardGeneralFormValidationError
}

interface DashboardGeneralGlobalAdminsDraftState {
  draftText: string
  normalizedValue: string[]
  mode: "valid" | "legacy_recovered" | "invalid_saved"
}

function stringifyJsonDraft(value: unknown, fallback = "[]"): string {
  const serialized = JSON.stringify(value, null, 2)
  return typeof serialized === "string" ? serialized : fallback
}

function buildGlobalAdminsValidationError(code: DashboardGeneralFormValidationCode) {
  switch (code) {
    case "GLOBAL_ADMINS_INVALID_JSON":
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins must be valid JSON."
      )
    case "GLOBAL_ADMINS_NOT_ARRAY":
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins must be a JSON array of quoted Discord role IDs."
      )
    case "GLOBAL_ADMINS_NUMBER":
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins must use quoted Discord role ID strings, not JSON numbers."
      )
    case "GLOBAL_ADMINS_EMPTY_STRING":
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins cannot contain empty role IDs."
      )
    case "GLOBAL_ADMINS_NON_STRING":
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins must only contain quoted Discord role ID strings."
      )
    case "GLOBAL_ADMINS_INVALID_ROLE_ID":
    default:
      return new DashboardGeneralFormValidationError(
        code,
        "Global admins must only contain Discord role IDs with 17 to 20 digits."
      )
  }
}

function normalizeDiscordRoleIdArray(input: unknown[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const entry of input) {
    if (typeof entry === "number") {
      throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_NUMBER")
    }

    if (typeof entry !== "string") {
      throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_NON_STRING")
    }

    const value = entry.trim()
    if (!value) {
      throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_EMPTY_STRING")
    }

    if (!DISCORD_ROLE_ID_REGEX.test(value)) {
      throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_INVALID_ROLE_ID")
    }

    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function parseGeneralGlobalAdminsInput(input: unknown): string[] {
  if (input == null) {
    return []
  }

  if (Array.isArray(input)) {
    return normalizeDiscordRoleIdArray(input)
  }

  if (typeof input !== "string") {
    throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_INVALID_JSON")
  }

  if (!input.trim()) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch {
    throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_INVALID_JSON")
  }

  if (!Array.isArray(parsed)) {
    throw buildGlobalAdminsValidationError("GLOBAL_ADMINS_NOT_ARRAY")
  }

  return normalizeDiscordRoleIdArray(parsed)
}

function recoverLegacyGlobalAdmins(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length < 3 || !input.every((entry) => typeof entry === "string")) {
    return null
  }

  const lines = input.map((entry) => entry.trim()).filter(Boolean)
  if (lines.length < 3 || lines[0] !== "[" || lines[lines.length - 1] !== "]") {
    return null
  }

  const seen = new Set<string>()
  const recovered: string[] = []

  for (const line of lines.slice(1, -1)) {
    const match = line.match(/^"(\d{17,20})",?$/)
    if (!match) {
      return null
    }

    const value = match[1]
    if (seen.has(value)) {
      continue
    }

    seen.add(value)
    recovered.push(value)
  }

  return recovered.length > 0 ? recovered : null
}

function inspectGeneralGlobalAdminsValue(input: unknown): DashboardGeneralGlobalAdminsDraftState {
  if (input == null) {
    return {
      draftText: "[]",
      normalizedValue: [],
      mode: "valid"
    }
  }

  if (Array.isArray(input)) {
    try {
      const normalizedValue = normalizeDiscordRoleIdArray(input)
      return {
        draftText: stringifyJsonDraft(normalizedValue),
        normalizedValue,
        mode: "valid"
      }
    } catch {
      const recovered = recoverLegacyGlobalAdmins(input)
      if (recovered) {
        return {
          draftText: stringifyJsonDraft(recovered),
          normalizedValue: recovered,
          mode: "legacy_recovered"
        }
      }
    }
  }

  return {
    draftText: stringifyJsonDraft(input, "null"),
    normalizedValue: [],
    mode: "invalid_saved"
  }
}

function parseStringArray(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((item) => String(item))
  if (typeof input === "string" && input.trim().length > 0) {
    try {
      const parsed = JSON.parse(input)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item))
    } catch {
      return input
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function normalizeUniqueStringEntries(input: unknown): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const entry of parseStringArray(input)) {
    const value = String(entry || "").trim()
    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

function normalizeTicketOptionTranscriptRoutingConfig(input: unknown) {
  if (!isPlainObject(input)) {
    return {
      useGlobalDefault: true,
      channels: []
    }
  }

  return {
    useGlobalDefault: typeof input.useGlobalDefault === "boolean"
      ? input.useGlobalDefault
      : true,
    channels: normalizeUniqueStringEntries(input.channels)
  }
}

function normalizeTicketOptionRoutingConfig(input: unknown) {
  if (!isPlainObject(input)) {
    return {
      supportTeamId: "",
      escalationTargetOptionIds: []
    }
  }

  return {
    supportTeamId: ensureString(input.supportTeamId, "").trim(),
    escalationTargetOptionIds: normalizeUniqueStringEntries(input.escalationTargetOptionIds)
  }
}

function normalizeSupportTeam(team: any) {
  const normalized: any = deepMerge(
    {
      id: team.id || slugify(team.name || `support-team-${Date.now()}`),
      name: team.name || "",
      roleIds: [],
      assignmentStrategy: "manual"
    },
    team
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.name = ensureString(normalized.name, "").trim()
  normalized.roleIds = normalizeUniqueStringEntries(normalized.roleIds)
  normalized.assignmentStrategy = ensureString(normalized.assignmentStrategy, "manual")
  assertOneOf(normalized.assignmentStrategy, SUPPORT_TEAM_ASSIGNMENT_STRATEGIES, "Support team assignment strategy")

  if (!normalized.id) {
    throw new Error("Support team ID is required.")
  }
  if (!normalized.name) {
    throw new Error("Support team name is required.")
  }

  return normalized
}

function normalizeTranscriptHtmlStyleDraftInput(
  input: Record<string, unknown>,
  fallback?: Partial<DashboardTranscriptHtmlStyleDraftShape> | null
): DashboardTranscriptHtmlStyleDraftShape {
  void input
  void fallback

  // Legacy theme fields are intentionally ignored so every transcript renders
  // with the locked Discord-default palette.
  return cloneLockedDiscordDefaultTranscriptHtmlStyle()
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`)
  }
}

function normalizeEmbedFields(input: unknown, label: string) {
  if (!Array.isArray(input)) {
    throw new Error(`${label} must be a JSON array of field objects.`)
  }

  return input.map((field, index) => {
    assertPlainObject(field, `${label} item ${index + 1}`)
    const name = ensureString(field.name, "").trim()
    const value = ensureString(field.value, "").trim()
    if (!name || !value) {
      throw new Error(`${label} item ${index + 1} requires both a name and value.`)
    }

    return {
      ...field,
      name,
      value,
      inline: ensureBoolean(field.inline)
    }
  })
}

function normalizeClaimedCategories(input: unknown) {
  if (!Array.isArray(input)) {
    throw new Error("Claimed category mappings must be a JSON array of { user, category } objects.")
  }

  return input.map((entry, index) => {
    assertPlainObject(entry, `Claimed category mapping ${index + 1}`)
    const user = ensureString(entry.user, "").trim()
    const category = ensureString(entry.category, "").trim()

    if (!user || !category) {
      throw new Error(`Claimed category mapping ${index + 1} requires both user and category.`)
    }

    return {
      ...entry,
      user,
      category
    }
  })
}

function validateOptionButton(button: unknown, needsColor: boolean) {
  assertPlainObject(button, "Option button")

  button.emoji = ensureString(button.emoji, "").trim()
  button.label = ensureString(button.label, "").trim()
  if (!button.emoji && !button.label) {
    throw new Error("Option buttons need at least an emoji or a label.")
  }

  if (needsColor) {
    const color = ensureString(button.color, "gray")
    assertOneOf(color, OPTION_BUTTON_COLORS, "Button color")
    button.color = color
  } else if ("color" in button) {
    delete button.color
  }
}

function validateOptionMessage(message: unknown, label: string, includePing: boolean) {
  assertPlainObject(message, label)
  message.enabled = ensureBoolean(message.enabled)
  message.text = ensureString(message.text, "")

  message.embed = message.embed ?? {}
  assertPlainObject(message.embed, `${label} embed`)
  message.embed.enabled = ensureBoolean(message.embed.enabled)
  message.embed.title = ensureString(message.embed.title, "")
  message.embed.description = ensureString(message.embed.description, "")
  message.embed.customColor = ensureString(message.embed.customColor, "")
  message.embed.image = ensureString(message.embed.image, "")
  message.embed.thumbnail = ensureString(message.embed.thumbnail, "")
  message.embed.fields = normalizeEmbedFields(message.embed.fields ?? [], `${label} embed fields`)
  message.embed.timestamp = ensureBoolean(message.embed.timestamp)

  if (includePing) {
    message.ping = message.ping ?? {}
    assertPlainObject(message.ping, `${label} ping`)
    message.ping["@here"] = ensureBoolean(message.ping["@here"])
    message.ping["@everyone"] = ensureBoolean(message.ping["@everyone"])
    message.ping.custom = parseStringArray(message.ping.custom)
  }
}

function normalizeTicketOption(option: any) {
  const defaults: any = {
    ticketAdmins: [],
    readonlyAdmins: [],
    allowCreationByBlacklistedUsers: false,
    questions: [],
    integrationProfileId: "",
    aiAssistProfileId: "",
    channel: {
      prefix: "ticket-",
      suffix: "user-name",
      category: "",
      backupCategory: "",
      closedCategory: "",
      claimedCategory: [],
      topic: ""
    },
    dmMessage: {
      enabled: false,
      text: "",
      embed: {
        enabled: false,
        title: "",
        description: "",
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: false
      }
    },
    ticketMessage: {
      enabled: true,
      text: "",
      embed: {
        enabled: true,
        title: option.name || "Ticket",
        description: option.description || "",
        customColor: "",
        image: "",
        thumbnail: "",
        fields: [],
        timestamp: true
      },
      ping: {
        "@here": false,
        "@everyone": false,
        custom: []
      }
    },
    autoclose: {
      enableInactiveHours: false,
      inactiveHours: 24,
      enableUserLeave: false,
      disableOnClaim: false
    },
    autodelete: {
      enableInactiveDays: false,
      inactiveDays: 7,
      enableUserLeave: false,
      disableOnClaim: false
    },
    cooldown: {
      enabled: false,
      cooldownMinutes: 10
    },
    limits: {
      enabled: false,
      globalMaximum: 20,
      userMaximum: 3
    },
    slowMode: {
      enabled: false,
      slowModeSeconds: 20
    },
    transcripts: {
      useGlobalDefault: true,
      channels: []
    },
    routing: {
      supportTeamId: "",
      escalationTargetOptionIds: []
    },
    workflow: {
      closeRequest: {
        enabled: false
      },
      awaitingUser: {
        enabled: false,
        reminderEnabled: false,
        reminderHours: 24,
        autoCloseEnabled: false,
        autoCloseHours: 72
      }
    }
  }

  const normalized: any = deepMerge(defaults, option)
  validateOptionButton(normalized.button, true)

  normalized.ticketAdmins = parseStringArray(normalized.ticketAdmins)
  normalized.readonlyAdmins = parseStringArray(normalized.readonlyAdmins)
  normalized.questions = parseStringArray(normalized.questions)
  normalized.integrationProfileId = ensureString(normalized.integrationProfileId, "").trim()
  normalized.aiAssistProfileId = ensureString(normalized.aiAssistProfileId, "").trim()
  normalized.allowCreationByBlacklistedUsers = ensureBoolean(normalized.allowCreationByBlacklistedUsers)

  assertPlainObject(normalized.channel, "Ticket channel")
  normalized.channel.prefix = ensureString(normalized.channel.prefix, defaults.channel.prefix)
  normalized.channel.suffix = ensureString(normalized.channel.suffix, defaults.channel.suffix)
  assertOneOf(normalized.channel.suffix, OPTION_CHANNEL_SUFFIXES, "Channel suffix")
  normalized.channel.category = ensureString(normalized.channel.category, "")
  normalized.channel.backupCategory = ensureString(normalized.channel.backupCategory, "")
  normalized.channel.closedCategory = ensureString(normalized.channel.closedCategory, "")
  normalized.channel.claimedCategory = normalizeClaimedCategories(normalized.channel.claimedCategory ?? [])
  normalized.channel.topic = ensureString(normalized.channel.topic, "")

  validateOptionMessage(normalized.dmMessage, "DM message", false)
  validateOptionMessage(normalized.ticketMessage, "Ticket message", true)

  normalized.autoclose.enableInactiveHours = ensureBoolean(normalized.autoclose.enableInactiveHours)
  normalized.autoclose.inactiveHours = ensureNumber(normalized.autoclose.inactiveHours, defaults.autoclose.inactiveHours)
  normalized.autoclose.enableUserLeave = ensureBoolean(normalized.autoclose.enableUserLeave)
  normalized.autoclose.disableOnClaim = ensureBoolean(normalized.autoclose.disableOnClaim)

  normalized.autodelete.enableInactiveDays = ensureBoolean(normalized.autodelete.enableInactiveDays)
  normalized.autodelete.inactiveDays = ensureNumber(normalized.autodelete.inactiveDays, defaults.autodelete.inactiveDays)
  normalized.autodelete.enableUserLeave = ensureBoolean(normalized.autodelete.enableUserLeave)
  normalized.autodelete.disableOnClaim = ensureBoolean(normalized.autodelete.disableOnClaim)

  normalized.cooldown.enabled = ensureBoolean(normalized.cooldown.enabled)
  normalized.cooldown.cooldownMinutes = ensureNumber(normalized.cooldown.cooldownMinutes, defaults.cooldown.cooldownMinutes)

  normalized.limits.enabled = ensureBoolean(normalized.limits.enabled)
  normalized.limits.globalMaximum = ensureNumber(normalized.limits.globalMaximum, defaults.limits.globalMaximum)
  normalized.limits.userMaximum = ensureNumber(normalized.limits.userMaximum, defaults.limits.userMaximum)

  normalized.slowMode.enabled = ensureBoolean(normalized.slowMode.enabled)
  normalized.slowMode.slowModeSeconds = ensureNumber(normalized.slowMode.slowModeSeconds, defaults.slowMode.slowModeSeconds)
  normalized.transcripts = normalizeTicketOptionTranscriptRoutingConfig(normalized.transcripts)
  normalized.routing = normalizeTicketOptionRoutingConfig(normalized.routing)
  assertPlainObject(normalized.workflow, "Ticket workflow")
  assertPlainObject(normalized.workflow.closeRequest, "Ticket close request workflow")
  assertPlainObject(normalized.workflow.awaitingUser, "Ticket awaiting-user workflow")
  normalized.workflow.closeRequest.enabled = ensureBoolean(normalized.workflow.closeRequest.enabled)
  normalized.workflow.awaitingUser.enabled = ensureBoolean(normalized.workflow.awaitingUser.enabled)
  normalized.workflow.awaitingUser.reminderEnabled = ensureBoolean(normalized.workflow.awaitingUser.reminderEnabled)
  normalized.workflow.awaitingUser.reminderHours = ensureNumber(normalized.workflow.awaitingUser.reminderHours, defaults.workflow.awaitingUser.reminderHours)
  normalized.workflow.awaitingUser.autoCloseEnabled = ensureBoolean(normalized.workflow.awaitingUser.autoCloseEnabled)
  normalized.workflow.awaitingUser.autoCloseHours = ensureNumber(normalized.workflow.awaitingUser.autoCloseHours, defaults.workflow.awaitingUser.autoCloseHours)
  if (normalized.workflow.awaitingUser.reminderHours <= 0 || normalized.workflow.awaitingUser.autoCloseHours <= 0) {
    throw new Error("Ticket workflow reminder and timeout hours must be positive.")
  }
  if (
    normalized.workflow.awaitingUser.reminderEnabled
    && normalized.workflow.awaitingUser.autoCloseEnabled
    && normalized.workflow.awaitingUser.autoCloseHours <= normalized.workflow.awaitingUser.reminderHours
  ) {
    throw new Error("Ticket workflow autoCloseHours must be greater than reminderHours when both settings are enabled.")
  }

  return normalized
}

function normalizeIntegrationProfile(profile: any) {
  const normalized: any = deepMerge(
    {
      id: profile.id || slugify(profile.label || `integration-profile-${Date.now()}`),
      providerId: "",
      label: profile.label || "",
      enabled: true,
      settings: {}
    },
    profile
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.providerId = ensureString(normalized.providerId, "").trim()
  normalized.label = ensureString(normalized.label, "").trim() || normalized.id
  normalized.enabled = ensureBoolean(normalized.enabled)
  normalized.settings = isPlainObject(normalized.settings) ? normalized.settings : {}

  if (!normalized.id) {
    throw new Error("Integration profile ID is required.")
  }
  if (!normalized.providerId) {
    throw new Error("Integration profile providerId is required.")
  }

  return normalized
}

const SECRET_SHAPED_KEY_REGEX = /secret|token|password|api[_-]?key|authorization|credential|bearer/i

function assertNoSecretShapedSettings(settings: Record<string, unknown>, label: string) {
  const secretKey = Object.keys(settings).find((key) => SECRET_SHAPED_KEY_REGEX.test(key))
  if (secretKey) {
    throw new Error(`${label} settings must not contain secret-shaped key "${secretKey}". Use host environment variables for provider secrets.`)
  }
}

function normalizeAiAssistContext(context: any) {
  const normalized = isPlainObject(context) ? context : {}
  const maxRecentMessages = Math.floor(ensureNumber(normalized.maxRecentMessages, 40))
  return {
    maxRecentMessages: Math.min(100, Math.max(10, maxRecentMessages)),
    includeTicketMetadata: normalized.includeTicketMetadata !== false,
    includeParticipants: normalized.includeParticipants !== false,
    includeManagedFormSnapshot: normalized.includeManagedFormSnapshot !== false,
    includeBotMessages: ensureBoolean(normalized.includeBotMessages)
  }
}

function normalizeAiAssistProfile(profile: any) {
  const normalized: any = deepMerge(
    {
      id: profile.id || slugify(profile.label || `ai-assist-profile-${Date.now()}`),
      providerId: "reference",
      label: profile.label || "",
      enabled: false,
      knowledgeSourceIds: [],
      context: {
        maxRecentMessages: 40,
        includeTicketMetadata: true,
        includeParticipants: true,
        includeManagedFormSnapshot: true,
        includeBotMessages: false
      },
      settings: {}
    },
    profile
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.providerId = ensureString(normalized.providerId, "").trim()
  normalized.label = ensureString(normalized.label, "").trim() || normalized.id
  normalized.enabled = ensureBoolean(normalized.enabled)
  normalized.knowledgeSourceIds = normalizeUniqueStringEntries(normalized.knowledgeSourceIds)
  normalized.context = normalizeAiAssistContext(normalized.context)
  normalized.settings = isPlainObject(normalized.settings) ? normalized.settings : {}
  assertNoSecretShapedSettings(normalized.settings, "AI assist profile")

  if (!normalized.id) {
    throw new Error("AI assist profile ID is required.")
  }
  if (!normalized.providerId) {
    throw new Error("AI assist profile providerId is required.")
  }

  return normalized
}

function normalizeKnowledgeSourcePath(sourcePath: string, projectRoot: string) {
  const normalized = ensureString(sourcePath, "").trim().replace(/\\/g, "/")
  if (!normalized) throw new Error("Knowledge source path is required.")
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new Error("Knowledge sources must be local files, not URLs.")
  }
  if (path.isAbsolute(normalized)) {
    throw new Error("Knowledge source paths must be relative.")
  }
  if (normalized.split("/").includes("..")) {
    throw new Error("Knowledge source paths may not contain '..'.")
  }
  if (!(normalized.startsWith("knowledge/") || normalized.startsWith(".docs/"))) {
    throw new Error("Knowledge source paths must stay under knowledge/ or .docs/.")
  }

  const absolutePath = path.resolve(projectRoot, normalized)
  const allowedRoots = [path.resolve(projectRoot, "knowledge"), path.resolve(projectRoot, ".docs")]
  if (!allowedRoots.some((root) => absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`))) {
    throw new Error("Knowledge source paths must stay under knowledge/ or .docs/.")
  }

  if (fs.existsSync(absolutePath)) {
    const stats = fs.lstatSync(absolutePath)
    if (stats.isSymbolicLink()) {
      throw new Error("Knowledge source files may not be symbolic links.")
    }
    const realPath = fs.realpathSync(absolutePath)
    const realAllowedRoots = allowedRoots.map((root) => fs.existsSync(root) ? fs.realpathSync(root) : root)
    if (!realAllowedRoots.some((root) => realPath === root || realPath.startsWith(`${root}${path.sep}`))) {
      throw new Error("Knowledge source files may not escape knowledge/ or .docs/.")
    }
  }

  return normalized
}

function normalizeKnowledgeSource(source: any, projectRoot: string) {
  const normalized: any = deepMerge(
    {
      id: source.id || slugify(source.label || `knowledge-source-${Date.now()}`),
      label: source.label || "",
      kind: source.kind || "markdown-file",
      path: source.path || "knowledge/example.md",
      enabled: false
    },
    source
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.label = ensureString(normalized.label, "").trim() || normalized.id
  normalized.kind = ensureString(normalized.kind, "markdown-file")
  assertOneOf(normalized.kind, ["markdown-file", "faq-json"], "Knowledge source kind")
  normalized.path = normalizeKnowledgeSourcePath(normalized.path, projectRoot)
  normalized.enabled = ensureBoolean(normalized.enabled)

  if (!normalized.id) {
    throw new Error("Knowledge source ID is required.")
  }

  return normalized
}

function validateFaqKnowledgeRecord(record: any, index: number): string | null {
  if (!isPlainObject(record)) return `FAQ knowledge entry ${index + 1} must be an object.`
  if (!ensureString(record.id, "").trim()) return `FAQ knowledge entry ${index + 1} must include an id.`
  if (!ensureString(record.question, "").trim()) return `FAQ knowledge entry ${index + 1} must include a question.`
  if (!ensureString(record.answer, "").trim()) return `FAQ knowledge entry ${index + 1} must include an answer.`
  if (record.aliases !== undefined && (!Array.isArray(record.aliases) || record.aliases.some((alias: any) => typeof alias !== "string"))) {
    return `FAQ knowledge entry ${index + 1} aliases must be strings.`
  }
  return null
}

function validateKnowledgeSourceContent(source: any, projectRoot: string) {
  if (source.kind !== "faq-json" || source.enabled !== true) return
  const filePath = path.resolve(projectRoot, source.path)
  if (!fs.existsSync(filePath)) return

  let parsed: any
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    throw new Error(`FAQ knowledge source "${source.id}" must contain valid JSON.`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`FAQ knowledge source "${source.id}" must contain an array of records.`)
  }

  for (let index = 0; index < parsed.length; index += 1) {
    const error = validateFaqKnowledgeRecord(parsed[index], index)
    if (error) throw new Error(error)
  }
}

function normalizeRoleOption(option: any) {
  const normalized: any = deepMerge(
    {
      roles: [],
      mode: "add",
      removeRolesOnAdd: [],
      addOnMemberJoin: false
    },
    option
  )

  validateOptionButton(normalized.button, true)
  normalized.roles = parseStringArray(normalized.roles)
  normalized.mode = ensureString(normalized.mode, "add")
  assertOneOf(normalized.mode, ROLE_MODES, "Role mode")
  normalized.removeRolesOnAdd = parseStringArray(normalized.removeRolesOnAdd)
  normalized.addOnMemberJoin = ensureBoolean(normalized.addOnMemberJoin)
  delete normalized.transcripts
  delete normalized.routing
  delete normalized.workflow
  delete normalized.integrationProfileId
  delete normalized.aiAssistProfileId

  return normalized
}

function normalizeWebsiteOption(option: any) {
  const normalized: any = deepMerge(
    {
      url: ""
    },
    option
  )

  validateOptionButton(normalized.button, false)
  normalized.url = ensureString(normalized.url, "")
  delete normalized.transcripts
  delete normalized.routing
  delete normalized.workflow
  delete normalized.integrationProfileId
  delete normalized.aiAssistProfileId

  return normalized
}

function normalizeOption(option: any) {
  const base: any = deepMerge(
    {
      id: option.id || slugify(option.name || `${option.type || "option"}-${Date.now()}`),
      name: option.name || "",
      description: option.description || "",
      type: option.type || "ticket",
      button: {
        emoji: option.button?.emoji || "",
        label: option.button?.label || option.name || option.id || "Option"
      }
    },
    option
  )

  base.id = ensureString(base.id, "").trim()
  base.name = ensureString(base.name, "").trim()
  base.description = ensureString(base.description, "")
  base.type = ensureString(base.type, "ticket")
  assertOneOf(base.type, OPTION_TYPES, "Option type")

  if (base.type === "ticket") return normalizeTicketOption(base)
  if (base.type === "role") return normalizeRoleOption(base)
  if (base.type === "website") return normalizeWebsiteOption(base)
  return base
}

function normalizePanel(panel: any) {
  const normalized: any = deepMerge(
    {
      id: panel.id || slugify(panel.name || `panel-${Date.now()}`),
      name: panel.name || "",
      dropdown: false,
      options: [],
      text: "",
      embed: {
        enabled: true,
        title: panel.name || "",
        description: "",
        customColor: "",
        url: "",
        image: "",
        thumbnail: "",
        footer: "",
        fields: [],
        timestamp: false
      },
      settings: {
        dropdownPlaceholder: "",
        enableMaxTicketsWarningInText: false,
        enableMaxTicketsWarningInEmbed: true,
        describeOptionsLayout: "normal",
        describeOptionsCustomTitle: "",
        describeOptionsInText: false,
        describeOptionsInEmbedFields: true,
        describeOptionsInEmbedDescription: false
      }
    },
    panel
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.name = ensureString(normalized.name, "").trim()
  normalized.dropdown = ensureBoolean(normalized.dropdown)
  normalized.options = parseStringArray(normalized.options)

  assertPlainObject(normalized.settings, "Panel settings")
  normalized.settings.dropdownPlaceholder = ensureString(normalized.settings.dropdownPlaceholder, "")
  normalized.settings.describeOptionsLayout = ensureString(normalized.settings.describeOptionsLayout, "normal")
  assertOneOf(normalized.settings.describeOptionsLayout, PANEL_DESCRIBE_LAYOUTS, "Options description layout")
  normalized.settings.describeOptionsCustomTitle = ensureString(normalized.settings.describeOptionsCustomTitle, "")
  normalized.settings.enableMaxTicketsWarningInText = ensureBoolean(normalized.settings.enableMaxTicketsWarningInText)
  normalized.settings.enableMaxTicketsWarningInEmbed = ensureBoolean(normalized.settings.enableMaxTicketsWarningInEmbed)
  normalized.settings.describeOptionsInText = ensureBoolean(normalized.settings.describeOptionsInText)
  normalized.settings.describeOptionsInEmbedFields = ensureBoolean(normalized.settings.describeOptionsInEmbedFields)
  normalized.settings.describeOptionsInEmbedDescription = ensureBoolean(normalized.settings.describeOptionsInEmbedDescription)

  return normalized
}

function normalizeQuestion(question: any) {
  const normalized: any = deepMerge(
    {
      id: question.id || slugify(question.name || `question-${Date.now()}`),
      name: question.name || "",
      type: question.type || "short",
      required: true,
      placeholder: "",
      length: {
        enabled: false,
        min: 0,
        max: 1000
      }
    },
    question
  )

  normalized.id = ensureString(normalized.id, "").trim()
  normalized.name = ensureString(normalized.name, "").trim()
  normalized.type = ensureString(normalized.type, "short")
  normalized.required = ensureBoolean(normalized.required)
  normalized.placeholder = ensureString(normalized.placeholder, "").trim()

  assertOneOf(normalized.type, QUESTION_TYPES, "Question type")

  if (normalized.id.length < QUESTION_ID_MIN_LENGTH || normalized.id.length > QUESTION_ID_MAX_LENGTH) {
    throw new Error(`Question IDs must be between ${QUESTION_ID_MIN_LENGTH} and ${QUESTION_ID_MAX_LENGTH} characters.`)
  }
  if (!QUESTION_ID_REGEX.test(normalized.id)) {
    throw new Error("Question IDs may only contain letters, numbers, and supported accented characters.")
  }
  if (normalized.name.length < QUESTION_NAME_MIN_LENGTH || normalized.name.length > QUESTION_NAME_MAX_LENGTH) {
    throw new Error(`Question names must be between ${QUESTION_NAME_MIN_LENGTH} and ${QUESTION_NAME_MAX_LENGTH} characters.`)
  }
  if (normalized.placeholder.length > QUESTION_PLACEHOLDER_MAX_LENGTH) {
    throw new Error(`Question placeholders must be at most ${QUESTION_PLACEHOLDER_MAX_LENGTH} characters.`)
  }

  assertPlainObject(normalized.length, "Question length settings")
  normalized.length.enabled = ensureBoolean(normalized.length.enabled)
  normalized.length.min = ensureNumber(normalized.length.min, QUESTION_LENGTH_MIN)
  normalized.length.max = ensureNumber(normalized.length.max, 1000)

  if (normalized.length.min < QUESTION_LENGTH_MIN || normalized.length.min > QUESTION_LENGTH_MAX) {
    throw new Error(`Question minimum length must be between ${QUESTION_LENGTH_MIN} and ${QUESTION_LENGTH_MAX}.`)
  }
  if (normalized.length.max < 1 || normalized.length.max > QUESTION_LENGTH_MAX) {
    throw new Error(`Question maximum length must be between 1 and ${QUESTION_LENGTH_MAX}.`)
  }
  if (normalized.length.min > normalized.length.max) {
    throw new Error("Question minimum length cannot exceed the maximum length.")
  }

  return normalized
}

export interface DashboardReferenceItem {
  id: string
  name: string
  index: number
  type?: string
}

export interface DashboardEditorDependencyGraph {
  optionPanels: Record<string, DashboardReferenceItem[]>
  questionOptions: Record<string, DashboardReferenceItem[]>
  supportTeamOptions: Record<string, DashboardReferenceItem[]>
  integrationProfileOptions: Record<string, DashboardReferenceItem[]>
  aiAssistProfileOptions: Record<string, DashboardReferenceItem[]>
  knowledgeSourceProfiles: Record<string, DashboardReferenceItem[]>
}

export class DashboardConfigOperationError extends Error {
  code: string
  guidance: string
  references: DashboardReferenceItem[]
  statusCode: number

  constructor(
    message: string,
    code: string,
    guidance = "",
    references: DashboardReferenceItem[] = [],
    statusCode = 409
  ) {
    super(message)
    this.name = "DashboardConfigOperationError"
    this.code = code
    this.guidance = guidance
    this.references = references
    this.statusCode = statusCode
  }
}

export function isDashboardConfigOperationError(error: unknown): error is DashboardConfigOperationError {
  return error instanceof DashboardConfigOperationError
}

function buildOptionPanelReferences(panels: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  panels.forEach((panel, index) => {
    const reference = {
      id: String(panel.id || `panel-${index + 1}`),
      name: String(panel.name || panel.id || `Panel ${index + 1}`),
      index
    }

    parseStringArray(panel.options).forEach((optionId) => {
      const key = String(optionId)
      references[key] = references[key] || []
      references[key].push(reference)
    })
  })

  return references
}

function buildQuestionOptionReferences(options: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  options.forEach((option, index) => {
    const reference = {
      id: String(option.id || `option-${index + 1}`),
      name: String(option.name || option.id || `Option ${index + 1}`),
      index,
      type: String(option.type || "")
    }

    parseStringArray(option.questions).forEach((questionId) => {
      const key = String(questionId)
      references[key] = references[key] || []
      references[key].push(reference)
    })
  })

  return references
}

function buildSupportTeamOptionReferences(options: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  options.forEach((option, index) => {
    if (option?.type !== "ticket") return
    const supportTeamId = ensureString(option.routing?.supportTeamId, "").trim()
    if (!supportTeamId) return

    const reference = {
      id: String(option.id || `option-${index + 1}`),
      name: String(option.name || option.id || `Option ${index + 1}`),
      index,
      type: String(option.type || "")
    }

    references[supportTeamId] = references[supportTeamId] || []
    references[supportTeamId].push(reference)
  })

  return references
}

function buildIntegrationProfileOptionReferences(options: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  options.forEach((option, index) => {
    if (option?.type !== "ticket") return
    const integrationProfileId = ensureString(option.integrationProfileId, "").trim()
    if (!integrationProfileId) return

    const reference = {
      id: String(option.id || `option-${index + 1}`),
      name: String(option.name || option.id || `Option ${index + 1}`),
      index,
      type: String(option.type || "")
    }

    references[integrationProfileId] = references[integrationProfileId] || []
    references[integrationProfileId].push(reference)
  })

  return references
}

function buildAiAssistProfileOptionReferences(options: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  options.forEach((option, index) => {
    if (option?.type !== "ticket") return
    const aiAssistProfileId = ensureString(option.aiAssistProfileId, "").trim()
    if (!aiAssistProfileId) return

    const reference = {
      id: String(option.id || `option-${index + 1}`),
      name: String(option.name || option.id || `Option ${index + 1}`),
      index,
      type: String(option.type || "")
    }

    references[aiAssistProfileId] = references[aiAssistProfileId] || []
    references[aiAssistProfileId].push(reference)
  })

  return references
}

function buildKnowledgeSourceProfileReferences(profiles: any[]): Record<string, DashboardReferenceItem[]> {
  const references: Record<string, DashboardReferenceItem[]> = {}

  profiles.forEach((profile, index) => {
    normalizeUniqueStringEntries(profile?.knowledgeSourceIds).forEach((sourceId) => {
      const reference = {
        id: String(profile.id || `profile-${index + 1}`),
        name: String(profile.label || profile.id || `Profile ${index + 1}`),
        index,
        type: "ai-assist-profile"
      }

      references[sourceId] = references[sourceId] || []
      references[sourceId].push(reference)
    })
  })

  return references
}

function buildDuplicateIdError(kind: "option" | "panel" | "question" | "support team" | "integration profile" | "AI assist profile" | "knowledge source", duplicateId: string) {
  const codeKind = kind.toUpperCase().replace(/\s+/g, "_")
  return new DashboardConfigOperationError(
    `${kind[0].toUpperCase()}${kind.slice(1)} ID "${duplicateId}" already exists.`,
    `${codeKind}_DUPLICATE_ID`,
    `Choose a different ${kind} ID before saving.`
  )
}

function buildReferenceGuardError(
  kind: "option" | "question" | "support team" | "integration profile" | "AI assist profile" | "knowledge source",
  action: "delete" | "rename",
  currentId: string,
  references: DashboardReferenceItem[],
  nextId = ""
) {
  const labels = references.map((reference) => `${reference.name} (${reference.id})`).join(", ")
  const targetLabel = kind === "option"
    ? "panels"
    : kind === "knowledge source"
      ? "AI assist profiles"
      : "options"
  const actionText = action === "delete"
    ? `delete ${kind} "${currentId}"`
    : `change ${kind} "${currentId}" to "${nextId}"`

  return new DashboardConfigOperationError(
    `Cannot ${actionText} because these ${targetLabel} still reference it: ${labels}.`,
    `${kind.toUpperCase().replace(/\s+/g, "_")}_${action.toUpperCase()}_BLOCKED`,
    kind === "option"
      ? "Remove this option from the listed panels first, then try again."
      : kind === "question"
          ? "Remove this question from the listed options first, then try again."
          : kind === "support team"
            ? "Remove this support team from the listed ticket option routes first, then try again."
            : kind === "knowledge source"
              ? "Remove this knowledge source from the listed AI assist profiles first, then try again."
              : kind === "AI assist profile"
                ? "Remove this AI assist profile from the listed ticket options first, then try again."
                : "Remove this integration profile from the listed ticket options first, then try again.",
    references
  )
}

export interface DashboardConfigService {
  projectRoot: string
  configDir: string
  dashboardPluginRoot: string
  definitions: ManagedConfigDefinition[]
  getFilePath: (id: ManagedConfigId) => string
  readManagedText: (id: ManagedConfigId) => string
  readManagedBackupText: (id: ManagedConfigId) => string
  readManagedJson: <T>(id: ManagedConfigId) => T
  writeManagedJson: (id: ManagedConfigId, value: unknown) => void
  prettifyText: (text: string) => string
  saveRawJson: (id: ManagedConfigId, text: string) => unknown
  listAvailableLanguages: () => string[]
  getAvailableOptions: () => Array<{ id: string; name: string; emoji: string; type: string; description: string }>
  listAvailableQuestions: () => Array<{ id: string; name: string; type: string; required: boolean }>
  listAvailableSupportTeams: () => Array<{ id: string; name: string; roleIds: string[]; assignmentStrategy: string }>
  listAvailableIntegrationProfiles: () => Array<{ id: string; providerId: string; label: string; enabled: boolean }>
  listAvailableAiAssistProfiles: () => Array<{ id: string; providerId: string; label: string; enabled: boolean }>
  getEditorDependencyGraph: () => DashboardEditorDependencyGraph
  normalizeGeneralDraft: (body: Record<string, unknown>, fallback?: Record<string, unknown> | null) => Record<string, unknown>
  inspectGeneralGlobalAdmins: (input: unknown) => DashboardGeneralGlobalAdminsDraftState
  saveGeneralForm: (body: Record<string, unknown>) => Record<string, unknown>
  normalizeTranscriptHtmlStyleDraft: (
    body: Record<string, unknown>,
    fallback?: Partial<DashboardTranscriptHtmlStyleDraftShape> | null
  ) => DashboardTranscriptHtmlStyleDraftShape
  saveTranscriptsForm: (body: Record<string, unknown>) => Record<string, unknown>
  saveOption: (option: Record<string, unknown>, editIndex: number) => { success: true; id: string; action: "created" | "updated"; count: number; item: Record<string, unknown>; index: number }
  savePanel: (panel: Record<string, unknown>, editIndex: number) => { success: true; id: string; action: "created" | "updated"; count: number; item: Record<string, unknown>; index: number }
  saveQuestion: (question: Record<string, unknown>, editIndex: number) => { success: true; id: string; action: "created" | "updated"; count: number; item: Record<string, unknown>; index: number }
  saveSupportTeam: (team: Record<string, unknown>, editIndex: number) => { success: true; id: string; action: "created" | "updated"; count: number; item: Record<string, unknown>; index: number }
  reorderArrayItems: (
    id: Extract<ManagedConfigId, "options" | "panels" | "questions" | "support-teams" | "integration-profiles" | "ai-assist-profiles" | "knowledge-sources">,
    orderedIds: string[]
  ) => { success: true; count: number; orderedIds: string[]; items: Record<string, unknown>[] }
  deleteArrayItem: (
    id: Extract<ManagedConfigId, "options" | "panels" | "questions" | "support-teams" | "integration-profiles" | "ai-assist-profiles" | "knowledge-sources">,
    index: number
  ) => { success: true; count: number; removedId: string; items: Record<string, unknown>[] }
  readDashboardPluginConfig: () => Partial<DashboardConfig>
  saveDashboardSecuritySettings: (
    liveConfig: DashboardConfig,
    body: Record<string, unknown>,
    actor: {
      userId: string
      username: string
      globalName?: string | null
    },
    options?: {
      runtimeBackupId?: string | null
    }
  ) => {
    backupId: string
    auditId: string
    auditFilePath: string
    changedPaths: string[]
    configPath: string
  }
}

export function createConfigService(
  projectRoot: string,
  dashboardPluginRoot = path.resolve(projectRoot, "plugins", "ot-dashboard")
): DashboardConfigService {
  const configDir = path.resolve(projectRoot, "config")
  const dashboardConfigPath = path.join(dashboardPluginRoot, "config.json")
  const dashboardSecurityRuntimeDir = path.resolve(projectRoot, "runtime", "ot-dashboard", "security")
  const dashboardSecurityBackupDir = path.join(dashboardSecurityRuntimeDir, "backups")
  const dashboardSecurityAuditPath = path.join(dashboardSecurityRuntimeDir, "audit.jsonl")

  const getFilePath = (id: ManagedConfigId): string => {
    const definition = getManagedConfig(id)
    if (!definition) {
      throw new Error(`Unknown config id: ${id}`)
    }

    return path.join(configDir, definition.fileName)
  }

  const readManagedText = (id: ManagedConfigId): string => {
    const filePath = getFilePath(id)
    if (
      (
        id === "support-teams"
        || id === "integration-profiles"
        || id === "ai-assist-profiles"
        || id === "knowledge-sources"
      )
      && !fs.existsSync(filePath)
    ) {
      return "[]\n"
    }
    return fs.readFileSync(filePath, "utf8")
  }

  const readManagedJson = <T>(id: ManagedConfigId): T => {
    return JSON.parse(readManagedText(id)) as T
  }

  const integrationProviderSecretKeys = (providerId: string): string[] => {
    const provider = getTicketPlatformRuntimeApi()?.getIntegrationProvider(providerId) ?? null
    return Array.isArray(provider?.secretSettingKeys)
      ? provider.secretSettingKeys.map((key) => String(key || "").trim()).filter(Boolean)
      : []
  }

  const redactIntegrationProfileSecrets = (profiles: unknown): unknown => {
    if (!Array.isArray(profiles)) return profiles
    return profiles.map((entry) => {
      const profile = normalizeIntegrationProfile(entry)
      const secretKeys = integrationProviderSecretKeys(profile.providerId)
      for (const key of secretKeys) {
        if (Object.prototype.hasOwnProperty.call(profile.settings, key)) {
          profile.settings[key] = INTEGRATION_SECRET_REDACTION
        }
      }
      return profile
    })
  }

  const mergeRedactedIntegrationProfileSecrets = (profiles: unknown): unknown => {
    if (!Array.isArray(profiles)) return profiles
    let currentProfiles: any[] = []
    try {
      currentProfiles = readManagedJson<any[]>("integration-profiles")
    } catch {
      currentProfiles = []
    }
    const currentById = new Map(currentProfiles.map((profile) => [String(profile?.id || ""), profile]))
    return profiles.map((entry) => {
      const profile = normalizeIntegrationProfile(entry)
      const current = currentById.get(profile.id)
      const currentSettings = isPlainObject(current?.settings) ? current.settings : {}
      for (const key of integrationProviderSecretKeys(profile.providerId)) {
        if (profile.settings[key] === INTEGRATION_SECRET_REDACTION && Object.prototype.hasOwnProperty.call(currentSettings, key)) {
          profile.settings[key] = currentSettings[key]
        }
      }
      return profile
    })
  }

  const readManagedBackupText = (id: ManagedConfigId): string => {
    if (id === "ai-assist-profiles") {
      return JSON.stringify(readManagedJson<any[]>("ai-assist-profiles").map(normalizeAiAssistProfile), null, 2) + "\n"
    }
    if (id === "knowledge-sources") {
      return JSON.stringify(readManagedJson<any[]>("knowledge-sources").map((source) => normalizeKnowledgeSource(source, projectRoot)), null, 2) + "\n"
    }
    if (id !== "integration-profiles") return readManagedText(id)
    return JSON.stringify(redactIntegrationProfileSecrets(readManagedJson<unknown>("integration-profiles")), null, 2) + "\n"
  }

  const writeManagedJson = (id: ManagedConfigId, value: unknown): void => {
    const filePath = getFilePath(id)
    const tempPath = `${filePath}.tmp`
    const writableValue = id === "integration-profiles"
      ? mergeRedactedIntegrationProfileSecrets(value)
      : id === "ai-assist-profiles"
        ? Array.isArray(value) ? value.map(normalizeAiAssistProfile) : value
        : id === "knowledge-sources"
          ? Array.isArray(value) ? value.map((source) => normalizeKnowledgeSource(source, projectRoot)) : value
          : value
    fs.writeFileSync(tempPath, JSON.stringify(writableValue, null, 2) + "\n", "utf8")
    fs.renameSync(tempPath, filePath)
  }

  const prettifyText = (text: string): string => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  const saveRawJson = (id: ManagedConfigId, text: string): unknown => {
    const parsed = JSON.parse(text)
    if (id === "support-teams") {
      if (!Array.isArray(parsed)) {
        throw new Error("support-teams.json must be an array.")
      }
      const nextIds = new Set(parsed.map((team: any) => String(team?.id || "").trim()).filter(Boolean))
      const references = buildSupportTeamOptionReferences(readManagedJson<any[]>("options"))
      for (const current of readManagedJson<any[]>("support-teams")) {
        const currentId = String(current?.id || "").trim()
        if (!currentId || nextIds.has(currentId)) continue
        const currentReferences = references[currentId] || []
        if (currentReferences.length > 0) {
          throw buildReferenceGuardError("support team", "delete", currentId, currentReferences)
        }
      }
    }
    if (id === "integration-profiles") {
      if (!Array.isArray(parsed)) {
        throw new Error("integration-profiles.json must be an array.")
      }
      const nextIds = new Set(parsed.map((profile: any) => String(profile?.id || "").trim()).filter(Boolean))
      const references = buildIntegrationProfileOptionReferences(readManagedJson<any[]>("options"))
      for (const current of readManagedJson<any[]>("integration-profiles")) {
        const currentId = String(current?.id || "").trim()
        if (!currentId || nextIds.has(currentId)) continue
        const currentReferences = references[currentId] || []
        if (currentReferences.length > 0) {
          throw buildReferenceGuardError("integration profile", "delete", currentId, currentReferences)
        }
      }
      const normalized = parsed.map(normalizeIntegrationProfile)
      writeManagedJson(id, normalized)
      return normalized
    }
    if (id === "ai-assist-profiles") {
      if (!Array.isArray(parsed)) {
        throw new Error("ai-assist-profiles.json must be an array.")
      }
      const nextIds = new Set(parsed.map((profile: any) => String(profile?.id || "").trim()).filter(Boolean))
      const references = buildAiAssistProfileOptionReferences(readManagedJson<any[]>("options"))
      for (const current of readManagedJson<any[]>("ai-assist-profiles")) {
        const currentId = String(current?.id || "").trim()
        if (!currentId || nextIds.has(currentId)) continue
        const currentReferences = references[currentId] || []
        if (currentReferences.length > 0) {
          throw buildReferenceGuardError("AI assist profile", "delete", currentId, currentReferences)
        }
      }
      const normalized = parsed.map(normalizeAiAssistProfile)
      validateAiAssistProfileKnowledgeReferences(normalized)
      writeManagedJson(id, normalized)
      return normalized
    }
    if (id === "knowledge-sources") {
      if (!Array.isArray(parsed)) {
        throw new Error("knowledge-sources.json must be an array.")
      }
      const nextIds = new Set(parsed.map((source: any) => String(source?.id || "").trim()).filter(Boolean))
      const references = buildKnowledgeSourceProfileReferences(readManagedJson<any[]>("ai-assist-profiles"))
      for (const current of readManagedJson<any[]>("knowledge-sources")) {
        const currentId = String(current?.id || "").trim()
        if (!currentId || nextIds.has(currentId)) continue
        const currentReferences = references[currentId] || []
        if (currentReferences.length > 0) {
          throw buildReferenceGuardError("knowledge source", "delete", currentId, currentReferences)
        }
      }
      const normalized = parsed.map((source: any) => normalizeKnowledgeSource(source, projectRoot))
      normalized.forEach((source: any) => validateKnowledgeSourceContent(source, projectRoot))
      writeManagedJson(id, normalized)
      return normalized
    }
    if (id === "options") {
      if (!Array.isArray(parsed)) {
        throw new Error("options.json must be an array.")
      }
      const normalized = parsed.map(normalizeOption)
      validateOptionRoutingReferences(normalized)
      validateOptionIntegrationReferences(normalized)
      validateOptionAiAssistReferences(normalized)
      writeManagedJson(id, normalized)
      return normalized
    }
    writeManagedJson(id, parsed)
    return parsed
  }

  const readDashboardPluginConfig = (): Partial<DashboardConfig> => {
    if (!fs.existsSync(dashboardConfigPath)) {
      return {}
    }

    return JSON.parse(fs.readFileSync(dashboardConfigPath, "utf8")) as Partial<DashboardConfig>
  }

  const writeDashboardPluginConfig = (value: unknown) => {
    ensureDirectory(path.dirname(dashboardConfigPath))
    const tempPath = `${dashboardConfigPath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8")
    fs.renameSync(tempPath, dashboardConfigPath)
  }

  const normalizeSecurityStringList = (value: unknown) => normalizeUniqueStringEntries(value)

  const normalizeSecuritySnapshot = (value: Partial<DashboardConfig>) => ({
    publicBaseUrl: normalizeDashboardPublicBaseUrl(value.publicBaseUrl),
    viewerPublicBaseUrl: normalizeDashboardPublicBaseUrl(value.viewerPublicBaseUrl),
    trustProxyHops: Number.isFinite(Number(value.trustProxyHops)) && Number(value.trustProxyHops) >= 0
      ? Math.floor(Number(value.trustProxyHops))
      : 0,
    auth: {
      breakglass: {
        enabled: value.auth?.breakglass?.enabled === true
      }
    },
    rbac: {
      ownerUserIds: normalizeSecurityStringList(value.rbac?.ownerUserIds),
      roleIds: {
        reviewer: normalizeSecurityStringList(value.rbac?.roleIds?.reviewer),
        editor: normalizeSecurityStringList(value.rbac?.roleIds?.editor),
        admin: normalizeSecurityStringList(value.rbac?.roleIds?.admin)
      },
      userIds: {
        reviewer: normalizeSecurityStringList(value.rbac?.userIds?.reviewer),
        editor: normalizeSecurityStringList(value.rbac?.userIds?.editor),
        admin: normalizeSecurityStringList(value.rbac?.userIds?.admin)
      }
    }
  })

  const collectChangedSecurityPaths = (
    before: ReturnType<typeof normalizeSecuritySnapshot>,
    after: ReturnType<typeof normalizeSecuritySnapshot>
  ) => {
    const changed: string[] = []
    const compare = (pathKey: string, left: unknown, right: unknown) => {
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        changed.push(pathKey)
      }
    }

    compare("publicBaseUrl", before.publicBaseUrl, after.publicBaseUrl)
    compare("viewerPublicBaseUrl", before.viewerPublicBaseUrl, after.viewerPublicBaseUrl)
    compare("trustProxyHops", before.trustProxyHops, after.trustProxyHops)
    compare("auth.breakglass.enabled", before.auth.breakglass.enabled, after.auth.breakglass.enabled)
    compare("rbac.ownerUserIds", before.rbac.ownerUserIds, after.rbac.ownerUserIds)
    compare("rbac.roleIds.reviewer", before.rbac.roleIds.reviewer, after.rbac.roleIds.reviewer)
    compare("rbac.roleIds.editor", before.rbac.roleIds.editor, after.rbac.roleIds.editor)
    compare("rbac.roleIds.admin", before.rbac.roleIds.admin, after.rbac.roleIds.admin)
    compare("rbac.userIds.reviewer", before.rbac.userIds.reviewer, after.rbac.userIds.reviewer)
    compare("rbac.userIds.editor", before.rbac.userIds.editor, after.rbac.userIds.editor)
    compare("rbac.userIds.admin", before.rbac.userIds.admin, after.rbac.userIds.admin)
    return changed
  }

  const saveDashboardSecuritySettings = (
    liveConfig: DashboardConfig,
    body: Record<string, unknown>,
    actor: {
      userId: string
      username: string
      globalName?: string | null
    },
    options: {
      runtimeBackupId?: string | null
    } = {}
  ) => {
    const currentFileConfig = readDashboardPluginConfig()
    const currentSnapshot = normalizeSecuritySnapshot({
      ...currentFileConfig,
      publicBaseUrl: liveConfig.publicBaseUrl,
      viewerPublicBaseUrl: liveConfig.viewerPublicBaseUrl,
      trustProxyHops: liveConfig.trustProxyHops,
      auth: {
        ...currentFileConfig.auth,
        ...liveConfig.auth
      },
      rbac: {
        ...currentFileConfig.rbac,
        ...liveConfig.rbac
      }
    })
    const trustProxyHops = Number(body.trustProxyHops)
    if (!Number.isFinite(trustProxyHops) || trustProxyHops < 0) {
      throw new Error("trustProxyHops must be a non-negative whole number.")
    }

    const nextSnapshot = normalizeSecuritySnapshot({
      publicBaseUrl: normalizeDashboardPublicBaseUrl(typeof body.publicBaseUrl === "string" ? body.publicBaseUrl : ""),
      viewerPublicBaseUrl: normalizeDashboardPublicBaseUrl(typeof body.viewerPublicBaseUrl === "string" ? body.viewerPublicBaseUrl : ""),
      trustProxyHops,
      auth: {
        breakglass: {
          enabled: ensureBoolean(body["auth.breakglass.enabled"])
        }
      },
      rbac: {
        ownerUserIds: normalizeSecurityStringList(body["rbac.ownerUserIds"]),
        roleIds: {
          reviewer: normalizeSecurityStringList(body["rbac.roleIds.reviewer"]),
          editor: normalizeSecurityStringList(body["rbac.roleIds.editor"]),
          admin: normalizeSecurityStringList(body["rbac.roleIds.admin"])
        },
        userIds: {
          reviewer: normalizeSecurityStringList(body["rbac.userIds.reviewer"]),
          editor: normalizeSecurityStringList(body["rbac.userIds.editor"]),
          admin: normalizeSecurityStringList(body["rbac.userIds.admin"])
        }
      }
    })

    const changedPaths = collectChangedSecurityPaths(currentSnapshot, nextSnapshot)
    const candidateConfig = deepClone(currentFileConfig)
    candidateConfig.publicBaseUrl = nextSnapshot.publicBaseUrl
    candidateConfig.viewerPublicBaseUrl = nextSnapshot.viewerPublicBaseUrl
    candidateConfig.trustProxyHops = nextSnapshot.trustProxyHops
    candidateConfig.auth = candidateConfig.auth || {}
    candidateConfig.auth.breakglass = {
      ...(candidateConfig.auth.breakglass || {}),
      enabled: nextSnapshot.auth.breakglass.enabled
    }
    candidateConfig.rbac = candidateConfig.rbac || {
      ownerUserIds: [],
      roleIds: { reviewer: [], editor: [], admin: [] },
      userIds: { reviewer: [], editor: [], admin: [] }
    }
    candidateConfig.rbac.ownerUserIds = nextSnapshot.rbac.ownerUserIds
    candidateConfig.rbac.roleIds = {
      ...(candidateConfig.rbac.roleIds || {}),
      reviewer: nextSnapshot.rbac.roleIds.reviewer,
      editor: nextSnapshot.rbac.roleIds.editor,
      admin: nextSnapshot.rbac.roleIds.admin
    }
    candidateConfig.rbac.userIds = {
      ...(candidateConfig.rbac.userIds || {}),
      reviewer: nextSnapshot.rbac.userIds.reviewer,
      editor: nextSnapshot.rbac.userIds.editor,
      admin: nextSnapshot.rbac.userIds.admin
    }

    ensureDirectory(dashboardSecurityBackupDir)
    ensureDirectory(path.dirname(dashboardSecurityAuditPath))
    const createdAt = new Date().toISOString()
    const backupId = generateWorkspaceRecordId("security-backup")
    const auditId = generateWorkspaceRecordId("security-audit")
    const backupPath = path.join(dashboardSecurityBackupDir, `${backupId}.json`)
    const backupPayload = {
      id: backupId,
      createdAt,
      actor: {
        userId: actor.userId,
        username: actor.username,
        globalName: actor.globalName || null
      },
      runtimeBackupId: options.runtimeBackupId || null,
      changedPaths,
      config: currentFileConfig
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + "\n", "utf8")

    const auditRecord = {
      id: auditId,
      createdAt,
      actor: {
        userId: actor.userId,
        username: actor.username,
        globalName: actor.globalName || null
      },
      runtimeBackupId: options.runtimeBackupId || null,
      backupId,
      changedPaths,
      snapshot: nextSnapshot
    }
    fs.appendFileSync(dashboardSecurityAuditPath, `${JSON.stringify(auditRecord)}\n`, "utf8")
    writeDashboardPluginConfig(candidateConfig)

    liveConfig.publicBaseUrl = nextSnapshot.publicBaseUrl
    liveConfig.viewerPublicBaseUrl = nextSnapshot.viewerPublicBaseUrl
    liveConfig.trustProxyHops = nextSnapshot.trustProxyHops
    liveConfig.auth.breakglass = {
      ...(liveConfig.auth.breakglass || {}),
      enabled: nextSnapshot.auth.breakglass.enabled
    }
    liveConfig.rbac = {
      ownerUserIds: nextSnapshot.rbac.ownerUserIds,
      roleIds: {
        reviewer: nextSnapshot.rbac.roleIds.reviewer,
        editor: nextSnapshot.rbac.roleIds.editor,
        admin: nextSnapshot.rbac.roleIds.admin
      },
      userIds: {
        reviewer: nextSnapshot.rbac.userIds.reviewer,
        editor: nextSnapshot.rbac.userIds.editor,
        admin: nextSnapshot.rbac.userIds.admin
      }
    }

    return {
      backupId,
      auditId,
      auditFilePath: dashboardSecurityAuditPath,
      changedPaths,
      configPath: dashboardConfigPath
    }
  }

  const listAvailableLanguages = (): string[] => {
    const languagesDir = path.resolve(projectRoot, "languages")
    if (!fs.existsSync(languagesDir)) return ["english"]

    const available = fs
      .readdirSync(languagesDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(/\.json$/i, ""))
      .sort()

    return available.length > 0 ? [...new Set(available)] : ["english"]
  }

  const getAvailableOptions = (): Array<{ id: string; name: string; emoji: string; type: string; description: string }> => {
    const options = readManagedJson<any[]>("options")
    return options.map((option) => ({
      id: String(option.id || ""),
      name: String(option.name || option.id || "Option"),
      emoji: String(option.button?.emoji || ""),
      type: String(option.type || ""),
      description: String(option.description || "")
    }))
  }

  const listAvailableQuestions = (): Array<{ id: string; name: string; type: string; required: boolean }> => {
    const questions = readManagedJson<any[]>("questions")
    return questions.map((question) => ({
      id: String(question.id || ""),
      name: String(question.name || question.id || "Question"),
      type: String(question.type || ""),
      required: Boolean(question.required)
    }))
  }

  const listAvailableSupportTeams = (): Array<{ id: string; name: string; roleIds: string[]; assignmentStrategy: string }> => {
    const teams = readManagedJson<any[]>("support-teams")
    return teams.map((team) => ({
      id: String(team.id || ""),
      name: String(team.name || team.id || "Support team"),
      roleIds: parseStringArray(team.roleIds),
      assignmentStrategy: String(team.assignmentStrategy || "manual")
    }))
  }

  const listAvailableIntegrationProfiles = (): Array<{ id: string; providerId: string; label: string; enabled: boolean }> => {
    const profiles = readManagedJson<any[]>("integration-profiles")
    return profiles.map((profile) => ({
      id: String(profile.id || ""),
      providerId: String(profile.providerId || ""),
      label: String(profile.label || profile.id || "Integration profile"),
      enabled: profile.enabled === true
    }))
  }

  const listAvailableAiAssistProfiles = (): Array<{ id: string; providerId: string; label: string; enabled: boolean }> => {
    const profiles = readManagedJson<any[]>("ai-assist-profiles")
    return profiles.map((profile) => ({
      id: String(profile.id || ""),
      providerId: String(profile.providerId || ""),
      label: String(profile.label || profile.id || "AI assist profile"),
      enabled: profile.enabled === true
    }))
  }

  const getEditorDependencyGraph = (): DashboardEditorDependencyGraph => {
    const options = readManagedJson<any[]>("options")
    const panels = readManagedJson<any[]>("panels")
    const aiAssistProfiles = readManagedJson<any[]>("ai-assist-profiles")

    return {
      optionPanels: buildOptionPanelReferences(panels),
      questionOptions: buildQuestionOptionReferences(options),
      supportTeamOptions: buildSupportTeamOptionReferences(options),
      integrationProfileOptions: buildIntegrationProfileOptionReferences(options),
      aiAssistProfileOptions: buildAiAssistProfileOptionReferences(options),
      knowledgeSourceProfiles: buildKnowledgeSourceProfileReferences(aiAssistProfiles)
    }
  }

  const ensureUniqueArrayId = (
    items: any[],
    kind: "option" | "panel" | "question" | "support team" | "integration profile" | "AI assist profile" | "knowledge source",
    candidateId: string,
    currentIndex = -1
  ) => {
    const duplicate = items.some((existing, index) => index !== currentIndex && String(existing.id || "") === candidateId)
    if (duplicate) {
      throw buildDuplicateIdError(kind, candidateId)
    }
  }

  const validateOptionRoutingReferences = (items: any[]) => {
    const supportTeamIds = new Set(readManagedJson<any[]>("support-teams").map((team) => String(team.id || "").trim()).filter(Boolean))
    const ticketOptions = items.filter((option) => option?.type === "ticket")
    const ticketById = new Map(ticketOptions.map((option) => [String(option.id || ""), option]))

    for (const option of ticketOptions) {
      const routing = normalizeTicketOptionRoutingConfig(option.routing)
      if (routing.supportTeamId && !supportTeamIds.has(routing.supportTeamId)) {
        throw new DashboardConfigOperationError(
          `Ticket option "${option.id}" references unknown support team "${routing.supportTeamId}".`,
          "OPTION_ROUTING_UNKNOWN_SUPPORT_TEAM",
          "Create the support team first or leave supportTeamId empty for legacy role-only routing.",
          [],
          400
        )
      }

      for (const targetId of routing.escalationTargetOptionIds) {
        const target = ticketById.get(targetId)
        if (!target) {
          throw new DashboardConfigOperationError(
            `Ticket option "${option.id}" escalation target "${targetId}" must be an existing ticket option.`,
            "OPTION_ROUTING_UNKNOWN_ESCALATION_TARGET",
            "Escalation targets must point at existing ticket options.",
            [],
            400
          )
        }

        const targetRouting = normalizeTicketOptionRoutingConfig(target.routing)
        if (!targetRouting.supportTeamId) {
          throw new DashboardConfigOperationError(
            `Escalation target "${targetId}" must have a non-empty supportTeamId.`,
            "OPTION_ROUTING_TARGET_WITHOUT_TEAM",
            "Assign the target option to a support team before using it as an escalation target.",
            [],
            400
          )
        }

        const sourceMode = option.channel?.transportMode === "private_thread" ? "private_thread" : "channel_text"
        const targetMode = target.channel?.transportMode === "private_thread" ? "private_thread" : "channel_text"
        if (sourceMode !== targetMode) {
          throw new DashboardConfigOperationError(
            `Escalation target "${targetId}" must use the same transportMode as "${option.id}".`,
            "OPTION_ROUTING_TRANSPORT_MISMATCH",
            "Create a same-transport target option for escalation.",
            [],
            400
          )
        }

        const sourceParent = String(option.channel?.threadParentChannel || "").trim()
        const targetParent = String(target.channel?.threadParentChannel || "").trim()
        if (sourceMode === "private_thread" && sourceParent !== targetParent) {
          throw new DashboardConfigOperationError(
            `Private-thread escalation target "${targetId}" must use the same threadParentChannel as "${option.id}".`,
            "OPTION_ROUTING_THREAD_PARENT_MISMATCH",
            "Private-thread escalation stays inside the same parent text channel.",
            [],
            400
          )
        }
      }
    }
  }

  const validateOptionIntegrationReferences = (items: any[]) => {
    const integrationProfileIds = new Set(readManagedJson<any[]>("integration-profiles").map((profile) => String(profile.id || "").trim()).filter(Boolean))
    const ticketOptions = items.filter((option) => option?.type === "ticket")

    for (const option of ticketOptions) {
      const integrationProfileId = ensureString(option.integrationProfileId, "").trim()
      if (!integrationProfileId || integrationProfileIds.has(integrationProfileId)) continue
      throw new DashboardConfigOperationError(
        `Ticket option "${option.id}" references unknown integration profile "${integrationProfileId}".`,
        "OPTION_UNKNOWN_INTEGRATION_PROFILE",
        "Create the integration profile first or leave integrationProfileId empty.",
        [],
        400
      )
    }
  }

  const validateOptionAiAssistReferences = (items: any[]) => {
    const aiAssistProfileIds = new Set(readManagedJson<any[]>("ai-assist-profiles").map((profile) => String(profile.id || "").trim()).filter(Boolean))
    const ticketOptions = items.filter((option) => option?.type === "ticket")

    for (const option of ticketOptions) {
      const aiAssistProfileId = ensureString(option.aiAssistProfileId, "").trim()
      if (!aiAssistProfileId || aiAssistProfileIds.has(aiAssistProfileId)) continue
      throw new DashboardConfigOperationError(
        `Ticket option "${option.id}" references unknown AI assist profile "${aiAssistProfileId}".`,
        "OPTION_UNKNOWN_AI_ASSIST_PROFILE",
        "Create the AI assist profile first or leave aiAssistProfileId empty.",
        [],
        400
      )
    }
  }

  const validateAiAssistProfileKnowledgeReferences = (items: any[]) => {
    const knowledgeSourceIds = new Set(readManagedJson<any[]>("knowledge-sources").map((source) => String(source.id || "").trim()).filter(Boolean))

    for (const profile of items) {
      for (const sourceId of normalizeUniqueStringEntries(profile?.knowledgeSourceIds)) {
        if (knowledgeSourceIds.has(sourceId)) continue
        throw new DashboardConfigOperationError(
          `AI assist profile "${profile.id}" references unknown knowledge source "${sourceId}".`,
          "AI_ASSIST_PROFILE_UNKNOWN_KNOWLEDGE_SOURCE",
          "Create the knowledge source first or remove it from knowledgeSourceIds.",
          [],
          400
        )
      }
    }
  }

  const applyGeneralFormBody = (
    current: Record<string, any>,
    body: Record<string, unknown>,
    globalAdmins: string[]
  ) => {
    current.token = ensureString(body.token, current.token || "")
    current.mainColor = ensureString(body.mainColor, current.mainColor || "")
    current.language = ensureString(body.language, current.language || "english")
    current.prefix = ensureString(body.prefix, current.prefix || "")
    current.serverId = ensureString(body.serverId, current.serverId || "")
    current.globalAdmins = globalAdmins
    current.slashCommands = ensureBoolean(body.slashCommands)
    current.textCommands = ensureBoolean(body.textCommands)
    current.tokenFromENV = ensureBoolean(body.tokenFromENV)

    current.status = current.status || {}
    current.status.enabled = ensureBoolean(body["status.enabled"])
    current.status.type = ensureString(body["status.type"], current.status.type || "watching")
    assertOneOf(current.status.type, STATUS_TYPES, "Status type")
    current.status.mode = ensureString(body["status.mode"], current.status.mode || "online")
    assertOneOf(current.status.mode, STATUS_MODES, "Status mode")
    current.status.text = ensureString(body["status.text"], current.status.text || "")
    current.status.state = ensureString(body["status.state"], current.status.state || "")

    current.system = current.system || {}
    const systemBooleanKeys = [
      "preferSlashOverText",
      "sendErrorOnUnknownCommand",
      "questionFieldsInCodeBlock",
      "displayFieldsWithQuestions",
      "showGlobalAdminsInPanelRoles",
      "disableVerifyBars",
      "useRedErrorEmbeds",
      "alwaysShowReason",
      "replyOnTicketCreation",
      "replyOnReactionRole",
      "askPriorityOnTicketCreation",
      "removeParticipantsOnClose",
      "disableAutocloseAfterReopen",
      "autodeleteRequiresClosedTicket",
      "adminOnlyDeleteWithoutTranscript",
      "allowCloseBeforeMessage",
      "allowCloseBeforeAdminMessage",
      "useTranslatedConfigChecker",
      "pinFirstTicketMessage",
      "enableTicketClaimButtons",
      "enableTicketCloseButtons",
      "enableTicketPinButtons",
      "enableTicketDeleteButtons",
      "enableTicketActionWithReason",
      "enableDeleteWithoutTranscript"
    ]

    for (const key of systemBooleanKeys) {
      current.system[key] = ensureBoolean(body[`system.${key}`])
    }

    current.system.emojiStyle = ensureString(body["system.emojiStyle"], current.system.emojiStyle || "before")
    assertOneOf(current.system.emojiStyle, EMOJI_STYLES, "Emoji style")
    current.system.pinEmoji = ensureString(body["system.pinEmoji"], current.system.pinEmoji || "")

    current.system.logs = current.system.logs || {}
    current.system.logs.enabled = ensureBoolean(body["system.logs.enabled"])
    current.system.logs.channel = ensureString(body["system.logs.channel"], current.system.logs.channel || "")

    current.system.limits = current.system.limits || {}
    current.system.limits.enabled = ensureBoolean(body["system.limits.enabled"])
    current.system.limits.globalMaximum = ensureNumber(body["system.limits.globalMaximum"], current.system.limits.globalMaximum || 0)
    current.system.limits.userMaximum = ensureNumber(body["system.limits.userMaximum"], current.system.limits.userMaximum || 0)

    current.system.channelTopic = current.system.channelTopic || {}
    for (const key of [
      "showOptionName",
      "showOptionDescription",
      "showOptionTopic",
      "showPriority",
      "showClosed",
      "showClaimed",
      "showPinned",
      "showCreator",
      "showParticipants"
    ]) {
      current.system.channelTopic[key] = ensureBoolean(body[`system.channelTopic.${key}`])
    }

    current.system.permissions = current.system.permissions || {}
    for (const key of [
      "help",
      "panel",
      "ticket",
      "close",
      "delete",
      "reopen",
      "claim",
      "unclaim",
      "pin",
      "unpin",
      "move",
      "escalate",
      "rename",
      "add",
      "remove",
      "blacklist",
      "stats",
      "clear",
      "autoclose",
      "autodelete",
      "transfer",
      "topic",
      "priority"
    ]) {
      current.system.permissions[key] = ensureString(body[`system.permissions.${key}`], current.system.permissions[key] || "everyone")
    }

    current.system.messages = current.system.messages || {}
    for (const key of [
      "creation",
      "closing",
      "deleting",
      "reopening",
      "claiming",
      "pinning",
      "adding",
      "removing",
      "renaming",
      "moving",
      "blacklisting",
      "transferring",
      "topicChange",
      "priorityChange",
      "reactionRole"
    ]) {
      current.system.messages[key] = current.system.messages[key] || {}
      current.system.messages[key].dm = ensureBoolean(body[`system.messages.${key}.dm`])
      current.system.messages[key].logs = ensureBoolean(body[`system.messages.${key}.logs`])
    }

    return current
  }

  const normalizeGeneralDraft = (
    body: Record<string, unknown>,
    fallback?: Record<string, unknown> | null
  ) => {
    const current = deepClone(
      (fallback && isPlainObject(fallback) ? fallback : readManagedJson<Record<string, unknown>>("general")) as Record<string, any>
    )
    const fallbackGlobalAdmins = inspectGeneralGlobalAdminsValue(current.globalAdmins).normalizedValue

    try {
      return applyGeneralFormBody(current, body, parseGeneralGlobalAdminsInput(body.globalAdmins))
    } catch (error) {
      if (!isDashboardGeneralFormValidationError(error)) {
        throw error
      }

      return applyGeneralFormBody(current, body, fallbackGlobalAdmins)
    }
  }

  const saveGeneralForm = (body: Record<string, unknown>) => {
    const current = deepClone(readManagedJson<Record<string, any>>("general"))
    const globalAdmins = parseGeneralGlobalAdminsInput(body.globalAdmins)

    applyGeneralFormBody(current, body, globalAdmins)

    writeManagedJson("general", current)
    return current
  }

  const saveTranscriptsForm = (body: Record<string, unknown>) => {
    const current = deepClone(readManagedJson<Record<string, any>>("transcripts"))

    current.general = current.general || {}
    for (const key of [
      "enabled",
      "enableChannel",
      "enableCreatorDM",
      "enableParticipantDM",
      "enableActiveAdminDM",
      "enableEveryAdminDM"
    ]) {
      current.general[key] = ensureBoolean(body[`general.${key}`])
    }
    current.general.channel = ensureString(body["general.channel"], current.general.channel || "")
    current.general.mode = ensureString(body["general.mode"], current.general.mode || "html")
    assertOneOf(current.general.mode, TRANSCRIPT_MODES, "Transcript mode")

    current.embedSettings = current.embedSettings || {}
    current.embedSettings.customColor = ensureString(body["embedSettings.customColor"], current.embedSettings.customColor || "")
    current.embedSettings.listAllParticipants = ensureBoolean(body["embedSettings.listAllParticipants"])
    current.embedSettings.includeTicketStats = ensureBoolean(body["embedSettings.includeTicketStats"])

    current.textTranscriptStyle = current.textTranscriptStyle || {}
    current.textTranscriptStyle.layout = ensureString(body["textTranscriptStyle.layout"], current.textTranscriptStyle.layout || "normal")
    assertOneOf(current.textTranscriptStyle.layout, TRANSCRIPT_TEXT_LAYOUTS, "Text transcript layout")
    current.textTranscriptStyle.fileMode = ensureString(body["textTranscriptStyle.fileMode"], current.textTranscriptStyle.fileMode || "channel-name")
    assertOneOf(current.textTranscriptStyle.fileMode, TRANSCRIPT_FILE_MODES, "Transcript file mode")
    current.textTranscriptStyle.customFileName = ensureString(body["textTranscriptStyle.customFileName"], current.textTranscriptStyle.customFileName || "")
    for (const key of ["includeStats", "includeIds", "includeEmbeds", "includeFiles", "includeBotMessages"]) {
      current.textTranscriptStyle[key] = ensureBoolean(body[`textTranscriptStyle.${key}`])
    }

    current.htmlTranscriptStyle = normalizeTranscriptHtmlStyleDraftInput(body, current.htmlTranscriptStyle)

    writeManagedJson("transcripts", current)
    return current
  }

  return {
    projectRoot,
    configDir,
    dashboardPluginRoot,
    definitions: MANAGED_CONFIGS,
    getFilePath,
    readManagedText,
    readManagedBackupText,
    readManagedJson,
    writeManagedJson,
    prettifyText,
    saveRawJson,
    listAvailableLanguages,
    getAvailableOptions,
    listAvailableQuestions,
    listAvailableSupportTeams,
    listAvailableIntegrationProfiles,
    listAvailableAiAssistProfiles,
    getEditorDependencyGraph,
    normalizeGeneralDraft,
    inspectGeneralGlobalAdmins(input) {
      return inspectGeneralGlobalAdminsValue(input)
    },
    readDashboardPluginConfig,
    saveDashboardSecuritySettings,
    saveGeneralForm,
    normalizeTranscriptHtmlStyleDraft(body, fallback) {
      return normalizeTranscriptHtmlStyleDraftInput(body, fallback)
    },
    saveTranscriptsForm,
    saveOption(option, editIndex) {
      const items = deepClone(readManagedJson<any[]>("options"))
      const action = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < items.length ? "updated" as const : "created" as const

      if (action === "updated") {
        const current = items[editIndex]
        const merged = deepMerge(current, option)
        const normalized = normalizeOption(merged)
        const previousId = String(current.id || "")
        const nextId = String(normalized.id || "")

        if (nextId !== previousId) {
          const references = buildOptionPanelReferences(readManagedJson<any[]>("panels"))[previousId] || []
          if (references.length > 0) {
            throw buildReferenceGuardError("option", "rename", previousId, references, nextId)
          }
        }

        ensureUniqueArrayId(items, "option", nextId, editIndex)
        items[editIndex] = normalized
        validateOptionRoutingReferences(items)
        validateOptionIntegrationReferences(items)
        validateOptionAiAssistReferences(items)
        writeManagedJson("options", items)
        return {
          success: true as const,
          id: nextId,
          action,
          count: items.length,
          item: normalized,
          index: editIndex
        }
      }

      const normalized = normalizeOption(option)
      const nextId = String(normalized.id || slugify(normalized.name || `options-${Date.now()}`))
      normalized.id = nextId
      ensureUniqueArrayId(items, "option", nextId)
      items.push(normalized)
      validateOptionRoutingReferences(items)
      validateOptionIntegrationReferences(items)
      validateOptionAiAssistReferences(items)
      writeManagedJson("options", items)
      return {
        success: true as const,
        id: nextId,
        action,
        count: items.length,
        item: normalized,
        index: items.length - 1
      }
    },
    savePanel(panel, editIndex) {
      const validatePanel = (normalized: any) => {
        const optionTypes = new Map(
          readManagedJson<any[]>("options").map((option) => [String(option.id || ""), String(option.type || "")])
        )
        const unknownOptionIds = normalized.options.filter((optionId: string) => !optionTypes.has(String(optionId)))

        if (unknownOptionIds.length > 0) {
          throw new Error(`Panels may only reference existing option IDs. Unknown: ${unknownOptionIds.join(", ")}`)
        }
        if (!normalized.dropdown) return

        const invalidOptionIds = normalized.options.filter((optionId: string) => {
          const optionType = optionTypes.get(String(optionId))
          return optionType !== PANEL_DROPDOWN_OPTION_TYPE
        })

        if (invalidOptionIds.length > 0) {
          throw new Error(`Dropdown panels can only include ${PANEL_DROPDOWN_OPTION_TYPE} options. Invalid: ${invalidOptionIds.join(", ")}`)
        }
      }

      const items = deepClone(readManagedJson<any[]>("panels"))
      if (Number.isInteger(editIndex) && editIndex >= 0 && editIndex < items.length) {
        const merged = deepMerge(items[editIndex], panel)
        const normalized = normalizePanel(merged)
        validatePanel(normalized)
        ensureUniqueArrayId(items, "panel", String(normalized.id || ""), editIndex)
        items[editIndex] = normalized
        writeManagedJson("panels", items)
        return {
          success: true as const,
          id: String(normalized.id),
          action: "updated" as const,
          count: items.length,
          item: normalized,
          index: editIndex
        }
      }

      const normalized = normalizePanel(panel)
      validatePanel(normalized)
      let nextId = String(normalized.id || "")
      if (!nextId) nextId = slugify(normalized.name || `panels-${Date.now()}`)
      normalized.id = nextId
      ensureUniqueArrayId(items, "panel", nextId)
      items.push(normalized)
      writeManagedJson("panels", items)
      return {
        success: true as const,
        id: String(normalized.id),
        action: "created" as const,
        count: items.length,
        item: normalized,
        index: items.length - 1
      }
    },
    saveQuestion(question, editIndex) {
      const items = deepClone(readManagedJson<any[]>("questions"))
      const action = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < items.length ? "updated" as const : "created" as const

      if (action === "updated") {
        const current = items[editIndex]
        const merged = deepMerge(current, question)
        const normalized = normalizeQuestion(merged)
        const previousId = String(current.id || "")
        const nextId = String(normalized.id || "")

        if (nextId !== previousId) {
          const references = buildQuestionOptionReferences(readManagedJson<any[]>("options"))[previousId] || []
          if (references.length > 0) {
            throw buildReferenceGuardError("question", "rename", previousId, references, nextId)
          }
        }

        ensureUniqueArrayId(items, "question", nextId, editIndex)
        items[editIndex] = normalized
        writeManagedJson("questions", items)
        return {
          success: true as const,
          id: nextId,
          action,
          count: items.length,
          item: normalized,
          index: editIndex
        }
      }

      const normalized = normalizeQuestion(question)
      const nextId = String(normalized.id || slugify(normalized.name || `questions-${Date.now()}`))
      normalized.id = nextId
      ensureUniqueArrayId(items, "question", nextId)
      items.push(normalized)
      writeManagedJson("questions", items)
      return {
        success: true as const,
        id: nextId,
        action,
        count: items.length,
        item: normalized,
        index: items.length - 1
      }
    },
    saveSupportTeam(team, editIndex) {
      const items = deepClone(readManagedJson<any[]>("support-teams"))
      const action = Number.isInteger(editIndex) && editIndex >= 0 && editIndex < items.length ? "updated" as const : "created" as const

      if (action === "updated") {
        const current = items[editIndex]
        const merged = deepMerge(current, team)
        const normalized = normalizeSupportTeam(merged)
        const previousId = String(current.id || "")
        const nextId = String(normalized.id || "")

        if (nextId !== previousId) {
          const references = buildSupportTeamOptionReferences(readManagedJson<any[]>("options"))[previousId] || []
          if (references.length > 0) {
            throw buildReferenceGuardError("support team", "rename", previousId, references, nextId)
          }
        }

        ensureUniqueArrayId(items, "support team", nextId, editIndex)
        items[editIndex] = normalized
        writeManagedJson("support-teams", items)
        return {
          success: true as const,
          id: nextId,
          action,
          count: items.length,
          item: normalized,
          index: editIndex
        }
      }

      const normalized = normalizeSupportTeam(team)
      const nextId = String(normalized.id || slugify(normalized.name || `support-team-${Date.now()}`))
      normalized.id = nextId
      ensureUniqueArrayId(items, "support team", nextId)
      items.push(normalized)
      writeManagedJson("support-teams", items)
      return {
        success: true as const,
        id: nextId,
        action,
        count: items.length,
        item: normalized,
        index: items.length - 1
      }
    },
    reorderArrayItems(id, orderedIds) {
      const items = deepClone(readManagedJson<any[]>(id))
      const normalizedIds = Array.isArray(orderedIds) ? orderedIds.map((value) => String(value)) : []
      const existingIds = items.map((item) => String(item.id || ""))

      if (normalizedIds.length !== items.length) {
        throw new Error(`Reorder for ${id} requires every current ID exactly once.`)
      }

      if (new Set(normalizedIds).size !== normalizedIds.length) {
        throw new Error(`Reorder for ${id} cannot include duplicate IDs.`)
      }

      const missingIds = existingIds.filter((currentId) => !normalizedIds.includes(currentId))
      const unknownIds = normalizedIds.filter((currentId) => !existingIds.includes(currentId))

      if (missingIds.length > 0 || unknownIds.length > 0) {
        throw new Error(
          `Reorder for ${id} must match the current ID set exactly. Missing: ${missingIds.join(", ") || "none"}. Unknown: ${unknownIds.join(", ") || "none"}.`
        )
      }

      const byId = new Map(items.map((item) => [String(item.id || ""), item]))
      const reordered = normalizedIds.map((currentId) => deepClone(byId.get(currentId)))
      writeManagedJson(id, reordered)
      return {
        success: true as const,
        count: reordered.length,
        orderedIds: normalizedIds,
        items: reordered
      }
    },
    deleteArrayItem(id, index) {
      const items = deepClone(readManagedJson<any[]>(id))
      if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        throw new Error("Invalid index")
      }
      const removed = items[index]
      const removedId = String(removed.id || "")

      if (id === "options") {
        const references = buildOptionPanelReferences(readManagedJson<any[]>("panels"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("option", "delete", removedId, references)
        }
      }

      if (id === "questions") {
        const references = buildQuestionOptionReferences(readManagedJson<any[]>("options"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("question", "delete", removedId, references)
        }
      }

      if (id === "support-teams") {
        const references = buildSupportTeamOptionReferences(readManagedJson<any[]>("options"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("support team", "delete", removedId, references)
        }
      }

      if (id === "integration-profiles") {
        const references = buildIntegrationProfileOptionReferences(readManagedJson<any[]>("options"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("integration profile", "delete", removedId, references)
        }
      }

      if (id === "ai-assist-profiles") {
        const references = buildAiAssistProfileOptionReferences(readManagedJson<any[]>("options"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("AI assist profile", "delete", removedId, references)
        }
      }

      if (id === "knowledge-sources") {
        const references = buildKnowledgeSourceProfileReferences(readManagedJson<any[]>("ai-assist-profiles"))[removedId] || []
        if (references.length > 0) {
          throw buildReferenceGuardError("knowledge source", "delete", removedId, references)
        }
      }

      items.splice(index, 1)
      writeManagedJson(id, items)
      return {
        success: true as const,
        count: items.length,
        removedId,
        items
      }
    }
  }
}
