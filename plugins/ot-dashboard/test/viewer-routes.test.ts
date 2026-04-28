import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { AddressInfo, Socket } from "node:net"
import { test } from "node:test"

import { type DashboardViewerAuthClient } from "../server/auth"
import { createDashboardApp } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import type { DashboardPluginDetail, DashboardRuntimeSnapshot } from "../server/dashboard-runtime-registry"
import type { DashboardRuntimeBridge } from "../server/runtime-bridge"
import {
  TRANSCRIPT_DASHBOARD_SERVICE_ID,
  type DashboardTranscriptService
} from "../server/transcript-service-bridge"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")

function createTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-viewer-"))
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
  fs.writeFileSync(path.join(root, "config", "options.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "panels.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "questions.json"), "[]\n")
  fs.writeFileSync(path.join(root, "config", "transcripts.json"), JSON.stringify({
    general: { enabled: true, enableChannel: true, enableCreatorDM: false, enableParticipantDM: false, enableActiveAdminDM: false, enableEveryAdminDM: false, channel: "1", mode: "html" },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: { layout: "normal", includeStats: true, includeIds: false, includeEmbeds: true, includeFiles: true, includeBotMessages: true, fileMode: "channel-name", customFileName: "transcript" },
    htmlTranscriptStyle: {
      background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" },
      header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
      stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    }
  }, null, 2))
  return root
}

function createSnapshot(): DashboardRuntimeSnapshot {
  return {
    capturedAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
    availability: "ready",
    processStartTime: new Date("2026-03-25T11:59:00.000Z").toISOString(),
    readyTime: new Date("2026-03-25T12:00:00.000Z").toISOString(),
    checkerSummary: { hasResult: true, valid: true, errorCount: 0, warningCount: 0, infoCount: 0 },
    pluginSummary: { discovered: 1, enabled: 1, executed: 1, crashed: 0, unknownCrashed: 0 },
    configInventory: [],
    statsSummary: { available: true, scopeCount: 0 },
    ticketSummary: { available: true, total: 0, open: 0, closed: 0, claimed: 0, pinned: 0, recentActivityCount: 0 },
    warnings: [],
    recentTicketActivity: []
  }
}

function createPluginDetail(overrides: Partial<DashboardPluginDetail> = {}): DashboardPluginDetail {
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
    shortDescription: "Transcript plugin fixture",
    tags: ["transcripts"],
    supportedVersions: ["OTv4.1.x"],
    assetCount: 0,
    configEntryPoints: [],
    editableAssets: [],
    unknownCrashWarning: false,
    longDescription: "Fixture plugin",
    imageUrl: "",
    projectUrl: "",
    requiredPlugins: [],
    incompatiblePlugins: [],
    npmDependencies: [],
    missingDependencies: [],
    missingRequiredPlugins: [],
    activeIncompatiblePlugins: [],
    warnings: [],
    ...overrides
  }
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

function createViewerService(mode: "public" | "private-discord" = "private-discord"): {
  service: DashboardTranscriptService
  cleanup: () => void
} {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-viewer-assets-"))
  const assetPath = path.join(assetRoot, "asset.png")
  fs.writeFileSync(assetPath, "asset-data", "utf8")
  const accessibleRecord = {
    id: "tr-private",
    status: "active" as const,
    ticketId: "ticket-private",
    channelId: "channel-private",
    guildId: "guild-1",
    creatorId: "viewer-1",
    deleterId: null,
    activeSlug: "slug-private",
    publicUrl: "https://records.example/dash/transcripts/slug-private",
    archivePath: "/archives/tr-private",
    statusReason: null,
    createdAt: new Date("2026-03-27T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString(),
    messageCount: 1,
    attachmentCount: 1,
    warningCount: 0,
    totalBytes: 16,
    accessPath: "creator-current-guild" as const
  }
  const staffAccessibleRecord = {
    ...accessibleRecord,
    id: "tr-staff",
    activeSlug: "slug-staff",
    publicUrl: "https://records.example/dash/transcripts/slug-staff",
    accessPath: "recorded-admin-current-staff" as const
  }

  function canUseViewerAccess(viewerAccess: {
    membership: "member" | "missing" | "unresolved"
    freshnessMs: number
  }) {
    return viewerAccess.membership === "member" && viewerAccess.freshnessMs <= 60_000
  }

  function isCreatorViewer(viewerUserId: string) {
    return viewerUserId === "viewer-1" || viewerUserId === "viewer-missing-1"
  }

  const service: DashboardTranscriptService = {
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
    async getAccessPolicy() {
      return {
        mode,
        viewerReady: mode === "public" ? true : true,
        message: mode === "public"
          ? "Public transcript links are enabled."
          : "Dashboard transcript viewer URLs are ready."
      }
    },
    async listViewerAccessibleTranscripts(viewerUserId, viewerAccess) {
      if (mode !== "private-discord" || !canUseViewerAccess(viewerAccess)) {
        return { total: 0, items: [] }
      }

      if (viewerUserId === "staff-user" && viewerAccess.liveTier) {
        return {
          total: 1,
          items: [staffAccessibleRecord]
        }
      }

      if (!isCreatorViewer(viewerUserId)) {
        return { total: 0, items: [] }
      }

      return {
        total: 1,
        items: [accessibleRecord]
      }
    },
    async renderViewerTranscript(slug: string, viewerUserId: string, assetBasePath: string, viewerAccess) {
      if (mode !== "private-discord") {
        return { status: "not-found" as const, message: "Transcript not found.", html: null, contentSecurityPolicy: null, accessPath: null }
      }

      if (!canUseViewerAccess(viewerAccess)) {
        return { status: "not-found" as const, message: "Transcript not found.", html: null, contentSecurityPolicy: null, accessPath: null }
      }

      if (slug === "slug-expired" || slug === "slug-deleted") {
        return { status: "gone" as const, message: "Transcript link is no longer available.", html: null, contentSecurityPolicy: null, accessPath: null }
      }

      if (slug !== "slug-private" && slug !== "slug-staff") {
        return { status: "not-found" as const, message: "Transcript not found.", html: null, contentSecurityPolicy: null, accessPath: null }
      }

      if (isCreatorViewer(viewerUserId)) {
        return {
          status: "ok" as const,
          message: "",
          html: `<html><body><img src="${assetBasePath}asset.png"></body></html>`,
          contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
          accessPath: "creator-current-guild" as const
        }
      }

      if (slug === "slug-staff" && viewerUserId === "staff-user" && viewerAccess.liveTier) {
        return {
          status: "ok" as const,
          message: "",
          html: `<html><body><img src="${assetBasePath}asset.png"></body></html>`,
          contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
          accessPath: "recorded-admin-current-staff" as const
        }
      }

      if (viewerAccess.ownerOverride) {
        return {
          status: "ok" as const,
          message: "",
          html: `<html><body><img src="${assetBasePath}asset.png"></body></html>`,
          contentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
          accessPath: "owner-override" as const
        }
      }

      return { status: "not-found" as const, message: "Transcript not found.", html: null, contentSecurityPolicy: null, accessPath: null }
    },
    async resolveViewerTranscriptAsset(slug: string, assetName: string, viewerUserId: string, viewerAccess) {
      if (mode !== "private-discord") {
        return { status: "not-found" as const, message: "Transcript asset not found.", filePath: null, contentType: null, cacheControl: null, accessPath: null }
      }

      if (!canUseViewerAccess(viewerAccess)) {
        return { status: "not-found" as const, message: "Transcript asset not found.", filePath: null, contentType: null, cacheControl: null, accessPath: null }
      }

      if (slug === "slug-expired" || slug === "slug-deleted") {
        return { status: "gone" as const, message: "Transcript link is no longer available.", filePath: null, contentType: null, cacheControl: null, accessPath: null }
      }

      if ((slug !== "slug-private" && slug !== "slug-staff") || assetName !== "asset.png") {
        return { status: "not-found" as const, message: "Transcript asset not found.", filePath: null, contentType: null, cacheControl: null, accessPath: null }
      }

      if (isCreatorViewer(viewerUserId)) {
        return {
          status: "ok" as const,
          message: "",
          filePath: assetPath,
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
          accessPath: "creator-current-guild" as const
        }
      }

      if (slug === "slug-staff" && viewerUserId === "staff-user" && viewerAccess.liveTier) {
        return {
          status: "ok" as const,
          message: "",
          filePath: assetPath,
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
          accessPath: "recorded-admin-current-staff" as const
        }
      }

      if (viewerAccess.ownerOverride) {
        return {
          status: "ok" as const,
          message: "",
          filePath: assetPath,
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
          accessPath: "owner-override" as const
        }
      }

      return { status: "not-found" as const, message: "Transcript asset not found.", filePath: null, contentType: null, cacheControl: null, accessPath: null }
    },
    async revokeTranscript(id: string) {
      return { ok: true, action: "revoke", target: id, status: "ok", message: "revoked" }
    },
    async reissueTranscript(id: string) {
      return { ok: true, action: "reissue", target: id, status: "ok", message: "reissued" }
    },
    async deleteTranscript(id: string) {
      return { ok: true, action: "delete", target: id, status: "ok", message: "deleted" }
    }
  }

  return {
    service,
    cleanup() {
      fs.rmSync(assetRoot, { recursive: true, force: true })
    }
  }
}

function createRuntimeBridge(
  service: DashboardTranscriptService,
  runtimeMembers: Map<string, ReturnType<typeof buildRuntimeGuildMember>>
): DashboardRuntimeBridge {
  const plugin = createPluginDetail()
  const snapshot = createSnapshot()

  return {
    getSnapshot() {
      return snapshot
    },
    listPlugins() {
      return [plugin]
    },
    getPluginDetail(_projectRoot, pluginId) {
      return pluginId === plugin.id ? plugin : null
    },
    listTickets() {
      return []
    },
    getRuntimeSource() {
      return {
        processStartupDate: new Date("2026-03-25T11:59:00.000Z"),
        readyStartupDate: new Date("2026-03-25T12:00:00.000Z"),
        plugins: {
          getAll() {
            return []
          },
          classes: {
            get(id: string) {
              return id === TRANSCRIPT_DASHBOARD_SERVICE_ID ? service : null
            }
          }
        }
      }
    },
    getGuildId() {
      return "guild-1"
    },
    async resolveGuildMember(userId: string) {
      return runtimeMembers.get(userId) || null
    }
  }
}

function takeCookie(response: Response, previous = "") {
  const setCookie = response.headers.get("set-cookie")
  return setCookie ? setCookie.split(";")[0] : previous
}

function assertPrivateHeaders(response: Response) {
  assert.equal(response.headers.get("cache-control"), "no-store, private")
  assert.equal(response.headers.get("pragma"), "no-cache")
  assert.equal(response.headers.get("referrer-policy"), "no-referrer")
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive")
}

async function startAdminLogin(runtime: { baseUrl: string }, returnTo = "/dash/admin") {
  let cookie = ""
  const getLogin = await fetch(`${runtime.baseUrl}/dash/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual" })
  cookie = takeCookie(getLogin)
  await getLogin.text()

  const startResponse = await fetch(`${runtime.baseUrl}/dash/login/discord?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: "manual",
    headers: { cookie }
  })

  cookie = takeCookie(startResponse, cookie)
  assert.equal(startResponse.status, 302)
  const location = String(startResponse.headers.get("location") || "")
  assert.match(location, /discord\.com\/oauth2\/authorize/)

  return {
    cookie,
    state: new URL(location).searchParams.get("state") || ""
  }
}

async function finishAdminLogin(runtime: { baseUrl: string }, cookie: string, state: string, userId = "admin-user") {
  const callbackResponse = await fetch(
    `${runtime.baseUrl}/dash/login/discord/callback?code=${encodeURIComponent(userId)}&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: { cookie }
    }
  )

  return {
    cookie: takeCookie(callbackResponse, cookie),
    response: callbackResponse
  }
}

async function loginAdmin(runtime: { baseUrl: string }, userId = "admin-user") {
  const started = await startAdminLogin(runtime)
  const completed = await finishAdminLogin(runtime, started.cookie, started.state, userId)

  assert.equal(completed.response.status, 302)
  assert.equal(completed.response.headers.get("location"), "/dash/admin")
  await completed.response.arrayBuffer()

  return completed.cookie
}

async function beginViewerLogin(runtime: { baseUrl: string }, returnTo = "/dash/transcripts/slug-private", cookie = "") {
  const response = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {}
  })
  const nextCookie = takeCookie(response, cookie)
  const location = String(response.headers.get("location") || "")
  const authorizeUrl = new URL(location)
  return {
    cookie: nextCookie,
    state: authorizeUrl.searchParams.get("state") || "",
    location
  }
}

async function startTestServer(options: {
  service: DashboardTranscriptService
  viewerAuthClient?: DashboardViewerAuthClient
  configOverride?: Partial<DashboardConfig>
  runtimeMembers?: Map<string, ReturnType<typeof buildRuntimeGuildMember>>
}) {
  const projectRoot = createTempProjectRoot()
  const authRoleIds = {
    reviewer: "role-reviewer",
    editor: "role-editor",
    admin: "role-admin"
  }
  const runtimeMembers = options.runtimeMembers || new Map<string, ReturnType<typeof buildRuntimeGuildMember>>([
    ["admin-user", buildRuntimeGuildMember("admin-user", [authRoleIds.admin])],
    ["staff-user", buildRuntimeGuildMember("staff-user", [authRoleIds.reviewer])],
    ["reviewer-user", buildRuntimeGuildMember("reviewer-user", [authRoleIds.reviewer])],
    ["viewer-1", buildRuntimeGuildMember("viewer-1", [])],
    ["owner-user", buildRuntimeGuildMember("owner-user", [])]
  ])
  const config: DashboardConfig = {
    host: "127.0.0.1",
    port: 0,
    basePath: "/dash",
    publicBaseUrl: "https://dashboard.example",
    viewerPublicBaseUrl: "https://records.example",
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

  if (options.configOverride) {
    Object.assign(config, options.configOverride)
  }

  if (options.configOverride?.auth) {
    config.auth = {
      ...config.auth,
      ...options.configOverride.auth,
      discord: {
        ...config.auth.discord,
        ...options.configOverride.auth.discord
      },
      breakglass: {
        ...config.auth.breakglass,
        ...options.configOverride.auth.breakglass
      },
      loginRateLimit: {
        ...config.auth.loginRateLimit,
        ...options.configOverride.auth.loginRateLimit
      }
    }
  }

  if (options.configOverride?.viewerAuth) {
    config.viewerAuth = options.configOverride.viewerAuth
  }

  if (options.configOverride?.rbac) {
    config.rbac = options.configOverride.rbac
  }

  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot,
    configOverride: config,
    runtimeBridge: createRuntimeBridge(options.service, runtimeMembers),
    viewerAuthClient: options.viewerAuthClient,
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
    socket.on("close", () => {
      connections.delete(socket)
    })
  })

  return {
    projectRoot,
    server,
    connections,
    context,
    runtimeMembers,
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

test("dashboard viewer routes return 404 in public mode", async (t) => {
  const fixture = createViewerService("public")
  const runtime = await startTestServer({ service: fixture.service })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const documentResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-public`, { redirect: "manual" })
  const assetResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-public/assets/asset.png`, { redirect: "manual" })

  assert.equal(documentResponse.status, 404)
  assert.equal(assetResponse.status, 404)
})

test("private viewer routes return 503 when dashboard viewer config is not ready", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    configOverride: {
      publicBaseUrl: "",
      viewerPublicBaseUrl: "",
      viewerAuth: {
        discord: {
          clientId: "",
          clientSecret: ""
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const response = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-private`, { redirect: "manual" })
  const body = await response.text()

  assert.equal(response.status, 503)
  assert.match(body, /publicBaseUrl/i)
  assert.match(body, /whitelist review submit stays blocked/i)
})

test("private viewer routes redirect before slug checks, reject invalid OAuth state, and keep admin auth separate from viewer auth", async (t) => {
  const fixture = createViewerService("private-discord")
  const viewerAuthClient: DashboardViewerAuthClient = {
    async exchangeCode(code) {
      assert.equal(code, "valid-code")
      return "access-token"
    },
    async fetchViewerIdentity() {
      return {
        userId: "viewer-1",
        username: "viewer",
        globalName: "Viewer One",
        avatarUrl: null,
        authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
      }
    }
  }
  const runtime = await startTestServer({ service: fixture.service, viewerAuthClient })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const missingSlugResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/missing-slug`, { redirect: "manual" })
  await missingSlugResponse.arrayBuffer()
  assert.equal(missingSlugResponse.status, 302)
  assert.equal(missingSlugResponse.headers.get("location"), "/dash/transcripts/_auth/login?returnTo=%2Fdash%2Ftranscripts%2Fmissing-slug")

  const adminCookie = await loginAdmin(runtime)
  const adminOnlyViewerResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-private`, {
    redirect: "manual",
    headers: { cookie: adminCookie }
  })
  await adminOnlyViewerResponse.arrayBuffer()
  assert.equal(adminOnlyViewerResponse.status, 302)
  assert.equal(adminOnlyViewerResponse.headers.get("location"), "/dash/transcripts/_auth/login?returnTo=%2Fdash%2Ftranscripts%2Fslug-private")

  const started = await beginViewerLogin(runtime, "/dash/transcripts/slug-private", adminCookie)
  assert.match(started.location, /discord\.com\/oauth2\/authorize/)
  assert.match(started.location, /scope=identify/)

  const invalidCallback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=valid-code&state=wrong-state`, {
    redirect: "manual",
    headers: { cookie: started.cookie }
  })
  await invalidCallback.arrayBuffer()
  assert.equal(invalidCallback.status, 302)
  assert.match(decodeURIComponent(String(invalidCallback.headers.get("location") || "")), /state expired or did not match/i)

  const restarted = await beginViewerLogin(runtime, "/dash/transcripts/slug-private", adminCookie)
  const validCallback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=valid-code&state=${encodeURIComponent(restarted.state)}`, {
    redirect: "manual",
    headers: { cookie: restarted.cookie }
  })
  const viewerCookie = takeCookie(validCallback, restarted.cookie)
  await validCallback.arrayBuffer()

  assert.equal(validCallback.status, 302)
  assert.equal(validCallback.headers.get("location"), "/dash/transcripts/slug-private")

  const adminResponse = await fetch(`${runtime.baseUrl}/dash/admin`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await adminResponse.arrayBuffer()
  assert.equal(adminResponse.status, 302)
  assert.equal(adminResponse.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin")
})

test("private viewer routes serve authorized transcript HTML and assets, return 404 for non-participants, and 410 for expired or deleted links", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    viewerAuthClient: {
      async exchangeCode() {
        return "access-token"
      },
      async fetchViewerIdentity() {
        return {
          userId: "viewer-1",
          username: "viewer",
          globalName: "Viewer One",
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const started = await beginViewerLogin(runtime)
  const callback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=valid-code&state=${encodeURIComponent(started.state)}`, {
    redirect: "manual",
    headers: { cookie: started.cookie }
  })
  const viewerCookie = takeCookie(callback, started.cookie)
  await callback.arrayBuffer()

  const viewerOnlyAdminResponse = await fetch(`${runtime.baseUrl}/dash/admin`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await viewerOnlyAdminResponse.arrayBuffer()
  assert.equal(viewerOnlyAdminResponse.status, 302)
  assert.equal(viewerOnlyAdminResponse.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin")

  const documentResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-private`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  const documentHtml = await documentResponse.text()
  assert.equal(documentResponse.status, 200)
  assert.match(documentHtml, /\/dash\/transcripts\/slug-private\/assets\/asset\.png/)

  const assetResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-private/assets/asset.png`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  assert.equal(assetResponse.status, 200)
  assert.equal(await assetResponse.text(), "asset-data")

  const missingResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-unknown`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await missingResponse.arrayBuffer()
  assert.equal(missingResponse.status, 404)

  const expiredResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-expired`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await expiredResponse.arrayBuffer()
  assert.equal(expiredResponse.status, 410)

  const deletedAssetResponse = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-deleted/assets/asset.png`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await deletedAssetResponse.arrayBuffer()
  assert.equal(deletedAssetResponse.status, 410)
})

test("viewer login fails closed without current guild membership and writes an audit record", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    runtimeMembers: new Map([
      ["admin-user", buildRuntimeGuildMember("admin-user", ["role-admin"])]
    ]),
    viewerAuthClient: {
      async exchangeCode() {
        return "access-token"
      },
      async fetchViewerIdentity() {
        return {
          userId: "viewer-missing-1",
          username: "viewer-missing",
          globalName: "Viewer Missing",
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const started = await beginViewerLogin(runtime)
  const callback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=valid-code&state=${encodeURIComponent(started.state)}`, {
    redirect: "manual",
    headers: { cookie: started.cookie }
  })
  await callback.arrayBuffer()

  assert.equal(callback.status, 302)
  assert.match(decodeURIComponent(String(callback.headers.get("location") || "")), /viewer-host access/i)

  const auditEvents = await runtime.context.authStore.listAuditEvents({
    eventType: "viewer-login-failure",
    actorUserId: "viewer-missing-1"
  })
  assert.equal(auditEvents.length, 1)
  assert.equal(auditEvents[0]?.reason, "viewer-membership-missing")
  assert.equal(auditEvents[0]?.target, "/dash/transcripts/slug-private")
})

test("my transcripts redirects unauthenticated viewers to login and shows only creator-owned accessible transcripts", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    viewerAuthClient: {
      async exchangeCode(code) {
        return code
      },
      async fetchViewerIdentity(accessToken) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: "Viewer One",
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const unauthenticated = await fetch(`${runtime.baseUrl}/dash/me/transcripts`, { redirect: "manual" })
  await unauthenticated.arrayBuffer()
  assert.equal(unauthenticated.status, 302)
  assert.equal(unauthenticated.headers.get("location"), "/dash/transcripts/_auth/login?returnTo=%2Fdash%2Fme%2Ftranscripts")

  const started = await beginViewerLogin(runtime, "/dash/me/transcripts")
  const callback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=viewer-1&state=${encodeURIComponent(started.state)}`, {
    redirect: "manual",
    headers: { cookie: started.cookie }
  })
  const viewerCookie = takeCookie(callback, started.cookie)
  await callback.arrayBuffer()
  assert.equal(callback.status, 302)
  assert.equal(callback.headers.get("location"), "/dash/me/transcripts")

  const response = await fetch(`${runtime.baseUrl}/dash/me/transcripts`, {
    headers: { cookie: viewerCookie }
  })
  const html = await response.text()

  assert.equal(response.status, 200)
  assert.match(html, /My Transcripts/)
  assert.match(html, /tr-private/)
  assert.match(html, /ticket-private/)
  assert.match(html, /channel-private/)
  assert.match(html, /Creator/)
  assert.match(html, /https:\/\/records\.example\/dash\/transcripts\/slug-private/)
  assert.doesNotMatch(html, /tr-staff/)
})

test("my transcripts shows recorded-admin staff assignments only and keeps unassigned reviewers on an empty state", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    viewerAuthClient: {
      async exchangeCode(code) {
        return code
      },
      async fetchViewerIdentity(accessToken) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: accessToken.replace(/-/g, " "),
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const staffStarted = await beginViewerLogin(runtime, "/dash/me/transcripts")
  const staffCallback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=staff-user&state=${encodeURIComponent(staffStarted.state)}`, {
    redirect: "manual",
    headers: { cookie: staffStarted.cookie }
  })
  const staffCookie = takeCookie(staffCallback, staffStarted.cookie)
  await staffCallback.arrayBuffer()

  const staffResponse = await fetch(`${runtime.baseUrl}/dash/me/transcripts`, {
    headers: { cookie: staffCookie }
  })
  const staffHtml = await staffResponse.text()
  assert.equal(staffResponse.status, 200)
  assert.match(staffHtml, /tr-staff/)
  assert.match(staffHtml, /Recorded admin staff/)
  assert.doesNotMatch(staffHtml, /tr-private/)

  const reviewerStarted = await beginViewerLogin(runtime, "/dash/me/transcripts")
  const reviewerCallback = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=reviewer-user&state=${encodeURIComponent(reviewerStarted.state)}`, {
    redirect: "manual",
    headers: { cookie: reviewerStarted.cookie }
  })
  const reviewerCookie = takeCookie(reviewerCallback, reviewerStarted.cookie)
  await reviewerCallback.arrayBuffer()

  const reviewerResponse = await fetch(`${runtime.baseUrl}/dash/me/transcripts`, {
    headers: { cookie: reviewerCookie }
  })
  const reviewerHtml = await reviewerResponse.text()
  assert.equal(reviewerResponse.status, 200)
  assert.match(reviewerHtml, /No accessible transcripts/)
  assert.doesNotMatch(reviewerHtml, /tr-private/)
  assert.doesNotMatch(reviewerHtml, /tr-staff/)
})

test("admin and viewer Discord auth flows persist success and failure audit rows", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    viewerAuthClient: {
      async exchangeCode(code) {
        return code
      },
      async fetchViewerIdentity(accessToken) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: accessToken.replace(/-/g, " "),
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const failedAdmin = await startAdminLogin(runtime)
  const deniedAdmin = await finishAdminLogin(runtime, failedAdmin.cookie, failedAdmin.state, "viewer-1")
  await deniedAdmin.response.arrayBuffer()
  assert.equal(deniedAdmin.response.status, 302)
  assert.match(decodeURIComponent(String(deniedAdmin.response.headers.get("location") || "")), /admin-host access/i)

  await loginAdmin(runtime, "admin-user")

  const viewerStarted = await beginViewerLogin(runtime, "/dash/transcripts/slug-private")
  const viewerCallback = await fetch(
    `${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=viewer-1&state=${encodeURIComponent(viewerStarted.state)}`,
    {
      redirect: "manual",
      headers: { cookie: viewerStarted.cookie }
    }
  )
  await viewerCallback.arrayBuffer()
  assert.equal(viewerCallback.status, 302)
  assert.equal(viewerCallback.headers.get("location"), "/dash/transcripts/slug-private")

  const adminFailure = await runtime.context.authStore.listAuditEvents({
    eventType: "admin-login-failure",
    actorUserId: "viewer-1"
  })
  const adminSuccess = await runtime.context.authStore.listAuditEvents({
    eventType: "admin-login-success",
    actorUserId: "admin-user"
  })
  const viewerSuccess = await runtime.context.authStore.listAuditEvents({
    eventType: "viewer-login-success",
    actorUserId: "viewer-1"
  })

  assert.equal(adminFailure.length, 1)
  assert.equal(adminFailure[0]?.reason, "admin-access-denied")
  assert.equal(adminSuccess.length, 1)
  assert.equal(adminSuccess[0]?.details.tier, "admin")
  assert.equal(viewerSuccess.length, 1)
  assert.equal(viewerSuccess[0]?.target, "/dash/transcripts/slug-private")
  assert.equal(viewerSuccess[0]?.details.membership, "member")
})

test("admin and viewer HTML routes return locked private headers and admin session invalidation is audited", async (t) => {
  const fixture = createViewerService("private-discord")
  const runtime = await startTestServer({
    service: fixture.service,
    viewerAuthClient: {
      async exchangeCode(code) {
        return code
      },
      async fetchViewerIdentity(accessToken) {
        return {
          userId: accessToken,
          username: accessToken,
          globalName: accessToken.replace(/-/g, " "),
          avatarUrl: null,
          authenticatedAt: new Date("2026-03-27T12:00:00.000Z").toISOString()
        }
      }
    }
  })
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const adminLoginPage = await fetch(`${runtime.baseUrl}/dash/login?returnTo=${encodeURIComponent("/dash/admin")}`, {
    redirect: "manual"
  })
  await adminLoginPage.arrayBuffer()
  assert.equal(adminLoginPage.status, 200)
  assertPrivateHeaders(adminLoginPage)

  const viewerLoginPage = await fetch(`${runtime.baseUrl}/dash/transcripts/_auth/login?returnTo=${encodeURIComponent("/dash/me/transcripts")}`, {
    redirect: "manual"
  })
  const viewerLoginHtml = await viewerLoginPage.text()
  assert.equal(viewerLoginPage.status, 200)
  assertPrivateHeaders(viewerLoginPage)
  assert.match(viewerLoginHtml, /eotfs-dashboard-favicon\.png/)
  assert.match(viewerLoginHtml, /Sign in to view this transcript/)
  assert.match(viewerLoginHtml, /Sign in with Discord/)
  assert.doesNotMatch(viewerLoginHtml, /eotfs-login-hero\.png/)
  assert.doesNotMatch(viewerLoginHtml, /What happens next/)
  assert.doesNotMatch(viewerLoginHtml, /Private access/)
  assert.doesNotMatch(viewerLoginHtml, /Separate session/)
  assert.doesNotMatch(viewerLoginHtml, /class="site-header"/)
  assert.doesNotMatch(viewerLoginHtml, /class="site-footer"/)
  assert.doesNotMatch(viewerLoginHtml, /field-help/)
  assert.doesNotMatch(viewerLoginHtml, /href="\/dash\/"[^>]*>Home</)

  const adminCookie = await loginAdmin(runtime, "admin-user")
  const adminPage = await fetch(`${runtime.baseUrl}/dash/admin`, {
    redirect: "manual",
    headers: { cookie: adminCookie }
  })
  await adminPage.arrayBuffer()
  assert.equal(adminPage.status, 200)
  assertPrivateHeaders(adminPage)

  const viewerStarted = await beginViewerLogin(runtime, "/dash/transcripts/slug-private")
  const viewerCallback = await fetch(
    `${runtime.baseUrl}/dash/transcripts/_auth/discord/callback?code=viewer-1&state=${encodeURIComponent(viewerStarted.state)}`,
    {
      redirect: "manual",
      headers: { cookie: viewerStarted.cookie }
    }
  )
  const viewerCookie = takeCookie(viewerCallback, viewerStarted.cookie)
  await viewerCallback.arrayBuffer()

  const transcriptPage = await fetch(`${runtime.baseUrl}/dash/transcripts/slug-private`, {
    redirect: "manual",
    headers: { cookie: viewerCookie }
  })
  await transcriptPage.arrayBuffer()
  assert.equal(transcriptPage.status, 200)
  assertPrivateHeaders(transcriptPage)

  runtime.runtimeMembers.delete("admin-user")
  const invalidatedAdminPage = await fetch(`${runtime.baseUrl}/dash/admin`, {
    redirect: "manual",
    headers: { cookie: adminCookie }
  })
  await invalidatedAdminPage.arrayBuffer()
  assert.equal(invalidatedAdminPage.status, 302)
  assert.equal(invalidatedAdminPage.headers.get("location"), "/dash/login?returnTo=%2Fdash%2Fadmin")
  assertPrivateHeaders(invalidatedAdminPage)

  const invalidations = await runtime.context.authStore.listAuditEvents({
    eventType: "session-invalidated",
    actorUserId: "admin-user"
  })
  assert.equal(invalidations.length, 1)
  assert.equal(invalidations[0]?.reason, "lost-guild-membership")
  assert.equal(invalidations[0]?.target, "/dash/admin")
})
