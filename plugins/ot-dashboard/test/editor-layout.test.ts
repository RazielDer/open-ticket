import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { AddressInfo, Socket } from "net"
import { test } from "node:test"

import { createConfigService } from "../server/config-service"
import { createDashboardApp } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import type { DashboardRuntimeBridge } from "../server/runtime-bridge"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")
const generalGlobalAdminIds = ["123456789012345678", "234567890123456789"]

const generalSystemKeys = [
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

const channelTopicKeys = [
  "showOptionName",
  "showOptionDescription",
  "showOptionTopic",
  "showPriority",
  "showClosed",
  "showClaimed",
  "showPinned",
  "showCreator",
  "showParticipants"
]

const permissionKeys = [
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
]

const messageKeys = [
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
]

function createFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-editors-"))
  const configDir = path.join(root, "config")
  fs.mkdirSync(configDir, { recursive: true })
  fs.mkdirSync(path.join(root, "plugins"), { recursive: true })

  fs.writeFileSync(path.join(configDir, "general.json"), JSON.stringify({
    token: "token",
    mainColor: "#ff6600",
    language: "english",
    prefix: "!ticket ",
    serverId: "guild-1",
    globalAdmins: generalGlobalAdminIds,
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "hello", state: "orbit" },
    system: {
      preferSlashOverText: true,
      sendErrorOnUnknownCommand: true,
      questionFieldsInCodeBlock: true,
      displayFieldsWithQuestions: false,
      showGlobalAdminsInPanelRoles: false,
      disableVerifyBars: false,
      useRedErrorEmbeds: true,
      alwaysShowReason: false,
      replyOnTicketCreation: false,
      replyOnReactionRole: true,
      askPriorityOnTicketCreation: false,
      removeParticipantsOnClose: true,
      disableAutocloseAfterReopen: true,
      autodeleteRequiresClosedTicket: true,
      adminOnlyDeleteWithoutTranscript: true,
      allowCloseBeforeMessage: false,
      allowCloseBeforeAdminMessage: true,
      useTranslatedConfigChecker: true,
      pinFirstTicketMessage: false,
      enableTicketClaimButtons: true,
      enableTicketCloseButtons: true,
      enableTicketPinButtons: true,
      enableTicketDeleteButtons: true,
      enableTicketActionWithReason: true,
      enableDeleteWithoutTranscript: true,
      emojiStyle: "before",
      pinEmoji: "📌",
      logs: { enabled: true, channel: "2" },
      limits: { enabled: true, globalMaximum: 100, userMaximum: 5 },
      channelTopic: {
        showOptionName: true,
        showOptionDescription: false,
        showOptionTopic: true,
        showPriority: false,
        showClosed: true,
        showClaimed: false,
        showPinned: false,
        showCreator: false,
        showParticipants: false
      },
      permissions: {
        help: "everyone",
        panel: "admin",
        ticket: "everyone",
        close: "admin",
        delete: "admin",
        reopen: "admin",
        claim: "admin",
        unclaim: "admin",
        pin: "admin",
        unpin: "admin",
        move: "admin",
        rename: "admin",
        add: "admin",
        remove: "admin",
        blacklist: "admin",
        stats: "everyone",
        clear: "admin",
        autoclose: "admin",
        autodelete: "admin",
        transfer: "admin",
        topic: "admin",
        priority: "admin"
      },
      messages: {
        creation: { dm: true, logs: true },
        closing: { dm: true, logs: true },
        deleting: { dm: true, logs: true },
        reopening: { dm: false, logs: true },
        claiming: { dm: false, logs: true },
        pinning: { dm: false, logs: true },
        adding: { dm: false, logs: true },
        removing: { dm: false, logs: true },
        renaming: { dm: false, logs: true },
        moving: { dm: true, logs: true },
        blacklisting: { dm: true, logs: true },
        transferring: { dm: true, logs: true },
        topicChange: { dm: false, logs: true },
        priorityChange: { dm: false, logs: true },
        reactionRole: { dm: false, logs: true }
      }
    }
  }, null, 2))

  fs.writeFileSync(path.join(configDir, "options.json"), JSON.stringify([
    {
      id: "option-1",
      name: "Support",
      description: "Open this ticket.",
      type: "ticket",
      button: { emoji: "🎫", label: "Support", color: "green" },
      ticketAdmins: ["7"],
      readonlyAdmins: ["8"],
      allowCreationByBlacklistedUsers: true,
      questions: ["question-1"],
      channel: {
        prefix: "support-",
        suffix: "counter-fixed",
        category: "1",
        backupCategory: "2",
        closedCategory: "3",
        claimedCategory: [{ user: "4", category: "44" }],
        topic: "Support topic"
      },
      dmMessage: {
        enabled: true,
        text: "DM text",
        embed: {
          enabled: true,
          title: "DM title",
          description: "DM description",
          customColor: "",
          image: "",
          thumbnail: "",
          fields: [{ name: "DM retained", value: "DM field", inline: false }],
          timestamp: false
        }
      },
      ticketMessage: {
        enabled: true,
        text: "",
        embed: {
          enabled: true,
          title: "Support",
          description: "Open this ticket.",
          fields: [{ name: "Retained", value: "Field", inline: false }]
        },
        ping: {
          "@here": true,
          "@everyone": false,
          custom: ["8"]
        }
      },
      cooldown: { enabled: true, cooldownMinutes: 10 },
      autoclose: { enableInactiveHours: true, inactiveHours: 24, enableUserLeave: true, disableOnClaim: true },
      autodelete: { enableInactiveDays: true, inactiveDays: 7, enableUserLeave: false, disableOnClaim: true },
      limits: { enabled: true, globalMaximum: 20, userMaximum: 3 },
      slowMode: { enabled: true, slowModeSeconds: 45 }
    }
  ], null, 2))

  fs.writeFileSync(path.join(configDir, "panels.json"), JSON.stringify([
    {
      id: "panel-1",
      name: "HELP CENTER",
      dropdown: true,
      options: ["option-1"],
      text: "Choose an option",
      embed: {
        enabled: true,
        title: "HELP CENTER",
        description: "Choose an option.",
        customColor: "#ff0000",
        url: "https://example.com",
        image: "https://example.com/image.png",
        thumbnail: "https://example.com/thumb.png",
        footer: "Retained footer",
        fields: [{ name: "Retained", value: "Field", inline: false }],
        timestamp: true
      },
      settings: {
        dropdownPlaceholder: "Open a ticket",
        enableMaxTicketsWarningInText: false,
        enableMaxTicketsWarningInEmbed: true,
        describeOptionsLayout: "normal",
        describeOptionsCustomTitle: "Details",
        describeOptionsInText: false,
        describeOptionsInEmbedFields: true,
        describeOptionsInEmbedDescription: false
      }
    }
  ], null, 2))

  fs.writeFileSync(path.join(configDir, "questions.json"), JSON.stringify([
    {
      id: "question-1",
      name: "Summary",
      type: "short",
      required: true,
      placeholder: "Describe the issue",
      length: {
        enabled: true,
        min: 5,
        max: 250
      }
    }
  ], null, 2))

  fs.writeFileSync(path.join(configDir, "transcripts.json"), JSON.stringify({
    general: {
      enabled: true,
      enableChannel: true,
      enableCreatorDM: true,
      enableParticipantDM: false,
      enableActiveAdminDM: false,
      enableEveryAdminDM: false,
      channel: "1",
      mode: "html"
    },
    embedSettings: { customColor: "#336699", listAllParticipants: true, includeTicketStats: true },
    textTranscriptStyle: {
      layout: "normal",
      includeStats: true,
      includeIds: true,
      includeEmbeds: true,
      includeFiles: true,
      includeBotMessages: true,
      fileMode: "channel-name",
      customFileName: "transcript"
    },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: true, backgroundColor: "#111111", backgroundImage: "https://example.com/background.png" },
      header: { enableCustomHeader: true, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: true, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: true, imageUrl: "https://example.com/favicon.png" }
    }
  }, null, 2))

  return root
}

function buildGeneralFormBody(current: Record<string, any>) {
  const params = new URLSearchParams()
  params.set("token", String(current.token || ""))
  params.set("mainColor", String(current.mainColor || ""))
  params.set("language", String(current.language || "english"))
  params.set("prefix", String(current.prefix || ""))
  params.set("serverId", String(current.serverId || ""))
  params.set("globalAdmins", JSON.stringify(current.globalAdmins || [], null, 2))
  if (current.slashCommands) params.set("slashCommands", "on")
  if (current.textCommands) params.set("textCommands", "on")
  if (current.tokenFromENV) params.set("tokenFromENV", "on")

  if (current.status?.enabled) params.set("status.enabled", "on")
  params.set("status.type", String(current.status?.type || "watching"))
  params.set("status.mode", String(current.status?.mode || "online"))
  params.set("status.text", String(current.status?.text || ""))
  params.set("status.state", String(current.status?.state || ""))

  for (const key of generalSystemKeys) {
    if (current.system?.[key]) params.set(`system.${key}`, "on")
  }
  params.set("system.emojiStyle", String(current.system?.emojiStyle || "before"))
  params.set("system.pinEmoji", String(current.system?.pinEmoji || ""))

  if (current.system?.logs?.enabled) params.set("system.logs.enabled", "on")
  params.set("system.logs.channel", String(current.system?.logs?.channel || ""))

  if (current.system?.limits?.enabled) params.set("system.limits.enabled", "on")
  params.set("system.limits.globalMaximum", String(current.system?.limits?.globalMaximum ?? 0))
  params.set("system.limits.userMaximum", String(current.system?.limits?.userMaximum ?? 0))

  for (const key of channelTopicKeys) {
    if (current.system?.channelTopic?.[key]) params.set(`system.channelTopic.${key}`, "on")
  }

  for (const key of permissionKeys) {
    params.set(`system.permissions.${key}`, String(current.system?.permissions?.[key] || ""))
  }

  for (const key of messageKeys) {
    if (current.system?.messages?.[key]?.dm) params.set(`system.messages.${key}.dm`, "on")
    if (current.system?.messages?.[key]?.logs) params.set(`system.messages.${key}.logs`, "on")
  }

  return params
}

function buildTranscriptsFormBody(current: Record<string, any>) {
  const params = new URLSearchParams()

  for (const key of [
    "enabled",
    "enableChannel",
    "enableCreatorDM",
    "enableParticipantDM",
    "enableActiveAdminDM",
    "enableEveryAdminDM"
  ]) {
    if (current.general?.[key]) params.set(`general.${key}`, "on")
  }
  params.set("general.channel", String(current.general?.channel || ""))
  params.set("general.mode", String(current.general?.mode || "html"))

  params.set("embedSettings.customColor", String(current.embedSettings?.customColor || ""))
  if (current.embedSettings?.listAllParticipants) params.set("embedSettings.listAllParticipants", "on")
  if (current.embedSettings?.includeTicketStats) params.set("embedSettings.includeTicketStats", "on")

  params.set("textTranscriptStyle.layout", String(current.textTranscriptStyle?.layout || "normal"))
  params.set("textTranscriptStyle.fileMode", String(current.textTranscriptStyle?.fileMode || "channel-name"))
  params.set("textTranscriptStyle.customFileName", String(current.textTranscriptStyle?.customFileName || ""))
  for (const key of ["includeStats", "includeIds", "includeEmbeds", "includeFiles", "includeBotMessages"]) {
    if (current.textTranscriptStyle?.[key]) params.set(`textTranscriptStyle.${key}`, "on")
  }

  if (current.htmlTranscriptStyle?.background?.enableCustomBackground) params.set("htmlTranscriptStyle.background.enableCustomBackground", "on")
  params.set("htmlTranscriptStyle.background.backgroundColor", String(current.htmlTranscriptStyle?.background?.backgroundColor || ""))
  params.set("htmlTranscriptStyle.background.backgroundImage", String(current.htmlTranscriptStyle?.background?.backgroundImage || ""))

  if (current.htmlTranscriptStyle?.header?.enableCustomHeader) params.set("htmlTranscriptStyle.header.enableCustomHeader", "on")
  params.set("htmlTranscriptStyle.header.backgroundColor", String(current.htmlTranscriptStyle?.header?.backgroundColor || ""))
  params.set("htmlTranscriptStyle.header.decoColor", String(current.htmlTranscriptStyle?.header?.decoColor || ""))
  params.set("htmlTranscriptStyle.header.textColor", String(current.htmlTranscriptStyle?.header?.textColor || ""))

  if (current.htmlTranscriptStyle?.stats?.enableCustomStats) params.set("htmlTranscriptStyle.stats.enableCustomStats", "on")
  params.set("htmlTranscriptStyle.stats.backgroundColor", String(current.htmlTranscriptStyle?.stats?.backgroundColor || ""))
  params.set("htmlTranscriptStyle.stats.keyTextColor", String(current.htmlTranscriptStyle?.stats?.keyTextColor || ""))
  params.set("htmlTranscriptStyle.stats.valueTextColor", String(current.htmlTranscriptStyle?.stats?.valueTextColor || ""))
  params.set("htmlTranscriptStyle.stats.hideBackgroundColor", String(current.htmlTranscriptStyle?.stats?.hideBackgroundColor || ""))
  params.set("htmlTranscriptStyle.stats.hideTextColor", String(current.htmlTranscriptStyle?.stats?.hideTextColor || ""))

  if (current.htmlTranscriptStyle?.favicon?.enableCustomFavicon) params.set("htmlTranscriptStyle.favicon.enableCustomFavicon", "on")
  params.set("htmlTranscriptStyle.favicon.imageUrl", String(current.htmlTranscriptStyle?.favicon?.imageUrl || ""))

  return params
}

function createTranscriptPreviewRuntimeBridge(): DashboardRuntimeBridge {
  const transcriptService = {
    isHealthy() {
      return true
    },
    async getSummary() {
      return {
        total: 0,
        active: 0,
        partial: 0,
        revoked: 0,
        deleted: 0,
        failed: 0,
        building: 0,
        totalArchiveBytes: 0,
        queueDepth: 0,
        recoveredBuilds: 0
      }
    },
    async resolveTranscript() {
      return null
    },
    async listTranscripts() {
      return { total: 0, items: [] }
    },
    async getTranscriptDetail() {
      return null
    },
    async listTranscriptStylePresets() {
      return [
        {
          id: "discord-classic",
          label: "Discord Classic",
          description: "Keeps the familiar Discord charcoal and gold transcript look.",
          draft: {
            background: { enableCustomBackground: true, backgroundColor: "#101318", backgroundImage: "" },
            header: { enableCustomHeader: true, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
            stats: { enableCustomStats: true, backgroundColor: "#202225", keyTextColor: "#8b919c", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
            favicon: { enableCustomFavicon: false, imageUrl: "" }
          }
        },
        {
          id: "forest-ledger",
          label: "Forest Ledger",
          description: "Muted greens tuned for softer long-form reading.",
          draft: {
            background: { enableCustomBackground: true, backgroundColor: "#0d1712", backgroundImage: "" },
            header: { enableCustomHeader: true, backgroundColor: "#163125", decoColor: "#7ccf7a", textColor: "#effcf2" },
            stats: { enableCustomStats: true, backgroundColor: "#13281f", keyTextColor: "#9bc2a5", valueTextColor: "#effcf2", hideBackgroundColor: "#2d4b3a", hideTextColor: "#effcf2" },
            favicon: { enableCustomFavicon: false, imageUrl: "" }
          }
        }
      ]
    },
    async renderTranscriptStylePreview() {
      return {
        status: "ok",
        message: "",
        html: "<html><body>preview</body></html>",
        contentSecurityPolicy: "default-src 'none'; frame-ancestors 'self'; img-src 'self' data: http: https:; script-src 'none'; style-src 'unsafe-inline'"
      }
    },
    async revokeTranscript(id: string) {
      return { ok: true, action: "revoke", target: id, status: "ok", message: `revoked ${id}` }
    },
    async reissueTranscript(id: string) {
      return { ok: true, action: "reissue", target: id, status: "ok", message: `reissued ${id}` }
    },
    async deleteTranscript(id: string) {
      return { ok: true, action: "delete", target: id, status: "ok", message: `deleted ${id}` }
    }
  }

  return {
    getSnapshot() {
      return {
        capturedAt: new Date("2026-03-27T16:10:00.000Z").toISOString(),
        availability: "ready",
        processStartTime: new Date("2026-03-27T15:30:00.000Z").toISOString(),
        readyTime: new Date("2026-03-27T15:31:00.000Z").toISOString(),
        checkerSummary: { hasResult: true, valid: true, errorCount: 0, warningCount: 0, infoCount: 0 },
        pluginSummary: { discovered: 1, enabled: 1, executed: 1, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: true, scopeCount: 0 },
        ticketSummary: { available: true, total: 0, open: 0, closed: 0, claimed: 0, pinned: 0, recentActivityCount: 0 },
        warnings: [],
        recentTicketActivity: []
      }
    },
    listPlugins() {
      return []
    },
    getPluginDetail(_projectRoot, pluginId) {
      if (pluginId !== "ot-html-transcripts") return null
      return {
        id: "ot-html-transcripts",
        directory: "ot-html-transcripts",
        pluginRoot: "/plugins/ot-html-transcripts",
        manifestPath: "/plugins/ot-html-transcripts/plugin.json",
        hasManifest: true,
        source: "runtime+manifest",
        name: "OT HTML Transcripts",
        version: "1.0.0",
        enabled: true,
        executed: true,
        crashed: false,
        crashReason: null,
        priority: 0,
        author: "tester",
        authors: ["tester"],
        contributors: [],
        shortDescription: "Preview fixture",
        tags: [],
        supportedVersions: ["OTv4.1.x"],
        assetCount: 0,
        configEntryPoints: [],
        editableAssets: [],
        unknownCrashWarning: false,
        longDescription: "",
        imageUrl: "",
        projectUrl: "",
        requiredPlugins: [],
        incompatiblePlugins: [],
        npmDependencies: [],
        missingDependencies: [],
        missingRequiredPlugins: [],
        activeIncompatiblePlugins: [],
        warnings: []
      } as any
    },
    listTickets() {
      return []
    },
    getRuntimeSource() {
      return {
        plugins: {
          getAll() {
            return []
          },
          classes: {
            get(id: string) {
              return id === "ot-html-transcripts:service" ? transcriptService : null
            }
          }
        }
      } as any
    }
  }
}

function parseHiddenValue(html: string, name: string) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`))
  return match ? match[1] : ""
}

function parseBodyData(html: string, key: string) {
  const match = html.match(new RegExp(`data-${key}="([^"]+)"`))
  return match ? match[1] : ""
}

function parseTextareaValue(html: string, name: string) {
  const match = html.match(new RegExp(`<textarea[^>]*name="${name}"[^>]*>([\\s\\S]*?)<\\/textarea>`))
  if (!match) {
    return ""
  }

  return match[1]
    .replace(/&#34;|&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

function buildRuntimeGuildMember(userId: string, roleIds: string[]) {
  return {
    guildId: "guild-1",
    userId,
    username: userId,
    globalName: userId.replace(/-/g, " "),
    displayName: userId.replace(/-/g, " "),
    avatarUrl: null,
    roleIds
  }
}

function assertInOrder(html: string, values: string[]) {
  let cursor = -1
  for (const value of values) {
    const next = html.indexOf(value, cursor + 1)
    assert.ok(next > cursor, `Expected "${value}" to appear after the previous marker.`)
    cursor = next
  }
}

async function startTestServer(
  projectRoot: string,
  basePath = "/dash",
  overrides: {
    runtimeBridge?: DashboardRuntimeBridge
  } = {}
) {
  const authRoleIds = {
    reviewer: "role-reviewer",
    editor: "role-editor",
    admin: "role-admin"
  }
  const authMembers = new Map<string, ReturnType<typeof buildRuntimeGuildMember>>([
    ["admin-user", buildRuntimeGuildMember("admin-user", [authRoleIds.admin])],
    ["editor-user", buildRuntimeGuildMember("editor-user", [authRoleIds.editor])],
    ["reviewer-user", buildRuntimeGuildMember("reviewer-user", [authRoleIds.reviewer])],
    ["owner-user", buildRuntimeGuildMember("owner-user", [])],
    ["member-user", buildRuntimeGuildMember("member-user", [])]
  ])
  const config: DashboardConfig = {
    host: "127.0.0.1",
    port: 0,
    basePath,
    publicBaseUrl: "",
    viewerPublicBaseUrl: "",
    trustProxyHops: 1,
    dashboardName: "Test Dashboard",
    locale: "english",
    brand: {
      title: "Test Dashboard",
      faviconPath: "./public/assets/eotfs-dashboard-favicon.png"
    },
    auth: {
      passwordHash: "",
      password: "",
      sessionSecret: "test-secret",
      sqlitePath: "runtime/ot-dashboard/auth.sqlite",
      discord: {
        clientId: "discord-client-id",
        clientSecret: "discord-client-secret"
      },
      breakglass: {
        enabled: false,
        passwordHash: ""
      },
      maxAgeHours: 1,
      loginRateLimit: { windowMinutes: 15, maxAttempts: 3 }
    },
    viewerAuth: {
      discord: {
        clientId: "discord-client-id",
        clientSecret: "discord-client-secret"
      }
    },
    rbac: {
      ownerUserIds: ["owner-user"],
      roleIds: {
        reviewer: [authRoleIds.reviewer],
        editor: [authRoleIds.editor],
        admin: [authRoleIds.admin]
      },
      userIds: {
        reviewer: [],
        editor: [],
        admin: []
      }
    }
  }

  const runtimeBridge: DashboardRuntimeBridge = {
    getSnapshot(currentProjectRoot: string) {
      return overrides.runtimeBridge?.getSnapshot(currentProjectRoot) || {
        capturedAt: new Date("2026-03-27T16:10:00.000Z").toISOString(),
        availability: "unavailable",
        processStartTime: null,
        readyTime: null,
        checkerSummary: { hasResult: false, valid: null, errorCount: 0, warningCount: 0, infoCount: 0 },
        pluginSummary: { discovered: 0, enabled: 0, executed: 0, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: false, scopeCount: 0 },
        ticketSummary: { available: false, total: 0, open: 0, closed: 0, claimed: 0, pinned: 0, recentActivityCount: 0 },
        warnings: ["Open Ticket runtime is not registered with the dashboard registry."],
        recentTicketActivity: []
      }
    },
    listPlugins(currentProjectRoot: string) {
      return overrides.runtimeBridge?.listPlugins(currentProjectRoot) || []
    },
    getPluginDetail(currentProjectRoot: string, pluginId: string) {
      return overrides.runtimeBridge?.getPluginDetail(currentProjectRoot, pluginId) || null
    },
    listTickets() {
      return overrides.runtimeBridge?.listTickets() || []
    },
    getRuntimeSource() {
      return overrides.runtimeBridge?.getRuntimeSource?.() || null
    },
    getGuildId() {
      return overrides.runtimeBridge?.getGuildId?.() || "guild-1"
    },
    async resolveGuildMember(userId: string) {
      const resolved = await overrides.runtimeBridge?.resolveGuildMember?.(userId)
      if (resolved) {
        return resolved
      }

      return authMembers.get(userId) || null
    }
  }

  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot,
    configOverride: config,
    runtimeBridge,
    adminAuthClient: {
      async exchangeCode(code: string) {
        return code
      },
      async fetchAdminIdentity(accessToken: string) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: accessToken.replace(/-/g, " "),
          avatarUrl: null,
          authenticatedAt: new Date().toISOString()
        }
      }
    }
  })
  const server = await new Promise<import("http").Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener))
  })
  const connections = new Set<Socket>()

  server.on("connection", (socket) => {
    connections.add(socket)
    socket.on("close", () => connections.delete(socket))
  })

  return {
    projectRoot,
    server,
    connections,
    context,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
}

async function stopTestServer(runtime: Awaited<ReturnType<typeof startTestServer>>) {
  runtime.server.close()
  runtime.server.closeIdleConnections?.()
  runtime.server.closeAllConnections?.()

  for (const socket of runtime.connections) {
    socket.destroy()
  }

  await runtime.context.authStore.close()
  runtime.server.unref()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fs.rmSync(runtime.projectRoot, { recursive: true, force: true })
}

async function startDiscordLogin(runtime: { baseUrl: string }, returnTo = "/dash/admin") {
  let cookie = ""
  const getLogin = await fetch(`${runtime.baseUrl}/dash/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual" })
  cookie = (getLogin.headers.get("set-cookie") || "").split(";")[0]
  await getLogin.text()

  const startResponse = await fetch(`${runtime.baseUrl}/dash/login/discord?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: "manual",
    headers: {
      cookie
    }
  })

  const startCookie = startResponse.headers.get("set-cookie")
  if (startCookie) {
    cookie = startCookie.split(";")[0]
  }

  assert.equal(startResponse.status, 302)
  const location = String(startResponse.headers.get("location") || "")
  assert.match(location, /discord\.com\/oauth2\/authorize/)
  const state = new URL(location).searchParams.get("state")
  assert.ok(state)

  return { cookie, state: String(state) }
}

async function finishDiscordLogin(
  runtime: { baseUrl: string },
  cookie: string,
  state: string,
  code: string
) {
  const callbackResponse = await fetch(
    `${runtime.baseUrl}/dash/login/discord/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: {
        cookie
      }
    }
  )

  const callbackCookie = callbackResponse.headers.get("set-cookie")
  if (callbackCookie) {
    cookie = callbackCookie.split(";")[0]
  }

  return {
    cookie,
    response: callbackResponse
  }
}

async function login(runtime: { baseUrl: string }, userId = "admin-user", returnTo = "/dash/admin") {
  const started = await startDiscordLogin(runtime, returnTo)
  const completed = await finishDiscordLogin(runtime, started.cookie, started.state, userId)

  assert.equal(completed.response.status, 302)
  assert.equal(completed.response.headers.get("location"), returnTo)
  await completed.response.arrayBuffer()

  return { cookie: completed.cookie }
}

test("core visual editors render the shared workspace shell and advanced tools parity", async (t) => {
  const runtime = await startTestServer(createFixtureRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const generalHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/general`, { headers: { cookie } })).text()
  assert.match(generalHtml, />Sections<\/h3>/)
  assert.match(generalHtml, /Advanced tools/)
  assert.match(generalHtml, /Command entry/)
  assert.doesNotMatch(generalHtml, /class="brand-logo"/)
  assert.doesNotMatch(generalHtml, /class="brand-kicker"/)
  assert.doesNotMatch(generalHtml, /class="site-footer"/)
  assert.match(generalHtml, /id="dashboard-ui-messages"/)
  assert.doesNotMatch(generalHtml, /hero-eyebrow/)
  assert.equal((generalHtml.match(/class="subsection-card editor-workspace-stat"/g) || []).length, 2)
  assert.match(generalHtml, /data-responsive-disclosure="workspace-advanced-tools"/)
  assert.match(generalHtml, /class="editor-workspace-main general-workspace-main"/)
  assert.match(generalHtml, /class="general-connection-layout"/)
  assert.match(generalHtml, /class="general-support-grid"/)
  assert.match(generalHtml, /class="general-advanced-grid"/)
  assertInOrder(generalHtml, [
    "Connection and command mode",
    "Status",
    "Logs",
    "Limits",
    "Advanced behavior"
  ])
  assert.match(generalHtml, /Identity and visual defaults/)
  assert.match(generalHtml, /id="section-connection"/)
  assert.match(generalHtml, /action="\/dash\/admin\/configs\/general\/review"/)
  assert.match(generalHtml, /href="\/dash\/admin\/configs\/general\/export"/)
  assert.match(generalHtml, /class="card-actions editor-utility-actions"/)
  assert.match(generalHtml, /class="editor-savebar-copy"/)
  assert.match(generalHtml, /Save changes/)
  assert.doesNotMatch(generalHtml, /Workspace navigation/)
  assert.doesNotMatch(generalHtml, /Jump to a section\./)
  assert.doesNotMatch(generalHtml, /Save General settings\./)
  assert.doesNotMatch(generalHtml, /utility tray for raw JSON, backup, review, and restore tasks/)
  assert.doesNotMatch(generalHtml, /field names unchanged/)
  assert.match(generalHtml, /name="globalAdmins"/)
  assert.match(generalHtml, /Global admin roles/)
  assert.match(generalHtml, /Store Discord role IDs as a JSON array of quoted strings/)
  assert.doesNotMatch(generalHtml, /Store Discord user IDs as a JSON array/)
  assert.match(generalHtml, /name="system\.permissions\.help"/)

  const optionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/options`, { headers: { cookie } })).text()
  assert.match(optionsHtml, /Advanced tools/)
  assert.doesNotMatch(optionsHtml, /class="brand-logo"/)
  assert.doesNotMatch(optionsHtml, /class="brand-kicker"/)
  assert.doesNotMatch(optionsHtml, /class="site-footer"/)
  assert.doesNotMatch(optionsHtml, /hero-eyebrow/)
  assert.equal((optionsHtml.match(/class="subsection-card editor-workspace-stat"/g) || []).length, 2)
  assert.match(optionsHtml, /Saved options/)
  assert.match(optionsHtml, /Manage ticket, website, and role options\./)
  assert.match(optionsHtml, /id="createOptionButton"/)
  assert.match(optionsHtml, /Duplicate/)
  assert.match(optionsHtml, /Question assignment/)
  assert.match(optionsHtml, /Assigned questions/)
  assert.match(optionsHtml, /Transcript delivery routing/)
  assert.match(optionsHtml, /class="summary-grid options-summary-grid"/)
  assert.match(optionsHtml, /class="section-card editor-savebar options-savebar"/)
  assert.match(optionsHtml, /class="options-support-grid"/)
  assert.match(optionsHtml, /class="card-grid options-dependency-grid"/)
  assert.match(optionsHtml, /class="option-ticket-layout"/)
  assert.match(optionsHtml, /Channel setup/)
  assert.match(optionsHtml, /Automation and limits/)
  assert.match(optionsHtml, /Use global transcript default/)
  assert.match(optionsHtml, /Explicit transcript channel IDs/)
  assert.match(optionsHtml, /id="transcriptUseGlobalDefault"/)
  assert.match(optionsHtml, /id="transcriptChannels" disabled readonly/)
  assert.match(optionsHtml, /comma-separated, newline-separated, or JSON-array channel IDs/i)
  assert.match(optionsHtml, /data-question-id="question-1"/)
  assert.match(optionsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(optionsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(optionsHtml, /<p class="config-file">Assigned questions<\/p>/)
  assert.doesNotMatch(optionsHtml, /<p class="config-file">Referencing panels<\/p>/)
  assert.doesNotMatch(optionsHtml, /id="openOptionModal"/)
  assert.doesNotMatch(optionsHtml, /Primary editor/)
  assert.doesNotMatch(optionsHtml, /leave raw JSON in the advanced tools tray/)
  assert.doesNotMatch(optionsHtml, /payload shape unchanged/)
  assert.doesNotMatch(optionsHtml, /Pick an option or start a new draft\./)
  assert.doesNotMatch(optionsHtml, /Edit the selected option with questions and panel usage in view\./)
  assert.doesNotMatch(optionsHtml, /These questions will be asked when this option is selected\./)
  assert.doesNotMatch(optionsHtml, /These panels currently include this option\./)
  assert.doesNotMatch(optionsHtml, /Configure ticket channels, automation, transcripts, and question assignment\./)
  assert.doesNotMatch(optionsHtml, /Set the name, ID, and button label first\./)
  assert.doesNotMatch(optionsHtml, /Set the ticket naming and category routing\./)
  assert.doesNotMatch(optionsHtml, /Save option changes\./)
  assert.doesNotMatch(optionsHtml, /options\.workspace\.saveTitle/)
  assert.match(optionsHtml, /action="\/dash\/admin\/configs\/options\/review"/)
  assert.match(optionsHtml, /href="\/dash\/admin\/configs\/options\/export"/)

  const optionsScript = fs.readFileSync(path.join(pluginRoot, "public", "js", "config-options.js"), "utf8")
  assert.match(optionsScript, /fields\.transcriptUseGlobalDefault\.checked = true/)
  assert.match(optionsScript, /fields\.transcriptChannels\.value = ui\.stringifyList\(buildDefaultTranscriptRouting\(\)\.channels\)/)
  assert.match(optionsScript, /fields\.transcriptChannels\.disabled = disabled/)
  assert.match(optionsScript, /fields\.transcriptChannels\.readOnly = disabled/)
  assert.match(optionsScript, /channels: ui\.parseList\(fields\.transcriptChannels\.value\)/)

  const panelsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/panels`, { headers: { cookie } })).text()
  assert.match(panelsHtml, /Advanced tools/)
  assert.doesNotMatch(panelsHtml, /class="brand-logo"/)
  assert.doesNotMatch(panelsHtml, /hero-eyebrow/)
  assert.equal((panelsHtml.match(/class="subsection-card editor-workspace-stat"/g) || []).length, 2)
  assert.match(panelsHtml, /id="createPanelButton"/)
  assert.match(panelsHtml, /Duplicate/)
  assert.match(panelsHtml, /Option picker/)
  assert.match(panelsHtml, /Member preview/)
  assert.match(panelsHtml, /Saved panels/)
  assert.match(panelsHtml, /Build ticket panels\./)
  assert.match(panelsHtml, /class="summary-grid panels-summary-grid"/)
  assert.match(panelsHtml, /class="panels-two-column-grid panels-primary-grid"/)
  assert.match(panelsHtml, /class="section-card editor-savebar panels-savebar"/)
  assert.match(panelsHtml, /data-option-id="option-1"/)
  assert.match(panelsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(panelsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(panelsHtml, /<p class="config-file">Selected options<\/p>/)
  assert.doesNotMatch(panelsHtml, /<p class="config-file">Member-facing summary<\/p>/)
  assert.doesNotMatch(panelsHtml, /id="openPanelModal"/)
  assert.doesNotMatch(panelsHtml, /Primary editor/)
  assert.doesNotMatch(panelsHtml, /Select a panel or start a new draft\./)
  assert.doesNotMatch(panelsHtml, /Edit the selected panel with option selection and preview feedback in view\./)
  assert.doesNotMatch(panelsHtml, /Saved order still controls entry order\./)
  assert.doesNotMatch(panelsHtml, /Switch between buttons and dropdown mode here\./)
  assert.doesNotMatch(panelsHtml, /Selected options stay visible in the picker and preview\./)
  assert.doesNotMatch(panelsHtml, /Set the ID, name, entry mode, and member copy first\./)
  assert.doesNotMatch(panelsHtml, /Keep the main embed title, description, and color visible before opening deeper embed fields\./)
  assert.doesNotMatch(panelsHtml, /Choose options with emoji, type, and description still visible\./)
  assert.doesNotMatch(panelsHtml, /Keep the member-facing result visible while you edit\./)
  assert.doesNotMatch(panelsHtml, /These options publish with this panel\./)
  assert.doesNotMatch(panelsHtml, /Open low-frequency embed fields and description layout switches here\./)
  assert.doesNotMatch(panelsHtml, /Save panel changes\./)
  assert.doesNotMatch(panelsHtml, /panels\.workspace\.saveTitle/)
  assert.doesNotMatch(panelsHtml, /raw JSON stays in advanced tools/)
  assert.doesNotMatch(panelsHtml, /payload shape unchanged/)
  assert.match(panelsHtml, /action="\/dash\/admin\/configs\/panels\/review"/)
  assert.match(panelsHtml, /href="\/dash\/admin\/configs\/panels\/export"/)

  const questionsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/questions`, { headers: { cookie } })).text()
  assert.match(questionsHtml, /Advanced tools/)
  assert.doesNotMatch(questionsHtml, /class="brand-logo"/)
  assert.doesNotMatch(questionsHtml, /hero-eyebrow/)
  assert.equal((questionsHtml.match(/class="subsection-card editor-workspace-stat"/g) || []).length, 2)
  assert.match(questionsHtml, /id="createQuestionButton"/)
  assert.match(questionsHtml, /Duplicate/)
  assert.match(questionsHtml, /Manage reusable intake questions\./)
  assert.match(questionsHtml, /Usage/)
  assert.match(questionsHtml, /Question details/)
  assert.match(questionsHtml, /Saved questions/)
  assert.match(questionsHtml, /class="summary-grid questions-summary-grid"/)
  assert.match(questionsHtml, /class="questions-two-column-grid questions-detail-grid"/)
  assert.match(questionsHtml, /class="section-card editor-savebar questions-savebar"/)
  assert.match(questionsHtml, /option-1/)
  assert.match(questionsHtml, /class="card-actions editor-toolbar-actions"/)
  assert.match(questionsHtml, /class="editor-savebar-copy"/)
  assert.doesNotMatch(questionsHtml, /<p class="config-file">Referenced by options<\/p>/)
  assert.doesNotMatch(questionsHtml, /id="openQuestionModal"/)
  assert.doesNotMatch(questionsHtml, /Primary editor/)
  assert.doesNotMatch(questionsHtml, /raw JSON stays in advanced tools/)
  assert.doesNotMatch(questionsHtml, /payload shape unchanged/)
  assert.doesNotMatch(questionsHtml, /Select a reusable question or start a new draft\./)
  assert.doesNotMatch(questionsHtml, /Edit the selected question with option usage in view\./)
  assert.doesNotMatch(questionsHtml, /Saved order still controls ticket intake order\./)
  assert.doesNotMatch(questionsHtml, /Prompt type stays visible while you edit placeholder and length rules\./)
  assert.doesNotMatch(questionsHtml, /Option usage stays visible while you edit\./)
  assert.doesNotMatch(questionsHtml, /See which options still rely on this question\./)
  assert.doesNotMatch(questionsHtml, /These options currently include this question\./)
  assert.doesNotMatch(questionsHtml, /Set the reusable ID, name, type, and placeholder first\./)
  assert.doesNotMatch(questionsHtml, /Open low-frequency length rules here\./)
  assert.doesNotMatch(questionsHtml, /Save question changes\./)
  assert.doesNotMatch(questionsHtml, /questions\.workspace\.saveTitle/)
  assert.match(questionsHtml, /action="\/dash\/admin\/configs\/questions\/review"/)
  assert.match(questionsHtml, /href="\/dash\/admin\/configs\/questions\/export"/)

  const transcriptsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, { headers: { cookie } })).text()
  assertInOrder(transcriptsHtml, [
    "Transcript editor workflow",
    "Transcript delivery",
    "Text transcript output",
    "HTML preview and presets",
    "HTML appearance",
    "Advanced transcript options"
  ])
  assert.match(transcriptsHtml, /Open transcript workspace/)
  assert.match(transcriptsHtml, /Default transcript channel ID/)
  assert.match(transcriptsHtml, /Ticket option overrides live in the Options workspace/)
  assert.match(transcriptsHtml, /name="htmlTranscriptStyle\.header\.backgroundColor"/)
  assert.match(transcriptsHtml, /Preview is unavailable/)
  assert.doesNotMatch(transcriptsHtml, /Common settings/)
  assert.doesNotMatch(transcriptsHtml, /Advanced settings/)
  assert.doesNotMatch(transcriptsHtml, /name="transcript-style-preview"/)
})

test("transcript visual editor renders preset controls and preview iframe when preview capability is available", async (t) => {
  const runtime = await startTestServer(createFixtureRoot(), "/dash", {
    runtimeBridge: createTranscriptPreviewRuntimeBridge()
  })
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const transcriptsHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, { headers: { cookie } })).text()
  assertInOrder(transcriptsHtml, [
    "Transcript editor workflow",
    "Transcript delivery",
    "Text transcript output",
    "HTML preview and presets",
    "HTML appearance",
    "Advanced transcript options"
  ])
  assert.match(transcriptsHtml, /Discord Classic/)
  assert.match(transcriptsHtml, /Forest Ledger/)
  assert.match(transcriptsHtml, /Apply preset/)
  assert.match(transcriptsHtml, /Reset style to saved values/)
  assert.match(transcriptsHtml, /Refresh preview/)
  assert.match(transcriptsHtml, /id="transcriptPreviewFrame"/)
  assert.match(transcriptsHtml, /name="transcript-style-preview"/)
  assert.match(transcriptsHtml, /id="transcript-saved-style"/)
  assert.match(transcriptsHtml, /id="transcript-style-presets"/)
  assert.doesNotMatch(transcriptsHtml, /Preview is unavailable/)
})

test("editor save paths preserve advanced values while common fields change", async () => {
  const root = createFixtureRoot()
  const service = createConfigService(root)

  try {
    const general = service.readManagedJson<Record<string, any>>("general")
    const generalBody = buildGeneralFormBody(general)
    generalBody.set("prefix", "!support ")
    generalBody.set("status.text", "updated")
    service.saveGeneralForm(Object.fromEntries(generalBody))

    const savedGeneral = service.readManagedJson<Record<string, any>>("general")
    assert.equal(savedGeneral.prefix, "!support ")
    assert.equal(savedGeneral.status.text, "updated")
    assert.deepEqual(savedGeneral.globalAdmins, generalGlobalAdminIds)
    assert.equal(savedGeneral.system.permissions.help, "everyone")
    assert.equal(savedGeneral.system.messages.creation.dm, true)

    const transcripts = service.readManagedJson<Record<string, any>>("transcripts")
    const transcriptsBody = buildTranscriptsFormBody(transcripts)
    transcriptsBody.set("general.mode", "text")
    transcriptsBody.set("textTranscriptStyle.fileMode", "channel-id")
    service.saveTranscriptsForm(Object.fromEntries(transcriptsBody))

    const savedTranscripts = service.readManagedJson<Record<string, any>>("transcripts")
    assert.equal(savedTranscripts.general.mode, "text")
    assert.equal(savedTranscripts.textTranscriptStyle.fileMode, "channel-id")
    assert.equal(savedTranscripts.htmlTranscriptStyle.favicon.imageUrl, "https://example.com/favicon.png")
    assert.equal(savedTranscripts.htmlTranscriptStyle.header.backgroundColor, "#202225")

    service.saveOption({
      id: "option-1",
      name: "Updated support",
      description: "Edited description",
      type: "ticket",
      button: { emoji: "🎫", label: "Updated support", color: "green" }
    }, 0)

    const savedOption = service.readManagedJson<any[]>("options")[0]
    assert.equal(savedOption.name, "Updated support")
    assert.deepEqual(savedOption.channel.claimedCategory, [{ user: "4", category: "44" }])
    assert.deepEqual(savedOption.dmMessage.embed.fields, [{ name: "DM retained", value: "DM field", inline: false }])
    assert.equal(savedOption.slowMode.slowModeSeconds, 45)

    service.savePanel({
      id: "panel-1",
      name: "Updated panel",
      dropdown: true,
      options: ["option-1"],
      text: "Updated"
    }, 0)

    const savedPanel = service.readManagedJson<any[]>("panels")[0]
    assert.equal(savedPanel.name, "Updated panel")
    assert.equal(savedPanel.embed.footer, "Retained footer")
    assert.equal(savedPanel.settings.describeOptionsLayout, "normal")
    assert.equal(savedPanel.settings.describeOptionsCustomTitle, "Details")

    service.saveQuestion({
      id: "question-1",
      name: "Updated summary",
      type: "short",
      required: false,
      placeholder: "New placeholder"
    }, 0)

    const savedQuestion = service.readManagedJson<any[]>("questions")[0]
    assert.equal(savedQuestion.name, "Updated summary")
    assert.equal(savedQuestion.length.enabled, true)
    assert.equal(savedQuestion.length.min, 5)
    assert.equal(savedQuestion.length.max, 250)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("general and transcript submit routes still accept the redesigned editor forms", async (t) => {
  const runtime = await startTestServer(createFixtureRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const generalPage = await fetch(`${runtime.baseUrl}/dash/visual/general`, { headers: { cookie } })
  const generalHtml = await generalPage.text()
  const generalCsrf = parseBodyData(generalHtml, "csrf-token")

  const generalService = createConfigService(runtime.projectRoot)
  const generalBody = buildGeneralFormBody(generalService.readManagedJson("general"))
  generalBody.set("csrfToken", generalCsrf)
  generalBody.set("serverId", "guild-2")

  const generalResponse = await fetch(`${runtime.baseUrl}/dash/api/config/general`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: generalBody.toString()
  })
  assert.equal(generalResponse.status, 302)
  assert.equal(generalService.readManagedJson<any>("general").serverId, "guild-2")
  assert.deepEqual(generalService.readManagedJson<any>("general").globalAdmins, generalGlobalAdminIds)

  const transcriptsPage = await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, { headers: { cookie } })
  const transcriptsHtml = await transcriptsPage.text()
  const transcriptsCsrf = parseBodyData(transcriptsHtml, "csrf-token")

  const transcriptService = createConfigService(runtime.projectRoot)
  const transcriptsBody = buildTranscriptsFormBody(transcriptService.readManagedJson("transcripts"))
  transcriptsBody.set("csrfToken", transcriptsCsrf)
  transcriptsBody.set("general.mode", "text")

  const transcriptsResponse = await fetch(`${runtime.baseUrl}/dash/api/config/transcripts`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: transcriptsBody.toString()
  })
  assert.equal(transcriptsResponse.status, 302)
  assert.equal(transcriptService.readManagedJson<any>("transcripts").general.mode, "text")
  assert.equal(transcriptService.readManagedJson<any>("transcripts").htmlTranscriptStyle.favicon.imageUrl, "https://example.com/favicon.png")
})

test("general submit route rejects invalid globalAdmins JSON, preserves draft state, and skips success audit writes", async (t) => {
  const runtime = await startTestServer(createFixtureRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const generalService = createConfigService(runtime.projectRoot)
  const generalPath = path.join(runtime.projectRoot, "config", "general.json")
  const originalGeneralText = fs.readFileSync(generalPath, "utf8")

  const generalPage = await fetch(`${runtime.baseUrl}/dash/visual/general`, { headers: { cookie } })
  const generalHtml = await generalPage.text()
  const generalCsrf = parseBodyData(generalHtml, "csrf-token")
  const generalBody = buildGeneralFormBody(generalService.readManagedJson("general"))
  const auditBefore = (await runtime.context.authStore.listAuditEvents({ limit: 100 }))
    .filter((event) => event.eventType === "config-save" && event.target === "general" && event.reason === "visual-general-form")

  generalBody.set("csrfToken", generalCsrf)
  generalBody.set("serverId", "guild-invalid")
  generalBody.set("globalAdmins", `[\n  "${generalGlobalAdminIds[0]}",\n]`)

  const generalResponse = await fetch(`${runtime.baseUrl}/dash/api/config/general`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: generalBody.toString()
  })

  const responseHtml = await generalResponse.text()
  const auditAfter = (await runtime.context.authStore.listAuditEvents({ limit: 100 }))
    .filter((event) => event.eventType === "config-save" && event.target === "general" && event.reason === "visual-general-form")

  assert.equal(generalResponse.status, 400)
  assert.match(responseHtml, /Enter valid JSON for this field/)
  assert.match(responseHtml, /value="guild-invalid"/)
  assert.equal(parseTextareaValue(responseHtml, "globalAdmins"), `[\n  "${generalGlobalAdminIds[0]}",\n]`)
  assert.equal(fs.readFileSync(generalPath, "utf8"), originalGeneralText)
  assert.deepEqual(generalService.readManagedJson<any>("general").globalAdmins, generalGlobalAdminIds)
  assert.equal(auditAfter.length, auditBefore.length)
})
