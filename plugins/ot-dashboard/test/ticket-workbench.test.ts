import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import type { AddressInfo } from "net"
import type { Socket } from "net"

import { createDashboardApp } from "../server/create-app"
import { buildDashboardAnalyticsModel, medianDurationMs, p95DurationMs, parseDashboardAnalyticsRequest } from "../server/analytics"
import { buildAnalyticsExportPayload } from "../server/export-serializers"
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
  type DashboardTicketAiAssistRequest,
  type DashboardTicketDetailRecord,
  type DashboardTicketFeedbackTelemetryRecord,
  type DashboardTicketLifecycleTelemetryRecord,
  type DashboardTicketTelemetrySignals
} from "../server/ticket-workbench-types"
import {
  buildTicketWorkbenchListModel,
  parseTicketWorkbenchListRequest,
  sanitizeTicketWorkbenchReturnTo
} from "../server/ticket-workbench"
import {
  buildDashboardQualityReviewListModel,
  parseDashboardQualityReviewQuery,
  sanitizeQualityReviewReturnTo
} from "../server/quality-review"

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
  writeJson(path.join(root, "config", "ai-assist-profiles.json"), [])
  writeJson(path.join(root, "config", "knowledge-sources.json"), [])
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
    channelName: null,
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

function telemetrySignals(overrides: Partial<DashboardTicketTelemetrySignals> = {}): DashboardTicketTelemetrySignals {
  return {
    hasEverReopened: false,
    reopenCount: 0,
    lastReopenedAt: null,
    latestFeedbackStatus: "none",
    latestFeedbackTriggeredAt: null,
    latestFeedbackCompletedAt: null,
    latestRatings: [],
    ...overrides
  }
}

function telemetrySnapshot(overrides: Partial<DashboardTicketFeedbackTelemetryRecord["snapshot"]> = {}): DashboardTicketFeedbackTelemetryRecord["snapshot"] {
  return {
    creatorUserId: "creator-1",
    optionId: "intake",
    transportMode: "channel_text",
    assignedTeamId: "triage",
    assignedStaffUserId: null,
    assignmentStrategy: "manual",
    integrationProfileId: null,
    aiAssistProfileId: null,
    closeRequestState: null,
    awaitingUserState: null,
    firstStaffResponseAt: null,
    resolvedAt: null,
    closed: false,
    ...overrides
  }
}

function feedbackTelemetry(overrides: Partial<DashboardTicketFeedbackTelemetryRecord> = {}): DashboardTicketFeedbackTelemetryRecord {
  return {
    sessionId: "feedback-1",
    ticketId: "ticket-1",
    triggerMode: "close",
    triggeredAt: Date.now() - 60_000,
    completedAt: Date.now() - 30_000,
    status: "completed",
    respondentUserId: "creator-1",
    closeCountAtTrigger: 1,
    snapshot: telemetrySnapshot(),
    questionSummaries: [
      { position: 0, type: "rating", label: "Experience", answered: true, ratingValue: 5, choiceIndex: null, choiceLabel: null }
    ],
    ...overrides
  }
}

function lifecycleTelemetry(overrides: Partial<DashboardTicketLifecycleTelemetryRecord> = {}): DashboardTicketLifecycleTelemetryRecord {
  return {
    recordId: "lifecycle-1",
    ticketId: "ticket-1",
    eventType: "reopened",
    occurredAt: Date.now() - 45_000,
    actorUserId: "staff-1",
    snapshot: telemetrySnapshot(),
    previousSnapshot: telemetrySnapshot({ closed: true }),
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
    providerLock: null,
    integration: null,
    aiAssist: null,
    telemetry: null
  }
}

async function startServer(options: {
  tickets?: DashboardTicketRecord[]
  detail?: DashboardTicketDetailRecord | null
  writes?: boolean
  ticketSummaryAvailable?: boolean
  aiAssistResult?: any
  telemetrySignals?: Record<string, DashboardTicketTelemetrySignals>
  lifecycleTelemetry?: DashboardTicketLifecycleTelemetryRecord[]
  feedbackTelemetry?: DashboardTicketFeedbackTelemetryRecord[]
  telemetrySignalCalls?: string[][]
} = {}) {
  const projectRoot = createProjectRoot()
  const tickets = options.tickets || [ticket({}), ticket({ id: "ticket-2", optionId: "missing-option", transportMode: "private_thread", assignedTeamId: "missing-team", assignedStaffUserId: "staff-2", openedOn: 1710000100000 })]
  const actionRequests: DashboardTicketActionRequest[] = []
  const aiAssistRequests: DashboardTicketAiAssistRequest[] = []
  const telemetryEnabled = Boolean(options.telemetrySignals || options.lifecycleTelemetry || options.feedbackTelemetry)
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
        },
        integration: null,
        aiAssist: null,
        telemetry: options.telemetrySignals?.[base.id] || null
      }
    },
    ...(telemetryEnabled ? {
      async listLifecycleTelemetry() {
        return {
          items: options.lifecycleTelemetry || [],
          nextCursor: null,
          truncated: false,
          warnings: []
        }
      },
      async listFeedbackTelemetry() {
        return {
          items: options.feedbackTelemetry || [],
          nextCursor: null,
          truncated: false,
          warnings: []
        }
      },
      async getTicketTelemetrySignals(ticketIds: string[]) {
        options.telemetrySignalCalls?.push([...ticketIds])
        return Object.fromEntries(ticketIds.map((ticketId) => [
          ticketId,
          options.telemetrySignals?.[ticketId] || telemetrySignals()
        ]))
      }
    } : {}),
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
    async runTicketAiAssist(input: DashboardTicketAiAssistRequest) {
      aiAssistRequests.push(input)
      return options.aiAssistResult || {
        ok: true,
        outcome: "success" as const,
        action: input.action,
        message: "tickets.detail.actionResults.aiAssistSuccess",
        profileId: "assist-1",
        providerId: "reference",
        confidence: "medium" as const,
        summary: input.action === "summarize" ? "Ticket summary text" : null,
        answer: input.action === "answerFaq" ? "FAQ answer text" : null,
        draft: input.action === "suggestReply" ? "Draft reply text" : null,
        citations: [],
        warnings: [],
        degradedReason: null,
        ticketId: input.ticketId
      }
    },
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
    aiAssistRequests,
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

function redirectAlertStatus(location: string | null) {
  return new URL(String(location), "http://dashboard.local").searchParams.get("alertStatus")
}

function unzipStoredEntries(buffer: Buffer) {
  const entries = new Map<string, string>()
  let offset = 0
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034B50) {
    const method = buffer.readUInt16LE(offset + 8)
    assert.equal(method, 0)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const fileNameLength = buffer.readUInt16LE(offset + 26)
    const extraLength = buffer.readUInt16LE(offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + fileNameLength + extraLength
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8")
    entries.set(name, buffer.subarray(dataStart, dataStart + compressedSize).toString("utf8"))
    offset = dataStart + compressedSize
  }
  return entries
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

  const reviewer = await login(runtime.baseUrl, "reviewer-user", "/dash/admin/tickets")
  assert.equal(reviewer.location, "/dash/admin/quality-review")
  const reviewerTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, { headers: { cookie: reviewer.cookie }, redirect: "manual" })
  await reviewerTickets.arrayBuffer()
  assert.equal(reviewerTickets.status, 302)
  assert.equal(reviewerTickets.headers.get("location"), "/dash/admin/quality-review")
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

test("ticket list exposes telemetry filters only when telemetry reads are available", async (t) => {
  const baseTickets = [
    ticket({ id: "ticket-1", channelName: "intake-channel" }),
    ticket({ id: "ticket-2", channelName: "second-channel", openedOn: 1710000100000 })
  ]
  const runtime = await startServer({
    tickets: baseTickets,
    telemetrySignals: {
      "ticket-1": telemetrySignals({
        hasEverReopened: true,
        reopenCount: 2,
        lastReopenedAt: Date.parse("2026-04-20T12:00:00.000Z"),
        latestFeedbackStatus: "completed",
        latestFeedbackTriggeredAt: Date.parse("2026-04-20T11:00:00.000Z"),
        latestFeedbackCompletedAt: Date.parse("2026-04-20T11:05:00.000Z"),
        latestRatings: [{ questionKey: "1:Experience", label: "Experience", value: 5 }]
      })
    }
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const response = await fetch(`${runtime.baseUrl}/dash/admin/tickets?feedback=completed&reopened=ever`, { headers: { cookie } })
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /intake-channel/)
  assert.match(html, /Feedback complete/)
  assert.match(html, /Reopened x2/)
  assert.doesNotMatch(html, /second-channel/)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Latest feedback/)
  assert.match(detailHtml, /Feedback complete/)
  assert.match(detailHtml, /Experience/)
})

test("ticket list batches badge telemetry for the visible page", async (t) => {
  const telemetrySignalCalls: string[][] = []
  const tickets = Array.from({ length: 11 }, (_item, index) => ticket({
    id: `ticket-${index + 1}`,
    channelName: index === 0 ? "oldest-channel" : index === 10 ? "newest-channel" : `channel-${index + 1}`,
    openedOn: 1710000000000 + index * 1000
  }))
  const runtime = await startServer({
    tickets,
    telemetrySignals: {
      "ticket-11": telemetrySignals({
        latestFeedbackStatus: "completed",
        hasEverReopened: true,
        reopenCount: 1
      })
    },
    telemetrySignalCalls
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const response = await fetch(`${runtime.baseUrl}/dash/admin/tickets?limit=10`, { headers: { cookie } })
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.deepEqual(telemetrySignalCalls, [[
    "ticket-11",
    "ticket-10",
    "ticket-9",
    "ticket-8",
    "ticket-7",
    "ticket-6",
    "ticket-5",
    "ticket-4",
    "ticket-3",
    "ticket-2"
  ]])
  assert.match(html, /newest-channel/)
  assert.doesNotMatch(html, /oldest-channel/)
  assert.match(html, /Feedback complete/)
  assert.match(html, /Reopened x1/)
})

test("ticket telemetry filters are disabled when telemetry reads are unavailable", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({ id: "ticket-1", channelName: "intake-channel" }),
      ticket({ id: "ticket-2", channelName: "second-channel", openedOn: 1710000100000 })
    ]
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const response = await fetch(`${runtime.baseUrl}/dash/admin/tickets?feedback=completed&reopened=ever`, { headers: { cookie } })
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /Ticket telemetry reads are unavailable/)
  assert.match(html, /intake-channel/)
  assert.match(html, /second-channel/)
})

test("ticket list model applies feedback and reopened telemetry signals", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))
  const request = parseTicketWorkbenchListRequest({ feedback: "completed", reopened: "ever" })
  const model = buildTicketWorkbenchListModel({
    basePath: "/dash",
    currentHref: "/dash/admin/tickets?feedback=completed&reopened=ever",
    request,
    tickets: [
      ticket({ id: "ticket-1", channelName: "intake-channel" }),
      ticket({ id: "ticket-2", channelName: "second-channel", openedOn: 1710000100000 })
    ],
    configService: runtime.context.configService,
    readsSupported: true,
    telemetrySupported: true,
    telemetrySignals: {
      "ticket-1": telemetrySignals({
        hasEverReopened: true,
        reopenCount: 1,
        latestFeedbackStatus: "completed"
      })
    }
  })

  assert.equal(model.total, 1)
  assert.equal(model.items[0].id, "ticket-1")
  assert.equal(model.items[0].feedbackBadge?.label, "Feedback complete")
  assert.equal(model.items[0].reopenBadge?.label, "Reopened x1")
})

test("quality review admits reviewers and admins without granting editor workbench access", async (t) => {
  const runtime = await startServer({
    telemetrySignals: {},
    feedbackTelemetry: [feedbackTelemetry()],
    lifecycleTelemetry: [lifecycleTelemetry()]
  })
  t.after(() => stopServer(runtime))

  const reviewer = await login(runtime.baseUrl, "reviewer-user", "/dash/admin/quality-review")
  assert.equal(reviewer.location, "/dash/admin/quality-review")
  const reviewerList = await fetch(`${runtime.baseUrl}/dash/admin/quality-review`, { headers: { cookie: reviewer.cookie } })
  const reviewerHtml = await reviewerList.text()
  assert.equal(reviewerList.status, 200)
  assert.match(reviewerHtml, /Quality review workspace/)
  assert.match(reviewerHtml, /Review candidates/)
  assert.doesNotMatch(reviewerHtml, /Export JSON|Export CSV|Bulk actions/)
  assert.doesNotMatch(reviewerHtml, /href="\/dash\/admin\/tickets"[^>]*>Tickets</)

  const reviewerTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, { headers: { cookie: reviewer.cookie }, redirect: "manual" })
  await reviewerTickets.arrayBuffer()
  assert.equal(reviewerTickets.status, 302)
  assert.equal(reviewerTickets.headers.get("location"), "/dash/admin/quality-review")

  const admin = await login(runtime.baseUrl, "admin-user", "/dash/admin/tickets")
  const adminTickets = await fetch(`${runtime.baseUrl}/dash/admin/tickets`, { headers: { cookie: admin.cookie } })
  assert.match(await adminTickets.text(), /Quality review/)

  const editor = await login(runtime.baseUrl, "editor-user", "/dash/admin/quality-review")
  assert.equal(editor.location, "/dash/visual/options")
  const editorDenied = await fetch(`${runtime.baseUrl}/dash/admin/quality-review`, { headers: { cookie: editor.cookie }, redirect: "manual" })
  await editorDenied.arrayBuffer()
  assert.equal(editorDenied.status, 302)
  assert.equal(editorDenied.headers.get("location"), "/dash/visual/options")
})

test("quality review list is window-scoped, current-page drilldown only, and privacy-safe", async (t) => {
  const now = Date.now()
  const liveTicket = ticket({ id: "ticket-live", channelName: "live-review-channel", assignedStaffUserId: "staff-1" })
  const archivedFeedback = feedbackTelemetry({
    sessionId: "feedback-archived",
    ticketId: "ticket-archived",
    triggeredAt: now - 90_000,
    completedAt: now - 80_000,
    status: "completed",
    respondentUserId: "creator-archived",
    snapshot: telemetrySnapshot({
      creatorUserId: "creator-archived",
      optionId: "missing-option",
      assignedTeamId: "missing-team",
      assignedStaffUserId: "staff-archived",
      transportMode: "private_thread",
      closed: true
    }),
    questionSummaries: [
      { position: 0, type: "rating", label: "Satisfaction", answered: true, ratingValue: 4, choiceIndex: null, choiceLabel: null },
      { position: 1, type: "text", label: "Private comment", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: null }
    ]
  })
  const liveFeedback = feedbackTelemetry({
    sessionId: "feedback-live",
    ticketId: "ticket-live",
    triggeredAt: now - 70_000,
    completedAt: now - 65_000,
    status: "ignored",
    snapshot: telemetrySnapshot({ assignedStaffUserId: "staff-1" })
  })
  const liveReopen = lifecycleTelemetry({
    recordId: "reopened-live",
    ticketId: "ticket-live",
    occurredAt: now - 60_000,
    eventType: "reopened",
    snapshot: telemetrySnapshot({ assignedStaffUserId: "staff-1" })
  })
  const runtime = await startServer({
    tickets: [liveTicket],
    telemetrySignals: {},
    feedbackTelemetry: [archivedFeedback, liveFeedback],
    lifecycleTelemetry: [
      liveReopen,
      lifecycleTelemetry({
        recordId: "closed-archived",
        ticketId: "ticket-archived",
        eventType: "closed",
        occurredAt: now - 75_000,
        snapshot: archivedFeedback.snapshot
      })
    ]
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl, "admin-user", "/dash/admin/quality-review")

  const listResponse = await fetch(`${runtime.baseUrl}/dash/admin/quality-review?signal=feedback&feedback=completed&q=archived`, { headers: { cookie } })
  const listHtml = await listResponse.text()
  assert.equal(listResponse.status, 200)
  assert.match(listHtml, /ticket-archived/)
  assert.match(listHtml, /Ticket no longer active/)
  assert.match(listHtml, /Unknown option/)
  assert.match(listHtml, /Unknown team/)
  assert.match(listHtml, /Unknown assignee \(staff-archived\)/)
  assert.match(listHtml, /Completed feedback/)
  assert.doesNotMatch(listHtml, /ticket-live/)
  assert.doesNotMatch(listHtml, /Export JSON|Export CSV|Bulk actions/)
  assert.match(listHtml, /returnTo=%2Fdash%2Fadmin%2Fquality-review%3Fsignal%3Dfeedback%26feedback%3Dcompleted%26q%3Darchived/)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/quality-review/ticket-archived?signal=feedback&feedback=completed&returnTo=${encodeURIComponent("https://example.invalid/bad")}`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Ticket no longer active/)
  assert.match(detailHtml, /Latest rating answers/)
  assert.match(detailHtml, /Satisfaction/)
  assert.match(detailHtml, /In current window/)
  assert.match(detailHtml, /href="\/dash\/admin\/quality-review"/)
  assert.doesNotMatch(detailHtml, /Private comment|raw feedback|attachment|discord\.com\/channels/)
})

test("quality review model preserves filter semantics and unavailable telemetry state", async (t) => {
  const runtime = await startServer()
  t.after(() => stopServer(runtime))

  const parsed = parseDashboardQualityReviewQuery({
    window: "custom",
    from: "2026-04-22",
    to: "2026-04-20",
    signal: "reopened",
    reopened: "never",
    limit: "999",
    page: "-2"
  }, { now: Date.parse("2026-04-28T12:00:00.000Z") })
  assert.equal(parsed.window, "30d")
  assert.equal(parsed.reopened, "all")
  assert.equal(parsed.limit, 25)
  assert.equal(parsed.page, 1)
  assert.equal(sanitizeQualityReviewReturnTo("/dash", "/dash/admin/tickets"), "/dash/admin/quality-review")
  assert.equal(sanitizeQualityReviewReturnTo("/dash", "/dash/admin/quality-review/ticket-1?returnTo=/dash/admin/quality-review"), "/dash/admin/quality-review/ticket-1?returnTo=/dash/admin/quality-review")

  const model = await buildDashboardQualityReviewListModel({
    basePath: "/dash",
    projectRoot: runtime.projectRoot,
    currentHref: "/dash/admin/quality-review",
    query: {},
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge
  })
  assert.equal(model.available, false)
  assert.match(model.warningMessage, /Ticket telemetry reads are unavailable/)
  assert.equal(model.items.length, 0)
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

test("ticket bulk actions require csrf, keep return filters, and map claim-self to actor claim", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({ id: "ticket-1", channelName: "intake-channel" }),
      ticket({ id: "ticket-2", channelName: "second-channel", openedOn: 1710000100000 })
    ]
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const listResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets?status=open&q=channel`, { headers: { cookie } })
  const listHtml = await listResponse.text()
  assert.equal(listResponse.status, 200)
  assert.match(listHtml, /id="ticket-bulk-actions"/)
  assert.match(listHtml, /intake-channel/)
  const csrfToken = csrfFrom(listHtml)

  const missingCsrf = await fetch(`${runtime.baseUrl}/dash/admin/tickets/bulk/claim-self`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      ticketIds: "ticket-1",
      returnTo: "/dash/admin/tickets?status=open&q=channel"
    })
  })
  await missingCsrf.arrayBuffer()
  assert.equal(missingCsrf.status, 403)
  assert.equal(runtime.actionRequests.length, 0)

  const emptySelection = await fetch(`${runtime.baseUrl}/dash/admin/tickets/bulk/unclaim`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/tickets?status=open&q=channel"
    })
  })
  await emptySelection.arrayBuffer()
  assert.equal(emptySelection.status, 302)
  assert.match(String(redirectMessage(emptySelection.headers.get("location"))), /Select at least one ticket/)
  assert.equal(runtime.actionRequests.length, 0)

  const claimResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/bulk/claim-self`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams([
      ["csrfToken", csrfToken],
      ["ticketIds", "ticket-1"],
      ["ticketIds", "ticket-2"],
      ["returnTo", "/dash/admin/tickets?status=open&q=channel"],
      ["reason", "bulk claim"]
    ])
  })
  await claimResponse.arrayBuffer()
  assert.equal(claimResponse.status, 302)
  const claimLocation = String(claimResponse.headers.get("location"))
  assert.match(claimLocation, /^\/dash\/admin\/tickets\?status=open&q=channel&alertStatus=success&msg=/)
  assert.match(String(redirectMessage(claimLocation)), /2 succeeded, 0 skipped, 0 failed/)
  assert.equal(redirectAlertStatus(claimLocation), "success")
  assert.deepEqual(runtime.actionRequests.map((request) => ({
    ticketId: request.ticketId,
    action: request.action,
    actorUserId: request.actorUserId,
    reason: request.reason,
    assigneeUserId: request.assigneeUserId
  })), [
    { ticketId: "ticket-1", action: "claim", actorUserId: "admin-user", reason: "bulk claim", assigneeUserId: undefined },
    { ticketId: "ticket-2", action: "claim", actorUserId: "admin-user", reason: "bulk claim", assigneeUserId: undefined }
  ])

  runtime.actionRequests.length = 0
  const closeResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/bulk/close`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams([
      ["csrfToken", csrfToken],
      ["ticketIds", "ticket-1"],
      ["ticketIds", "ticket-2"],
      ["returnTo", "/dash/admin/tickets?status=open&q=channel"]
    ])
  })
  await closeResponse.arrayBuffer()
  assert.equal(closeResponse.status, 302)
  assert.match(String(redirectMessage(closeResponse.headers.get("location"))), /0 succeeded, 2 skipped, 0 failed/)
  assert.equal(redirectAlertStatus(closeResponse.headers.get("location")), "warning")
  assert.equal(runtime.actionRequests.length, 0)

  await new Promise((resolve) => setTimeout(resolve, 25))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ticket-bulk-action" })
  assert.equal(audits.length, 3)
  const emptyAudit = audits.find((event) => event.reason === "empty-selection")
  const claimAudit = audits.find((event) => event.details?.action === "claim-self")
  const closeAudit = audits.find((event) => event.details?.action === "close")
  assert.equal(emptyAudit?.details?.action, "unclaim")
  assert.equal(emptyAudit?.details?.requested, 0)
  assert.equal(claimAudit?.details?.succeeded, 2)
  assert.equal(closeAudit?.details?.skipped, 2)
})

test("ticket workbench export is editor csrf-protected current-page JSON and CSV", async (t) => {
  const tickets = [
    ticket({
      id: "ticket-b",
      channelName: "=cmd, \"quoted\"\nline",
      transportParentMessageId: "https://discord.com/channels/guild/channel/message",
      integrationProfileId: "secret-integration-profile",
      aiAssistProfileId: "secret-ai-profile",
      openedOn: 1710000100000
    }),
    ...Array.from({ length: 10 }, (_item, index) => ticket({
      id: `ticket-new-${index}`,
      channelName: `new-${index}`,
      openedOn: 1710000200000 + index
    }))
  ]
  const telemetrySignalCalls: string[][] = []
  const runtime = await startServer({
    tickets,
    telemetrySignalCalls,
    telemetrySignals: {
      "ticket-b": telemetrySignals({
        hasEverReopened: true,
        reopenCount: 2,
        lastReopenedAt: 1710000300000,
        latestFeedbackStatus: "completed"
      })
    }
  })
  t.after(() => stopServer(runtime))

  const editor = await login(runtime.baseUrl, "editor-user", "/dash/admin/tickets?limit=10&page=2&sort=opened-desc")
  const listResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets?limit=10&page=2&sort=opened-desc`, { headers: { cookie: editor.cookie } })
  const listHtml = await listResponse.text()
  assert.equal(listResponse.status, 200)
  assert.match(listHtml, /Export JSON/)
  assert.match(listHtml, /Export CSV/)
  const csrfToken = csrfFrom(listHtml)

  const missingCsrf = await fetch(`${runtime.baseUrl}/dash/admin/tickets/export/json`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ limit: "10", page: "2", sort: "opened-desc" })
  })
  await missingCsrf.arrayBuffer()
  assert.equal(missingCsrf.status, 403)

  const jsonExport = await fetch(`${runtime.baseUrl}/dash/admin/tickets/export/json`, {
    method: "POST",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/tickets?limit=10&page=2&sort=opened-desc",
      limit: "10",
      page: "2",
      sort: "opened-desc"
    })
  })
  assert.equal(jsonExport.status, 200)
  assert.match(String(jsonExport.headers.get("content-type")), /application\/json/)
  assert.match(String(jsonExport.headers.get("content-disposition")), /ticket-workbench-page\.json/)
  const jsonBody = await jsonExport.json() as any
  assert.deepEqual(Object.keys(jsonBody), ["generatedAt", "filters", "page", "limit", "sort", "warnings", "items"])
  assert.equal(jsonBody.page, 2)
  assert.equal(jsonBody.limit, 10)
  assert.equal(jsonBody.sort, "opened-desc")
  assert.equal(jsonBody.filters.feedback, "all")
  assert.equal(jsonBody.filters.reopened, "all")
  assert.equal(Object.prototype.hasOwnProperty.call(jsonBody, "total"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(jsonBody, "currentPageOnly"), false)
  assert.deepEqual(jsonBody.items.map((item: any) => item.ticketId), ["ticket-b"])
  assert.equal(jsonBody.items[0].resourceName, "=cmd, \"quoted\"\nline")
  assert.equal(jsonBody.items[0].telemetryAvailable, true)
  assert.equal(jsonBody.items[0].latestFeedbackStatus, "completed")
  assert.equal(jsonBody.items[0].reopenCount, 2)
  const jsonText = JSON.stringify(jsonBody)
  assert.doesNotMatch(jsonText, /discord\.com\/channels/)
  assert.doesNotMatch(jsonText, /secret-integration-profile|secret-ai-profile/)
  assert.doesNotMatch(jsonText, /questionSummaries|attachment|transcript/)

  const csvExport = await fetch(`${runtime.baseUrl}/dash/admin/tickets/export/csv`, {
    method: "POST",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/tickets?limit=10&page=2&sort=opened-desc",
      limit: "10",
      page: "2",
      sort: "opened-desc"
    })
  })
  assert.equal(csvExport.status, 200)
  assert.match(String(csvExport.headers.get("content-type")), /text\/csv/)
  assert.match(String(csvExport.headers.get("content-disposition")), /ticket-workbench-page\.csv/)
  const csvText = await csvExport.text()
  assert.match(csvText, /^ticketId,resourceName,closed,claimed,transportMode,panelId,panelLabel/m)
  assert.match(csvText, /ticket-b/)
  assert.ok(csvText.includes('"\'=cmd, ""quoted""\nline"'))
  assert.doesNotMatch(csvText, /ticket-new-/)
  assert.doesNotMatch(csvText, /discord\.com\/channels|secret-integration-profile|secret-ai-profile/)

  const invalidFormat = await fetch(`${runtime.baseUrl}/dash/admin/tickets/export/xlsx`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/transcripts"
    })
  })
  await invalidFormat.arrayBuffer()
  assert.equal(invalidFormat.status, 302)
  assert.match(String(invalidFormat.headers.get("location")), /^\/dash\/admin\/tickets\?alertStatus=warning&msg=/)
  assert.match(String(redirectMessage(invalidFormat.headers.get("location"))), /Export format must be JSON or CSV/)

  assert.ok(telemetrySignalCalls.some((ids) => ids.length === 1 && ids[0] === "ticket-b"))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ticket-export" })
  assert.equal(audits.length, 3)
  const successAudit = audits.find((event) => event.outcome === "success" && event.details?.format === "json")
  assert.equal(successAudit?.target, "ticket-workbench")
  assert.equal(successAudit?.reason, "ticket-workbench-export")
  assert.equal(successAudit?.details?.rowCount, 1)
  assert.equal(Object.prototype.hasOwnProperty.call(successAudit?.details || {}, "query"), false)
})

test("ticket AI assist API requires csrf, stays actor-private, and audits metadata only", async (t) => {
  const baseTicket = ticket({ id: "ticket-1", aiAssistProfileId: "assist-1" })
  const detail = enabledDetail(baseTicket)
  detail.aiAssist = {
    profileId: "assist-1",
    providerId: "reference",
    label: "Reference assist",
    available: true,
    actions: ["summarize", "answerFaq", "suggestReply"],
    reason: null
  }
  const runtime = await startServer({
    tickets: [baseTicket],
    detail,
    aiAssistResult: {
      ok: true,
      outcome: "success",
      action: "answerFaq",
      message: "tickets.detail.actionResults.aiAssistSuccess",
      profileId: "assist-1",
      providerId: "reference",
      confidence: "high",
      summary: null,
      answer: "FAQ answer text",
      draft: null,
      citations: [
        { kind: "knowledge-source", sourceId: "faq", label: "FAQ: Rules", locator: "knowledge/faq.json#rules", excerpt: "Source excerpt" }
      ],
      warnings: ["Knowledge source was partially clipped."],
      degradedReason: null,
      ticketId: "ticket-1"
    }
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const detailHtml = await detailResponse.text()
  const csrfToken = csrfFrom(detailHtml)
  assert.match(detailHtml, /AI assist/)
  assert.match(detailHtml, /data-ai-assist-result-text/)
  assert.match(detailHtml, /data-ai-assist-citations/)
  assert.match(detailHtml, /data-ai-assist-warnings/)
  assert.match(detailHtml, /data-ai-assist-copy/)
  assert.doesNotMatch(detailHtml, /send to ticket/i)

  const clientSource = fs.readFileSync(path.join(pluginRoot, "public", "js", "control-center.js"), "utf8")
  assert.match(clientSource, /data-ai-assist-citation-list/)
  assert.match(clientSource, /data-ai-assist-warning-list/)
  assert.match(clientSource, /data-ai-assist-copy/)
  assert.match(clientSource, /navigator\.clipboard/)
  assert.doesNotMatch(clientSource, /send to ticket/i)

  const missingCsrf = await fetch(`${runtime.baseUrl}/dash/api/tickets/ticket-1/ai/answer-faq`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json"
    },
    body: JSON.stringify({ question: "secret prompt text" })
  })
  await missingCsrf.arrayBuffer()
  assert.equal(missingCsrf.status, 403)
  assert.equal(runtime.aiAssistRequests.length, 0)

  const response = await fetch(`${runtime.baseUrl}/dash/api/tickets/ticket-1/ai/answer-faq`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({ question: "secret prompt text" })
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.result.answer, "FAQ answer text")
  assert.deepEqual(body.result.citations, [
    { kind: "knowledge-source", sourceId: "faq", label: "FAQ: Rules", locator: "knowledge/faq.json#rules", excerpt: "Source excerpt" }
  ])
  assert.deepEqual(body.result.warnings, ["Knowledge source was partially clipped."])
  assert.equal(runtime.aiAssistRequests.length, 1)
  assert.deepEqual(runtime.aiAssistRequests[0], {
    ticketId: "ticket-1",
    action: "answerFaq",
    actorUserId: "admin-user",
    prompt: "secret prompt text",
    instructions: ""
  })

  await new Promise((resolve) => setTimeout(resolve, 25))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ai-assist-request" })
  assert.equal(audits.length, 1)
  assert.equal(audits[0].target, "ticket-1")
  assert.equal(audits[0].outcome, "success")
  assert.deepEqual(audits[0].details, {
    action: "answerFaq",
    profileId: "assist-1",
    providerId: "reference",
    confidence: "high"
  })
  assert.doesNotMatch(JSON.stringify(audits[0]), /secret prompt text|FAQ answer text/)
})

test("ticket AI assist FAQ API rejects blank questions before runtime dispatch", async (t) => {
  const baseTicket = ticket({ id: "ticket-1", aiAssistProfileId: "assist-1" })
  const detail = enabledDetail(baseTicket)
  detail.aiAssist = {
    profileId: "assist-1",
    providerId: "reference",
    label: "Reference assist",
    available: true,
    actions: ["summarize", "answerFaq", "suggestReply"],
    reason: null
  }
  const runtime = await startServer({ tickets: [baseTicket], detail })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const csrfToken = csrfFrom(await detailResponse.text())
  const response = await fetch(`${runtime.baseUrl}/dash/api/tickets/ticket-1/ai/answer-faq`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({ question: "   " })
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.success, false)
  assert.equal(body.error, "FAQ assist requires a question.")
  assert.equal(runtime.aiAssistRequests.length, 0)

  await new Promise((resolve) => setTimeout(resolve, 25))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ai-assist-request" })
  assert.equal(audits.length, 1)
  assert.equal(audits[0].reason, "FAQ assist requires a question.")
  assert.equal(Object.prototype.hasOwnProperty.call(audits[0].details, "prompt"), false)
})

test("ticket AI assist API strips summarize body and returns degraded reasons", async (t) => {
  const reason = "Reference AI provider is not configured on this host"
  const baseTicket = ticket({ id: "ticket-1", aiAssistProfileId: "assist-1" })
  const detail = enabledDetail(baseTicket)
  detail.aiAssist = {
    profileId: "assist-1",
    providerId: "reference",
    label: "Reference assist",
    available: true,
    actions: ["summarize", "answerFaq", "suggestReply"],
    reason: null
  }
  const runtime = await startServer({
    tickets: [baseTicket],
    detail,
    aiAssistResult: {
      ok: false,
      outcome: "unavailable",
      action: "summarize",
      message: "tickets.detail.actionResults.unavailable",
      profileId: "assist-1",
      providerId: "reference",
      confidence: null,
      summary: null,
      answer: null,
      draft: null,
      citations: [],
      warnings: [],
      degradedReason: reason,
      ticketId: "ticket-1"
    }
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const csrfToken = csrfFrom(await detailResponse.text())
  const response = await fetch(`${runtime.baseUrl}/dash/api/tickets/ticket-1/ai/summarize`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({ prompt: "unexpected prompt", instructions: "unexpected instructions" })
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.success, false)
  assert.equal(body.error, reason)
  assert.equal(body.result.degradedReason, reason)
  assert.equal(runtime.aiAssistRequests.length, 1)
  assert.deepEqual(runtime.aiAssistRequests[0], {
    ticketId: "ticket-1",
    action: "summarize",
    actorUserId: "admin-user",
    prompt: "",
    instructions: ""
  })
})

test("ticket AI assist API sanitizes provider-error reasons before response and audit", async (t) => {
  const baseTicket = ticket({ id: "ticket-1", aiAssistProfileId: "assist-1" })
  const detail = enabledDetail(baseTicket)
  detail.aiAssist = {
    profileId: "assist-1",
    providerId: "reference",
    label: "Reference assist",
    available: true,
    actions: ["summarize", "answerFaq", "suggestReply"],
    reason: null
  }
  const runtime = await startServer({
    tickets: [baseTicket],
    detail,
    aiAssistResult: {
      ok: false,
      outcome: "provider-error",
      action: "summarize",
      message: "tickets.detail.actionResults.unavailable",
      profileId: "assist-1",
      providerId: "reference",
      confidence: null,
      summary: null,
      answer: null,
      draft: null,
      citations: [],
      warnings: [],
      degradedReason: "raw provider response contained secret prompt text",
      ticketId: "ticket-1"
    }
  })
  t.after(() => stopServer(runtime))
  const { cookie } = await login(runtime.baseUrl)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/tickets/ticket-1`, { headers: { cookie } })
  const csrfToken = csrfFrom(await detailResponse.text())
  const response = await fetch(`${runtime.baseUrl}/dash/api/tickets/ticket-1/ai/summarize`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken
    },
    body: JSON.stringify({})
  })
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error, "AI assist provider returned an error.")
  assert.equal(body.result.degradedReason, "AI assist provider returned an error.")
  assert.doesNotMatch(JSON.stringify(body), /secret prompt text|raw provider response/)

  await new Promise((resolve) => setTimeout(resolve, 25))
  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "ai-assist-request" })
  assert.equal(audits.length, 1)
  assert.equal(audits[0].reason, "AI assist provider returned an error.")
  assert.doesNotMatch(JSON.stringify(audits[0]), /secret prompt text|raw provider response/)
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
  assert.equal(closeRequestFixture.actionRuns[0].params.member?.id, "admin-user")

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

test("analytics export routes require admin csrf and stream JSON or ZIP downloads", async (t) => {
  const runtime = await startServer({
    tickets: [
      ticket({
        id: "unknown-ticket",
        assignedTeamId: null,
        assignedStaffUserId: null,
        transportMode: null,
        channelName: "unknown-channel",
        openedOn: Date.parse("2026-04-20T10:00:00.000Z")
      })
    ],
    lifecycleTelemetry: [],
    feedbackTelemetry: [],
    telemetrySignals: {}
  })
  t.after(() => stopServer(runtime))

  const admin = await login(runtime.baseUrl, "admin-user", "/dash/admin/analytics")
  const analyticsResponse = await fetch(`${runtime.baseUrl}/dash/admin/analytics?window=7d&teamId=triage`, { headers: { cookie: admin.cookie } })
  const analyticsHtml = await analyticsResponse.text()
  assert.equal(analyticsResponse.status, 200)
  assert.match(analyticsHtml, /Export JSON/)
  assert.match(analyticsHtml, /Export CSV/)
  const csrfToken = csrfFrom(analyticsHtml)

  const missingCsrf = await fetch(`${runtime.baseUrl}/dash/admin/analytics/export/json`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: admin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ window: "7d" })
  })
  await missingCsrf.arrayBuffer()
  assert.equal(missingCsrf.status, 403)

  const editor = await login(runtime.baseUrl, "editor-user", "/dash/visual/options")
  const editorOptions = await fetch(`${runtime.baseUrl}/dash/visual/options`, { headers: { cookie: editor.cookie } })
  const editorCsrf = csrfFrom(await editorOptions.text())
  const editorDenied = await fetch(`${runtime.baseUrl}/dash/admin/analytics/export/json`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: editor.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ csrfToken: editorCsrf })
  })
  await editorDenied.arrayBuffer()
  assert.equal(editorDenied.status, 403)

  const jsonExport = await fetch(`${runtime.baseUrl}/dash/admin/analytics/export/json`, {
    method: "POST",
    headers: {
      cookie: admin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/analytics?window=7d&teamId=triage",
      window: "7d",
      teamId: "triage"
    })
  })
  assert.equal(jsonExport.status, 200)
  assert.match(String(jsonExport.headers.get("content-type")), /application\/json/)
  assert.match(String(jsonExport.headers.get("content-disposition")), /ticket-analytics-report\.json/)
  const jsonBody = await jsonExport.json() as any
  assert.deepEqual(Object.keys(jsonBody), ["generatedAt", "filters", "warnings", "unavailableSections", "summaryCards", "tables"])
  assert.equal(jsonBody.filters.window, "7d")
  assert.equal(jsonBody.summaryCards.length, 12)
  assert.deepEqual(jsonBody.summaryCards.map((card: any) => card.key), [
    "openedTickets",
    "openBacklog",
    "medianFirstResponse",
    "p95FirstResponse",
    "medianResolution",
    "p95Resolution",
    "feedbackTriggered",
    "feedbackCompletionRate",
    "feedbackIgnoredRate",
    "feedbackDeliveryFailed",
    "reopenedTickets",
    "reopenRate"
  ])
  assert.ok(jsonBody.summaryCards.every((card: any) => typeof card.key === "string" && typeof card.status === "string"))
  assert.equal(jsonBody.tables.cohortPerformanceByTeam.status, "unavailable")
  assert.deepEqual(Object.keys(jsonBody.tables.cohortPerformanceByTeam), ["status", "warning", "rows"])
  assert.ok(Array.isArray(jsonBody.unavailableSections))
  assert.equal(jsonBody.tables.backlogByTeam.status, "available")

  const zipExport = await fetch(`${runtime.baseUrl}/dash/admin/analytics/export/csv`, {
    method: "POST",
    headers: {
      cookie: admin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "/dash/admin/analytics",
      window: "custom",
      from: "2026-04-20",
      to: "2026-04-20"
    })
  })
  assert.equal(zipExport.status, 200)
  assert.match(String(zipExport.headers.get("content-type")), /application\/zip/)
  assert.match(String(zipExport.headers.get("content-disposition")), /ticket-analytics-report\.zip/)
  const zipEntries = unzipStoredEntries(Buffer.from(await zipExport.arrayBuffer()))
  assert.ok(zipEntries.has("manifest.json"))
  assert.ok(zipEntries.has("summary-cards.csv"))
  assert.ok(zipEntries.has("backlog-by-team.csv"))
  assert.ok(zipEntries.has("feedback-outcomes-by-team.csv"))
  assert.equal(zipEntries.has("cohort-performance-by-team.csv"), false)
  const manifest = JSON.parse(String(zipEntries.get("manifest.json")))
  assert.deepEqual(Object.keys(manifest), ["formatVersion", "generatedAt", "filters", "warnings", "unavailableSections", "includedFiles"])
  assert.equal(manifest.formatVersion, 1)
  assert.ok(manifest.unavailableSections.some((section: any) => section.key === "cohortPerformanceByTeam"))
  assert.ok(manifest.includedFiles.some((file: any) => file.name === "feedback-outcomes-by-team.csv" && file.rowCount === 0))
  assert.equal(zipEntries.get("summary-cards.csv")?.split(/\r?\n/, 1)[0], "key,label,status,value,warning")
  assert.equal(zipEntries.get("backlog-by-team.csv")?.split(/\r?\n/, 1)[0], "teamId,teamLabel,openCount")
  assert.match(String(zipEntries.get("backlog-by-team.csv")), /\r\n,Unknown team,1\r\n/)
  assert.equal(zipEntries.get("feedback-outcomes-by-team.csv"), "teamId,teamLabel,triggeredCount,completedCount,ignoredCount,deliveryFailedCount,completionRate,ignoredRate,warning\r\n")
  assert.doesNotMatch(JSON.stringify(Object.fromEntries(zipEntries)), /raw feedback|attachment|discord\.com\/channels/)

  const invalidFormat = await fetch(`${runtime.baseUrl}/dash/admin/analytics/export/pdf`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: admin.cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      returnTo: "https://example.invalid/steal"
    })
  })
  await invalidFormat.arrayBuffer()
  assert.equal(invalidFormat.status, 302)
  assert.match(String(invalidFormat.headers.get("location")), /^\/dash\/admin\/analytics\?alertStatus=warning&msg=/)
  assert.match(String(redirectMessage(invalidFormat.headers.get("location"))), /Export format must be JSON or CSV/)

  const audits = await runtime.context.authStore.listAuditEvents({ eventType: "analytics-export" })
  assert.equal(audits.length, 3)
  const successAudit = audits.find((event) => event.outcome === "success" && event.details?.format === "json")
  assert.equal(successAudit?.target, "analytics")
  assert.equal(successAudit?.reason, "analytics-export")
  assert.equal(Object.prototype.hasOwnProperty.call(successAudit?.details || {}, "query"), false)
})

test("analytics model reports feedback outcomes, rating summaries, and reopen telemetry", async (t) => {
  const ticketA = ticket({ id: "ticket-a", channelName: "ticket-a", openedOn: Date.parse("2026-04-20T08:00:00.000Z") })
  const ticketB = ticket({
    id: "ticket-b",
    channelName: "ticket-b",
    openedOn: Date.parse("2026-04-20T09:00:00.000Z"),
    closedOn: Date.parse("2026-04-20T11:00:00.000Z"),
    open: false,
    closed: true
  })
  const ticketC = ticket({
    id: "ticket-c",
    channelName: "ticket-c",
    assignedTeamId: "lead",
    openedOn: Date.parse("2026-04-20T10:00:00.000Z")
  })
  const lifecycleTelemetry: DashboardTicketLifecycleTelemetryRecord[] = [
    {
      recordId: "closed-a",
      ticketId: "ticket-a",
      eventType: "closed",
      occurredAt: Date.parse("2026-04-20T09:00:00.000Z"),
      actorUserId: "staff-1",
      snapshot: telemetrySnapshot({ closed: true }),
      previousSnapshot: telemetrySnapshot()
    },
    {
      recordId: "reopened-a",
      ticketId: "ticket-a",
      eventType: "reopened",
      occurredAt: Date.parse("2026-04-20T10:00:00.000Z"),
      actorUserId: "staff-1",
      snapshot: telemetrySnapshot(),
      previousSnapshot: telemetrySnapshot({ closed: true })
    },
    {
      recordId: "closed-b",
      ticketId: "ticket-b",
      eventType: "closed",
      occurredAt: Date.parse("2026-04-20T11:00:00.000Z"),
      actorUserId: "staff-1",
      snapshot: telemetrySnapshot({ closed: true }),
      previousSnapshot: telemetrySnapshot()
    },
    {
      recordId: "closed-c",
      ticketId: "ticket-c",
      eventType: "closed",
      occurredAt: Date.parse("2026-04-20T12:00:00.000Z"),
      actorUserId: "staff-2",
      snapshot: telemetrySnapshot({ assignedTeamId: "lead", closed: true }),
      previousSnapshot: telemetrySnapshot({ assignedTeamId: "lead" })
    }
  ]
  const feedbackTelemetry: DashboardTicketFeedbackTelemetryRecord[] = [
    {
      sessionId: "feedback-a",
      ticketId: "ticket-a",
      triggerMode: "close",
      triggeredAt: Date.parse("2026-04-20T09:01:00.000Z"),
      completedAt: Date.parse("2026-04-20T09:03:00.000Z"),
      status: "completed",
      respondentUserId: "creator-1",
      closeCountAtTrigger: 1,
      snapshot: telemetrySnapshot(),
      questionSummaries: [{ position: 1, type: "rating", label: "Experience", answered: true, ratingValue: 5, choiceIndex: null, choiceLabel: null }]
    },
    {
      sessionId: "feedback-b",
      ticketId: "ticket-b",
      triggerMode: "close",
      triggeredAt: Date.parse("2026-04-20T11:01:00.000Z"),
      completedAt: null,
      status: "ignored",
      respondentUserId: "creator-1",
      closeCountAtTrigger: 1,
      snapshot: telemetrySnapshot(),
      questionSummaries: [{ position: 1, type: "rating", label: "Experience", answered: true, ratingValue: 3, choiceIndex: null, choiceLabel: null }]
    },
    {
      sessionId: "feedback-c",
      ticketId: "ticket-c",
      triggerMode: "close",
      triggeredAt: Date.parse("2026-04-20T12:01:00.000Z"),
      completedAt: null,
      status: "delivery_failed",
      respondentUserId: "creator-1",
      closeCountAtTrigger: 1,
      snapshot: telemetrySnapshot({ assignedTeamId: "lead" }),
      questionSummaries: []
    }
  ]
  const runtime = await startServer({
    tickets: [ticketA, ticketB, ticketC],
    lifecycleTelemetry,
    feedbackTelemetry,
    telemetrySignals: {
      "ticket-a": telemetrySignals({
        hasEverReopened: true,
        reopenCount: 1,
        lastReopenedAt: Date.parse("2026-04-20T10:00:00.000Z"),
        latestFeedbackStatus: "completed"
      })
    }
  })
  t.after(() => stopServer(runtime))

  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "custom", from: "2026-04-20", to: "2026-04-20" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    transcriptService: {
      async listTicketAnalyticsHistory() {
        return {
          total: 0,
          warnings: [],
          nextCursor: null,
          truncated: false,
          items: []
        }
      }
    }
  })

  assert.equal(model.telemetryState, "available")
  assert.equal(model.summaryCards[6].value, "3")
  assert.equal(model.summaryCards[9].value, "1")
  assert.equal(model.summaryCards[10].value, "1")
  assert.equal(model.feedbackByTeam.find((row) => row.key === "triage")?.completed, 1)
  assert.equal(model.feedbackByTeam.find((row) => row.key === "triage")?.ignored, 1)
  assert.equal(model.feedbackByTeam.find((row) => row.key === "triage")?.completionRate.value, "50%")
  assert.equal(model.ratingQuestions[0].questionLabel, "Experience")
  assert.equal(model.ratingQuestions[0].averageRating, "4.0")
  assert.equal(model.ratingQuestions[0].medianRating, "4.0")
  assert.equal(model.reopenRateByTeam.find((row) => row.key === "triage")?.reopenedTickets, 1)
  assert.equal(model.reopenRateByTeam.find((row) => row.key === "triage")?.closedTickets, 2)
  assert.equal(model.reopenRateByTeam.find((row) => row.key === "triage")?.reopenRate.value, "50%")
  assert.equal(model.reopenedBacklogByTeam.find((row) => row.key === "triage")?.count, 1)
})

test("analytics model keeps zero-response rating buckets visible as unavailable", async (t) => {
  const runtime = await startServer({
    feedbackTelemetry: [
      {
        sessionId: "feedback-zero-rating",
        ticketId: "ticket-1",
        triggerMode: "close",
        triggeredAt: Date.parse("2026-04-20T09:01:00.000Z"),
        completedAt: Date.parse("2026-04-20T09:03:00.000Z"),
        status: "completed",
        respondentUserId: "creator-1",
        closeCountAtTrigger: 1,
        snapshot: telemetrySnapshot(),
        questionSummaries: [
          { position: 1, type: "rating", label: "Experience", answered: false, ratingValue: null, choiceIndex: null, choiceLabel: null },
          { position: 2, type: "choice", label: "Outcome", answered: true, ratingValue: null, choiceIndex: 0, choiceLabel: "Good" }
        ]
      }
    ]
  })
  t.after(() => stopServer(runtime))

  const model = await buildDashboardAnalyticsModel({
    basePath: "/dash",
    query: { window: "custom", from: "2026-04-20", to: "2026-04-20" },
    configService: runtime.context.configService,
    runtimeBridge: runtime.context.runtimeBridge,
    t: runtime.context.i18n.t,
    transcriptService: {
      async listTicketAnalyticsHistory() {
        return {
          total: 0,
          warnings: [],
          nextCursor: null,
          truncated: false,
          items: []
        }
      }
    }
  })

  const ratingRow = model.ratingQuestions.find((row) => row.questionKey === "1:Experience")
  assert.notEqual(ratingRow, undefined)
  assert.equal(ratingRow?.responses, 0)
  assert.equal(ratingRow?.averageRating, runtime.context.i18n.t("common.unavailable"))
  assert.equal(ratingRow?.medianRating, runtime.context.i18n.t("common.unavailable"))
  assert.equal(ratingRow?.lowSample, false)
  assert.equal(model.ratingQuestions.find((row) => row.questionKey === "2:Outcome"), undefined)
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
  const cohortRow = model.cohortByTeam.find((row) => row.key === "triage")
  assert.equal(cohortRow?.count, 2)
  assert.equal(cohortRow?.medianFirstResponseMs, 1_200_000)
  assert.equal(cohortRow?.p95FirstResponseMs, 1_800_000)
  assert.equal(cohortRow?.medianResolutionMs, 5_400_000)
  assert.equal(cohortRow?.p95ResolutionMs, 7_200_000)

  const exportPayload = await buildAnalyticsExportPayload(model, "json", "2026-04-21T00:00:00.000Z")
  const exportBody = JSON.parse(String(exportPayload.body))
  assert.deepEqual(Object.keys(exportBody), ["generatedAt", "filters", "warnings", "unavailableSections", "summaryCards", "tables"])
  assert.deepEqual(Object.keys(exportBody.tables.cohortPerformanceByTeam), ["status", "warning", "rows"])
  assert.deepEqual(Object.keys(exportBody.tables.cohortPerformanceByTeam.rows[0]), [
    "teamId",
    "teamLabel",
    "openedCount",
    "medianFirstResponseMs",
    "p95FirstResponseMs",
    "medianResolutionMs",
    "p95ResolutionMs",
    "warning"
  ])
  assert.deepEqual(exportBody.tables.cohortPerformanceByTeam.rows[0], {
    teamId: "triage",
    teamLabel: "Triage",
    openedCount: 2,
    medianFirstResponseMs: 1_200_000,
    p95FirstResponseMs: 1_800_000,
    medianResolutionMs: 5_400_000,
    p95ResolutionMs: 7_200_000,
    warning: "Low sample: 2"
  })
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
  const controlCenterSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "server", "control-center.ts"), "utf8")
  const workflowSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "workflow.yaml"), "utf8")
  const controllerSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "runtime", "controller-state.yaml"), "utf8")
  const bridgeSource = fs.readFileSync(path.join(root, "plugins", "ot-eotfs-bridge", "index.ts"), "utf8")

  assert.match(authSource, /ticket\.workbench/)
  assert.match(authSource, /"\/admin\/tickets"/)
  assert.match(authSource, /"quality\.review"/)
  assert.match(authSource, /"quality\.review\.manage"/)
  assert.doesNotMatch(authSource, /\/admin\/tickets\/export\/:format/)
  assert.match(authSource, /if \(tier === "editor" \|\| tier === "admin"\) \{\s+capabilities\.push\("config\.write\.visual", "admin\.shell", "ticket\.workbench"\)/)
  assert.doesNotMatch(authSource, /DASHBOARD_EDITOR_ALLOWED_PATHS[\s\S]*\/admin\/quality-review/)
  assert.doesNotMatch(routesSource, /DashboardActionProviderBridge/)
  assert.match(routesSource, /admin\/analytics\/export\/:format"\), adminGuard\.form\("analytics\.view"\)/)
  assert.match(routesSource, /admin\/tickets\/export\/:format"\), adminGuard\.form\("ticket\.workbench"\)/)
  assert.match(routesSource, /admin\/quality-review"\), adminGuard\.page\("quality\.review"\)/)
  assert.match(routesSource, /admin\/quality-review\/:ticketId"\), adminGuard\.page\("quality\.review"\)/)
  assert.match(routesSource, /admin\/tickets\/bulk\/:actionId"\), adminGuard\.form\("ticket\.workbench"\)/)
  assert.match(routesSource, /const runtimeAction = action === "claim-self" \? "claim" : action/)
  assert.match(routesSource, /eventType: "ticket-bulk-action"/)
  assert.doesNotMatch(routesSource, /assigneeUserId:\s*actorUserId/)
  assert.doesNotMatch(routesSource, /admin\/tickets\/:ticketId\/export|prepared ticket export|prepareTicketExport/i)
  assert.doesNotMatch(routesSource, /admin\/quality-review\/export|adminGuard\.form\("quality\.review"|api\/quality-review/i)
  assert.doesNotMatch(controlCenterSource, /admin\/quality-review/)
  assert.match(bridgeSource, /getDashboardTicketLockState/)
  assert.equal(bridgeSource.includes("ot-eotfs-bridge:legacy"), false)
  assert.match(workflowSource, /superseded by the workspace SLICE-010 controller contract/)
  assert.match(controllerSource, /SLICE-010` supersedes that local retirement contract/)
})

test("SLICE-012 workflow source guards stale close requests and dashboard approvals", () => {
  const root = path.resolve(process.cwd())
  const workflowSource = fs.readFileSync(path.join(root, "src", "actions", "ticketWorkflow.ts"), "utf8")
  const messagesSource = fs.readFileSync(path.join(root, "src", "builders", "messages.ts"), "utf8")
  const embedsSource = fs.readFileSync(path.join(root, "src", "builders", "embeds.ts"), "utf8")
  const bridgeSource = fs.readFileSync(path.join(root, "plugins", "ot-eotfs-bridge", "index.ts"), "utf8")
  const runtimeBridgeSource = fs.readFileSync(path.join(root, "plugins", "ot-dashboard", "server", "runtime-bridge.ts"), "utf8")
  const closeCommandSource = fs.readFileSync(path.join(root, "src", "commands", "close.ts"), "utf8")

  const visibilityStart = workflowSource.indexOf("export async function canShowRequestCloseButton")
  const requestStart = workflowSource.indexOf("export async function requestTicketClose")
  const requestEnd = workflowSource.indexOf("export async function cancelTicketCloseRequest")
  const cancelStart = requestEnd
  const cancelEnd = workflowSource.indexOf("export async function approveTicketCloseRequest")
  const approvalStart = workflowSource.indexOf("export async function approveTicketCloseRequest")
  const approvalEnd = workflowSource.indexOf("export async function dismissTicketCloseRequest")
  const verificationStart = workflowSource.indexOf("export async function verifyTicketCloseRequestApproval")
  const verificationEnd = workflowSource.indexOf("async function replyCloseRequestApprovalFailure")
  const modalBranchStart = closeCommandSource.indexOf('originalSource == "close-request"')
  const modalBranchEnd = closeCommandSource.indexOf("}else{", modalBranchStart)
  const cancelButtonStart = messagesSource.indexOf('if (workflowState.closeRequestState == "requested")')
  const cancelButtonEnd = messagesSource.indexOf('}else if (await canShowRequestCloseButton', cancelButtonStart)
  const approveVerifybarStart = workflowSource.indexOf("approveCloseRequestVerifybar.success.add")
  const approveVerifybarEnd = workflowSource.indexOf("approveCloseRequestVerifybar.failure.add", approveVerifybarStart)

  assert.notEqual(visibilityStart, -1)
  assert.notEqual(requestStart, -1)
  assert.notEqual(requestEnd, -1)
  assert.notEqual(cancelStart, -1)
  assert.notEqual(cancelEnd, -1)
  assert.notEqual(approvalStart, -1)
  assert.notEqual(approvalEnd, -1)
  assert.notEqual(verificationStart, -1)
  assert.notEqual(verificationEnd, -1)
  assert.notEqual(modalBranchStart, -1)
  assert.notEqual(modalBranchEnd, -1)
  assert.notEqual(cancelButtonStart, -1)
  assert.notEqual(cancelButtonEnd, -1)
  assert.notEqual(approveVerifybarStart, -1)
  assert.notEqual(approveVerifybarEnd, -1)

  const visibilityFunction = workflowSource.slice(visibilityStart, requestStart)
  const requestFunction = workflowSource.slice(requestStart, requestEnd)
  const cancelFunction = workflowSource.slice(cancelStart, cancelEnd)
  const approvalFunction = workflowSource.slice(approvalStart, approvalEnd)
  const verificationFunction = workflowSource.slice(verificationStart, verificationEnd)
  const closeRequestModalBranch = closeCommandSource.slice(modalBranchStart, modalBranchEnd)
  const cancelButtonBranch = messagesSource.slice(cancelButtonStart, cancelButtonEnd)
  const approveVerifybarBranch = workflowSource.slice(approveVerifybarStart, approveVerifybarEnd)

  assert.match(visibilityFunction, /resolveCreatorDirectCloseAvailability/)
  assert.match(visibilityFunction, /directCloseAvailable === false/)
  assert.match(requestFunction, /resolveCreatorDirectCloseAvailability/)
  assert.match(requestFunction, /directCloseAvailable !== false/)
  assert.match(cancelFunction, /resolveTicketWorkflowLock\(ticket,"cancel-close-request"\)/)
  assert.ok(
    cancelFunction.indexOf('resolveTicketWorkflowLock(ticket,"cancel-close-request")') < cancelFunction.indexOf("resetTicketCloseRequest")
  )
  assert.match(cancelButtonBranch, /resolveTicketWorkflowLock\(ticket,"cancel-close-request"\)/)
  assert.match(cancelButtonBranch, /!cancelLock\.locked/)
  assert.match(bridgeSource, /"request-close","cancel-close-request","approve-close-request"/)
  assert.match(approvalFunction, /verifyTicketCloseRequestApproval/)
  assert.match(verificationFunction, /ticketUserMessagesAnalysis/)
  assert.match(runtimeBridgeSource, /member: context\.member/)
  assert.match(closeRequestModalBranch, /approveTicketCloseRequest/)
  assert.doesNotMatch(closeRequestModalBranch, /close-ticket/)
  assert.match(approveVerifybarBranch, /approveTicketCloseRequest\(guild,channel,user,ticket,null,member,false\)/)
  assert.match(approveVerifybarBranch, /opendiscord:close-message"\)\.build\("close-request"/)
  assert.doesNotMatch(approveVerifybarBranch, /opendiscord:close-request-message"\)\.build\("approved"/)
  assert.doesNotMatch(approveVerifybarBranch, /"approved" as any/)
  assert.doesNotMatch(embedsSource, /source == "approved"/)
  assert.doesNotMatch(embedsSource, /Close request approved/)
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
