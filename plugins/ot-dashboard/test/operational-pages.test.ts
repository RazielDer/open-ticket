import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { AddressInfo, Socket } from "net"
import { test } from "node:test"

import { createDashboardApp, type DashboardPluginRegistryBridge } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import {
  clearDashboardRuntimeRegistry,
  registerDashboardRuntime,
  type DashboardRuntimeSource
} from "../server/dashboard-runtime-registry"
import type { DashboardActionProviderBridge } from "../server/action-provider-bridge"
import { defaultDashboardRuntimeBridge, type DashboardRuntimeBridge } from "../server/runtime-bridge"
import type {
  DashboardListTranscriptsQuery,
  DashboardListTranscriptsResult,
  DashboardTranscriptActionResult,
  DashboardTranscriptDetail,
  DashboardTranscriptRecord,
  DashboardTranscriptService,
  DashboardTranscriptSummary
} from "../server/transcript-service-bridge"
import { createDashboardTranscriptPluginEntry } from "../../ot-html-transcripts/dashboard-workbench"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")
const generalGlobalAdminIds = ["123456789012345678", "234567890123456789"]

function createTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-operational-"))
  fs.mkdirSync(path.join(root, "config"), { recursive: true })
  fs.mkdirSync(path.join(root, "plugins"), { recursive: true })

  fs.writeFileSync(path.join(root, "config", "general.json"), JSON.stringify({
    token: "token",
    mainColor: "#ffffff",
    language: "english",
    prefix: "!ticket ",
    serverId: "1",
    globalAdmins: [],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "ready", state: "" },
    system: {
      emojiStyle: "before",
      pinEmoji: "📌",
      logs: { enabled: true, channel: "2" },
      limits: { enabled: true, globalMaximum: 5, userMaximum: 1 },
      channelTopic: {},
      permissions: {},
      messages: {}
    }
  }, null, 2))
  fs.writeFileSync(path.join(root, "config", "options.json"), JSON.stringify([{ id: "support", name: "Support" }], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "panels.json"), JSON.stringify([{ id: "main", name: "Main panel", options: ["support"] }], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "questions.json"), JSON.stringify([{ id: "summary", name: "Summary", required: true }], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "transcripts.json"), JSON.stringify({
    general: {
      enabled: true,
      enableChannel: true,
      enableCreatorDM: false,
      enableParticipantDM: false,
      enableActiveAdminDM: false,
      enableEveryAdminDM: false,
      channel: "1",
      mode: "html"
    },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: {
      layout: "normal",
      includeStats: true,
      includeIds: false,
      includeEmbeds: true,
      includeFiles: true,
      includeBotMessages: true,
      fileMode: "channel-name",
      customFileName: "transcript"
    },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    }
  }, null, 2))

  writePlugin(root, "ot-html-transcripts", {
    id: "ot-html-transcripts",
    name: "HTML Transcripts",
    enabled: true,
    priority: 5,
    details: {
      author: "Dashboard Team",
      shortDescription: "Publishes HTML transcript archives for ticket staff.",
      longDescription: "Provides archive generation, link management, and mirrored transcript assets.",
      tags: ["transcripts", "archives"]
    },
    supportedVersions: ["v1"]
  }, {
    "config/settings.json": { queueConcurrency: 2, publicBaseUrl: "https://transcripts.example.test" }
  })

  writePlugin(root, "ot-needs-attention", {
    id: "ot-needs-attention",
    name: "Needs Attention",
    enabled: true,
    priority: 10,
    details: {
      author: "Dashboard Team",
      shortDescription: "Example plugin that currently fails to boot.",
      tags: ["ops"]
    }
  }, {
    "config/state.json": { enabled: true }
  })

  writePlugin(root, "ot-disabled", {
    id: "ot-disabled",
    name: "Disabled Plugin",
    enabled: false,
    priority: 20,
    details: {
      author: "Dashboard Team",
      shortDescription: "Installed but intentionally disabled.",
      tags: ["maintenance"]
    }
  }, {
    "config/disabled.json": { enabled: false }
  })

  writePlugin(root, "ot-installed", {
    id: "ot-installed",
    name: "Installed Only",
    enabled: true,
    priority: 30,
    details: {
      author: "Dashboard Team",
      shortDescription: "Manifest is present but the runtime has not loaded it yet.",
      tags: ["inventory"]
    }
  }, {
    "config/installed.json": { loaded: false }
  })

  return root
}

function writePlugin(
  projectRoot: string,
  directory: string,
  manifest: Record<string, unknown>,
  assets: Record<string, unknown>
) {
  const pluginDirectory = path.join(projectRoot, "plugins", directory)
  fs.mkdirSync(pluginDirectory, { recursive: true })
  fs.writeFileSync(path.join(pluginDirectory, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n")
  for (const [relativePath, value] of Object.entries(assets)) {
    const assetPath = path.join(pluginDirectory, relativePath)
    fs.mkdirSync(path.dirname(assetPath), { recursive: true })
    fs.writeFileSync(assetPath, JSON.stringify(value, null, 2) + "\n")
  }
}

function parseHiddenValue(html: string, name: string) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`))
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
    assert.ok(next > cursor, `Expected "${value}" after "${values[values.indexOf(value) - 1] || "start"}"`)
    cursor = next
  }
}

function createRuntimeTicket(id: string, optionId: string) {
  const values = new Map<string, unknown>([
    ["opendiscord:opened-by", "user-1"],
    ["opendiscord:opened-on", 1710000000000],
    ["opendiscord:open", true],
    ["opendiscord:closed", false],
    ["opendiscord:claimed", true],
    ["opendiscord:pinned", false],
    ["opendiscord:claimed-by", "mod-1"],
    ["opendiscord:participants", ["user-1", "mod-1"]],
    ["opendiscord:category-mode", "open"],
    ["opendiscord:channel-suffix", "support"]
  ])

  return {
    id: { value: id },
    option: { id: { value: optionId } },
    get(key: string) {
      return { value: values.get(key) }
    }
  }
}

function createTranscriptFixture() {
  const transcript: DashboardTranscriptRecord = {
    id: "tr-1",
    status: "active",
    ticketId: "ticket-1",
    channelId: "channel-1",
    guildId: "guild-1",
    creatorId: "user-1",
    deleterId: null,
    activeSlug: "transcript-slug",
    publicUrl: "https://transcripts.example.test/t/tr-1",
    archivePath: "archives/tr-1",
    statusReason: null,
    createdAt: "2026-03-24T18:00:00.000Z",
    updatedAt: "2026-03-24T18:10:00.000Z",
    messageCount: 18,
    attachmentCount: 3,
    warningCount: 1,
    totalBytes: 4096
  }

  const detail: DashboardTranscriptDetail = {
    transcript,
    links: [
      {
        id: "link-1",
        transcriptId: transcript.id,
        slug: "transcript-slug",
        status: "active",
        reason: null,
        createdAt: "2026-03-24T18:00:00.000Z",
        expiresAt: null,
        expiredAt: null,
        revokedAt: null,
        publicUrl: transcript.publicUrl
      }
    ],
    participants: [
      { id: "p-1", userId: "user-1", displayName: "Ticket Creator", role: "creator" },
      { id: "p-2", userId: "mod-1", displayName: "Moderator", role: "admin" }
    ],
    assets: [
      {
        id: "asset-1",
        assetName: "conversation.html",
        sourceUrl: "https://cdn.example.test/conversation.html",
        archiveRelativePath: "archives/tr-1/conversation.html",
        mimeType: "text/html",
        byteSize: 2048,
        status: "mirrored",
        reason: null
      }
    ]
  }

  let currentDetail = structuredClone(detail)

  const summary: DashboardTranscriptSummary = {
    total: 1,
    active: 1,
    partial: 0,
    revoked: 0,
    deleted: 0,
    failed: 0,
    building: 0,
    totalArchiveBytes: 4096,
    queueDepth: 0,
    recoveredBuilds: 0
  }

  const service: DashboardTranscriptService = {
    isHealthy() {
      return true
    },
    async getSummary() {
      return summary
    },
    async resolveTranscript(target: string) {
      return target === currentDetail.transcript.id ? currentDetail.transcript : null
    },
    async listTranscripts(query: DashboardListTranscriptsQuery): Promise<DashboardListTranscriptsResult> {
      const filtered = [currentDetail.transcript].filter((item) => {
        if (query.status && item.status !== query.status) return false
        if (query.search && ![item.id, item.ticketId, item.channelId, item.activeSlug, item.statusReason].join(" ").toLowerCase().includes(query.search.toLowerCase())) {
          return false
        }
        return true
      })
      return {
        total: filtered.length,
        items: filtered.slice(query.offset || 0, (query.offset || 0) + (query.limit || filtered.length))
      }
    },
    async getTranscriptDetail(target: string) {
      return target === currentDetail.transcript.id ? currentDetail : null
    },
    async revokeTranscript(id: string, reason?: string): Promise<DashboardTranscriptActionResult> {
      currentDetail = {
        ...currentDetail,
        transcript: {
          ...currentDetail.transcript,
          status: "revoked",
          statusReason: reason || "Revoked from dashboard"
        }
      }
      return { ok: true, action: "revoke", target: id, status: "revoked", message: `Revoked ${id}.` }
    },
    async reissueTranscript(id: string): Promise<DashboardTranscriptActionResult> {
      return { ok: true, action: "reissue", target: id, status: "active", message: `Reissued ${id}.` }
    },
    async deleteTranscript(id: string): Promise<DashboardTranscriptActionResult> {
      return { ok: true, action: "delete", target: id, status: "deleted", message: `Deleted ${id}.` }
    }
  }

  service.listOperationalTranscripts = async (query) => {
    const base = await service.listTranscripts!(query)
    return {
      total: base.total,
      matchingSummary: {
        total: base.total,
        active: base.items.filter((item) => item.status === "active").length,
        partial: base.items.filter((item) => item.status === "partial").length,
        revoked: base.items.filter((item) => item.status === "revoked").length,
        deleted: base.items.filter((item) => item.status === "deleted").length,
        failed: base.items.filter((item) => item.status === "failed").length,
        building: base.items.filter((item) => item.status === "building").length
      },
      items: base.items.map((item) => ({
        ...item,
        integrityHealth: "healthy",
        repairable: false,
        retentionCandidate: false,
        canBulkRevoke: Boolean(item.activeSlug),
        canBulkDelete: item.status === "revoked" || item.status === "deleted" || item.status === "failed",
        canExport: item.status !== "building"
      }))
    }
  }
  service.bulkRevokeTranscripts = async (ids: string[]) => ({
    action: "revoke",
    requested: ids.length,
    succeeded: ids.length,
    skipped: 0,
    failed: 0,
    items: ids.map((transcriptId) => ({
      transcriptId,
      ok: true,
      status: "ok",
      message: `Revoked ${transcriptId}.`
    })),
    message: `Bulk revoke finished: ${ids.length} succeeded, 0 skipped, 0 failed.`
  })
  service.bulkDeleteTranscripts = async (ids: string[]) => ({
    action: "delete",
    requested: ids.length,
    succeeded: ids.length,
    skipped: 0,
    failed: 0,
    items: ids.map((transcriptId) => ({
      transcriptId,
      ok: true,
      status: "ok",
      message: `Deleted ${transcriptId}.`
    })),
    message: `Bulk delete finished: ${ids.length} succeeded, 0 skipped, 0 failed.`
  })
  service.prepareBulkTranscriptExport = async () => ({
    ok: true,
    message: "Prepared a bundled export for 1 transcript(s).",
    export: {
      exportId: "bulk-export-1",
      fileName: "transcripts-bulk.zip",
      filePath: path.join(os.tmpdir(), "transcripts-bulk.zip"),
      contentType: "application/zip",
      byteSize: 0,
      exportedCount: 1,
      skippedCount: 0,
      createdAt: "2026-03-24T18:10:00.000Z"
    },
    items: [{
      transcriptId: currentDetail.transcript.id,
      ok: true,
      status: "ok",
      message: `Prepared ${currentDetail.transcript.id}.`,
      fileName: `transcript-${currentDetail.transcript.id}.zip`
    }]
  })
  service.prepareTranscriptExport = async (target: string) => ({
    ok: true,
    target,
    transcriptId: target,
    message: `Prepared export for ${target}.`,
    export: {
      exportId: "export-1",
      transcriptId: target,
      format: "zip",
      fileName: `transcript-${target}.zip`,
      filePath: path.join(os.tmpdir(), `transcript-${target}.zip`),
      contentType: "application/zip",
      byteSize: 0,
      archiveIncluded: true,
      createdAt: "2026-03-24T18:10:00.000Z"
    }
  })
  service.releasePreparedTranscriptExport = async () => true

  return { service }
}

function createRuntime() {
  const { service } = createTranscriptFixture()
  const transcriptPlugin = {
    id: { value: "ot-html-transcripts" },
    dir: "ot-html-transcripts",
    enabled: true,
    executed: true,
    crashed: false,
    priority: 5,
    version: "1.0.0",
    details: {
      author: "Dashboard Team",
      contributors: [],
      shortDescription: "Publishes HTML transcript archives for ticket staff.",
      tags: ["transcripts", "archives"]
    },
    dependenciesInstalled() {
      return []
    },
    pluginsInstalled() {
      return []
    },
    pluginsIncompatible() {
      return []
    }
  }
  const crashedPlugin = {
    id: { value: "ot-needs-attention" },
    dir: "ot-needs-attention",
    enabled: true,
    executed: false,
    crashed: true,
    crashReason: "Boot failed",
    priority: 10,
    version: "1.0.0",
    details: {
      author: "Dashboard Team",
      contributors: [],
      shortDescription: "Example plugin that currently fails to boot.",
      tags: ["ops"]
    }
  }
  const plugins = [transcriptPlugin, crashedPlugin]
  const tickets = [createRuntimeTicket("ticket-1", "support")]

  const runtime: DashboardRuntimeSource = {
    processStartupDate: new Date("2026-03-24T17:30:00.000Z"),
    readyStartupDate: new Date("2026-03-24T17:35:00.000Z"),
    plugins: {
      getAll() {
        return plugins
      },
      get(id: string) {
        return plugins.find((item) => item.id.value === id || item.dir === id) || null
      },
      classes: {
        get(id: string) {
          return id === "ot-html-transcripts:service" ? service : null
        }
      },
      unknownCrashedPlugins: []
    },
    checkers: {
      lastResult: {
        valid: true,
        messages: [{ type: "info" }]
      }
    },
    tickets: {
      getAll() {
        return tickets
      },
      get(id: string) {
        return tickets.find((item) => item.id.value === id) || null
      },
      onAdd() {},
      onChange() {},
      onRemove() {}
    }
  }

  clearDashboardRuntimeRegistry()
  registerDashboardRuntime(runtime)
  return { runtime, service }
}

function createPluginRegistryBridge(service: DashboardTranscriptService): DashboardPluginRegistryBridge {
  const entry = createDashboardTranscriptPluginEntry({
    configs: {
      get(id: string) {
        if (id !== "opendiscord:transcripts") return null
        return {
          data: {
            general: {
              mode: "html"
            }
          }
        }
      }
    },
    plugins: {
      classes: {
        get(id: string) {
          return id === "ot-html-transcripts:service" ? service : null
        }
      }
    }
  })

  return {
    async listSections(pluginId: string, context) {
      if (pluginId !== entry.pluginId) return []
      const staticSections = Array.isArray(entry.sections) ? [...entry.sections] : []
      const dynamicSections = entry.buildSections ? await entry.buildSections(context) : []
      return [...staticSections, ...dynamicSections]
    },
    getAssetKind(pluginId: string, relativePath: string) {
      if (pluginId === "ot-html-transcripts" && relativePath === "config/settings.json") {
        return "object"
      }
      return "json"
    }
  }
}

function createActionProviderBridge(): DashboardActionProviderBridge {
  return {
    list(_snapshot, options) {
      if (options?.pluginId === "ot-html-transcripts") {
        return [
          {
            id: "plugin-tools",
            title: "Transcript maintenance",
            pluginId: "ot-html-transcripts",
            availability: { available: true, reason: "" },
            actions: [
              {
                id: "refresh-cache",
                label: "Refresh transcript cache",
                description: "Refreshes transcript-derived dashboard state.",
                confirmation: { required: true, text: "Refresh transcript cache now?" },
                guard: {
                  auth: "required",
                  csrf: "required",
                  runtimeAvailability: "required"
                }
              }
            ]
          }
        ]
      }

      return [
        {
          id: "runtime-tools",
          title: "Runtime maintenance",
          pluginId: null,
            availability: { available: true, reason: "" },
            actions: [
              {
                id: "refresh-runtime",
                label: "Refresh runtime snapshot",
                description: "Refreshes the runtime snapshot card set.",
                confirmation: { required: true, text: "Refresh runtime snapshot now?" },
                guard: {
                  auth: "required",
                  csrf: "required",
                  runtimeAvailability: "required"
                }
              }
            ]
          }
        ]
    },
    async run(providerId, actionId) {
      return {
        ok: true,
        message: `Ran ${providerId}:${actionId}.`
      }
    }
  }
}

async function startTestServer(projectRoot: string, basePath = "/dash") {
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

  const runtime = createRuntime()
  const runtimeBridge: DashboardRuntimeBridge = {
    ...defaultDashboardRuntimeBridge,
    getGuildId() {
      return "guild-1"
    },
    async resolveGuildMember(userId: string) {
      return authMembers.get(userId) || null
    }
  }
  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot,
    configOverride: config,
    runtimeBridge,
    actionProviderBridge: createActionProviderBridge(),
    pluginRegistryBridge: createPluginRegistryBridge(runtime.service),
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
  context.backupService.createBackup("Baseline config backup", "manual")
  context.pluginManagementService.createBackup("ot-html-transcripts", "Baseline plugin backup", "manual")

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
  clearDashboardRuntimeRegistry()
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

test("operational pages render the beginner-first slice while keeping advanced routes alive", async (t) => {
  const runtime = await startTestServer(createTempProjectRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const assetId = runtime.context.pluginManagementService.encodeAssetId("config/settings.json")

  const configResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs/general`, { headers: { cookie } })
  const configHtml = await configResponse.text()
  assert.equal(configResponse.status, 200)
  assert.match(configHtml, /General configuration/)
  assert.match(configHtml, /Sections/)
  assert.match(configHtml, /Command entry/)
  assert.match(configHtml, /Connection and command mode/)
  assert.match(configHtml, /Advanced tools/)
  assert.doesNotMatch(configHtml, /class="site-footer"/)
  assert.match(configHtml, /id="dashboard-ui-messages"/)

  const pluginsResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins`, { headers: { cookie } })
  const pluginsHtml = await pluginsResponse.text()
  assert.equal(pluginsResponse.status, 200)
  assertInOrder(pluginsHtml, [
    "Needs attention",
    "Running",
    "Installed, not loaded",
    "Disabled"
  ])
  assert.match(pluginsHtml, /Running/)
  assert.match(pluginsHtml, /Needs attention/)
  assert.match(pluginsHtml, /Disabled/)
  assert.match(pluginsHtml, /Installed, not loaded/)
  assert.match(pluginsHtml, /Add-ons/)
  assert.match(pluginsHtml, /add-on\(s\) in this project\./)
  assert.match(pluginsHtml, /pluginInventoryEmpty/)
  assert.doesNotMatch(pluginsHtml, /href="\/dash\/health"/)
  assert.doesNotMatch(pluginsHtml, /class="site-footer"/)
  assert.doesNotMatch(pluginsHtml, /Manifest only/)

  const pluginDetailResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/ot-html-transcripts`, { headers: { cookie } })
  const pluginDetailHtml = await pluginDetailResponse.text()
  assert.equal(pluginDetailResponse.status, 200)
  assertInOrder(pluginDetailHtml, [
    "Purpose and status",
    "Transcript workspace",
    "Advanced tools",
    "Manifest settings",
    "JSON files",
    "Backups"
  ])
  assert.match(pluginDetailHtml, /Open transcript workspace/)
  assert.match(pluginDetailHtml, /Open transcript settings/)
  assert.match(pluginDetailHtml, /Configured mode: HTML\./)
  assert.match(pluginDetailHtml, /Global transcript settings provide the default channel/)
  assert.match(pluginDetailHtml, /ticket option editor/)
  assert.match(pluginDetailHtml, /Transcript maintenance/)

  const assetResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/ot-html-transcripts/assets/${assetId}`, { headers: { cookie } })
  const assetHtml = await assetResponse.text()
  assert.equal(assetResponse.status, 200)
  assert.match(assetHtml, /Draft and review/)
  assert.match(assetHtml, /Recent backups for this file/)

  const ticketsResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, {
    headers: { cookie },
    redirect: "manual"
  })
  await ticketsResponse.arrayBuffer()
  assert.equal(ticketsResponse.status, 302)
  assert.equal(ticketsResponse.headers.get("location"), "/dash/admin")

  const transcriptsResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, { headers: { cookie } })
  const transcriptsHtml = await transcriptsResponse.text()
  assert.equal(transcriptsResponse.status, 200)
  assert.match(transcriptsHtml, /Review transcript archives here\. Single-record actions stay on transcript detail pages, and bulk tools stay with the table below\./)
  assert.doesNotMatch(transcriptsHtml, /Search transcript records, inspect archived details, and open advanced transcript actions only on the detail page\./)
  assert.match(transcriptsHtml, /Find transcript records/)
  assert.match(transcriptsHtml, /Creator ID/)
  assert.match(transcriptsHtml, /Channel ID/)
  assert.match(transcriptsHtml, /Created from/)
  assert.match(transcriptsHtml, /Created to/)
  assert.match(transcriptsHtml, /Filtered summary/)
  assert.match(transcriptsHtml, /Clear filters/)
  assert.match(transcriptsHtml, /Operations overview/)
  assert.match(transcriptsHtml, /This overview fills in when the transcript service can answer read-only archive checks again\./)
  assert.match(transcriptsHtml, /Bulk actions/)
  assert.match(transcriptsHtml, /Revoke selected/)
  assert.match(transcriptsHtml, /Delete selected/)
  assert.match(transcriptsHtml, /Export selected/)
  assert.match(transcriptsHtml, /Transcript records/)
  assert.doesNotMatch(transcriptsHtml, /Revoke active link/)
  assert.doesNotMatch(transcriptsHtml, /Delete archive/)

  const transcriptDetailResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-1`, { headers: { cookie } })
  const transcriptDetailHtml = await transcriptDetailResponse.text()
  assert.equal(transcriptDetailResponse.status, 200)
  assert.match(transcriptDetailHtml, /Current public access/)
  assert.match(transcriptDetailHtml, /Integrity data is unavailable/)
  assert.match(transcriptDetailHtml, /Event history is unavailable/)
  assert.match(transcriptDetailHtml, /Link history/)
  assert.match(transcriptDetailHtml, /Participants/)
  assert.match(transcriptDetailHtml, /Mirrored assets/)
  assert.match(transcriptDetailHtml, /Download export/)
  assert.match(transcriptDetailHtml, /Revoke active link/)
  assert.match(transcriptDetailHtml, /Delete archive/)

  const runtimeResponse = await fetch(`${runtime.baseUrl}/dash/admin/runtime`, { headers: { cookie } })
  const runtimeHtml = await runtimeResponse.text()
  assert.equal(runtimeResponse.status, 200)
  assert.match(runtimeHtml, /Review live runtime health/)
  assert.match(runtimeHtml, /Back to Advanced/)
  assert.match(runtimeHtml, /Runtime maintenance/)

  const securityResponse = await fetch(`${runtime.baseUrl}/dash/admin/security`, { headers: { cookie } })
  const securityHtml = await securityResponse.text()
  assert.equal(securityResponse.status, 200)
  assert.match(securityHtml, /Security workspace/)
  assert.match(securityHtml, /Secret readiness/)
  assert.match(securityHtml, /Owner user IDs/)
  assert.doesNotMatch(securityHtml, /name="sessionSecret"/)
  assert.doesNotMatch(securityHtml, /name="auth\.breakglass\.passwordHash"/)

  const evidenceResponse = await fetch(`${runtime.baseUrl}/dash/admin/evidence`, { headers: { cookie } })
  const evidenceHtml = await evidenceResponse.text()
  assert.equal(evidenceResponse.status, 200)
  assert.match(evidenceHtml, /Review backups before you restore anything/)
  assert.match(evidenceHtml, /Backup inventory/)
  assert.match(evidenceHtml, /Verification guidance/)
})

test("general page warns on legacy globalAdmins recovery and shows raw invalid saved values without guessing", async (t) => {
  const root = createTempProjectRoot()
  const generalPath = path.join(root, "config", "general.json")
  const savedGeneral = JSON.parse(fs.readFileSync(generalPath, "utf8"))
  savedGeneral.globalAdmins = [
    "[",
    `"${generalGlobalAdminIds[0]}",`,
    `"${generalGlobalAdminIds[1]}",`,
    "]"
  ]
  fs.writeFileSync(generalPath, JSON.stringify(savedGeneral, null, 2))

  const runtime = await startTestServer(root)
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const legacyResponse = await fetch(`${runtime.baseUrl}/dash/visual/general`, { headers: { cookie } })
  const legacyHtml = await legacyResponse.text()

  assert.equal(legacyResponse.status, 200)
  assert.match(legacyHtml, /known legacy line-split corruption pattern/i)
  assert.equal(parseTextareaValue(legacyHtml, "globalAdmins"), JSON.stringify(generalGlobalAdminIds, null, 2))
  assert.deepEqual(JSON.parse(fs.readFileSync(generalPath, "utf8")).globalAdmins, [
    "[",
    `"${generalGlobalAdminIds[0]}",`,
    `"${generalGlobalAdminIds[1]}",`,
    "]"
  ])

  savedGeneral.globalAdmins = {
    broken: true,
    ids: [generalGlobalAdminIds[0]]
  }
  fs.writeFileSync(generalPath, JSON.stringify(savedGeneral, null, 2))

  const invalidSavedResponse = await fetch(`${runtime.baseUrl}/dash/visual/general`, { headers: { cookie } })
  const invalidSavedHtml = await invalidSavedResponse.text()

  assert.equal(invalidSavedResponse.status, 200)
  assert.match(invalidSavedHtml, /could not be safely repaired/i)
  assert.match(parseTextareaValue(invalidSavedHtml, "globalAdmins"), /"broken": true/)
})

test("transcript destructive actions stay on the detail page only", async (t) => {
  const runtime = await startTestServer(createTempProjectRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, { headers: { cookie } })
  const listHtml = await listResponse.text()
  assert.equal(listResponse.status, 200)
  assert.match(listHtml, /Bulk actions/)
  assert.match(listHtml, /Revoke selected/)
  assert.match(listHtml, /Delete selected/)
  assert.match(listHtml, /Export selected/)
  assert.doesNotMatch(listHtml, /Revoke active link/)
  assert.doesNotMatch(listHtml, /Reissue public link/)
  assert.doesNotMatch(listHtml, /Delete archive/)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-1`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Download export/)
  assert.match(detailHtml, /Revoke active link/)
  assert.match(detailHtml, /Reissue public link/)
  assert.match(detailHtml, /Delete archive/)
})

test("plugin workbench and transcript workspace actions still function after the redesign", async (t) => {
  const runtime = await startTestServer(createTempProjectRoot())
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const pluginDetailResponse = await fetch(`${runtime.baseUrl}/dash/admin/plugins/ot-html-transcripts`, { headers: { cookie } })
  const pluginDetailHtml = await pluginDetailResponse.text()
  assert.equal(pluginDetailResponse.status, 200)
  assert.match(pluginDetailHtml, /Open transcript workspace/)
  assert.match(pluginDetailHtml, /Refresh transcript cache/)
  const pluginCsrfToken = parseHiddenValue(pluginDetailHtml, "csrfToken")

  const pluginActionResponse = await fetch(`${runtime.baseUrl}/dash/admin/actions/plugin-tools/refresh-cache`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken: pluginCsrfToken,
      returnTo: "/dash/admin/plugins/ot-html-transcripts"
    }).toString()
  })
  assert.equal(pluginActionResponse.status, 302)
  assert.match(pluginActionResponse.headers.get("location") || "", /Ran%20plugin-tools%3Arefresh-cache/)

  const transcriptDetailResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-1`, { headers: { cookie } })
  const transcriptDetailHtml = await transcriptDetailResponse.text()
  assert.equal(transcriptDetailResponse.status, 200)
  const transcriptCsrfToken = parseHiddenValue(transcriptDetailHtml, "csrfToken")

  const revokeResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-1/revoke`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken: transcriptCsrfToken,
      reason: "Moderator cleanup"
    }).toString()
  })
  assert.equal(revokeResponse.status, 302)
  assert.match(revokeResponse.headers.get("location") || "", /admin\/transcripts\/tr-1\?status=success/)
})
