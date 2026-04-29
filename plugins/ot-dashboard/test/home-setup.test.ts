import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { AddressInfo, Socket } from "net"
import { test } from "node:test"

import { createDashboardApp } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import { buildHomeQualityReviewBlock } from "../server/home-setup-models"
import type { DashboardRuntimeBridge } from "../server/runtime-bridge"
import { evaluateSetupState } from "../server/setup-state"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")

function createTempProjectRoot(overrides: {
  general?: Record<string, unknown>
  options?: Array<Record<string, unknown>>
  panels?: Array<Record<string, unknown>>
  questions?: Array<Record<string, unknown>>
  transcripts?: Record<string, unknown>
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-home-setup-"))
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
    },
    ...(overrides.general || {})
  }, null, 2))

  fs.writeFileSync(path.join(root, "config", "options.json"), JSON.stringify(overrides.options || [], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "panels.json"), JSON.stringify(overrides.panels || [], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "questions.json"), JSON.stringify(overrides.questions || [], null, 2) + "\n")
  fs.writeFileSync(path.join(root, "config", "transcripts.json"), JSON.stringify({
    general: { enabled: true, enableChannel: true, enableCreatorDM: false, enableParticipantDM: false, enableActiveAdminDM: false, enableEveryAdminDM: false, channel: "1", mode: "html" },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: { layout: "normal", includeStats: true, includeIds: false, includeEmbeds: true, includeFiles: true, includeBotMessages: true, fileMode: "channel-name", customFileName: "transcript" },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    },
    ...(overrides.transcripts || {})
  }, null, 2))

  return root
}

function parseHiddenValue(html: string, name: string) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`))
  return match ? match[1] : ""
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

function createHealthyTranscriptRuntimeBridge(): DashboardRuntimeBridge {
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
        capturedAt: new Date("2026-03-28T20:00:00.000Z").toISOString(),
        availability: "ready",
        processStartTime: new Date("2026-03-28T19:59:00.000Z").toISOString(),
        readyTime: new Date("2026-03-28T20:00:00.000Z").toISOString(),
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
        shortDescription: "Healthy transcript fixture",
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
        capturedAt: new Date("2026-03-28T20:00:00.000Z").toISOString(),
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

test("setup-state evaluation follows the locked beginner-first rules", () => {
  let result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "", slashCommands: true, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [],
    transcripts: { general: { enabled: false, mode: "html" } }
  }, { state: "ready", htmlMode: false })
  assert.equal(result.byId.general.state, "needs_setup")
  assert.equal(result.byId.general.reason, "missing_server_id")

  result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "1", slashCommands: false, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [],
    transcripts: { general: { enabled: false, mode: "html" } }
  }, { state: "ready", htmlMode: false })
  assert.equal(result.byId.general.reason, "missing_command_mode")

  result = evaluateSetupState({
    general: { token: "", tokenFromENV: false, serverId: "1", slashCommands: true, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [],
    transcripts: { general: { enabled: false, mode: "html" } }
  }, { state: "ready", htmlMode: false })
  assert.equal(result.byId.general.reason, "missing_token")

  result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "1", slashCommands: true, textCommands: false },
    options: [],
    panels: [],
    questions: [],
    transcripts: { general: { enabled: false, mode: "html" } }
  }, { state: "ready", htmlMode: false })
  assert.equal(result.byId.options.state, "needs_setup")
  assert.equal(result.byId.panels.state, "needs_setup")
  assert.equal(result.byId.questions.state, "optional")
  assert.equal(result.byId.transcripts.state, "optional")
  assert.equal(result.nextStep.id, "options")

  result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "1", slashCommands: true, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [{}],
    transcripts: { general: { enabled: true, mode: "" } }
  }, { state: "ready", htmlMode: false })
  assert.equal(result.byId.questions.state, "ready")
  assert.equal(result.byId.transcripts.state, "needs_attention")
  assert.equal(result.byId.transcripts.reason, "invalid_mode")
  assert.equal(result.nextStep.id, "transcripts")

  result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "1", slashCommands: true, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [],
    transcripts: { general: { enabled: true, mode: "html" } }
  }, { state: "runtime-unavailable", htmlMode: true })
  assert.equal(result.byId.transcripts.state, "ready")
  assert.equal(result.htmlTranscriptWarning, true)
  assert.equal(result.nextStep.id, "transcripts")
  assert.equal(result.nextStep.reason, "html_integration_unavailable")

  result = evaluateSetupState({
    general: { token: "token", tokenFromENV: false, serverId: "1", slashCommands: true, textCommands: false },
    options: [{}],
    panels: [{}],
    questions: [{}],
    transcripts: { general: { enabled: true, mode: "html" } }
  }, { state: "ready", htmlMode: true })
  assert.equal(result.nextStep.id, "operations")
})

test("home quality-review block carries reminder and digest facts without setup warnings", () => {
  const block = buildHomeQualityReviewBlock({
    basePath: "/dash",
    i18n: {
      t(key: string) {
        const labels: Record<string, string> = {
          "home.qualityReview.title": "Quality review",
          "home.summary.qualityReview": "Quality Review",
          "home.summary.qualityReviewDetail": "Active {active}, Unassigned {unassigned}",
          "home.qualityReview.lastDigest": "Last Digest",
          "home.qualityReview.remindersSentToday": "Reminders Sent Today",
          "home.qualityReview.notDelivered": "Not delivered"
        }
        return labels[key] || key
      }
    }
  } as any, {
    activeCount: 4,
    myQueueCount: 1,
    unassignedCount: 2,
    overdueCount: 3,
    overdueUnreviewedCount: 2,
    overdueInReviewCount: 1,
    unavailableReason: null
  }, {
    notificationsEnabled: false,
    digestEnabled: false,
    deliveryChannelCount: 0,
    configuredTargetCount: null,
    validTargetCount: null,
    lastDeliveryError: null,
    unavailableReason: "Quality-review notifications are disabled.",
    remindersSentToday: 2,
    lastDigestAt: null,
    lastDigestDate: null,
    lastDigestCount: 0,
    digestDeliveredToday: false,
    ticketReminder: null,
    ticketReminderCooldownUntil: null
  })

  assert.ok(block)
  assert.equal(block?.notificationFacts[0].label, "Last Digest")
  assert.equal(block?.notificationFacts[0].value, "Not delivered")
  assert.equal(block?.notificationFacts[1].label, "Reminders Sent Today")
  assert.equal(block?.notificationFacts[1].value, "2")
  assert.equal(block?.notificationStatusCopy, "Quality-review notifications are disabled.")
  assert.equal(block?.unavailable, false)
})

test("root redirect, login, home, advanced, and transcript warning routes render the guided beginner-first flow", async (t) => {
  const runtime = await startTestServer(createTempProjectRoot({
    options: [],
    panels: [],
    questions: [],
    transcripts: {
      general: {
        enabled: true,
        enableChannel: true,
        enableCreatorDM: false,
        enableParticipantDM: false,
        enableActiveAdminDM: false,
        enableEveryAdminDM: false,
        channel: "1",
        mode: "html"
      }
    }
  }))
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const landingResponse = await fetch(`${runtime.baseUrl}/dash`, { redirect: "manual" })
  await landingResponse.arrayBuffer()
  assert.equal(landingResponse.status, 302)
  assert.equal(landingResponse.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin")

  const loginResponse = await fetch(`${runtime.baseUrl}/dash/login`)
  const loginHtml = await loginResponse.text()
  assert.equal(loginResponse.status, 200)
  assert.match(loginHtml, /Test Dashboard/)
  assert.match(loginHtml, /eotfs-dashboard-favicon\.png/)
  assert.match(loginHtml, /eotfs-login-hero\.png/)
  assert.match(loginHtml, /Continue with Discord/)
  assert.match(loginHtml, /Use Discord sign-in with current Editor or Admin access on the admin host\./)
  assert.doesNotMatch(loginHtml, /login-inline-actions/)
  assert.doesNotMatch(loginHtml, /Back to landing/)
  assert.doesNotMatch(loginHtml, /login-masthead/)
  assert.doesNotMatch(loginHtml, /login-brand-title/)
  assert.doesNotMatch(loginHtml, /data-action="check-health"/)
  assert.doesNotMatch(loginHtml, /login-health-status/)
  assert.doesNotMatch(loginHtml, /Check health/)
  assert.doesNotMatch(loginHtml, /Only current Discord staff mapped to Editor or Admin can sign in here\./)
  assert.doesNotMatch(loginHtml, /brand-logo/)
  assert.doesNotMatch(loginHtml, /js\/login\.js/)
  assert.doesNotMatch(loginHtml, /Tickets, Transcripts, and Add-ons cover the daily work once setup is in place\./)

  const { cookie } = await login(runtime)

  const homeResponse = await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie }
  })
  const homeHtml = await homeResponse.text()
  assert.equal(homeResponse.status, 200)
  assert.match(homeHtml, /Next step/)
  assert.match(homeHtml, /Setup areas/)
  assert.match(homeHtml, /overview-stage-status/)
  assert.match(homeHtml, /System health/)
  assert.doesNotMatch(homeHtml, /href="\/dash\/admin\/configs"[^>]*>Setup</)
  assert.match(homeHtml, /\/dash\/visual\/general/)
  assert.match(homeHtml, /\/dash\/visual\/options/)
  assert.match(homeHtml, /\/dash\/visual\/panels/)
  assert.match(homeHtml, /\/dash\/visual\/questions/)
  assert.match(homeHtml, /\/dash\/config\/general/)
  assert.doesNotMatch(homeHtml, /class="status-strip tone-/)
  assert.doesNotMatch(homeHtml, /Daily work/)
  assert.doesNotMatch(homeHtml, /Review live tickets/)
  assert.doesNotMatch(homeHtml, /href="\/dash\/health"/)
  assert.doesNotMatch(homeHtml, /class="site-footer"/)
  assert.match(homeHtml, /id="dashboard-ui-messages"/)
  assert.doesNotMatch(homeHtml, /No warnings right now/)
  assert.match(homeHtml, /HTML transcript mode is enabled, but the transcript integration is not ready\./)

  const setupResponse = await fetch(`${runtime.baseUrl}/dash/admin/configs`, {
    headers: { cookie },
    redirect: "manual"
  })
  await setupResponse.arrayBuffer()
  assert.equal(setupResponse.status, 302)
  assert.equal(setupResponse.headers.get("location"), "/dash/admin")

  const advancedResponse = await fetch(`${runtime.baseUrl}/dash/admin/advanced`, {
    headers: { cookie }
  })
  const advancedHtml = await advancedResponse.text()
  assert.equal(advancedResponse.status, 200)
  assert.match(advancedHtml, /Security workspace/)
  assert.match(advancedHtml, /Open security workspace/)
  assert.match(advancedHtml, /System status/)
  assert.match(advancedHtml, /Backups and restore/)
  assert.match(advancedHtml, /Advanced JSON editors/)
  assert.match(advancedHtml, /Plugin maintenance/)
  assert.match(advancedHtml, /Runtime diagnostics links/)

  const transcriptsResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })
  const transcriptsHtml = await transcriptsResponse.text()
  assert.equal(transcriptsResponse.status, 200)
  assert.match(transcriptsHtml, /Open Ticket runtime is not registered with the dashboard, so transcript operations are unavailable\./)
})

test("home prioritizes daily work once setup is already ready", async (t) => {
  const runtime = await startTestServer(createTempProjectRoot({
    options: [{}],
    panels: [{}],
    questions: [{}],
    transcripts: {
      general: {
        enabled: false,
        enableChannel: false,
        enableCreatorDM: false,
        enableParticipantDM: false,
        enableActiveAdminDM: false,
        enableEveryAdminDM: false,
        channel: "",
        mode: "html"
      }
    }
  }), "/dash", {
    runtimeBridge: createHealthyTranscriptRuntimeBridge()
  })
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)
  const homeResponse = await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie }
  })
  const homeHtml = await homeResponse.text()

  assert.equal(homeResponse.status, 200)
  assert.doesNotMatch(homeHtml, /Next step/)
  assert.match(homeHtml, /Setup areas/)
  assert.match(homeHtml, /overview-stage-status/)
  assert.match(homeHtml, /System health/)
  assert.doesNotMatch(homeHtml, /class="status-strip tone-/)
  assert.doesNotMatch(homeHtml, /Daily work/)
  assert.doesNotMatch(homeHtml, /Review live tickets/)
})
