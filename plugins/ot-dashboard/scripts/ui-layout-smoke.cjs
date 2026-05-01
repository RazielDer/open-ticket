const fs = require("fs")
const path = require("path")

let chromium
try {
  ;({ chromium } = require("playwright"))
} catch (error) {
  console.error("Playwright is required for test:ui-layout. Run npm install in plugins/ot-dashboard.")
  console.error(error && error.message ? error.message : error)
  process.exit(1)
}

const pluginRoot = path.resolve(__dirname, "..")
const openTicketRoot = path.resolve(pluginRoot, "..", "..")
const workspaceRoot = path.resolve(openTicketRoot, "..")
const defaultOpsRoot = path.resolve(workspaceRoot, "..", "_ops", "ui-audit")
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z")
const auditRoot = path.resolve(process.env.OT_DASHBOARD_UI_AUDIT_OUT || path.join(defaultOpsRoot, timestamp))
const screenshotsDir = path.join(auditRoot, "screenshots")

const compiledDashboardRoot = path.join(openTicketRoot, "dist", "plugins", "ot-dashboard")
const createAppPath = path.join(compiledDashboardRoot, "server", "create-app.js")
const ticketWorkbenchPath = path.join(compiledDashboardRoot, "server", "ticket-workbench.js")
const qualityReviewPath = path.join(compiledDashboardRoot, "server", "quality-review-queue.js")

for (const requiredPath of [createAppPath, ticketWorkbenchPath, qualityReviewPath]) {
  if (!fs.existsSync(requiredPath)) {
    console.error(`Missing compiled dashboard artifact: ${requiredPath}`)
    console.error("Run npm --prefix open-ticket run build before npm --prefix open-ticket/plugins/ot-dashboard run test:ui-layout.")
    process.exit(1)
  }
}

const { createDashboardApp } = require(createAppPath)
const { buildTicketQueueSummary } = require(ticketWorkbenchPath)
const { buildQualityReviewQueueSummary } = require(qualityReviewPath)

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function createProjectRoot() {
  fs.mkdirSync(auditRoot, { recursive: true })
  fs.mkdirSync(screenshotsDir, { recursive: true })

  const root = path.join(auditRoot, "fixture-project")
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(path.join(root, "config"), { recursive: true })
  fs.mkdirSync(path.join(root, "runtime"), { recursive: true })

  const fixturePluginRoot = path.join(root, "plugins", "ot-dashboard")
  fs.mkdirSync(fixturePluginRoot, { recursive: true })
  fs.cpSync(path.join(pluginRoot, "public"), path.join(fixturePluginRoot, "public"), { recursive: true })
  fs.cpSync(path.join(pluginRoot, "locales"), path.join(fixturePluginRoot, "locales"), { recursive: true })

  writeJson(path.join(fixturePluginRoot, "config.json"), {
    host: "127.0.0.1",
    port: 0,
    basePath: "/dash",
    publicBaseUrl: "https://dashboard.example",
    viewerPublicBaseUrl: "https://records.example",
    trustProxyHops: 1,
    dashboardName: "UI Layout Smoke Dashboard",
    locale: "english",
    auth: {
      password: "",
      passwordHash: "",
      sessionSecret: "layout-smoke-session-secret-with-safe-length",
      sqlitePath: "runtime/ot-dashboard/auth.sqlite",
      discord: { clientId: "discord-client-id", clientSecret: "redacted-secret" },
      breakglass: { enabled: false, passwordHash: "" },
      maxAgeHours: 1,
      loginRateLimit: { windowMinutes: 15, maxAttempts: 8 }
    },
    viewerAuth: {
      discord: { clientId: "discord-client-id", clientSecret: "redacted-secret" }
    },
    brand: {
      title: "UI Layout Smoke Dashboard",
      faviconPath: "./public/assets/eotfs-dashboard-favicon.png"
    },
    rbac: {
      ownerUserIds: ["owner-user"],
      roleIds: { reviewer: ["role-reviewer"], editor: ["role-editor"], admin: ["role-admin"] },
      userIds: { reviewer: [], editor: [], admin: [] }
    }
  })

  writeJson(path.join(root, "config", "general.json"), {
    token: "redacted-token",
    mainColor: "#ffffff",
    language: "english",
    prefix: "!ticket ",
    serverId: "guild-1",
    globalAdmins: [],
    slashCommands: true,
    textCommands: false,
    tokenFromENV: false,
    status: { enabled: true, type: "watching", mode: "online", text: "ready", state: "" },
    system: {
      emojiStyle: "before",
      pinEmoji: "pin",
      logs: { enabled: true, channel: "200000000000000001" },
      limits: { enabled: true, globalMaximum: 100, userMaximum: 3 },
      permissions: {},
      messages: {},
      channelTopic: {}
    }
  })

  writeJson(path.join(root, "config", "options.json"), [
    {
      id: "intake",
      name: "Intake",
      description: "Main intake queue",
      type: "ticket",
      button: { emoji: "ticket", label: "Intake", color: "gray" },
      channel: {
        transportMode: "channel_text",
        prefix: "ticket-",
        suffix: "user-name",
        category: "300000000000000001",
        backupCategory: "300000000000000002",
        closedCategory: "300000000000000003",
        claimedCategory: [],
        topic: ""
      },
      routing: { supportTeamId: "triage", escalationTargetOptionIds: ["escalated"] },
      workflow: { closeRequestEnabled: true, awaitingUserEnabled: true },
      integrationProfileId: "whitelist",
      aiAssistProfileId: "assist-default",
      questions: ["q-context"],
      ticketAdmins: [],
      readonlyAdmins: [],
      allowCreationByBlacklistedUsers: false,
      ticketMessage: {
        enabled: true,
        text: "",
        embed: { enabled: true, title: "Intake", description: "Main intake queue", customColor: "", fields: [], timestamp: true },
        ping: { "@here": false, "@everyone": false, custom: [] }
      }
    },
    {
      id: "escalated",
      name: "Escalated",
      description: "Escalated queue",
      type: "ticket",
      button: { emoji: "alert", label: "Escalated", color: "red" },
      channel: {
        transportMode: "channel_text",
        prefix: "urgent-",
        suffix: "user-name",
        category: "300000000000000004",
        backupCategory: "",
        closedCategory: "",
        claimedCategory: [],
        topic: ""
      },
      routing: { supportTeamId: "lead", escalationTargetOptionIds: [] },
      workflow: { closeRequestEnabled: true, awaitingUserEnabled: true },
      questions: [],
      ticketAdmins: [],
      readonlyAdmins: [],
      allowCreationByBlacklistedUsers: false
    },
    {
      id: "info",
      name: "Info Only",
      description: "Non-ticket option",
      type: "website",
      button: { emoji: "info", label: "Info", color: "blue" },
      url: "https://example.invalid"
    }
  ])

  writeJson(path.join(root, "config", "panels.json"), [
    {
      id: "front-desk",
      name: "Front desk",
      options: ["intake", "escalated"],
      text: "Open a ticket.",
      dropdown: false,
      embed: { enabled: true, title: "Front desk", description: "Start here.", fields: [], timestamp: false },
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
    }
  ])
  writeJson(path.join(root, "config", "questions.json"), [
    {
      id: "q-context",
      name: "Context",
      type: "paragraph",
      required: true,
      placeholder: "Describe the issue.",
      length: { enabled: false, min: 0, max: 1000 }
    }
  ])
  writeJson(path.join(root, "config", "support-teams.json"), [
    { id: "triage", name: "Triage", roleIds: ["role-editor"], assignmentStrategy: "manual" },
    { id: "lead", name: "Lead", roleIds: ["role-admin"], assignmentStrategy: "manual" }
  ])
  writeJson(path.join(root, "config", "integration-profiles.json"), [
    { id: "whitelist", label: "Whitelist bridge", providerId: "ot-eotfs-bridge", enabled: true, settings: {} }
  ])
  writeJson(path.join(root, "config", "ai-assist-profiles.json"), [
    { id: "assist-default", label: "Default assist", providerId: "reference", enabled: true, knowledgeSourceIds: ["faq"], settings: {} }
  ])
  writeJson(path.join(root, "config", "knowledge-sources.json"), [
    { id: "faq", label: "FAQ", type: "local-json", path: "knowledge/faq.json" }
  ])
  writeJson(path.join(root, "knowledge", "faq.json"), [{ q: "status", a: "Use the dashboard status cards." }])
  writeJson(path.join(root, "config", "transcripts.json"), {
    general: {
      enabled: true,
      enableChannel: true,
      enableCreatorDM: false,
      enableParticipantDM: false,
      enableActiveAdminDM: false,
      enableEveryAdminDM: false,
      channel: "200000000000000002",
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
      stats: {
        enableCustomStats: false,
        backgroundColor: "#202225",
        keyTextColor: "#737373",
        valueTextColor: "#ffffff",
        hideBackgroundColor: "#40444a",
        hideTextColor: "#ffffff"
      },
      favicon: { enableCustomFavicon: false, imageUrl: "" }
    }
  })

  return { root, pluginRoot: fixturePluginRoot }
}

function ticket(index, overrides = {}) {
  const id = overrides.id || `ticket-${String(index).padStart(3, "0")}`
  const closed = overrides.closed ?? index % 5 === 0
  const claimed = overrides.claimed ?? index % 3 === 0
  const pinned = overrides.pinned ?? index % 7 === 0
  return {
    id,
    optionId: overrides.optionId || (index % 11 === 0 ? "missing-option" : "intake"),
    creatorId: overrides.creatorId || `creator-${index}`,
    transportMode: overrides.transportMode || (index % 8 === 0 ? "private_thread" : "channel_text"),
    channelName: `ticket-${index}`,
    transportParentChannelId: index % 8 === 0 ? "parent-channel-1" : null,
    transportParentMessageId: null,
    assignedTeamId: overrides.assignedTeamId === undefined ? (index % 4 === 0 ? "lead" : "triage") : overrides.assignedTeamId,
    assignedStaffUserId: overrides.assignedStaffUserId === undefined ? (claimed ? "staff-1" : null) : overrides.assignedStaffUserId,
    assignmentStrategy: "manual",
    firstStaffResponseAt: Date.now() - index * 100000,
    resolvedAt: closed ? Date.now() - index * 120000 : null,
    awaitingUserState: index % 6 === 0 ? "awaiting" : null,
    awaitingUserSince: index % 6 === 0 ? Date.now() - 86400000 : null,
    closeRequestState: index % 9 === 0 ? "pending" : null,
    closeRequestBy: index % 9 === 0 ? `creator-${index}` : null,
    closeRequestAt: index % 9 === 0 ? Date.now() - 300000 : null,
    integrationProfileId: index % 10 === 0 ? "whitelist" : null,
    aiAssistProfileId: index % 5 === 0 ? "assist-default" : null,
    openedOn: Date.now() - index * 3600000,
    closedOn: closed ? Date.now() - index * 120000 : null,
    reopenedOn: index % 13 === 0 ? Date.now() - index * 60000 : null,
    claimedOn: claimed ? Date.now() - index * 50000 : null,
    pinnedOn: pinned ? Date.now() - index * 40000 : null,
    claimedBy: claimed ? "staff-1" : null,
    pinnedBy: pinned ? "staff-1" : null,
    open: !closed,
    closed,
    claimed,
    pinned,
    participantCount: 2 + (index % 4),
    categoryMode: index % 12 === 0 ? "overflow" : "normal",
    channelSuffix: "creator",
    ...overrides
  }
}

function telemetrySnapshot(overrides = {}) {
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
    firstStaffResponseAt: Date.now() - 3600000,
    resolvedAt: null,
    closed: false,
    ...overrides
  }
}

function feedbackRecord(ticketId, index, status = "completed") {
  return {
    sessionId: `feedback-${ticketId}-${index}`,
    ticketId,
    triggerMode: "close",
    triggeredAt: Date.now() - index * 900000,
    completedAt: status === "completed" ? Date.now() - index * 890000 : null,
    status,
    respondentUserId: `creator-${index}`,
    closeCountAtTrigger: 1,
    snapshot: telemetrySnapshot({ assignedTeamId: index % 4 === 0 ? "lead" : "triage" }),
    questionSummaries: [
      {
        position: 1,
        type: "rating",
        label: "Experience",
        answered: status === "completed",
        ratingValue: status === "completed" ? (index % 5) + 1 : null,
        choiceIndex: null,
        choiceLabel: null
      }
    ]
  }
}

function lifecycleRecord(ticketId, index, eventType = "reopened") {
  return {
    recordId: `life-${ticketId}-${index}`,
    ticketId,
    eventType,
    occurredAt: Date.now() - index * 800000,
    actorUserId: "staff-1",
    snapshot: telemetrySnapshot(),
    previousSnapshot: telemetrySnapshot({ closed: true })
  }
}

function telemetrySignals(index) {
  return {
    hasEverReopened: index % 13 === 0,
    reopenCount: index % 13 === 0 ? 1 : 0,
    lastReopenedAt: index % 13 === 0 ? Date.now() - index * 60000 : null,
    latestFeedbackStatus: index % 5 === 0 ? "completed" : "none",
    latestFeedbackTriggeredAt: index % 5 === 0 ? Date.now() - index * 900000 : null,
    latestFeedbackCompletedAt: index % 5 === 0 ? Date.now() - index * 890000 : null,
    latestRatings: index % 5 === 0 ? [{ label: "Experience", ratingValue: (index % 5) + 1 }] : []
  }
}

function qualityCase(ticketId, index, overrides = {}) {
  return {
    ticketId,
    stored: true,
    state: index % 5 === 0 ? "resolved" : index % 2 === 0 ? "in_review" : "unreviewed",
    ownerUserId: index % 2 === 0 ? "admin-user" : null,
    ownerLabel: index % 2 === 0 ? "admin-user" : "Unassigned",
    createdAt: Date.now() - index * 2000000,
    updatedAt: Date.now() - index * 1500000,
    resolvedAt: index % 5 === 0 ? Date.now() - index * 1200000 : null,
    resolutionOutcome: index % 5 === 0 ? "action_taken" : null,
    resolvedByUserId: index % 5 === 0 ? "admin-user" : null,
    lastSignalAt: Date.now() - index * 1500000,
    noteCount: index % 2,
    noteAdjustmentCount: index % 3 === 0 ? 1 : 0,
    rawFeedbackStatus: index % 3 === 0 ? "available" : "none",
    latestRawFeedbackSessionId: index % 3 === 0 ? `feedback-${ticketId}-${index}` : null,
    ownerBucket: index % 2 === 0 ? "mine" : "unassigned",
    queueAnchorAt: Date.now() - index * 1500000,
    overdue: index > 10,
    overdueKind: index > 10 ? "unreviewed" : null,
    overdueSince: index > 10 ? Date.now() - index * 1500000 : null,
    ...overrides
  }
}

function member(userId, roleIds = []) {
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

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function validateResult(result) {
  const failures = []
  if (result.status !== 200) failures.push(`expected HTTP 200, got ${result.status}`)
  if (result.metrics.horizontalOverflow) {
    failures.push(`document overflow ${result.metrics.bodyScrollWidth}/${result.metrics.bodyClientWidth}`)
  }
  if (/\bundefined\b/i.test(result.metrics.textStart)) failures.push("visible text contains undefined")
  if (/(Cannot read properties|ReferenceError|TypeError|SyntaxError|Error:|template error)/i.test(result.metrics.textStart)) {
    failures.push("visible text contains runtime/template error text")
  }
  return failures
}

async function main() {
  const { root: projectRoot, pluginRoot: fixturePluginRoot } = createProjectRoot()
  const tickets = Array.from({ length: 100 }, (_, i) => ticket(i + 1))
  tickets[0] = ticket(1, {
    id: "ticket-1",
    pinned: true,
    claimed: true,
    assignedStaffUserId: "staff-1",
    integrationProfileId: "whitelist",
    aiAssistProfileId: "assist-default",
    closeRequestState: "pending",
    awaitingUserState: "awaiting",
    awaitingUserSince: Date.now() - 86400000
  })

  const feedbackTelemetry = tickets
    .slice(0, 20)
    .map((item, i) => feedbackRecord(item.id, i + 1, i % 6 === 0 ? "delivery_failed" : i % 4 === 0 ? "ignored" : "completed"))
  const lifecycleTelemetry = tickets.filter((_, i) => i % 13 === 0).map((item, i) => lifecycleRecord(item.id, i + 1))
  const qualityCases = tickets.slice(0, 30).map((item, i) => qualityCase(item.id, i + 1))
  const savedViews = [
    {
      viewId: "shared-view",
      scope: "shared",
      ownerUserId: "admin-user",
      name: "Shared overdue triage",
      query: { team: "triage", status: "open", attention: "overdue", limit: "100" },
      createdAt: Date.now() - 10000,
      updatedAt: Date.now() - 9000
    },
    {
      viewId: "private-view",
      scope: "private",
      ownerUserId: "editor-user",
      name: "My pinned tickets",
      query: { pinned: "true", status: "open" },
      createdAt: Date.now() - 8000,
      updatedAt: Date.now() - 7000
    }
  ]
  const members = new Map([
    ["admin-user", member("admin-user", ["role-admin"])],
    ["editor-user", member("editor-user", ["role-editor"])],
    ["reviewer-user", member("reviewer-user", ["role-reviewer"])],
    ["member-user", member("member-user", [])],
    ["owner-user", member("owner-user", [])],
    ["staff-1", member("staff-1", ["role-editor"])],
    ["creator-2", member("creator-2", [])],
    ["observer-1", member("observer-1", [])]
  ])
  const globalDatabase = new Map()

  const runtimeBridge = {
    getSnapshot() {
      return {
        capturedAt: new Date().toISOString(),
        availability: "ready",
        processStartTime: new Date(Date.now() - 7200000).toISOString(),
        readyTime: new Date(Date.now() - 7100000).toISOString(),
        checkerSummary: { hasResult: true, valid: true, errorCount: 0, warningCount: 1, infoCount: 2 },
        pluginSummary: { discovered: 19, enabled: 12, executed: 12, crashed: 0, unknownCrashed: 0 },
        configInventory: [],
        statsSummary: { available: true, scopeCount: 4 },
        ticketSummary: {
          available: true,
          total: tickets.length,
          open: tickets.filter((item) => item.open).length,
          closed: tickets.filter((item) => item.closed).length,
          claimed: tickets.filter((item) => item.claimed).length,
          pinned: tickets.filter((item) => item.pinned).length,
          recentActivityCount: 12
        },
        warnings: ["Fixture runtime warning for layout smoke."],
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
    async getTicketDetail(ticketId) {
      const base = tickets.find((item) => item.id === ticketId)
      if (!base) return null
      return {
        ticket: base,
        panelId: "front-desk",
        panelLabel: "Front desk",
        optionLabel: base.optionId === "intake" ? "Intake" : `Missing option (${base.optionId})`,
        creatorLabel: `Unknown user (${base.creatorId})`,
        teamLabel: base.assignedTeamId === "triage" ? "Triage" : base.assignedTeamId === "lead" ? "Lead" : `Missing team (${base.assignedTeamId})`,
        assigneeLabel: base.assignedStaffUserId ? "Staff One" : "Unassigned",
        priorityId: "normal",
        priorityLabel: "Normal",
        topic: "Long fixture topic used to check wrapping in the ticket detail workspace at half-screen widths",
        originalApplicantUserId: "creator-original",
        originalApplicantLabel: "Unknown user (creator-original)",
        creatorTransferWarning: "tickets.detail.warnings.creatorTransfer",
        participantLabels: ["creator-1", "staff-1"],
        actionAvailability: Object.fromEntries(
          [
            "claim",
            "unclaim",
            "assign",
            "escalate",
            "move",
            "transfer",
            "add-participant",
            "remove-participant",
            "set-priority",
            "set-topic",
            "approve-close-request",
            "dismiss-close-request",
            "set-awaiting-user",
            "clear-awaiting-user",
            "pin",
            "unpin",
            "rename",
            "close",
            "reopen",
            "refresh"
          ].map((id) => [id, id === "close" || id === "escalate" ? { enabled: false, reason: "Locked by provider." } : { enabled: true, reason: null }])
        ),
        assignableStaff: [{ userId: "staff-1", label: "Staff One" }],
        escalationTargets: [{ optionId: "escalated", optionLabel: "Escalated", panelId: "front-desk", panelLabel: "Front desk", transportMode: "channel_text" }],
        moveTargets: [{ optionId: "escalated", optionLabel: "Escalated", panelId: "front-desk", panelLabel: "Front desk", transportMode: "channel_text", teamId: "lead", teamLabel: "Lead" }],
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
        integration: {
          profileId: "whitelist",
          providerId: "ot-eotfs-bridge",
          label: "Whitelist bridge",
          state: "locked",
          summary: "Whitelist bridge owns close and escalation actions.",
          degradedReason: null,
          lockedTicketActions: ["close", "escalate"],
          warnings: ["Provider owns close and escalation actions."]
        },
        aiAssist: {
          profileId: "assist-default",
          providerId: "reference",
          label: "Reference assistant",
          available: true,
          reason: null,
          actions: ["summarize", "answerFaq", "suggestReply"],
          warnings: []
        },
        telemetry: telemetrySignals(Number(base.id.replace(/\D/g, "")) || 1)
      }
    },
    async listLifecycleTelemetry() {
      return { items: lifecycleTelemetry, nextCursor: null, truncated: false, warnings: [] }
    },
    async listFeedbackTelemetry() {
      return { items: feedbackTelemetry, nextCursor: null, truncated: false, warnings: [] }
    },
    async getTicketTelemetrySignals(ticketIds) {
      return Object.fromEntries(ticketIds.map((id) => [id, telemetrySignals(Number(id.replace(/\D/g, "")) || 1)]))
    },
    async getTicketQueueSummary(input) {
      return buildTicketQueueSummary(tickets, { lifecycleRecords: lifecycleTelemetry, lifecycleAvailable: true, unavailableReason: null, now: input.now })
    },
    async listTicketWorkbenchViews(actorUserId) {
      return savedViews.filter((view) => view.scope === "shared" || view.ownerUserId === actorUserId)
    },
    async getTicketWorkbenchView(viewId, actorUserId) {
      return savedViews.find((view) => view.viewId === viewId && (view.scope === "shared" || view.ownerUserId === actorUserId)) || null
    },
    async listQualityReviewCases() {
      return { cases: qualityCases, warnings: [] }
    },
    async getQualityReviewCase(ticketId) {
      const summary = qualityCases.find((item) => item.ticketId === ticketId)
      if (!summary) return null
      return {
        ...summary,
        notes: [
          { noteId: "note-1", ticketId, authorUserId: "admin-user", authorLabel: "admin-user", createdAt: Date.now() - 500000, body: "Private review note fixture." }
        ],
        rawFeedback: [
          {
            sessionId: summary.latestRawFeedbackSessionId || "feedback-1",
            ticketId,
            capturedAt: Date.now() - 400000,
            retentionExpiresAt: Date.now() + 86400000,
            storageStatus: summary.rawFeedbackStatus === "available" ? "available" : "none",
            warnings: [],
            answers: [
              {
                position: 1,
                type: "text",
                label: "Freeform",
                answered: true,
                textValue: "raw private comment",
                ratingValue: null,
                choiceIndex: null,
                choiceLabel: null,
                assets: []
              },
              {
                position: 2,
                type: "image",
                label: "Screenshot",
                answered: true,
                textValue: null,
                ratingValue: null,
                choiceIndex: null,
                choiceLabel: null,
                assets: [
                  {
                    assetId: "asset-1",
                    fileName: "asset-1.png",
                    contentType: "image/png",
                    byteSize: 12,
                    relativePath: "ticket-1/feedback-1/asset-1.png",
                    captureStatus: "mirrored",
                    reason: null
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    async getQualityReviewQueueSummary(input) {
      return buildQualityReviewQueueSummary(qualityCases, input)
    },
    async getQualityReviewNotificationStatus() {
      return {
        notificationsEnabled: false,
        digestEnabled: false,
        deliveryChannelCount: 0,
        configuredTargetCount: 0,
        validTargetCount: 0,
        lastDeliveryError: null,
        unavailableReason: null,
        remindersSentToday: 0,
        lastDigestAt: null,
        lastDigestDate: null,
        lastDigestCount: 0,
        digestDeliveredToday: false,
        ticketReminder: null,
        ticketReminderCooldownUntil: null
      }
    },
    async resolveQualityReviewOwnerLabel(userId) {
      return userId ? members.get(userId)?.displayName || `Unknown owner (${userId})` : "Unassigned"
    },
    async runTicketAiAssist(input) {
      return {
        ok: true,
        outcome: "success",
        action: input.action,
        message: "tickets.detail.actionResults.aiAssistSuccess",
        profileId: "assist-default",
        providerId: "reference",
        confidence: "medium",
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
    async resolveGuildMember(userId) {
      return members.get(userId) || null
    },
    getRuntimeSource() {
      return {
        databases: {
          get(id) {
            if (id !== "opendiscord:global") return null
            return {
              async get(category, key) {
                return globalDatabase.get(`${category}:${key}`)
              },
              async set(category, key, value) {
                globalDatabase.set(`${category}:${key}`, value)
                return true
              },
              async delete(category, key) {
                return globalDatabase.delete(`${category}:${key}`)
              },
              async getCategory(category) {
                const prefix = `${category}:`
                return [...globalDatabase.entries()]
                  .filter(([key]) => key.startsWith(prefix))
                  .map(([key, value]) => ({ key: key.slice(prefix.length), value }))
              }
            }
          }
        }
      }
    }
  }

  const config = JSON.parse(fs.readFileSync(path.join(fixturePluginRoot, "config.json"), "utf8"))
  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot: fixturePluginRoot,
    configOverride: config,
    runtimeBridge,
    adminAuthClient: {
      async exchangeCode(code) {
        return code
      },
      async fetchAdminIdentity(accessToken) {
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

  const server = await listen(app)
  const connections = new Set()
  server.on("connection", (socket) => {
    connections.add(socket)
    socket.on("close", () => connections.delete(socket))
  })
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  async function login(userId, returnTo) {
    let cookie = ""
    const loginResponse = await fetch(`${baseUrl}/dash/login?returnTo=${encodeURIComponent(returnTo)}`, { redirect: "manual" })
    cookie = (loginResponse.headers.get("set-cookie") || "").split(";")[0]
    await loginResponse.arrayBuffer()
    const startResponse = await fetch(`${baseUrl}/dash/login/discord?returnTo=${encodeURIComponent(returnTo)}`, {
      redirect: "manual",
      headers: { cookie }
    })
    const startCookie = startResponse.headers.get("set-cookie")
    if (startCookie) cookie = startCookie.split(";")[0]
    const state = new URL(String(startResponse.headers.get("location"))).searchParams.get("state")
    const callback = await fetch(`${baseUrl}/dash/login/discord/callback?code=${encodeURIComponent(userId)}&state=${encodeURIComponent(state)}`, {
      redirect: "manual",
      headers: { cookie }
    })
    const callbackCookie = callback.headers.get("set-cookie")
    if (callbackCookie) cookie = callbackCookie.split(";")[0]
    await callback.arrayBuffer()
    if (callback.status !== 302) throw new Error(`Login failed for ${userId}: ${callback.status}`)
    return cookie
  }

  const roles = {
    admin: await login("admin-user", "/dash/admin"),
    editor: await login("editor-user", "/dash/admin/tickets"),
    reviewer: await login("reviewer-user", "/dash/admin/quality-review")
  }
  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "half", width: 960, height: 1080 },
    { name: "narrow-half", width: 720, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]
  const routes = [
    { role: "admin", id: "home", path: "/dash/admin" },
    { role: "editor", id: "tickets-list", path: "/dash/admin/tickets?limit=100&status=open&sort=queue-priority" },
    { role: "editor", id: "tickets-saved-view", path: "/dash/admin/tickets?viewId=shared-view" },
    { role: "editor", id: "ticket-detail", path: "/dash/admin/tickets/ticket-1?returnTo=%2Fdash%2Fadmin%2Ftickets%3Flimit%3D100" },
    { role: "admin", id: "analytics", path: "/dash/admin/analytics?window=30d" },
    { role: "reviewer", id: "quality-list", path: "/dash/admin/quality-review?window=all&attention=overdue&rawFeedback=available" },
    { role: "reviewer", id: "quality-detail", path: "/dash/admin/quality-review/ticket-1?returnTo=%2Fdash%2Fadmin%2Fquality-review" },
    { role: "admin", id: "quality-supervision", path: "/dash/admin/quality-review/supervision?outcome=action_taken" },
    { role: "admin", id: "security", path: "/dash/admin/security" },
    { role: "admin", id: "raw-options", path: "/dash/admin/configs/options" },
    { role: "editor", id: "visual-options", path: "/dash/visual/options" },
    { role: "editor", id: "visual-general", path: "/dash/visual/general" },
    { role: "editor", id: "visual-panels", path: "/dash/visual/panels" },
    { role: "editor", id: "visual-questions", path: "/dash/visual/questions" }
  ]

  const browser = await chromium.launch({ headless: true })
  const results = []
  const failures = []
  try {
    for (const route of routes) {
      console.log(`ui-layout ${route.role}/${route.id}`)
      for (const viewport of viewports) {
        const browserContext = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height }
        })
        const [cookieName, ...cookieValueParts] = roles[route.role].split("=")
        await browserContext.addCookies([{ name: cookieName, value: cookieValueParts.join("="), url: baseUrl }])
        const page = await browserContext.newPage()
        let status = null
        let navigationError = null
        try {
          const response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "domcontentloaded", timeout: 10000 })
          status = response ? response.status() : null
          await page.waitForTimeout(100)
        } catch (error) {
          navigationError = error && error.message ? error.message : String(error)
        }

        const fileName = `${route.role}-${route.id}-${viewport.name}.png`
        const screenshotPath = path.join(screenshotsDir, fileName)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        const metrics = await page.evaluate(() => {
          const main = document.querySelector("main") || document.body
          const clientWidth = document.documentElement.clientWidth
          const overflowElements = Array.from(document.querySelectorAll("body *"))
            .map((element) => {
              const rect = element.getBoundingClientRect()
              const classes = Array.from(element.classList || []).slice(0, 5).join(".")
              return {
                tag: element.tagName.toLowerCase(),
                selector: `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`,
                right: Math.round(rect.right),
                width: Math.round(rect.width),
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth,
                insideTableWrap: Boolean(element.closest(".table-wrap")),
                text: (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120)
              }
            })
            .filter((element) => element.right > clientWidth + 4 || element.scrollWidth > element.clientWidth + 4)
            .slice(0, 20)
          const localTableOverflow = Array.from(document.querySelectorAll(".table-wrap"))
            .map((element) => ({
              selector: element.className,
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
              overflowing: element.scrollWidth > element.clientWidth + 4
            }))
            .filter((element) => element.overflowing)
          return {
            finalUrl: location.href,
            title: document.title,
            bodyScrollWidth: document.documentElement.scrollWidth,
            bodyClientWidth: clientWidth,
            horizontalOverflow: document.documentElement.scrollWidth > clientWidth + 4,
            fullHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
            overflowElements,
            localTableOverflow,
            textStart: main.innerText.slice(0, 1200)
          }
        })

        const result = {
          role: route.role,
          id: route.id,
          path: route.path,
          viewport,
          status: navigationError ? "navigation-error" : status,
          navigationError,
          screenshot: path.relative(auditRoot, screenshotPath),
          metrics
        }
        const resultFailures = validateResult(result)
        if (navigationError) resultFailures.push(navigationError)
        if (resultFailures.length) {
          failures.push({
            route: `${route.role}/${route.id}`,
            path: route.path,
            viewport: viewport.name,
            failures: resultFailures,
            screenshot: result.screenshot,
            overflowElements: metrics.overflowElements
          })
        }
        results.push(result)
        await browserContext.close()
      }
    }
  } finally {
    await browser.close()
    server.close()
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    for (const socket of connections) socket.destroy()
    await context.authStore.close()
  }

  const resultsPath = path.join(auditRoot, "browser-results.json")
  writeJson(resultsPath, { baseUrl, projectRoot, routes, viewports, results, failures })
  const summary = {
    auditRoot,
    screenshots: results.length,
    routes: routes.length,
    viewports: viewports.length,
    resultsPath,
    failures: failures.length
  }
  console.log(JSON.stringify(summary, null, 2))
  if (failures.length) {
    console.error(JSON.stringify({ failures }, null, 2))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
