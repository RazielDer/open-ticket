import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import type { AddressInfo } from "net"
import type { Socket } from "net"

import { createDashboardApp } from "../server/create-app"
import { buildDashboardAnalyticsModel, medianDurationMs, p95DurationMs, parseDashboardAnalyticsRequest } from "../server/analytics"
import type { DashboardConfig } from "../server/dashboard-config"
import {
  defaultDashboardRuntimeBridge,
  type DashboardRuntimeBridge,
  type DashboardRuntimeGuildMember
} from "../server/runtime-bridge"
import {
  clearDashboardRuntimeRegistry,
  registerDashboardRuntime,
  type DashboardTicketRecord
} from "../server/dashboard-runtime-registry"
import { ODTICKET_PLATFORM_METADATA_IDS } from "../../../src/core/api/openticket/ticket-platform"
import {
  DASHBOARD_TICKET_ACTION_IDS,
  type DashboardTicketActionId,
  type DashboardTicketActionRequest,
  type DashboardTicketDetailRecord
} from "../server/ticket-workbench-types"
import { sanitizeTicketWorkbenchReturnTo } from "../server/ticket-workbench"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function createProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-ticket-workbench-"))
  writeJson(path.join(root, "config", "general.json"), {
    token: "token",
    mainColor: "#ffffff",
    language: "english",
    prefix: "!ticket ",
    serverId: "guild-1",
    globalAdmins: [],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "ready", state: "" },
    system: { permissions: {}, messages: {}, logs: {}, limits: {}, channelTopic: {} }
  })
  writeJson(path.join(root, "config", "options.json"), [
    {
      id: "intake",
      name: "Intake",
      type: "ticket",
      channel: { transportMode: "channel_text" },
      routing: { supportTeamId: "triage", escalationTargetOptionIds: ["escalated"] }
    },
    {
      id: "escalated",
      name: "Escalated",
      type: "ticket",
      channel: { transportMode: "channel_text" },
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] }
    },
    {
      id: "triage-followup",
      name: "Triage follow-up",
      type: "ticket",
      channel: { transportMode: "channel_text" },
      routing: { supportTeamId: "triage", escalationTargetOptionIds: [] }
    }
  ])
  writeJson(path.join(root, "config", "panels.json"), [
    { id: "front-desk", name: "Front desk", options: ["intake", "triage-followup"] }
  ])
  writeJson(path.join(root, "config", "support-teams.json"), [
    { id: "triage", name: "Triage", roleIds: ["role-editor"], assignmentStrategy: "manual" },
    { id: "lead", name: "Lead", roleIds: ["role-admin"], assignmentStrategy: "manual" }
  ])
  writeJson(path.join(root, "config", "questions.json"), [])
  writeJson(path.join(root, "config", "transcripts.json"), {
    general: { enabled: true, enableChannel: false, enableCreatorDM: false, enableParticipantDM: false, enableActiveAdminDM: false, enableEveryAdminDM: false, channel: "", mode: "html" },
    embedSettings: { customColor: "", listAllParticipants: false, includeTicketStats: false },
    textTranscriptStyle: { layout: "normal", includeStats: true, includeIds: false, includeEmbeds: true, includeFiles: true, includeBotMessages: true, fileMode: "channel-name", customFileName: "transcript" },
    htmlTranscriptStyle: { background: { enableCustomBackground: false, backgroundColor: "", backgroundImage: "" }, header: { enableCustomHeader: false, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" }, stats: { enableCustomStats: false, backgroundColor: "#202225", keyTextColor: "#737373", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" }, favicon: { enableCustomFavicon: false, imageUrl: "" } }
  })
  return root
}

function ticket(overrides: Partial<DashboardTicketRecord>): DashboardTicketRecord {
  return {
    id: "ticket-1",
    optionId: "intake",
    creatorId: "creator-1",
    transportMode: "channel_text",
    transportParentChannelId: null,
    transportParentMessageId: null,
    assignedTeamId: "triage",
    assignedStaffUserId: null,
    assignmentStrategy: "manual",
    firstStaffResponseAt: null,
    resolvedAt: null,
    awaitingUserState: null,
    awaitingUserSince: null,
    closeRequestState: null,
    closeRequestBy: null,
    closeRequestAt: null,
    integrationProfileId: null,
    aiAssistProfileId: null,
    openedOn: 1710000000000,
    closedOn: null,
    reopenedOn: null,
    claimedOn: null,
    pinnedOn: null,
    claimedBy: null,
    pinnedBy: null,
    open: true,
    closed: false,
    claimed: false,
    pinned: false,
    participantCount: 2,
    categoryMode: "normal",
    channelSuffix: "creator",
    ...overrides
  }
}

function member(userId: string, roleIds: string[]): DashboardRuntimeGuildMember {
  return {
    guildId: "guild-1",
    userId,
    username: userId,
    globalName: userId,
    displayName: userId,
    avatarUrl: null,
    roleIds
  }
}

function runtimeMember(userId: string, roleIds: string[] = []) {
  return {
    id: userId,
    displayName: userId,
    user: { id: userId, username: userId, globalName: userId, bot: false },
    roles: { cache: new Map(roleIds.map((roleId) => [roleId, { id: roleId }])) }
  }
}

function runtimeDataSource(entries: Record<string, unknown>) {
  const data = new Map(Object.entries(entries).map(([id, value]) => [id, { value }]))
  return {
    exists(id: string) {
      return data.has(id)
    },
    get(id: string) {
      return data.get(id) || { value: undefined }
    }
  }
}

function runtimeOption(
  id: string,
  name: string,
  teamId: string | null,
  transportMode = "channel_text",
  threadParentChannel: string | null = null,
  workflow: { closeRequestEnabled?: boolean; awaitingUserEnabled?: boolean } = {}
) {
  return {
    id: { value: id },
    name: { value: name },
    ...runtimeDataSource({
      "opendiscord:routing-support-team": teamId,
      "opendiscord:channel-transport-mode": transportMode,
      "opendiscord:channel-thread-parent": threadParentChannel,
      "opendiscord:workflow-close-request-enabled": Boolean(workflow.closeRequestEnabled),
      "opendiscord:workflow-awaiting-user-enabled": Boolean(workflow.awaitingUserEnabled)
    })
  }
}

function runtimeTicket(option: any, overrides: Record<string, unknown> = {}) {
  return {
    id: { value: "ticket-1" },
    option,
    ...runtimeDataSource({
      "opendiscord:opened-by": "creator-1",
      "opendiscord:previous-creators": ["creator-original"],
      "opendiscord:participants": [{ type: "user", id: "staff-1" }],
      "opendiscord:priority": 0,
      "opendiscord:topic": "Initial topic",
      "opendiscord:open": true,
      "opendiscord:closed": false,
      "opendiscord:claimed": false,
      "opendiscord:pinned": false,
      "opendiscord:opened-on": 1710000000000,
      "opendiscord:channel-suffix": "creator",
      [ODTICKET_PLATFORM_METADATA_IDS.transportMode]: "channel_text",
      [ODTICKET_PLATFORM_METADATA_IDS.assignedTeamId]: "triage",
      [ODTICKET_PLATFORM_METADATA_IDS.assignedStaffUserId]: null,
      ...overrides
    })
  }
}

function registerRuntimeActionFixture(options: {
  includeOptionManager?: boolean
  actionRuns?: Array<{ id: string; params: any }>
  ticketOverrides?: Record<string, unknown>
  runtimeOptions?: any[]
  formsDrafts?: any[]
} = {}) {
  clearDashboardRuntimeRegistry()
  const runtimeOptions = options.runtimeOptions || [
    runtimeOption("intake", "Intake", "triage"),
    runtimeOption("triage-followup", "Triage follow-up", "triage")
  ]
  const intake = runtimeOptions[0]
  const followup = runtimeOptions[1]
  const ticketRecord = runtimeTicket(intake, options.ticketOverrides)
  const members = new Map([
    ["admin-user", runtimeMember("admin-user", ["role-admin"])],
    ["creator-1", runtimeMember("creator-1")],
    ["creator-2", runtimeMember("creator-2")],
    ["observer-1", runtimeMember("observer-1")],
    ["staff-1", runtimeMember("staff-1", ["role-editor"])]
  ])
  const guild = {
    id: "guild-1",
    roles: { everyone: { id: "everyone" } },
    members: {
      cache: members,
      async fetch() {
        return members
      }
    }
  }
  const actionRuns = options.actionRuns || []
  const runtime: any = {
    configs: {
      get(id: string) {
        const configs: Record<string, unknown> = {
          "opendiscord:general": { serverId: "guild-1", system: { permissions: {} } },
          "opendiscord:options": runtimeOptions.map((option) => ({
            id: option.id.value,
            name: option.name.value,
            type: "ticket",
            channel: {
              transportMode: option.get("opendiscord:channel-transport-mode").value,
              threadParentChannel: option.get("opendiscord:channel-thread-parent").value || ""
            },
            routing: { supportTeamId: option.get("opendiscord:routing-support-team").value }
          })),
          "opendiscord:panels": [{ id: "front-desk", name: "Front desk", options: runtimeOptions.map((option) => option.id.value) }],
          "opendiscord:support-teams": [{ id: "triage", name: "Triage", roleIds: ["role-editor"], assignmentStrategy: "manual" }]
        }
        return Object.prototype.hasOwnProperty.call(configs, id) ? { data: configs[id] } : null
      }
    },
    tickets: {
      get(id: string) {
        return id === "ticket-1" ? ticketRecord : null
      },
      getAll() {
        return [ticketRecord]
      }
    },
    client: {
      mainServer: guild,
      async fetchGuildTextBasedChannel() {
        return { id: "ticket-1", isThread: () => false }
      },
      async fetchGuildMember(_guild: any, userId: string) {
        return members.get(userId) || null
      },
      client: {
        users: {
          async fetch(userId: string) {
            return { id: userId, username: userId, displayName: userId }
          }
        }
      }
    },
    actions: {
      get(id: string) {
        return {
          async run(_source: string, params: any) {
            actionRuns.push({ id, params })
          }
        }
      }
    },
    priorities: {
      getAll() {
        return [
          { rawName: "normal", priority: 0, renderDisplayName: () => "Normal" },
          { rawName: "urgent", priority: 5, renderDisplayName: () => "Urgent" }
        ]
      },
      getFromPriorityLevel(level: number) {
        return this.getAll().find((priority) => priority.priority === level) || null
      }
    }
  }
  if (options.formsDrafts) {
    runtime.plugins = {
      classes: {
        get(id: string) {
          return id === "ot-ticket-forms:service"
            ? {
                async listTicketDrafts() {
                  return options.formsDrafts
                }
              }
            : null
        }
      }
    }
  }
  if (options.includeOptionManager !== false) {
    runtime.options = {
      get(id: string) {
        return runtimeOptions.find((option) => option.id.value === id) || null
      },
      getAll() {
        return runtimeOptions
      }
    }
  }
  registerDashboardRuntime(runtime)
  return { runtime, ticketRecord, intake, followup, actionRuns }
}

function enabledDetail(base: DashboardTicketRecord, actions: DashboardTicketActionId[] = [...DASHBOARD_TICKET_ACTION_IDS]): DashboardTicketDetailRecord {
  const actionAvailability = Object.fromEntries(DASHBOARD_TICKET_ACTION_IDS.map((action) => [
    action,
    actions.includes(action)
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "Disabled for test." }
  ])) as DashboardTicketDetailRecord["actionAvailability"]

  return {
    ticket: base,
    panelId: "front-desk",
    panelLabel: "Front desk",
    optionLabel: "Intake",
    creatorLabel: "Unknown user (creator-1)",
    teamLabel: "Triage",
    assigneeLabel: "Unassigned",
    priorityId: "normal",
    priorityLabel: "Normal",
    topic: "Initial topic",
    originalApplicantUserId: "creator-original",
    originalApplicantLabel: "Unknown user (creator-original)",
    creatorTransferWarning: "tickets.detail.warnings.creatorTransfer",
    participantLabels: ["creator-1", "staff-1"],
    actionAvailability,
    assignableStaff: [{ userId: "staff-1", label: "Staff One" }],
    escalationTargets: [{ optionId: "escalated", optionLabel: "Escalated", panelId: null, panelLabel: "Missing panel", transportMode: "channel_text" }],
    moveTargets: [{ optionId: "triage-followup", optionLabel: "Triage follow-up", panelId: "front-desk", panelLabel: "Front desk", transportMode: "channel_text", teamId: "triage", teamLabel: "Triage" }],
    transferCandidates: [{ userId: "creator-2", label: "Creator Two" }],
    participantChoices: [
      { userId: "creator-1", label: "Creator One", present: true },
      { userId: "staff-1", label: "Staff One", present: true },
      { userId: "observer-1", label: "Observer One", present: false }
    ],
    priorityChoices: [
      { priorityId: "normal", label: "Normal" },
      { priorityId: "urgent", label: "Urgent" }
    ],
    providerLock: null
  }
}

async function startServer(options: {
  tickets?: DashboardTicketRecord[]
  detail?: DashboardTicketDetailRecord | null
  writes?: boolean
  ticketSummaryAvailable?: boolean
} = {}) {
  const projectRoot = createProjectRoot()
  const tickets = options.tickets || [ticket({}), ticket({ id: "ticket-2", optionId: "missing-option", transportMode: "private_thread", assignedTeamId: "missing-team", assignedStaffUserId: "staff-2", openedOn: 1710000100000 })]
  const actionRequests: DashboardTicketActionRequest[] = []
  const members = new Map([
    ["admin-user", member("admin-user", ["role-admin"])],
    ["editor-user", member("editor-user", ["role-editor"])],
    ["reviewer-user", member("reviewer-user", ["role-reviewer"])],
    ["creator-2", member("creator-2", [])],
    ["observer-1", member("observer-1", [])],
    ["staff-1", member("staff-1", ["role-editor"])]
  ])
  const config: DashboardConfig = {
    host: "127.0.0.1",
    port: 0,
    basePath: "/dash",
    publicBaseUrl: "",
    viewerPublicBaseUrl: "",
    trustProxyHops: 1,
    dashboardName: "Ticket Dashboard",
    locale: "english",
    brand: { title: "Ticket Dashboard", faviconPath: "./public/assets/eotfs-dashboard-favicon.png" },
    auth: {
      passwordHash: "",
      password: "",
      sessionSecret: "test-secret",
      sqlitePath: "runtime/ot-dashboard/auth.sqlite",
      discord: { clientId: "discord-client-id", clientSecret: "discord-client-secret" },
      breakglass: { enabled: false, passwordHash: "" },
      maxAgeHours: 1,
      loginRateLimit: { windowMinutes: 15, maxAttempts: 3 }
    },
    viewerAuth: { discord: { clientId: "discord-client-id", clientSecret: "discord-client-secret" } },
    rbac: {
      ownerUserIds: [],
      roleIds: { reviewer: ["role-reviewer"], editor: ["role-editor"], admin: ["role-admin"] },
      userIds: { reviewer: [], editor: [], admin: [] }
    }
  }
  const runtimeBridge: DashboardRuntimeBridge = {
    getSnapshot() {
      return {
        capturedAt: new Date("2026-04-21T12:00:00.000Z").toISOString(),
        availability: "ready",
        processStartTime: null,
        readyTime: new Date("2026-04-21T12:00:00.000Z").toISOString(),
        checkerSummary: { hasResult: false, valid: null, errorCount: 0, warningCount: 0, infoCount: 0 },
        pluginSummary: { discovered: 0, enabled: 0, executed: 0, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: false, scopeCount: 0 },
        ticketSummary: { available: options.ticketSummaryAvailable !== false, total: tickets.length, open: tickets.filter((item) => item.open).length, closed: tickets.filter((item) => item.closed).length, claimed: tickets.filter((item) => item.claimed).length, pinned: 0, recentActivityCount: 0 },
        warnings: [],
        recentTicketActivity: []
      }
    },
    listPlugins() {
      return []
    },
    getPluginDetail() {
      return null
    },
    listTickets() {
      return tickets
    },
    async getTicketDetail(ticketId: string) {
      if (options.detail === null) return null
      const base = tickets.find((item) => item.id === ticketId)
      if (!base) return null
      return options.detail || {
        ticket: base,
        panelId: "front-desk",
        panelLabel: "Front desk",
        optionLabel: base.optionId === "intake" ? "Intake" : `Missing option (${base.optionId})`,
        creatorLabel: `Unknown user (${base.creatorId})`,
        teamLabel: base.assignedTeamId === "triage" ? "Triage" : `Missing team (${base.assignedTeamId})`,
        assigneeLabel: base.assignedStaffUserId ? `Unknown user (${base.assignedStaffUserId})` : "Unassigned",
        priorityId: "normal",
        priorityLabel: "Normal",
        topic: "Initial topic",
        originalApplicantUserId: "creator-original",
        originalApplicantLabel: "Unknown user (creator-original)",
        creatorTransferWarning: "tickets.detail.warnings.creatorTransfer",
        participantLabels: ["creator-1", "staff-1"],
        actionAvailability: {
          claim: { enabled: true, reason: null },
          unclaim: { enabled: false, reason: "Ticket is not currently claimed." },
          assign: { enabled: true, reason: null },
          escalate: { enabled: false, reason: "Locked by provider." },
          move: { enabled: true, reason: null },
          transfer: { enabled: true, reason: null },
          "add-participant": { enabled: true, reason: null },
          "remove-participant": { enabled: true, reason: null },
          "set-priority": { enabled: true, reason: null },
          "set-topic": { enabled: true, reason: null },
          "approve-close-request": { enabled: false, reason: "No close request is pending." },
          "dismiss-close-request": { enabled: false, reason: "No close request is pending." },
          "set-awaiting-user": { enabled: true, reason: null },
          "clear-awaiting-user": { enabled: false, reason: "This ticket is not awaiting user response." },
          close: { enabled: false, reason: "Locked by provider." },
          reopen: { enabled: false, reason: "Ticket is not closed." },
          refresh: { enabled: true, reason: null }
        },
        assignableStaff: [{ userId: "staff-1", label: "Staff One" }],
        escalationTargets: [{ optionId: "escalated", optionLabel: "Escalated", panelId: null, panelLabel: "Missing panel", transportMode: "channel_text" }],
        moveTargets: [{ optionId: "triage-followup", optionLabel: "Triage follow-up", panelId: "front-desk", panelLabel: "Front desk", transportMode: "channel_text", teamId: "triage", teamLabel: "Triage" }],
        transferCandidates: [{ userId: "creator-2", label: "Creator Two" }],
        participantChoices: [
          { userId: "creator-1", label: "Creator One", present: true },
          { userId: "staff-1", label: "Staff One", present: true },
          { userId: "observer-1", label: "Observer One", present: false }
        ],
        priorityChoices: [
          { priorityId: "normal", label: "Normal" },
          { priorityId: "urgent", label: "Urgent" }
        ],
        providerLock: {
          providerId: "ot-eotfs-bridge",
          title: "Whitelist bridge",
          message: "Bridge-owned actions are locked.",
          lockedActions: ["close", "escalate"]
        }
      }
    },
    ...(options.writes === false ? {} : {
      async runTicketAction(input: DashboardTicketActionRequest) {
        actionRequests.push(input)
        return {
          ok: true,
          status: "success" as const,
          message: input.action === "move" ? "tickets.detail.actionResults.moveSuccess" : `${input.action} through test runtime.`,
          ticketId: input.ticketId
        }
      }
    }),
    getGuildId() {
      return "guild-1"
    },
    async resolveGuildMember(userId: string) {
      return members.get(userId) || null
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
          globalName: accessToken,
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
    actionRequests,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
}

async function stopServer(runtime: Awaited<ReturnType<typeof startServer>>) {
  runtime.server.close()
  runtime.server.closeIdleConnections?.()
  runtime.server.closeAllConnections?.()
  for (const socket of runtime.connections) socket.destroy()
  await runtime.context.authStore.close()
  runtime.server.unref()
  await new Promise((resolve) => setTimeout(resolve, 0))
  fs.rmSync(runtime.projectRoot, { recursive: true, force: true })
}

async function startLogin(baseUrl: string, returnTo = "/dash/admin/tickets") {
  let cookie = ""
  const loginResponse = await fetch(`${baseUrl}/dash/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual" })
  cookie = (loginResponse.headers.get("set-cookie") || "").split(";")[0]
  await loginResponse.text()
  const startResponse = await fetch(`${baseUrl}/dash/login/discord?returnTo=${encodeURIComponent(returnTo)}`, {
    redirect: "manual",
    headers: { cookie }
  })
  const state = new URL(String(startResponse.headers.get("location"))).searchParams.get("state")
  assert.ok(state)
  return { cookie, state }
}

async function login(baseUrl: string, userId = "admin-user", returnTo = "/dash/admin/tickets") {
  const started = await startLogin(baseUrl, returnTo)
  const callback = await fetch(`${baseUrl}/dash/login/discord/callback?code=${encodeURIComponent(userId)}&state=${encodeURIComponent(String(started.state))}`, {
    redirect: "manual",
    headers: { cookie: started.cookie }
  })
  const cookie = (callback.headers.get("set-cookie") || started.cookie).split(";")[0]
  assert.equal(callback.status, 302)
  await callback.arrayBuffer()
  return { cookie, location: callback.headers.get("location") }
}

function csrfFrom(html: string) {
  const match = html.match(/name="csrfToken" value="([^"]+)"/)
  assert.ok(match)
  return match[1]
}

function redirectMessage(location: string | null) {
  return new URL(String(location), "http://dashboard.local").searchParams.get("msg")
}

test("ticket workbench restores editor/admin access without reopening admin home to editors", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))

  const admin = await login(runtime.baseUrl, "admin-user")
  assert.equal(admin.location, "/dash/admin/tickets")
  const adminTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, { headers: { cookie: admin.cookie } })
  const adminHtml = await adminTickets.text()
  assert.equal(adminTickets.status, 200)
  assert.match(adminHtml, /href="\/dash\/admin\/tickets"[^>]*>Tickets</)
  assert.match(adminHtml, /Ticket records/)

  const editor = await login(runtime.baseUrl, "editor-user", "/dash/admin/tickets")
  const editorTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, { headers: { cookie: editor.cookie } })
  assert.equal(editorTickets.status, 200)
  const editorHome = await fetch(`${runtime.baseUrl}/dash/admin`, { headers: { cookie: editor.cookie }, redirect: "manual" })
  await editorHome.arrayBuffer()
  assert.equal(editorHome.status, 302)
  assert.equal(editorHome.headers.get("location"), "/dash/visual/options")

  const reviewerStarted = await startLogin(runtime.baseUrl, "/dash/admin/tickets")
  const reviewerCallback = await fetch(`${runtime.baseUrl}/dash/login/discord/callback?code=reviewer-user&state=${encodeURIComponent(String(reviewerStarted.state))}`, {
    redirect: "manual",
    headers: { cookie: reviewerStarted.cookie }
  })
  await reviewerCallback.arrayBuffer()
  assert.equal(reviewerCallback.status, 302)
  assert.match(String(reviewerCallback.headers.get("location")), /does%20not%20currently%20have%20admin-host%20access/)
})

test("ticket list filters, fallback labels, and returnTo links stay detail-first", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const response = await fetch(`${runtime.baseUrl}/dash/admin/tickets?status=open&transport=private_thread&teamId=missing-team&q=missing`, { headers: { cookie } })
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /Missing option \(missing-option\)/)
  assert.match(html, /Missing team \(missing-team\)/)
  assert.match(html, /Private thread/)
  assert.match(html, /returnTo=%2Fdash%2Fadmin%2Ftickets%3Fstatus%3Dopen%26transport%3Dprivate_thread%26teamId%3Dmissing-team%26q%3Dmissing/)
  assert.doesNotMatch(html, /Close ticket<\/button>/)
  assert.doesNotMatch(html, /Assign staff<\/button>/)
})

test("ticket detail shows provider locks, safe back links, and form-post runtime actions", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1?returnTo=https://example.invalid/bad`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Bridge-owned actions are locked\./)
  assert.match(detailHtml, /href="\/dash\/admin\/tickets"/)
  assert.match(detailHtml, /Assign staff/)
  assert.match(detailHtml, /Locked by provider\./)
  assert.match(detailHtml, /Operator workflows/)
  assert.match(detailHtml, /Transfer creator/)
  assert.match(detailHtml, /Move ticket/)
  assert.match(detailHtml, /Add participant/)
  assert.match(detailHtml, /Remove participant/)
  assert.match(detailHtml, /Set priority/)
  assert.match(detailHtml, /Set topic/)
  assert.match(detailHtml, /Original applicant authority remains/)
  assert.match(detailHtml, /Pin, unpin, and freeform rename remain Discord-only/)
  assert.match(detailHtml, /value="\/dash\/admin\/tickets"/)

  const csrfToken = csrfFrom(detailHtml)
  const actionResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1/actions/assign?returnTo=${encodeURIComponent("/dash/admin/tickets?status=open")}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/tickets?status=open",
      assigneeUserId: "staff-1",
      reason: "dashboard assignment"
    })
  })
  await actionResponse.arrayBuffer()
  assert.equal(actionResponse.status, 302)
  assert.match(String(actionResponse.headers.get("location")), /\/dash\/admin\/tickets\/ticket-1\?/)
  assert.match(String(actionResponse.headers.get("location")), /status=success/)
  assert.match(String(actionResponse.headers.get("location")), /returnTo=%2Fdash%2Fadmin%2Ftickets%3Fstatus%3Dopen/)
  assert.equal(runtime.actionRequests.length, 1)
  assert.deepEqual(runtime.actionRequests[0], {
    ticketId: "ticket-1",
    action: "assign",
    actorUserId: "admin-user",
    reason: "dashboard assignment",
    assigneeUserId: "staff-1",
    targetOptionId: undefined,
    newCreatorUserId: undefined,
    participantUserId: undefined,
    priorityId: undefined,
    topic: undefined
  })

  await new Promise((resolve) => setTimeout(resolve, 25))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ticket-action" })
  assert.equal(audits.length, 1)
  assert.equal(audits[0].target, "ticket-1")
})

test("ticket action POSTs require csrf and revalidate disabled provider-locked actions", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  const csrfToken = csrfFrom(detailHtml)

  const missingCsrf = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1/actions/assign`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      assigneeUserId: "staff-1",
      reason: "missing csrf"
    })
  })
  await missingCsrf.arrayBuffer()
  assert.equal(missingCsrf.status, 403)
  assert.equal(runtime.actionRequests.length, 0)

  const lockedClose = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1/actions/close`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reason: "provider should block"
    })
  })
  await lockedClose.arrayBuffer()
  assert.equal(lockedClose.status, 302)
  assert.match(String(lockedClose.headers.get("location")), /status=warning/)
  assert.equal(redirectMessage(lockedClose.headers.get("location")), "Locked by provider.")
  assert.equal(runtime.actionRequests.length, 0)

  const invalidAction = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1/actions/delete`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ csrfToken })
  })
  await invalidAction.arrayBuffer()
  assert.equal(invalidAction.status, 302)
  assert.equal(redirectMessage(invalidAction.headers.get("location")), "Unsupported ticket action.")
})

test("ticket action route forwards every locked action id through the runtime bridge with actor context", async (t) => {
  const baseTicket = ticket({ id: "ticket-1" })
  const runtime = await startServer({
    tickets: [baseTicket],
    detail: enabledDetail(baseTicket)
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1?returnTo=${encodeURIComponent("/dash/admin/tickets?status=open")}`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  const csrfToken = csrfFrom(detailHtml)

  for (const action of DASHBOARD_TICKET_ACTION_IDS) {
    const body = new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/tickets?status=open",
      reason: `${action} reason`
    })
    if (action === "assign") body.set("assigneeUserId", "staff-1")
    if (action === "escalate") body.set("targetOptionId", "escalated")
    if (action === "move") body.set("targetOptionId", "triage-followup")
    if (action === "transfer") body.set("newCreatorUserId", "creator-2")
    if (action === "add-participant") body.set("participantUserId", "observer-1")
    if (action === "remove-participant") body.set("participantUserId", "staff-1")
    if (action === "set-priority") body.set("priorityId", "urgent")
    if (action === "set-topic") body.set("topic", "Updated dashboard topic")

    const response = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1/actions/${action}`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = String(response.headers.get("location"))
    assert.match(location, /status=success/)
    assert.match(location, /returnTo=%2Fdash%2Fadmin%2Ftickets%3Fstatus%3Dopen/)
    if (action === "move") {
      const redirect = new URL(location, runtime.baseUrl)
      assert.equal(redirect.searchParams.get("msg"), "Ticket moved.")
      assert.equal(redirect.searchParams.get("msg")?.startsWith("tickets.detail."), false)
    }
  }

  assert.deepEqual(runtime.actionRequests.map((request) => request.action), [...DASHBOARD_TICKET_ACTION_IDS])
  assert.ok(runtime.actionRequests.every((request) => request.actorUserId === "admin-user"))
  assert.equal(runtime.actionRequests.find((request) => request.action === "assign")?.assigneeUserId, "staff-1")
  assert.equal(runtime.actionRequests.find((request) => request.action === "escalate")?.targetOptionId, "escalated")
  assert.equal(runtime.actionRequests.find((request) => request.action === "move")?.targetOptionId, "triage-followup")
  assert.equal(runtime.actionRequests.find((request) => request.action === "transfer")?.newCreatorUserId, "creator-2")
  assert.equal(runtime.actionRequests.find((request) => request.action === "add-participant")?.participantUserId, "observer-1")
  assert.equal(runtime.actionRequests.find((request) => request.action === "remove-participant")?.participantUserId, "staff-1")
  assert.equal(runtime.actionRequests.find((request) => request.action === "set-priority")?.priorityId, "urgent")
  assert.equal(runtime.actionRequests.find((request) => request.action === "set-topic")?.topic, "Updated dashboard topic")
})

test("runtime ticket move stays disabled when only config fallback options are available", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  registerRuntimeActionFixture({ includeOptionManager: false })

  const detail = await defaultDashboardRuntimeBridge.getTicketDetail?.("ticket-1", "admin-user")
  assert.equal(detail?.moveTargets.length, 0)
  assert.equal(detail?.actionAvailability.move.enabled, false)
  assert.equal(
    detail?.actionAvailability.move.reason,
    "tickets.detail.availability.noSameOwnerMoveTargets"
  )
})

test("runtime ticket detail resolves original applicant from managed-record draft state", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  registerRuntimeActionFixture({
    ticketOverrides: { "opendiscord:previous-creators": ["metadata-applicant"] },
    formsDrafts: [
      {
        ticketChannelId: "ticket-1",
        formId: "whitelist",
        answerTarget: "ticket_managed_record",
        applicantDiscordUserId: "draft-applicant"
      }
    ]
  })

  const detail = await defaultDashboardRuntimeBridge.getTicketDetail?.("ticket-1", "admin-user")
  assert.equal(detail?.originalApplicantUserId, "draft-applicant")
  assert.equal(detail?.creatorTransferWarning, "tickets.detail.warnings.creatorTransfer")
})

test("runtime ticket move targets preserve private-thread parent-channel constraints", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  registerRuntimeActionFixture({
    runtimeOptions: [
      runtimeOption("intake", "Intake", "triage", "private_thread", "parent-1"),
      runtimeOption("triage-followup", "Triage follow-up", "triage", "private_thread", "parent-1"),
      runtimeOption("triage-other-parent", "Triage other parent", "triage", "private_thread", "parent-2")
    ],
    ticketOverrides: {
      [ODTICKET_PLATFORM_METADATA_IDS.transportMode]: "private_thread",
      [ODTICKET_PLATFORM_METADATA_IDS.transportParentChannelId]: "parent-1"
    }
  })

  const detail = await defaultDashboardRuntimeBridge.getTicketDetail?.("ticket-1", "admin-user")
  assert.deepEqual(detail?.moveTargets.map((choice) => choice.optionId), ["triage-followup"])
  assert.equal(detail?.actionAvailability.move.enabled, true)
})

test("runtime ticket action bridge refuses to remove the current creator as a participant", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  const fixture = registerRuntimeActionFixture()

  const result = await defaultDashboardRuntimeBridge.runTicketAction?.({
    ticketId: "ticket-1",
    action: "remove-participant",
    actorUserId: "admin-user",
    participantUserId: "creator-1",
    reason: "remove creator"
  })

  assert.equal(result?.ok, false)
  assert.equal(result?.status, "warning")
  assert.equal(result?.message, "tickets.detail.actionResults.participantCreatorRemoveDenied")
  assert.equal(fixture.actionRuns.length, 0)
})

test("runtime ticket action bridge executes SLICE-010A Open Ticket action branches", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  const fixture = registerRuntimeActionFixture()

  const actions: DashboardTicketActionRequest[] = [
    { ticketId: "ticket-1", action: "move", actorUserId: "admin-user", targetOptionId: "triage-followup", reason: "move" },
    { ticketId: "ticket-1", action: "transfer", actorUserId: "admin-user", newCreatorUserId: "creator-2", reason: "transfer" },
    { ticketId: "ticket-1", action: "add-participant", actorUserId: "admin-user", participantUserId: "observer-1", reason: "add" },
    { ticketId: "ticket-1", action: "remove-participant", actorUserId: "admin-user", participantUserId: "staff-1", reason: "remove" },
    { ticketId: "ticket-1", action: "set-priority", actorUserId: "admin-user", priorityId: "urgent", reason: "priority" },
    { ticketId: "ticket-1", action: "set-topic", actorUserId: "admin-user", topic: "Updated dashboard topic" }
  ]

  for (const action of actions) {
    const result = await defaultDashboardRuntimeBridge.runTicketAction?.(action)
    assert.equal(result?.ok, true, `${action.action} should succeed`)
  }

  assert.deepEqual(fixture.actionRuns.map((run) => run.id), [
    "opendiscord:move-ticket",
    "opendiscord:transfer-ticket",
    "opendiscord:add-ticket-user",
    "opendiscord:remove-ticket-user",
    "opendiscord:update-ticket-priority",
    "opendiscord:update-ticket-topic"
  ])
  assert.equal(fixture.actionRuns[0].params.data, fixture.followup)
  assert.equal(fixture.actionRuns[1].params.newCreator.id, "creator-2")
  assert.equal(fixture.actionRuns[2].params.data.id, "observer-1")
  assert.equal(fixture.actionRuns[3].params.data.id, "staff-1")
  assert.equal(fixture.actionRuns[4].params.newPriority.rawName, "urgent")
  assert.equal(fixture.actionRuns[5].params.newTopic, "Updated dashboard topic")
})

test("runtime ticket action bridge executes SLICE-012 workflow action branches", async (t) => {
  t.after(() => clearDashboardRuntimeRegistry())
  const workflowOptions = [
    runtimeOption("intake", "Intake", "triage", "channel_text", null, { closeRequestEnabled: true, awaitingUserEnabled: true }),
    runtimeOption("triage-followup", "Triage follow-up", "triage", "channel_text", null, { closeRequestEnabled: true, awaitingUserEnabled: true })
  ]
  const closeRequestFixture = registerRuntimeActionFixture({
    runtimeOptions: workflowOptions,
    ticketOverrides: {
      [ODTICKET_PLATFORM_METADATA_IDS.closeRequestState]: "requested"
    }
  })

  for (const action of ["approve-close-request", "dismiss-close-request"] as const) {
    const result = await defaultDashboardRuntimeBridge.runTicketAction?.({
      ticketId: "ticket-1",
      action,
      actorUserId: "admin-user",
      reason: `${action} reason`
    })
    assert.equal(result?.ok, true, `${action} should succeed`)
  }

  assert.deepEqual(closeRequestFixture.actionRuns.map((run) => run.id), [
    "opendiscord:approve-close-request",
    "opendiscord:dismiss-close-request"
  ])
  assert.equal(closeRequestFixture.actionRuns[0].params.reason, "approve-close-request reason")

  const setAwaitingFixture = registerRuntimeActionFixture({ runtimeOptions: workflowOptions })
  const setResult = await defaultDashboardRuntimeBridge.runTicketAction?.({
    ticketId: "ticket-1",
    action: "set-awaiting-user",
    actorUserId: "admin-user",
    reason: "waiting on requester"
  })
  assert.equal(setResult?.ok, true)

  const clearAwaitingFixture = registerRuntimeActionFixture({
    runtimeOptions: workflowOptions,
    ticketOverrides: {
      [ODTICKET_PLATFORM_METADATA_IDS.awaitingUserState]: "waiting"
    }
  })
  const clearResult = await defaultDashboardRuntimeBridge.runTicketAction?.({
    ticketId: "ticket-1",
    action: "clear-awaiting-user",
    actorUserId: "admin-user",
    reason: "requester replied"
  })
  assert.equal(clearResult?.ok, true)

  assert.deepEqual(setAwaitingFixture.actionRuns.map((run) => run.id), ["opendiscord:set-awaiting-user"])
  assert.deepEqual(clearAwaitingFixture.actionRuns.map((run) => run.id), ["opendiscord:clear-awaiting-user"])
})

test("ticket workbench renders degraded read and write states instead of redirecting away", async (t) => {
  const unavailableRuntime = await startServer({ ticketSummaryAvailable: false })
  t.after(() => stopServer(unavailableRuntime))
  const unavailableLogin = await login(unavailableRuntime.baseUrl)
  const listResponse = await fetch(`${unavailableRuntime.baseUrl}/dash/admin/tickets`, { headers: { cookie: unavailableLogin.cookie } })
  const listHtml = await listResponse.text()
  assert.equal(listResponse.status, 200)
  assert.match(listHtml, /not exposing ticket inventory/)

  const readOnlyRuntime = await startServer({ writes: false })
  t.after(() => stopServer(readOnlyRuntime))
  const readOnlyLogin = await login(readOnlyRuntime.baseUrl)
  const detailResponse = await fetch(`${readOnlyRuntime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie: readOnlyLogin.cookie } })
  const detailHtml = await detailResponse.text()
  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Ticket action writes are unavailable/)
  assert.match(detailHtml, /Dashboard runtime ticket writes are unavailable\./)

  const csrfToken = csrfFrom(detailHtml)
  const assignResponse = await fetch(`${readOnlyRuntime.baseUrl}/dash/admin/tickets/ticket-1/actions/assign`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: readOnlyLogin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      assigneeUserId: "staff-1"
    })
  })
  await assignResponse.arrayBuffer()
  assert.equal(assignResponse.status, 302)
  assert.match(String(redirectMessage(assignResponse.headers.get("location"))), /Dashboard runtime ticket writes are unavailable/)
  assert.equal(readOnlyRuntime.actionRequests.length, 0)

  const refreshResponse = await fetch(`${readOnlyRuntime.baseUrl}/dash/admin/tickets/ticket-1/actions/refresh`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: readOnlyLogin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ csrfToken })
  })
  await refreshResponse.arrayBuffer()
  assert.equal(refreshResponse.status, 302)
  assert.equal(redirectMessage(refreshResponse.headers.get("location")), "Ticket detail refreshed.")
})

test("analytics workspace is admin-only and degrades when transcript history is unavailable", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))

  const admin = await login(runtime.baseUrl, "admin-user", "/dash/admin/analytics")
  const adminAnalytics = await fetch(`${runtime.baseUrl}/dash/admin/analytics`, { headers: { cookie: admin.cookie } })
  assert.equal(adminAnalytics.status, 200)
  const html = await adminAnalytics.text()
  assert.match(html, />Analytics</)
  assert.match(html, /Current backlog/)
  assert.match(html, /Transcript analytics history is unavailable/)

  const editor = await login(runtime.baseUrl, "editor-user", "/dash/admin/analytics")
  assert.equal(editor.location, "/dash/visual/options")
  const editorAnalytics = await fetch(`${runtime.baseUrl}/dash/admin/analytics`, {
    headers: { cookie: editor.cookie },
    redirect: "manual"
  })
  assert.equal(editorAnalytics.status, 302)
  assert.equal(editorAnalytics.headers.get("location"), "/dash/visual/options")
})

test("analytics model normalizes UTC windows, computes SLA metrics, groups backlog, and dedupes live tickets over history", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({
        id: "live-1",
        openedOn: Date.parse("2026-04-20T10:00:00.000Z"),
        firstStaffResponseAt: Date.parse("2026-04-20T10:10:00.000Z"),
        resolvedAt: Date.parse("2026-04-20T11:00:00.000Z"),
        assignedStaffUserId: "staff-1"
      }),
      ticket({
        id: "outside",
        openedOn: Date.parse("2026-03-01T10:00:00.000Z"),
        assignedTeamId: "lead",
        assignedStaffUserId: "staff-2"
      })
    ]
  })
  t.after(() => stopServer(runtime))

  const calls: unknown[] = []
  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "custom", from: "2026-04-20", to: "2026-04-20", transport: "channel_text" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    transcriptService: {
      async listTicketAnalyticsHistory(query) {
        calls.push(query)
        return {
          total: 2,
          warnings: [],
          nextCursor: null,
          truncated: false,
          items: [
            {
              ticketId: "live-1",
              transcriptId: "tr-live-1",
              creatorId: "creator-1",
              openedAt: Date.parse("2026-04-20T10:00:00.000Z"),
              closedAt: Date.parse("2026-04-20T11:00:00.000Z"),
              resolvedAt: Date.parse("2026-04-20T11:00:00.000Z"),
              firstStaffResponseAt: Date.parse("2026-04-20T10:20:00.000Z"),
              assignedTeamId: "triage",
              assignedStaffUserId: "staff-archive",
              transportMode: "channel_text",
              transcriptStatus: "active"
            },
            {
              ticketId: "archive-1",
              transcriptId: "tr-archive-1",
              creatorId: "creator-2",
              openedAt: Date.parse("2026-04-20T12:00:00.000Z"),
              closedAt: Date.parse("2026-04-20T14:00:00.000Z"),
              resolvedAt: Date.parse("2026-04-20T14:00:00.000Z"),
              firstStaffResponseAt: Date.parse("2026-04-20T12:30:00.000Z"),
              assignedTeamId: "triage",
              assignedStaffUserId: "staff-2",
              transportMode: "channel_text",
              transcriptStatus: "active"
            }
          ]
        }
      }
    }
  })

  assert.equal(calls.length, 1)
  assert.equal(model.request.openedFromMs, Date.parse("2026-04-20T00:00:00.000Z"))
  assert.equal(model.request.openedToMs, Date.parse("2026-04-21T00:00:00.000Z"))
  assert.equal(model.summaryCards[0].value, "2")
  assert.equal(model.summaryCards[1].value, "2")
  assert.equal(model.summaryCards[2].value, "20m")
  assert.equal(model.summaryCards[3].value, "30m")
  assert.equal(model.summaryCards[4].value, "1h 30m")
  assert.equal(model.summaryCards[5].value, "2h")
  assert.equal(model.backlogByTeam.find((row) => row.key === "triage")?.count, 1)
  assert.equal(model.cohortByTeam.find((row) => row.key === "triage")?.count, 2)
})

test("analytics model keeps live ticket identity authoritative before applying archive filters", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({
        id: "live-reassigned",
        openedOn: Date.parse("2026-04-20T09:00:00.000Z"),
        assignedTeamId: "lead",
        assignedStaffUserId: "staff-live"
      })
    ]
  })
  t.after(() => stopServer(runtime))

  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "custom", from: "2026-04-20", to: "2026-04-20", teamId: "triage", transport: "channel_text" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    transcriptService: {
      async listTicketAnalyticsHistory() {
        return {
          total: 2,
          warnings: [],
          nextCursor: null,
          truncated: false,
          items: [
            {
              ticketId: "live-reassigned",
              transcriptId: "tr-live-reassigned",
              creatorId: "creator-stale",
              openedAt: Date.parse("2026-04-20T09:00:00.000Z"),
              closedAt: null,
              resolvedAt: null,
              firstStaffResponseAt: null,
              assignedTeamId: "triage",
              assignedStaffUserId: "staff-archive",
              transportMode: "channel_text",
              transcriptStatus: "active"
            },
            {
              ticketId: "archive-visible",
              transcriptId: "tr-archive-visible",
              creatorId: "creator-visible",
              openedAt: Date.parse("2026-04-20T12:00:00.000Z"),
              closedAt: Date.parse("2026-04-20T12:40:00.000Z"),
              resolvedAt: Date.parse("2026-04-20T12:40:00.000Z"),
              firstStaffResponseAt: Date.parse("2026-04-20T12:10:00.000Z"),
              assignedTeamId: "triage",
              assignedStaffUserId: "staff-visible",
              transportMode: "channel_text",
              transcriptStatus: "active"
            }
          ]
        }
      }
    }
  })

  assert.equal(model.summaryCards[0].value, "1")
  assert.equal(model.summaryCards[1].value, "0")
  assert.equal(model.cohortByTeam.find((row) => row.key === "triage")?.count, 1)
  assert.equal(model.cohortByTeam.find((row) => row.key === "lead"), undefined)
})

test("analytics model preserves live backlog when transcript history reads fail", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({
        id: "live-backlog",
        openedOn: Date.parse("2026-04-20T10:00:00.000Z"),
        assignedTeamId: "triage",
        assignedStaffUserId: "staff-1"
      })
    ]
  })
  t.after(() => stopServer(runtime))

  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "30d" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    now: Date.parse("2026-04-25T12:00:00.000Z"),
    transcriptService: {
      async listTicketAnalyticsHistory() {
        throw new Error("history store unavailable")
      }
    }
  })

  assert.equal(model.historyState, "unavailable")
  assert.equal(model.summaryCards[0].value, "Unavailable")
  assert.equal(model.summaryCards[1].value, "1")
  assert.equal(model.backlogByTeam.find((row) => row.key === "triage")?.count, 1)
  assert.equal(model.cohortByTeam.length, 0)
  assert.match(model.historyWarnings.join("\n"), /could not be read/)
})

test("analytics model surfaces truncation warnings before lower-priority history warnings", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({
        id: "live-backlog-truncated",
        openedOn: Date.parse("2026-04-20T10:00:00.000Z"),
        assignedTeamId: "triage"
      })
    ]
  })
  t.after(() => stopServer(runtime))

  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "30d" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    now: Date.parse("2026-04-25T12:00:00.000Z"),
    transcriptService: {
      async listTicketAnalyticsHistory() {
        return {
          total: 0,
          items: [],
          warnings: ["older skipped archive warning", "another skipped archive warning"],
          nextCursor: null,
          truncated: true
        }
      }
    }
  })

  assert.equal(model.historyState, "truncated")
  assert.match(model.historyWarnings[0], /truncated/)
  assert.equal(model.summaryCards[0].value, "Unavailable")
  assert.equal(model.summaryCards[1].value, "1")
  assert.equal(model.cohortByTeam.length, 0)
})

test("analytics request parser honors preset windows and fails invalid custom ranges closed", () => {
  const now = Date.parse("2026-04-25T12:00:00.000Z")
  const sevenDay = parseDashboardAnalyticsRequest({ window: "7d" }, { now })
  assert.equal(sevenDay.window, "7d")
  assert.equal(sevenDay.openedFromMs, Date.parse("2026-04-18T12:00:00.000Z"))
  assert.equal(sevenDay.openedToMs, now)

  const thirtyDay = parseDashboardAnalyticsRequest({ window: "30d" }, { now })
  assert.equal(thirtyDay.window, "30d")
  assert.equal(thirtyDay.openedFromMs, Date.parse("2026-03-26T12:00:00.000Z"))
  assert.equal(thirtyDay.openedToMs, now)

  const ninetyDay = parseDashboardAnalyticsRequest({ window: "90d" }, { now })
  assert.equal(ninetyDay.window, "90d")
  assert.equal(ninetyDay.openedFromMs, Date.parse("2026-01-25T12:00:00.000Z"))
  assert.equal(ninetyDay.openedToMs, now)

  const invalidCustom = parseDashboardAnalyticsRequest({ window: "custom", from: "2026-04-30", to: "2026-04-01" }, { now })
  assert.equal(invalidCustom.window, "30d")
  assert.equal(invalidCustom.openedFromMs, Date.parse("2026-03-26T12:00:00.000Z"))
  assert.equal(invalidCustom.openedToMs, now)
})

test("analytics duration helpers use fixed median and nearest-rank p95 math", () => {
  assert.equal(medianDurationMs([30, 10, 20]), 20)
  assert.equal(medianDurationMs([40, 10, 20, 30]), 25)
  assert.equal(p95DurationMs([10, 20, 30, 40]), 40)
})

test("ticket workbench source boundaries preserve dashboard and bridge contracts", () => {
  const root = path.resolve(process.cwd())
  const authSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "server", "auth.ts"), "utf8")
  const routesSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "server", "routes", "admin.ts"), "utf8")
  const workflowSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "workflow.yaml"), "utf8")
  const controllerSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "runtime", "controller-state.yaml"), "utf8")
  const bridgeSource = fs.readFileSync(path.join(root, "plugins", "ot-eotfs-bridge", "index.ts"), "utf8")

  assert.match(authSource, /ticket\.workbench/)
  assert.match(authSource, /"\/admin\/tickets"/)
  assert.match(authSource, /if \(tier === "editor" \|\| tier === "admin"\) \{\s+capabilities\.push\("config\.write\.visual", "admin\.shell", "ticket\.workbench"\)/)
  assert.doesNotMatch(routesSource, /DashboardActionProviderBridge/)
  assert.match(bridgeSource, /getDashboardTicketLockState/)
  assert.match(workflowSource, /superseded by the workspace SLICE-010 controller contract/)
  assert.match(controllerSource, /SLICE-010` supersedes that local retirement contract/)
})

test("ticket returnTo sanitizer accepts only ticket-workbench admin-host targets", () => {
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets?status=open"), "/dash/admin/tickets?status=open")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets/ticket-1"), "/dash/admin/tickets/ticket-1")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/transcripts"), "/dash/admin/tickets")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "https://example.invalid/dash/admin/tickets"), "/dash/admin/tickets")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets/../transcripts"), "/dash/admin/tickets")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets/%2e%2e/transcripts"), "/dash/admin/tickets")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets\\..\\transcripts"), "/dash/admin/tickets")
  assert.equal(sanitizeTicketWorkbenchReturnTo("/dash", "/dash/admin/tickets/%5c..%5ctranscripts"), "/dash/admin/tickets")
})
