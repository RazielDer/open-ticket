import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import type { AddressInfo } from "net"
import type { Socket } from "net"

import { createDashboardApp } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import type { DashboardRuntimeBridge, DashboardRuntimeGuildMember } from "../server/runtime-bridge"
import type { DashboardTicketRecord } from "../server/dashboard-runtime-registry"
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
    creatorTransferWarning: "Original applicant authority remains with Unknown user (creator-original); the current creator is Unknown user (creator-1).",
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
        creatorTransferWarning: "Original applicant authority remains with Unknown user (creator-original); the current creator is Unknown user (creator-1).",
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
          message: `${input.action} through test runtime.`,
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
    assert.match(String(response.headers.get("location")), /status=success/)
    assert.match(String(response.headers.get("location")), /returnTo=%2Fdash%2Fadmin%2Ftickets%3Fstatus%3Dopen/)
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
  assert.match(String(redirectMessage(assignResponse.headers.get("location"))), /Ticket action writes are unavailable/)
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
