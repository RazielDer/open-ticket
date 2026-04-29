import fs from "node:fs"
import type express from "express"

import { buildDashboardAuditActor, createAdminGuard, hasDashboardCapability, sanitizeReturnTo } from "../auth"
import { buildDashboardAnalyticsModel } from "../analytics"
import type { DashboardAppContext } from "../create-app"
import {
  buildAnalyticsExportPayload,
  buildTicketWorkbenchExportPayload,
  getAnalyticsExportAuditDetails,
  getTicketWorkbenchExportAuditDetails,
  parseDashboardExportFormat
} from "../export-serializers"
import {
  getDashboardSecurityWarnings,
  getDashboardViewerReadiness,
  joinBasePath,
  resolveDashboardDiscordAuthConfig
} from "../dashboard-config"
import { prepareJsonReview } from "../json-review"
import {
  buildActionCards,
  buildAdminShell,
  buildConfigDetailModel,
  buildConfigItems,
  buildPluginAssetDetailModel,
  buildPluginDetailModel,
  buildPluginInventoryGroups,
  buildPluginInventoryItems,
  buildVerificationCards,
  consumePendingReview,
  type DashboardTone,
  formatDate,
  getAlert,
  requireManagedConfig,
  stashPendingReview
} from "../control-center"
import {
  buildAdvancedWorkspaceModel,
  buildHomeQualityReviewBlock,
  buildHomeWorkspaceModel,
  buildTranscriptIntegrationWarning
} from "../home-setup-models"
import {
  buildTranscriptAvailabilityAlert,
  buildTranscriptDetailIntegritySummaryCard,
  buildTranscriptDetailModel,
  buildTranscriptIntegritySummaryCard,
  buildTranscriptListModel,
  buildTranscriptRetentionSummaryCard,
  buildTranscriptSummaryCards,
  parseTranscriptEventsRequest,
  parseTranscriptListRequest,
  sanitizeTranscriptWorkspaceReturnTo
} from "../transcript-control-center"
import {
  resolveTranscriptIntegration,
  supportsTranscriptOperationsReads,
  supportsTranscriptOperationsWrites,
  supportsTranscriptTicketAnalyticsHistory,
  type DashboardListTranscriptEventsResult,
  type DashboardListTranscriptsResult,
  type DashboardTranscriptIntegrityReport,
  type DashboardTranscriptIntegritySummary,
  type DashboardTranscriptOperationalListQuery,
  type DashboardTranscriptOperationalListResult,
  type DashboardTranscriptPrepareBulkExportResult,
  type DashboardTranscriptPrepareExportResult,
  type DashboardTranscriptRetentionPreview
} from "../transcript-service-bridge"
import {
  supportsTicketTelemetryReads,
  supportsTicketWorkbenchReads,
  supportsTicketWorkbenchWrites,
  type DashboardRuntimeBridge,
  type DashboardRuntimeGuildMember
} from "../runtime-bridge"
import {
  buildDashboardQualityReviewDetailModel,
  buildDashboardQualityReviewListModel,
  buildQualityReviewQueueHref,
  sanitizeQualityReviewReturnTo
} from "../quality-review"
import {
  buildFallbackTicketDetail,
  buildTicketWorkbenchDetailModel,
  buildTicketWorkbenchListModel,
  parseDashboardTicketBulkActionId,
  parseDashboardTicketActionId,
  parseTicketWorkbenchListRequest,
  sanitizeTicketWorkbenchReturnTo,
  translateTicketWorkbenchMessage
} from "../ticket-workbench"
import type { DashboardQualityReviewActionId, DashboardTicketTelemetrySignals } from "../ticket-workbench-types"

function renderPage(res: express.Response, view: string, locals: Record<string, unknown> = {}) {
  const access = res.locals.dashboardAccess as { capabilities?: string[] } | undefined
  const capabilitySet = new Set((access?.capabilities || []).map(String))
  const filterByCapability = <T extends { requiredCapability?: string }>(items: T[] | undefined) => (
    Array.isArray(items)
      ? items.filter((item) => !item.requiredCapability || capabilitySet.has(item.requiredCapability))
      : items
  )

  res.render(view, {
    ...locals,
    ...(Array.isArray(locals.navItems) ? { navItems: filterByCapability(locals.navItems as Array<{ requiredCapability?: string }>) } : {}),
    ...(Array.isArray(locals.heroActions) ? { heroActions: filterByCapability(locals.heroActions as Array<{ requiredCapability?: string }>) } : {})
  })
}

function buildBulkActionTone(result: { succeeded: number; skipped: number; failed: number }) {
  if (result.failed > 0) return "danger"
  if (result.skipped > 0) return "warning"
  return "success"
}

function normalizeStringListInput(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : []
  return raw
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean)
    .filter((entry, index, values) => values.indexOf(entry) === index)
}

function appendAlertQuery(href: string, status: string, message: string) {
  return `${href}${href.includes("?") ? "&" : "?"}alertStatus=${encodeURIComponent(status)}&msg=${encodeURIComponent(message)}`
}

function parseQualityReviewActionId(value: string): DashboardQualityReviewActionId | null {
  return value === "set-state" || value === "assign-owner" || value === "clear-owner" || value === "add-note"
    ? value
    : null
}

function memberHasAdminTier(context: DashboardAppContext, member: DashboardRuntimeGuildMember | null) {
  if (!member) return false
  if (context.config.rbac.ownerUserIds.includes(member.userId)) return true
  if (context.config.rbac.userIds.admin.includes(member.userId)) return true
  const adminRoleIds = new Set(context.config.rbac.roleIds.admin.map((roleId) => String(roleId || "").trim()).filter(Boolean))
  return member.roleIds.some((roleId) => adminRoleIds.has(String(roleId || "").trim()))
}

function dashboardRuntimeMemberLabel(member: DashboardRuntimeGuildMember, fallback: string) {
  return member.displayName || member.globalName || member.username || fallback
}

async function resolveQualityReviewOwnerLabel(context: DashboardAppContext, userId: string) {
  const member = typeof context.runtimeBridge.resolveGuildMember === "function"
    ? await context.runtimeBridge.resolveGuildMember(userId).catch(() => null)
    : null
  return member ? dashboardRuntimeMemberLabel(member, userId) : `Unknown owner (${userId})`
}

async function resolveCurrentQualityReviewOwnerLabel(context: DashboardAppContext, userId: string) {
  const normalizedUserId = String(userId || "").trim()
  if (!normalizedUserId) return "Unassigned"
  const member = typeof context.runtimeBridge.resolveGuildMember === "function"
    ? await context.runtimeBridge.resolveGuildMember(normalizedUserId).catch(() => null)
    : null
  return member && memberHasAdminTier(context, member)
    ? dashboardRuntimeMemberLabel(member, normalizedUserId)
    : `Unknown owner (${normalizedUserId})`
}

async function buildQualityReviewOwnerChoices(context: DashboardAppContext, currentUserId: string | null | undefined) {
  const ids = new Set<string>()
  for (const userId of context.config.rbac.ownerUserIds) ids.add(userId)
  for (const userId of context.config.rbac.userIds.admin) ids.add(userId)
  if (currentUserId) ids.add(currentUserId)

  const choices = await Promise.all([...ids].map(async (userId) => ({
    value: userId,
    label: await resolveQualityReviewOwnerLabel(context, userId)
  })))
  return choices
    .filter((choice) => choice.value.trim().length > 0)
    .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value))
}

async function canAssignQualityReviewOwner(
  context: DashboardAppContext,
  access: ReturnType<ReturnType<typeof createAdminGuard>["getAccess"]>,
  ownerUserId: string
) {
  const normalizedOwner = String(ownerUserId || "").trim()
  if (!normalizedOwner || !access || !hasDashboardCapability(access, "quality.review.manage")) return false
  if (access.identity?.userId === normalizedOwner) return true
  if (context.config.rbac.ownerUserIds.includes(normalizedOwner) || context.config.rbac.userIds.admin.includes(normalizedOwner)) return true
  const member = typeof context.runtimeBridge.resolveGuildMember === "function"
    ? await context.runtimeBridge.resolveGuildMember(normalizedOwner).catch(() => null)
    : null
  return memberHasAdminTier(context, member)
}

function sanitizeAnalyticsWorkspaceReturnTo(basePath: string, candidate: unknown) {
  const fallback = joinBasePath(basePath, "admin/analytics")
  if (typeof candidate !== "string" || candidate.length === 0) return fallback
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("://") || candidate.includes("\\")) return fallback
  if (basePath !== "/" && !candidate.startsWith(basePath)) return fallback
  const rawPath = candidate.split(/[?#]/, 1)[0]
  for (const segment of rawPath.split("/")) {
    let decoded = segment
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return fallback
    }
    if (decoded === "." || decoded === ".." || decoded.includes("\\")) return fallback
  }

  const normalizedBasePath = basePath === "/" ? "" : basePath
  const analyticsRoot = `${normalizedBasePath}/admin/analytics`
  if (candidate === analyticsRoot) return candidate
  if (candidate.startsWith(`${analyticsRoot}?`)) return candidate
  if (candidate.startsWith(`${analyticsRoot}/`)) return candidate
  return fallback
}

function sendDashboardExport(res: express.Response, payload: { fileName: string; contentType: string; body: Buffer | string }) {
  res.setHeader("Content-Type", payload.contentType)
  res.setHeader("Content-Disposition", `attachment; filename="${payload.fileName}"`)
  res.send(payload.body)
}

function registerPreparedExportCleanup(
  res: express.Response,
  release: () => Promise<boolean>
) {
  let released = false

  const cleanup = () => {
    if (released) return
    released = true
    res.off("finish", cleanup)
    res.off("close", cleanup)
    void release().catch(() => false)
  }

  res.on("finish", cleanup)
  res.on("close", cleanup)
  return cleanup
}

function streamPreparedTranscriptExport(
  res: express.Response,
  prepared: DashboardTranscriptPrepareExportResult["export"] | DashboardTranscriptPrepareBulkExportResult["export"],
  release: () => Promise<boolean>
) {
  if (!prepared) {
    res.status(500).send("Prepared transcript export is unavailable.")
    return
  }

  const cleanup = registerPreparedExportCleanup(res, release)
  res.setHeader("Content-Type", prepared.contentType)
  res.setHeader("Content-Disposition", `attachment; filename="${prepared.fileName}"`)
  res.sendFile(prepared.filePath, (error) => {
    if (!error) return

    cleanup()
    if (!res.headersSent) {
      res.status(500).send("Unable to stream the prepared transcript export.")
      return
    }

    if (!res.writableEnded) {
      res.end()
    }
  })
}

function parseBooleanInput(value: unknown, fallback = false) {
  if (value === true || value === "true" || value === "on" || value === "1") return true
  if (value === false || value === "false" || value === "0") return false
  return fallback
}

function parsePriorityInput(i18n: DashboardAppContext["i18n"], value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(i18n.t("routeMessages.priorityInvalid"))
  }
  return parsed
}

function formatAvailabilityLabel(i18n: DashboardAppContext["i18n"], availability: string) {
  switch (availability) {
    case "ready":
      return i18n.t("shell.status.ready")
    case "starting":
      return i18n.t("shell.status.starting")
    case "degraded":
      return i18n.t("shell.status.degraded")
    default:
      return i18n.t("shell.status.unavailable")
  }
}

function toneForAvailability(availability: string): DashboardTone {
  switch (availability) {
    case "ready":
      return "success"
    case "starting":
      return "muted"
    case "degraded":
      return "warning"
    default:
      return "danger"
  }
}

function metricCard(label: string, value: string, detail: string, tone?: DashboardTone) {
  return {
    label,
    value,
    detail,
    kind: "metric" as const,
    ...(tone ? { tone } : {})
  }
}

function statusCard(label: string, value: string, detail: string, tone: DashboardTone = "muted") {
  return {
    label,
    value,
    detail,
    kind: "status" as const,
    tone
  }
}

function recordAdminAuditEvent(
  context: DashboardAppContext,
  req: express.Request,
  actor: Parameters<typeof buildDashboardAuditActor>[0] | null | undefined,
  input: {
    eventType: string
    target: string
    outcome?: string | null
    reason?: string | null
    details?: Record<string, unknown>
  }
) {
  return context.authStore.recordAuditEvent({
    eventType: input.eventType,
    sessionScope: "admin",
    sessionId: req.sessionID,
    actor: buildDashboardAuditActor(actor || null),
    target: input.target,
    outcome: input.outcome ?? "success",
    reason: input.reason ?? null,
    details: input.details ?? {}
  }).catch(() => {})
}

function buildSecurityWorkspaceModel(context: DashboardAppContext) {
  const { config, basePath, i18n } = context
  const discord = resolveDashboardDiscordAuthConfig(config)
  const warnings = getDashboardSecurityWarnings(config).map((message) => ({
    tone: "warning",
    message
  }))
  const sessionSecret = String(config.auth.sessionSecret || "").trim()
  const breakglassHash = String(config.auth.breakglass?.passwordHash || "").trim()
  const breakglassEnabled = config.auth.breakglass?.enabled === true

  return {
    formAction: joinBasePath(basePath, "admin/security"),
    warnings,
    secrets: [
      {
        title: i18n.t("security.secrets.discord.title"),
        tone: discord.clientId && discord.clientSecret ? "success" : "warning",
        label: discord.clientId && discord.clientSecret
          ? i18n.t("security.secrets.ready")
          : i18n.t("security.secrets.missing"),
        detail: discord.clientId && discord.clientSecret
          ? i18n.t("security.secrets.discord.readyDetail")
          : i18n.t("security.secrets.discord.missingDetail")
      },
      {
        title: i18n.t("security.secrets.session.title"),
        tone: sessionSecret && sessionSecret.length >= 32 ? "success" : "warning",
        label: sessionSecret && sessionSecret.length >= 32
          ? i18n.t("security.secrets.ready")
          : i18n.t("security.secrets.missing"),
        detail: sessionSecret && sessionSecret.length >= 32
          ? i18n.t("security.secrets.session.readyDetail")
          : i18n.t("security.secrets.session.missingDetail")
      },
      {
        title: i18n.t("security.secrets.breakglass.title"),
        tone: breakglassEnabled
          ? breakglassHash
            ? "success"
            : "warning"
          : "muted",
        label: breakglassEnabled
          ? breakglassHash
            ? i18n.t("security.secrets.ready")
            : i18n.t("security.secrets.missing")
          : i18n.t("security.secrets.disabled"),
        detail: breakglassEnabled
          ? breakglassHash
            ? i18n.t("security.secrets.breakglass.readyDetail")
            : i18n.t("security.secrets.breakglass.missingDetail")
          : i18n.t("security.secrets.breakglass.disabledDetail")
      }
    ],
    values: {
      publicBaseUrl: String(config.publicBaseUrl || ""),
      viewerPublicBaseUrl: String(config.viewerPublicBaseUrl || ""),
      trustProxyHops: String(config.trustProxyHops),
      ownerUserIds: config.rbac.ownerUserIds.join("\n"),
      reviewerRoleIds: config.rbac.roleIds.reviewer.join("\n"),
      editorRoleIds: config.rbac.roleIds.editor.join("\n"),
      adminRoleIds: config.rbac.roleIds.admin.join("\n"),
      reviewerUserIds: config.rbac.userIds.reviewer.join("\n"),
      editorUserIds: config.rbac.userIds.editor.join("\n"),
      adminUserIds: config.rbac.userIds.admin.join("\n"),
      breakglassEnabled
    }
  }
}

export function registerAdminRoutes(app: express.Express, context: DashboardAppContext) {
  const { basePath, brand, configService, backupService, runtimeBridge, pluginManagementService, i18n } = context
  const adminGuard = createAdminGuard(context)
  const workspaceFirstConfigIds = new Set(["general", "options", "panels", "questions"])
  const editorVisualConfigIds = new Set(["options", "panels", "questions"])
  const routeText = {
    backupOrConfigurationNotFound: i18n.t("routeMessages.backupOrConfigurationNotFound"),
    pluginNotFound: i18n.t("routeMessages.pluginNotFound"),
    pluginAssetNotFound: i18n.t("routeMessages.pluginAssetNotFound"),
    ticketNotFound: i18n.t("routeMessages.ticketNotFound"),
    transcriptNotFound: i18n.t("routeMessages.transcriptNotFound"),
    reviewTokenExpired: i18n.t("routeMessages.reviewTokenExpired")
  }
  const qualityReviewHrefForAccess = (res: express.Response) => {
    const access = adminGuard.getAccess(res)
    return access && hasDashboardCapability(access, "quality.review")
      ? buildQualityReviewQueueHref(basePath)
      : null
  }
  const qualityReviewRuntimeBridge: DashboardRuntimeBridge = {
    ...runtimeBridge,
    resolveQualityReviewOwnerLabel: (userId) => resolveCurrentQualityReviewOwnerLabel(context, userId)
  }
  const managedConfigRequirement = (req: express.Request) => {
    const definition = requireManagedConfig(req.params.id)
    if (!definition) {
      return "admin.shell" as const
    }

    if (editorVisualConfigIds.has(definition.id)) {
      return "config.write.visual" as const
    }

    return definition.id === "transcripts"
      ? "transcript.manage" as const
      : "config.write.general" as const
  }

  const buildAnalyticsWorkspaceModel = async (query: Record<string, unknown>, qualityReviewHref: string | null = null) => {
    const transcriptIntegration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const transcriptService = transcriptIntegration.state === "ready" && supportsTranscriptTicketAnalyticsHistory(transcriptIntegration.service)
      ? transcriptIntegration.service
      : null
    return await buildDashboardAnalyticsModel({
      basePath,
      query,
      configService,
      runtimeBridge,
      transcriptService,
      t: i18n.t,
      qualityReviewHref
    })
  }

  const buildTicketWorkbenchWorkspaceModel = async (query: Record<string, unknown>, currentHref: string, qualityReviewHref: string | null = null) => {
    const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
    const runtimeAvailable = snapshot.ticketSummary.available === true
    const readsSupported = supportsTicketWorkbenchReads(runtimeBridge) && runtimeAvailable
    const writesSupported = supportsTicketWorkbenchWrites(runtimeBridge)
    const request = parseTicketWorkbenchListRequest(query)
    const tickets = readsSupported ? runtimeBridge.listTickets() : []
    let telemetrySupported = readsSupported && supportsTicketTelemetryReads(runtimeBridge)
    let telemetrySignals: Record<string, DashboardTicketTelemetrySignals> = {}
    let telemetryFilterSignals: Record<string, DashboardTicketTelemetrySignals> = {}
    let telemetryWarningMessage = ""

    if (telemetrySupported && runtimeBridge.getTicketTelemetrySignals) {
      try {
        const telemetryFiltersActive = request.feedback !== "all" || request.reopened !== "all"
        if (telemetryFiltersActive) {
          telemetryFilterSignals = await runtimeBridge.getTicketTelemetrySignals(tickets.map((ticket) => ticket.id))
        }
        const preview = buildTicketWorkbenchListModel({
          basePath,
          currentHref,
          request,
          tickets,
          configService,
          readsSupported,
          writesSupported,
          telemetrySupported,
          telemetrySignals: telemetryFilterSignals,
          telemetryFilterSignals,
          warningMessage: runtimeAvailable
            ? ""
            : "The Open Ticket runtime is not exposing ticket inventory to the dashboard right now.",
          telemetryWarningMessage,
          qualityReviewHref
        })
        const visibleTicketIds = preview.items.map((item) => item.id)
        telemetrySignals = visibleTicketIds.length > 0
          ? await runtimeBridge.getTicketTelemetrySignals(visibleTicketIds)
          : {}
      } catch {
        telemetrySupported = false
        telemetryFilterSignals = {}
        telemetrySignals = {}
        telemetryWarningMessage = "Ticket telemetry reads are unavailable; feedback and reopen filters are disabled."
      }
    } else if (readsSupported) {
      telemetryWarningMessage = "Ticket telemetry reads are unavailable; feedback and reopen filters are disabled."
    }

    return buildTicketWorkbenchListModel({
      basePath,
      currentHref,
      request,
      tickets,
      configService,
      readsSupported,
      writesSupported,
      telemetrySupported,
      telemetrySignals,
      telemetryFilterSignals,
      warningMessage: runtimeAvailable
        ? ""
        : "The Open Ticket runtime is not exposing ticket inventory to the dashboard right now.",
      telemetryWarningMessage,
      qualityReviewHref
    })
  }

  app.get(joinBasePath(basePath, "admin"), adminGuard.page("quality.review"), async (req, res) => {
    const access = adminGuard.getAccess(res)
    if (access?.tier !== "admin" && !hasDashboardCapability(access, "quality.review")) {
      return res.redirect(access?.preferredEntryPath || joinBasePath(basePath, "visual/options"))
    }

    const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
    const transcriptIntegration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const queueSummary = access?.identity && hasDashboardCapability(access, "quality.review") && typeof qualityReviewRuntimeBridge.getQualityReviewQueueSummary === "function"
      ? await qualityReviewRuntimeBridge.getQualityReviewQueueSummary({ actorUserId: access.identity.userId }).catch(() => null)
      : null
    const homeModel = buildHomeWorkspaceModel(context, transcriptIntegration, {
      qualityReview: hasDashboardCapability(access, "quality.review")
        ? buildHomeQualityReviewBlock(context, queueSummary)
        : null
    })
    const setupNeedsAttention = homeModel.setupCounts.needsSetup + homeModel.setupCounts.needsAttention
    const adminHome = access?.tier === "admin"
    const summaryCards = adminHome
      ? [
          metricCard(
            i18n.t("home.summary.setup"),
            String(homeModel.setupCounts.ready),
            i18n.t("home.summary.setupDetail", {
              ready: homeModel.setupCounts.ready,
              total: homeModel.setup.items.length
            }),
            setupNeedsAttention > 0 ? "warning" : "success"
          ),
          metricCard(
            i18n.t("home.summary.addOns"),
            String(snapshot.pluginSummary.discovered),
            i18n.t("home.summary.addOnsDetail", { count: snapshot.pluginSummary.crashed }),
            snapshot.pluginSummary.crashed > 0 ? "warning" : "muted"
          ),
          metricCard(
            i18n.t("home.summary.tickets"),
            String(snapshot.ticketSummary.total),
            i18n.t("home.summary.ticketsDetail", { count: snapshot.ticketSummary.recentActivityCount })
          )
        ]
      : []
    if (homeModel.qualityReview) {
      summaryCards.push(metricCard(
        homeModel.qualityReview.summaryCard.label,
        homeModel.qualityReview.summaryCard.value,
        homeModel.qualityReview.summaryCard.detail,
        homeModel.qualityReview.summaryCard.tone
      ))
    }

    renderPage(res, "admin-shell", buildAdminShell(context, "home", {
      pageTitle: `${i18n.t("home.title")} | ${brand.title}`,
      pageEyebrow: "",
      pageHeadline: i18n.t("home.headline"),
      pageSubtitle: i18n.t("home.subtitle"),
      pageAlert: getAlert(req) || buildTranscriptIntegrationWarning(context, transcriptIntegration),
      summaryCards,
      contentView: "sections/overview",
      recommendedAction: homeModel.recommendedAction,
      setupCards: adminHome ? homeModel.setupCards : [],
      showSetupStatus: adminHome,
      showWarnings: adminHome,
      qualityReviewHome: homeModel.qualityReview
    }))
  })

  app.get(joinBasePath(basePath, "admin/configs"), adminGuard.page("admin.shell"), (_req, res) => {
    const access = adminGuard.getAccess(res)
    if (access?.tier !== "admin") {
      return res.redirect(access?.preferredEntryPath || joinBasePath(basePath, "visual/options"))
    }

    res.redirect(joinBasePath(basePath, "admin"))
  })

  app.post(joinBasePath(basePath, "admin/configs/backups/create"), adminGuard.form("config.write.general"), (req, res) => {
    const note = String(req.body?.note || "")
    const returnTo = sanitizeReturnTo(basePath, req.body?.returnTo, joinBasePath(basePath, "admin"))
    const backup = backupService.createBackup(note, "manual")
    res.redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}msg=${encodeURIComponent(i18n.t("routeMessages.backupCreated", { id: backup.id }))}`
    )
  })

  app.get(joinBasePath(basePath, "admin/configs/:id/export"), adminGuard.page((req) => (
    req.params.id === "transcripts" ? "transcript.manage" : "config.write.general"
  )), (req, res) => {
    const definition = requireManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    const text = configService.prettifyText(configService.readManagedText(definition.id))
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="${definition.fileName}"`)
    res.send(text)
  })

  app.get(joinBasePath(basePath, "admin/configs/:id"), adminGuard.page(managedConfigRequirement), (req, res) => {
    const definition = requireManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    if (workspaceFirstConfigIds.has(definition.id)) {
      const search = new URLSearchParams()
      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((entry) => search.append(key, String(entry)))
          return
        }
        if (value !== undefined) {
          search.set(key, String(value))
        }
      })

      const target = joinBasePath(basePath, definition.visualPath)
      return res.redirect(search.size > 0 ? `${target}?${search.toString()}` : target)
    }

    const detail = buildConfigDetailModel(context, definition)
    const areaLabel = i18n.t(`setup.areas.${definition.id}.label`)
    renderPage(res, "admin-shell", buildAdminShell(context, "home", {
      pageTitle: `${definition.fileName} | ${brand.title}`,
      pageEyebrow: i18n.t("configDetail.eyebrow"),
      pageHeadline: i18n.t("configDetail.headline", { area: areaLabel }),
      pageSubtitle: i18n.t("configDetail.subtitle"),
      pageAlert: getAlert(req),
      contentView: "sections/config-detail",
      detail,
      areaLabel,
      visualHref: joinBasePath(basePath, definition.visualPath),
      rawHref: joinBasePath(basePath, definition.rawPath),
      reviewAction: joinBasePath(basePath, `admin/configs/${definition.id}/review`),
      exportHref: joinBasePath(basePath, `admin/configs/${definition.id}/export`),
      includeJsonEditor: true
    }))
  })

  app.post(joinBasePath(basePath, "admin/configs/:id/review"), adminGuard.form("config.write.general"), (req, res) => {
    const definition = requireManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    try {
      const candidateText = String(req.body?.candidateText || "")
      const currentText = configService.prettifyText(configService.readManagedText(definition.id))
      const review = prepareJsonReview(definition, currentText, candidateText)
      const token = stashPendingReview(req, {
        kind: "managed-config",
        id: definition.id,
        candidateText: review.candidateText,
        sourceLabel: String(req.body?.sourceLabel || i18n.t("routeMessages.configDraftSource")),
        createdAt: new Date().toISOString()
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "home", {
        pageTitle: `${i18n.t("routeMessages.configReviewPageTitle", { fileName: definition.fileName })} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.configReviewEyebrow"),
        pageHeadline: i18n.t("routeMessages.configReviewHeadline", { fileName: definition.fileName }),
        pageSubtitle: i18n.t("routeMessages.configReviewSubtitle"),
        contentView: "sections/config-review",
        review,
        reviewToken: token,
        applyAction: joinBasePath(basePath, `admin/configs/${definition.id}/apply`),
        backHref: joinBasePath(basePath, `admin/configs/${definition.id}`),
        applyLabel: i18n.t("routeMessages.configReviewApply"),
        applyConfirmMessage: i18n.t("routeMessages.configReviewConfirm")
      }))
    } catch (error) {
      const detail = buildConfigDetailModel(context, definition, String(req.body?.candidateText || "{}"))
      const areaLabel = i18n.t(`setup.areas.${definition.id}.label`)
      renderPage(res, "admin-shell", buildAdminShell(context, "home", {
        pageTitle: `${definition.fileName} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.configReviewErrorEyebrow"),
        pageHeadline: i18n.t("routeMessages.configReviewErrorHeadline", { fileName: definition.fileName }),
        pageSubtitle: i18n.t("routeMessages.configReviewErrorSubtitle"),
        pageAlert: { tone: "error", message: (error as Error).message },
        contentView: "sections/config-detail",
        detail,
        areaLabel,
        visualHref: joinBasePath(basePath, definition.visualPath),
        rawHref: joinBasePath(basePath, definition.rawPath),
        reviewAction: joinBasePath(basePath, `admin/configs/${definition.id}/review`),
        exportHref: joinBasePath(basePath, `admin/configs/${definition.id}/export`),
        includeJsonEditor: true
      }))
    }
  })

  app.get(joinBasePath(basePath, "admin/configs/:id/restore/:backupId"), adminGuard.page("config.write.general"), (req, res) => {
    const definition = requireManagedConfig(req.params.id)
    const backup = backupService.getBackup(req.params.backupId)
    if (!definition || !backup) {
      return res.status(404).send(routeText.backupOrConfigurationNotFound)
    }

    try {
      const candidateText = backupService.getBackupText(backup.id, definition.id)
      const currentText = configService.prettifyText(configService.readManagedText(definition.id))
      const review = prepareJsonReview(definition, currentText, candidateText)
      const token = stashPendingReview(req, {
        kind: "managed-config",
        id: definition.id,
        candidateText: review.candidateText,
        sourceLabel: i18n.t("routeMessages.configRestoreSource", { backupId: backup.id }),
        createdAt: new Date().toISOString()
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "home", {
        pageTitle: `${i18n.t("routeMessages.configRestorePageTitle", { fileName: definition.fileName })} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.configRestoreEyebrow"),
        pageHeadline: i18n.t("routeMessages.configRestoreHeadline", { fileName: definition.fileName }),
        pageSubtitle: i18n.t("routeMessages.configRestoreSubtitle"),
        contentView: "sections/config-review",
        review,
        reviewToken: token,
        applyAction: joinBasePath(basePath, `admin/configs/${definition.id}/apply`),
        backHref: joinBasePath(basePath, `admin/configs/${definition.id}`),
        applyLabel: i18n.t("routeMessages.configReviewApply"),
        applyConfirmMessage: i18n.t("routeMessages.configReviewConfirm")
      }))
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/configs/${definition.id}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.post(joinBasePath(basePath, "admin/configs/:id/apply"), adminGuard.form("config.write.general"), (req, res) => {
    const definition = requireManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    const review = consumePendingReview(req, String(req.body?.reviewToken || ""))
    if (!review || review.kind !== "managed-config" || review.id !== definition.id) {
      return res.redirect(
        `${joinBasePath(basePath, `admin/configs/${definition.id}`)}?status=error&msg=${encodeURIComponent(routeText.reviewTokenExpired)}`
      )
    }

    try {
      const parsed = JSON.parse(review.candidateText)
      backupService.createBackup(i18n.t("routeMessages.configPreApplyBackup", { fileName: definition.fileName }), `apply:${definition.id}`)
      configService.writeManagedJson(definition.id, parsed)
      res.redirect(
        `${joinBasePath(basePath, `admin/configs/${definition.id}`)}?saved=1&msg=${encodeURIComponent(i18n.t("routeMessages.configApplySuccess", { fileName: definition.fileName }))}`
      )
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/configs/${definition.id}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.post(joinBasePath(basePath, "admin/actions/:providerId/:actionId"), adminGuard.form("runtime.view"), async (req, res) => {
    const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
    const result = await context.actionProviderBridge.run(
      req.params.providerId,
      decodeURIComponent(req.params.actionId),
      snapshot,
      context.projectRoot
    )
    const returnTo = sanitizeReturnTo(basePath, req.body?.returnTo, joinBasePath(basePath, "admin/runtime"))
    const separator = returnTo.includes("?") ? "&" : "?"
    res.redirect(`${returnTo}${separator}status=${result.ok ? "success" : "error"}&msg=${encodeURIComponent(result.message)}`)
  })

  app.get(joinBasePath(basePath, "admin/plugins"), adminGuard.page("plugin.manage"), (req, res) => {
    const plugins = buildPluginInventoryItems(context)
    renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
      pageTitle: `${i18n.t("nav.addOns")} | ${brand.title}`,
      pageEyebrow: "",
      pageHeadline: i18n.t("addOns.headline"),
      pageSubtitle: i18n.t("addOns.subtitle"),
      hidePageIntro: true,
      pageAlert: getAlert(req),
      pageClass: "page-addons-inventory",
      contentView: "sections/plugins",
      plugins,
      pluginGroups: buildPluginInventoryGroups(context, plugins)
    }))
  })

  app.get(joinBasePath(basePath, "admin/plugins/:id"), adminGuard.page("plugin.manage"), async (req, res) => {
    const detail = pluginManagementService.getPluginDetail(req.params.id)
    if (!detail) {
      return res.status(404).send(routeText.pluginNotFound)
    }

    const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
    const model = await buildPluginDetailModel(context, detail) as any
    renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
      pageTitle: `${detail.id} | ${brand.title}`,
      pageEyebrow: i18n.t("addOns.detail.eyebrow"),
      pageHeadline: detail.name || detail.id,
      pageSubtitle: i18n.t("addOns.detail.subtitle"),
      pageAlert: getAlert(req),
      heroActions: [
        { href: joinBasePath(basePath, "admin/plugins"), label: i18n.t("nav.addOns"), variant: "secondary" },
        { href: model.manifestExportHref, label: i18n.t("addOns.manifestAction"), variant: "secondary" }
      ],
      contentView: "sections/plugin-detail",
      detail: model,
      pluginActionCards: buildActionCards(context, snapshot, { pluginId: detail.id })
    }))
  })

  app.post(joinBasePath(basePath, "admin/plugins/:id/backups/create"), adminGuard.form("plugin.manage"), (req, res) => {
    try {
      const backup = pluginManagementService.createBackup(req.params.id, String(req.body?.note || ""), "manual")
      res.redirect(
        `${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}`)}?msg=${encodeURIComponent(i18n.t("routeMessages.pluginBackupCreated", { id: backup.id }))}`
      )
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.get(joinBasePath(basePath, "admin/plugins/:id/manifest/export"), adminGuard.page("plugin.manage"), (req, res) => {
    try {
      const text = pluginManagementService.getManifestText(req.params.id)
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.setHeader("Content-Disposition", 'attachment; filename="plugin.json"')
      res.send(text)
    } catch (error) {
      res.status(404).send((error as Error).message)
    }
  })

  app.post(joinBasePath(basePath, "admin/plugins/:id/manifest/review"), adminGuard.form("plugin.manage"), async (req, res) => {
    const detail = pluginManagementService.getPluginDetail(req.params.id)
    if (!detail) {
      return res.status(404).send(routeText.pluginNotFound)
    }

    try {
      const enabled = parseBooleanInput(req.body?.enabled, detail.enabled ?? false)
      const priority = parsePriorityInput(i18n, req.body?.priority, detail.priority ?? 0)
      const currentText = pluginManagementService.getManifestText(detail.id)
      const candidateText = pluginManagementService.buildManifestCandidateText(detail.id, { enabled, priority })
      const review = prepareJsonReview({ fileName: "plugin.json", kind: "object" }, currentText, candidateText)
      const token = stashPendingReview(req, {
        kind: "plugin-manifest",
        pluginId: detail.id,
        candidateText: review.candidateText,
        sourceLabel: i18n.t("routeMessages.manifestReviewSource"),
        createdAt: new Date().toISOString()
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
        pageTitle: `${i18n.t("routeMessages.manifestReviewPageTitle")} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.manifestReviewEyebrow"),
        pageHeadline: i18n.t("routeMessages.manifestReviewHeadline", { id: detail.id }),
        pageSubtitle: i18n.t("routeMessages.manifestReviewSubtitle"),
        contentView: "sections/config-review",
        review,
        reviewToken: token,
        applyAction: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(detail.id)}/manifest/apply`),
        backHref: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(detail.id)}`),
        applyLabel: i18n.t("routeMessages.manifestReviewApply"),
        applyConfirmMessage: i18n.t("routeMessages.manifestReviewConfirm")
      }))
    } catch (error) {
      const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
      const model = await buildPluginDetailModel(context, detail) as any
      model.manifestDraft = {
        enabled: parseBooleanInput(req.body?.enabled, detail.enabled ?? false),
        priority: String(req.body?.priority ?? detail.priority ?? 0)
      }
      renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
        pageTitle: `${detail.id} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.manifestReviewErrorEyebrow"),
        pageHeadline: detail.name || detail.id,
        pageSubtitle: i18n.t("routeMessages.manifestReviewErrorSubtitle"),
        pageAlert: { tone: "error", message: (error as Error).message },
        contentView: "sections/plugin-detail",
        detail: model,
        pluginActionCards: buildActionCards(context, snapshot, { pluginId: detail.id })
      }))
    }
  })

  app.post(joinBasePath(basePath, "admin/plugins/:id/manifest/apply"), adminGuard.form("plugin.manage"), (req, res) => {
    const review = consumePendingReview(req, String(req.body?.reviewToken || ""))
    if (!review || review.kind !== "plugin-manifest" || review.pluginId !== req.params.id) {
      return res.redirect(
        `${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}`)}?status=error&msg=${encodeURIComponent(routeText.reviewTokenExpired)}`
      )
    }

    try {
      pluginManagementService.applyManifestCandidate(review.pluginId, review.candidateText)
      res.redirect(
        `${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(review.pluginId)}`)}?msg=${encodeURIComponent(i18n.t("routeMessages.manifestApplySuccess"))}`
      )
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.get(joinBasePath(basePath, "admin/plugins/:id/assets/:assetId"), adminGuard.page("plugin.manage"), (req, res) => {
    const model = buildPluginAssetDetailModel(context, req.params.id, req.params.assetId)
    if (!model) {
      return res.status(404).send(routeText.pluginAssetNotFound)
    }

    renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
      pageTitle: `${model.asset.relativePath} | ${brand.title}`,
      pageEyebrow: i18n.t("pluginAsset.eyebrow"),
      pageHeadline: model.asset.relativePath,
      pageSubtitle: i18n.t("pluginAsset.subtitle"),
      pageAlert: getAlert(req),
      heroActions: [
        { href: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(model.plugin.id)}`), label: i18n.t("pluginAsset.backAction"), variant: "secondary" },
        { href: model.asset.exportHref, label: i18n.t("pluginAsset.exportAction"), variant: "secondary" }
      ],
      contentView: "sections/plugin-asset-detail",
      detail: model,
      includeJsonEditor: true
    }))
  })

  app.post(joinBasePath(basePath, "admin/plugins/:id/assets/:assetId/review"), adminGuard.form("plugin.manage"), (req, res) => {
    const model = buildPluginAssetDetailModel(context, req.params.id, req.params.assetId)
    if (!model) {
      return res.status(404).send(routeText.pluginAssetNotFound)
    }

    try {
      const currentText = pluginManagementService.readAssetText(model.plugin.id, req.params.assetId)
      const candidateText = pluginManagementService.buildAssetCandidateText(model.plugin.id, req.params.assetId, String(req.body?.candidateText || ""))
      const review = prepareJsonReview({ fileName: model.asset.relativePath, kind: model.asset.kind }, currentText, candidateText)
      const token = stashPendingReview(req, {
        kind: "plugin-asset",
        pluginId: model.plugin.id,
        assetPath: model.asset.relativePath,
        assetKind: model.asset.kind,
        candidateText: review.candidateText,
        sourceLabel: String(req.body?.sourceLabel || i18n.t("routeMessages.pluginAssetReviewSource")),
        createdAt: new Date().toISOString()
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
        pageTitle: `${i18n.t("routeMessages.pluginAssetReviewPageTitle", { path: model.asset.relativePath })} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.pluginAssetReviewEyebrow"),
        pageHeadline: i18n.t("routeMessages.pluginAssetReviewHeadline", { path: model.asset.relativePath }),
        pageSubtitle: i18n.t("routeMessages.pluginAssetReviewSubtitle"),
        contentView: "sections/config-review",
        review,
        reviewToken: token,
        applyAction: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(model.plugin.id)}/assets/${req.params.assetId}/apply`),
        backHref: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(model.plugin.id)}/assets/${req.params.assetId}`),
        applyLabel: i18n.t("routeMessages.pluginAssetReviewApply"),
        applyConfirmMessage: i18n.t("routeMessages.pluginAssetReviewConfirm")
      }))
    } catch (error) {
      const errorModel = buildPluginAssetDetailModel(context, req.params.id, req.params.assetId, String(req.body?.candidateText || ""))
      if (!errorModel) {
        return res.status(404).send(routeText.pluginAssetNotFound)
      }

      renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
        pageTitle: `${errorModel.asset.relativePath} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.pluginAssetReviewErrorEyebrow"),
        pageHeadline: errorModel.asset.relativePath,
        pageSubtitle: i18n.t("routeMessages.pluginAssetReviewErrorSubtitle"),
        pageAlert: { tone: "error", message: (error as Error).message },
        contentView: "sections/plugin-asset-detail",
        detail: errorModel,
        includeJsonEditor: true
      }))
    }
  })

  app.post(joinBasePath(basePath, "admin/plugins/:id/assets/:assetId/apply"), adminGuard.form("plugin.manage"), (req, res) => {
    const review = consumePendingReview(req, String(req.body?.reviewToken || ""))
    const asset = pluginManagementService.getAsset(req.params.id, req.params.assetId)
    if (!review || review.kind !== "plugin-asset" || review.pluginId !== req.params.id || !asset || asset.relativePath !== review.assetPath) {
      return res.redirect(
        `${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}/assets/${req.params.assetId}`)}?status=error&msg=${encodeURIComponent(routeText.reviewTokenExpired)}`
      )
    }

    try {
      pluginManagementService.applyAssetCandidate(review.pluginId, req.params.assetId, review.candidateText)
      res.redirect(
        `${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(review.pluginId)}/assets/${req.params.assetId}`)}?msg=${encodeURIComponent(i18n.t("routeMessages.pluginAssetApplySuccess", { path: review.assetPath }))}`
      )
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}/assets/${req.params.assetId}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.get(joinBasePath(basePath, "admin/plugins/:id/assets/:assetId/export"), adminGuard.page("plugin.manage"), (req, res) => {
    try {
      const asset = pluginManagementService.getAsset(req.params.id, req.params.assetId)
      if (!asset) {
        return res.status(404).send(routeText.pluginAssetNotFound)
      }
      const text = pluginManagementService.readAssetText(req.params.id, req.params.assetId)
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.setHeader("Content-Disposition", `attachment; filename="${asset.fileName}"`)
      res.send(text)
    } catch (error) {
      res.status(404).send((error as Error).message)
    }
  })

  app.get(joinBasePath(basePath, "admin/plugins/:id/assets/:assetId/restore/:backupId"), adminGuard.page("plugin.manage"), (req, res) => {
    const model = buildPluginAssetDetailModel(context, req.params.id, req.params.assetId)
    if (!model) {
      return res.status(404).send(routeText.pluginAssetNotFound)
    }

    try {
      const candidateText = pluginManagementService.getBackupText(model.plugin.id, req.params.backupId, model.asset.relativePath)
      const currentText = pluginManagementService.readAssetText(model.plugin.id, req.params.assetId)
      const review = prepareJsonReview({ fileName: model.asset.relativePath, kind: model.asset.kind }, currentText, candidateText)
      const token = stashPendingReview(req, {
        kind: "plugin-asset",
        pluginId: model.plugin.id,
        assetPath: model.asset.relativePath,
        assetKind: model.asset.kind,
        candidateText: review.candidateText,
        sourceLabel: i18n.t("routeMessages.pluginAssetRestoreSource", { backupId: req.params.backupId }),
        createdAt: new Date().toISOString()
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "addons", {
        pageTitle: `${i18n.t("routeMessages.pluginAssetRestorePageTitle", { path: model.asset.relativePath })} | ${brand.title}`,
        pageEyebrow: i18n.t("routeMessages.pluginAssetRestoreEyebrow"),
        pageHeadline: i18n.t("routeMessages.pluginAssetRestoreHeadline", { path: model.asset.relativePath }),
        pageSubtitle: i18n.t("routeMessages.pluginAssetRestoreSubtitle"),
        contentView: "sections/config-review",
        review,
        reviewToken: token,
        applyAction: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(model.plugin.id)}/assets/${req.params.assetId}/apply`),
        backHref: joinBasePath(basePath, `admin/plugins/${encodeURIComponent(model.plugin.id)}/assets/${req.params.assetId}`),
        applyLabel: i18n.t("routeMessages.pluginAssetReviewApply"),
        applyConfirmMessage: i18n.t("routeMessages.pluginAssetRestoreConfirm")
      }))
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, `admin/plugins/${encodeURIComponent(req.params.id)}/assets/${req.params.assetId}`)}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.get(joinBasePath(basePath, "admin/advanced"), adminGuard.page("config.write.security"), (req, res) => {
    const advancedModel = buildAdvancedWorkspaceModel(context)
    renderPage(res, "admin-shell", buildAdminShell(context, "advanced", {
      pageTitle: `${i18n.t("advanced.title")} | ${brand.title}`,
      pageEyebrow: i18n.t("advanced.eyebrow"),
      pageHeadline: i18n.t("advanced.headline"),
      pageSubtitle: i18n.t("advanced.subtitle"),
      pageAlert: getAlert(req),
      contentView: "sections/advanced",
      advancedModel
    }))
  })

  app.get(joinBasePath(basePath, "admin/security"), adminGuard.page("config.write.security"), (req, res) => {
    const securityWorkspace = buildSecurityWorkspaceModel(context)
    renderPage(res, "admin-shell", buildAdminShell(context, "advanced", {
      pageTitle: `${i18n.t("security.title")} | ${brand.title}`,
      pageEyebrow: i18n.t("security.eyebrow"),
      pageHeadline: i18n.t("security.headline"),
      pageSubtitle: i18n.t("security.subtitle"),
      pageAlert: getAlert(req),
      heroActions: [
        { href: joinBasePath(basePath, "admin/advanced"), label: i18n.t("security.backAction"), variant: "secondary" }
      ],
      summaryCards: [
        metricCard(
          i18n.t("security.summary.adminHost"),
          context.config.publicBaseUrl || i18n.t("common.unavailable"),
          i18n.t("security.summary.adminHostDetail")
        ),
        metricCard(
          i18n.t("security.summary.viewerHost"),
          context.config.viewerPublicBaseUrl || i18n.t("common.unavailable"),
          i18n.t("security.summary.viewerHostDetail")
        ),
        metricCard(
          i18n.t("security.summary.owners"),
          String(context.config.rbac.ownerUserIds.length),
          i18n.t("security.summary.ownersDetail")
        ),
        metricCard(
          i18n.t("security.summary.warnings"),
          String(securityWorkspace.warnings.length),
          i18n.t("security.summary.warningsDetail"),
          securityWorkspace.warnings.length > 0 ? "warning" : "success"
        )
      ],
      contentView: "sections/security",
      securityWorkspace
    }))
  })

  app.post(joinBasePath(basePath, "admin/security"), adminGuard.form("config.write.security"), (req, res) => {
    try {
      const runtimeBackup = backupService.createBackup(i18n.t("security.messages.preApplyBackup"), "apply:dashboard-security")
      const actor = adminGuard.getAccess(res)?.identity
      if (!actor) {
        return res.status(403).type("text/plain; charset=utf-8").send("Forbidden")
      }

      const result = configService.saveDashboardSecuritySettings(
        context.config,
        req.body as Record<string, unknown>,
        actor,
        { runtimeBackupId: runtimeBackup.id }
      )
      void recordAdminAuditEvent(context, req, actor, {
        eventType: "security-workspace-save",
        target: "dashboard-security",
        reason: "admin-security-workspace",
        details: {
          changedPaths: result.changedPaths,
          backupId: result.backupId,
          auditId: result.auditId,
          runtimeBackupId: runtimeBackup.id
        }
      })
      res.redirect(
        `${joinBasePath(basePath, "admin/security")}?saved=1&msg=${encodeURIComponent(
          i18n.t("security.messages.saved", { backupId: result.backupId })
        )}`
      )
    } catch (error) {
      res.redirect(`${joinBasePath(basePath, "admin/security")}?status=error&msg=${encodeURIComponent((error as Error).message)}`)
    }
  })

  app.get(joinBasePath(basePath, "admin/runtime"), adminGuard.page("runtime.view"), (req, res) => {
    const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
    const checkerValue = snapshot.checkerSummary.valid === null
      ? i18n.t("systemStatusPage.checkerStates.unknown")
      : snapshot.checkerSummary.valid
        ? i18n.t("systemStatusPage.checkerStates.valid")
        : i18n.t("systemStatusPage.checkerStates.invalid")
    renderPage(res, "admin-shell", buildAdminShell(context, "advanced", {
      pageTitle: `${i18n.t("systemStatusPage.title")} | ${brand.title}`,
      pageEyebrow: i18n.t("systemStatusPage.eyebrow"),
      pageHeadline: i18n.t("systemStatusPage.headline"),
      pageSubtitle: i18n.t("systemStatusPage.subtitle"),
      pageAlert: getAlert(req),
      heroActions: [
        { href: joinBasePath(basePath, "admin/advanced"), label: i18n.t("systemStatusPage.backAction"), variant: "secondary" }
      ],
      summaryCards: [
        metricCard(i18n.t("systemStatusPage.summary.processStart"), formatDate(snapshot.processStartTime), i18n.t("systemStatusPage.summary.processStartDetail")),
        metricCard(i18n.t("systemStatusPage.summary.readyTime"), formatDate(snapshot.readyTime), i18n.t("systemStatusPage.summary.readyTimeDetail")),
        statusCard(
          i18n.t("systemStatusPage.summary.checker"),
          checkerValue,
          i18n.t("systemStatusPage.summary.checkerDetail", {
            errors: snapshot.checkerSummary.errorCount,
            warnings: snapshot.checkerSummary.warningCount
          }),
          snapshot.checkerSummary.valid === null
            ? "muted"
            : snapshot.checkerSummary.valid
              ? "success"
              : "danger"
        ),
        metricCard(
          i18n.t("systemStatusPage.summary.recentActivity"),
          String(snapshot.recentTicketActivity.length),
          i18n.t("systemStatusPage.summary.recentActivityDetail")
        )
      ],
      actionCards: buildActionCards(context, snapshot),
      contentView: "sections/runtime"
    }))
  })

  app.get(joinBasePath(basePath, "admin/analytics"), adminGuard.page("analytics.view"), async (req, res, next) => {
    try {
      const model = await buildAnalyticsWorkspaceModel(req.query as Record<string, unknown>, qualityReviewHrefForAccess(res))

      renderPage(res, "admin-shell", buildAdminShell(context, "analytics", {
        pageTitle: `${i18n.t("analytics.title")} | ${brand.title}`,
        pageEyebrow: i18n.t("analytics.page.eyebrow"),
        pageHeadline: i18n.t("analytics.page.headline"),
        pageSubtitle: i18n.t("analytics.page.subtitle"),
        pageAlert: getAlert(req),
        summaryCards: model.summaryCards,
        pageClass: "page-analytics-workspace",
        contentView: "sections/analytics",
        analytics: model
      }))
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "admin/analytics/export/:format"), adminGuard.form("analytics.view"), async (req, res) => {
    const returnTo = sanitizeAnalyticsWorkspaceReturnTo(basePath, req.body?.returnTo || req.query.returnTo)
    const format = parseDashboardExportFormat(req.params.format)
    const actor = adminGuard.getAccess(res)?.identity
    if (!format) {
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "analytics-export",
        target: "analytics",
        outcome: "failure",
        reason: "analytics-export",
        details: {
          format: String(req.params.format || ""),
          warningCount: 0,
          unavailableSectionCount: 0
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "warning", i18n.t("routeMessages.invalidExportFormat")))
    }

    try {
      const model = await buildAnalyticsWorkspaceModel(req.body as Record<string, unknown>, qualityReviewHrefForAccess(res))
      const payload = await buildAnalyticsExportPayload(model, format)
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "analytics-export",
        target: "analytics",
        outcome: "success",
        reason: "analytics-export",
        details: getAnalyticsExportAuditDetails(model, format)
      })
      return sendDashboardExport(res, payload)
    } catch {
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "analytics-export",
        target: "analytics",
        outcome: "failure",
        reason: "analytics-export",
        details: {
          format,
          warningCount: 0,
          unavailableSectionCount: 0
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "danger", i18n.t("routeMessages.exportFailed")))
    }
  })

  app.get(joinBasePath(basePath, "admin/quality-review"), adminGuard.page("quality.review"), async (req, res, next) => {
    try {
      const access = adminGuard.getAccess(res)
      const model = await buildDashboardQualityReviewListModel({
        basePath,
        projectRoot: context.projectRoot,
        currentHref: req.originalUrl || joinBasePath(basePath, "admin/quality-review"),
        query: req.query as Record<string, unknown>,
        configService,
        runtimeBridge: qualityReviewRuntimeBridge,
        actorUserId: access?.identity?.userId || ""
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "quality-review", {
        pageTitle: `${i18n.t("qualityReview.title")} | ${brand.title}`,
        pageEyebrow: i18n.t("qualityReview.page.eyebrow"),
        pageHeadline: i18n.t("qualityReview.page.headline"),
        pageSubtitle: i18n.t("qualityReview.page.subtitle"),
        pageAlert: getAlert(req),
        summaryCards: model.summaryCards,
        hidePageIntro: true,
        pageClass: "page-quality-review",
        contentView: "sections/quality-review",
        qualityReview: model
      }))
    } catch (error) {
      next(error)
    }
  })

  app.get(joinBasePath(basePath, "admin/quality-review/:ticketId"), adminGuard.page("quality.review"), async (req, res, next) => {
    try {
      const access = adminGuard.getAccess(res)
      const canManage = Boolean(access && hasDashboardCapability(access, "quality.review.manage"))
      const model = await buildDashboardQualityReviewDetailModel({
        basePath,
        projectRoot: context.projectRoot,
        ticketId: req.params.ticketId,
        actorUserId: access?.identity?.userId || "",
        currentHref: req.originalUrl || joinBasePath(basePath, `admin/quality-review/${encodeURIComponent(req.params.ticketId)}`),
        returnTo: req.query.returnTo,
        query: req.query as Record<string, unknown>,
        configService,
        runtimeBridge: qualityReviewRuntimeBridge,
        ticketWorkbenchAccessible: Boolean(access && hasDashboardCapability(access, "ticket.workbench")),
        canManage,
        ownerChoices: canManage ? await buildQualityReviewOwnerChoices(context, access?.identity?.userId) : []
      })

      if (model.available && !model.detailRecord) {
        return res.status(404).send(routeText.ticketNotFound)
      }

      renderPage(res, "admin-shell", buildAdminShell(context, "quality-review", {
        pageTitle: `${req.params.ticketId} | ${brand.title}`,
        pageEyebrow: i18n.t("qualityReview.detail.eyebrow"),
        pageHeadline: model.detailRecord
          ? i18n.t("qualityReview.detail.headline", { id: model.detailRecord.ticketId })
          : i18n.t("qualityReview.detail.unavailableTitle"),
        pageSubtitle: i18n.t("qualityReview.detail.subtitle"),
        pageAlert: getAlert(req),
        summaryCards: model.summaryCards,
        heroActions: [
          { href: model.backHref, label: i18n.t("qualityReview.detail.backAction"), variant: "secondary" }
        ],
        pageClass: "page-quality-review-detail",
        contentView: "sections/quality-review-detail",
        qualityReviewDetail: model
      }))
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "admin/quality-review/:ticketId/actions/:actionId"), adminGuard.form("quality.review.manage"), async (req, res) => {
    const action = parseQualityReviewActionId(req.params.actionId)
    const access = adminGuard.getAccess(res)
    const actorUserId = access?.identity?.userId || ""
    const returnTo = sanitizeQualityReviewReturnTo(basePath, req.body?.returnTo || req.query.returnTo)
    const detailHref = joinBasePath(basePath, `admin/quality-review/${encodeURIComponent(req.params.ticketId)}`)
    const redirectToDetail = (status: string, message: string) => {
      const params = new URLSearchParams({ status, msg: message, returnTo })
      return `${detailHref}?${params.toString()}`
    }

    if (!action) {
      await recordAdminAuditEvent(context, req, access?.identity, {
        eventType: "quality-review-action",
        target: req.params.ticketId,
        outcome: "failure",
        reason: "invalid-action",
        details: { actionId: req.params.actionId, actorUserId }
      })
      return res.redirect(redirectToDetail("warning", "Unsupported quality review action."))
    }

    if (action === "assign-owner") {
      const ownerUserId = typeof req.body?.ownerUserId === "string" ? req.body.ownerUserId.trim() : ""
      if (!await canAssignQualityReviewOwner(context, access, ownerUserId)) {
        await recordAdminAuditEvent(context, req, access?.identity, {
          eventType: "quality-review-action",
          target: req.params.ticketId,
          outcome: "failure",
          reason: "invalid-owner",
          details: { action, ownerUserId, actorUserId }
        })
        return res.redirect(redirectToDetail("warning", "Quality review owner must be a current dashboard admin."))
      }
    }

    const result = typeof runtimeBridge.runQualityReviewAction === "function"
      ? await runtimeBridge.runQualityReviewAction({
          ticketId: req.params.ticketId,
          action,
          actorUserId,
          state: typeof req.body?.state === "string" ? req.body.state : undefined,
          ownerUserId: typeof req.body?.ownerUserId === "string" ? req.body.ownerUserId : undefined,
          note: typeof req.body?.note === "string" ? req.body.note : undefined
        })
      : { ok: false, status: "warning" as const, message: "Quality review service is unavailable." }

    await recordAdminAuditEvent(context, req, access?.identity, {
      eventType: "quality-review-action",
      target: req.params.ticketId,
      outcome: result.ok ? "success" : "failure",
      reason: action,
      details: {
        action,
        actorUserId,
        status: result.status,
        warnings: result.warnings || []
      }
    })

    return res.redirect(redirectToDetail(result.status, result.message))
  })

  app.get(joinBasePath(basePath, "admin/quality-review/:ticketId/feedback/:sessionId/assets/:assetId"), adminGuard.page("quality.review.manage"), async (req, res) => {
    const access = adminGuard.getAccess(res)
    const actorUserId = access?.identity?.userId || ""
    const result = typeof runtimeBridge.resolveQualityReviewAsset === "function"
      ? await runtimeBridge.resolveQualityReviewAsset(req.params.ticketId, req.params.sessionId, req.params.assetId, actorUserId)
      : {
          status: "missing" as const,
          filePath: null,
          fileName: null,
          contentType: null,
          byteSize: 0,
          message: "Quality review service is unavailable."
        }

    res.setHeader("Cache-Control", "no-store, private")
    res.setHeader("X-Content-Type-Options", "nosniff")
    if (result.status === "expired") return res.status(410).send(result.message)
    if (result.status !== "available" || !result.filePath) return res.status(404).send(result.message)

    await recordAdminAuditEvent(context, req, access?.identity, {
      eventType: "quality-review-asset-access",
      target: req.params.ticketId,
      outcome: "success",
      reason: "raw-feedback-asset",
      details: {
        ticketId: req.params.ticketId,
        sessionId: req.params.sessionId,
        assetId: req.params.assetId,
        actorUserId,
        byteSize: result.byteSize
      }
    })

    if (result.contentType) res.type(result.contentType)
    if (result.fileName) res.setHeader("Content-Disposition", `attachment; filename="${result.fileName.replace(/"/g, "")}"`)
    return res.sendFile(result.filePath)
  })

  app.get(joinBasePath(basePath, "admin/tickets"), adminGuard.page("ticket.workbench"), async (req, res, next) => {
    try {
      const model = await buildTicketWorkbenchWorkspaceModel(
        req.query as Record<string, unknown>,
        req.originalUrl || joinBasePath(basePath, "admin/tickets"),
        qualityReviewHrefForAccess(res)
      )

      renderPage(res, "admin-shell", buildAdminShell(context, "tickets", {
        pageTitle: `${i18n.t("tickets.title")} | ${brand.title}`,
        pageEyebrow: i18n.t("tickets.page.eyebrow"),
        pageHeadline: i18n.t("tickets.page.headline"),
        pageSubtitle: i18n.t("tickets.page.subtitle"),
        pageAlert: getAlert(req),
        hidePageIntro: true,
        pageClass: "page-ticket-workbench",
        contentView: "sections/tickets",
        ticketList: model
      }))
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "admin/tickets/export/:format"), adminGuard.form("ticket.workbench"), async (req, res) => {
    const returnTo = sanitizeTicketWorkbenchReturnTo(basePath, req.body?.returnTo || req.query.returnTo)
    const format = parseDashboardExportFormat(req.params.format)
    const actor = adminGuard.getAccess(res)?.identity
    if (!format) {
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "ticket-export",
        target: "ticket-workbench",
        outcome: "failure",
        reason: "ticket-workbench-export",
        details: {
          format: String(req.params.format || ""),
          page: 0,
          limit: 0,
          rowCount: 0,
          warningCount: 0
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "warning", i18n.t("routeMessages.invalidExportFormat")))
    }

    try {
      const model = await buildTicketWorkbenchWorkspaceModel(req.body as Record<string, unknown>, returnTo, qualityReviewHrefForAccess(res))
      const payload = await buildTicketWorkbenchExportPayload(model, format)
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "ticket-export",
        target: "ticket-workbench",
        outcome: "success",
        reason: "ticket-workbench-export",
        details: getTicketWorkbenchExportAuditDetails(model, format)
      })
      return sendDashboardExport(res, payload)
    } catch {
      await recordAdminAuditEvent(context, req, actor, {
        eventType: "ticket-export",
        target: "ticket-workbench",
        outcome: "failure",
        reason: "ticket-workbench-export",
        details: {
          format,
          page: 0,
          limit: 0,
          rowCount: 0,
          warningCount: 0
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "danger", i18n.t("routeMessages.exportFailed")))
    }
  })

  app.post(joinBasePath(basePath, "admin/tickets/bulk/:actionId"), adminGuard.form("ticket.workbench"), async (req, res) => {
    const action = parseDashboardTicketBulkActionId(req.params.actionId)
    const actorUserId = adminGuard.getAccess(res)?.identity?.userId || ""
    const returnTo = sanitizeTicketWorkbenchReturnTo(basePath, req.body?.returnTo || req.query.returnTo)
    const ticketIds = normalizeStringListInput(req.body?.ticketIds)
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0 ? req.body.reason.trim() : undefined

    if (!action) {
      await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
        eventType: "ticket-bulk-action",
        target: "bulk",
        outcome: "failure",
        reason: "invalid-action",
        details: {
          actionId: req.params.actionId,
          actorUserId
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "warning", i18n.t("tickets.page.bulk.invalidAction")))
    }

    if (ticketIds.length < 1) {
      await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
        eventType: "ticket-bulk-action",
        target: "bulk",
        outcome: "failure",
        reason: "empty-selection",
        details: {
          action,
          requested: 0,
          succeeded: 0,
          skipped: 0,
          failed: 0,
          actorUserId
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "warning", i18n.t("tickets.page.bulk.emptySelection")))
    }

    const runtimeAvailable = runtimeBridge.getSnapshot(context.projectRoot).ticketSummary.available === true
    const readsSupported = supportsTicketWorkbenchReads(runtimeBridge) && runtimeAvailable
    const writesSupported = supportsTicketWorkbenchWrites(runtimeBridge) && typeof runtimeBridge.runTicketAction === "function"
    if (!readsSupported || !writesSupported) {
      await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
        eventType: "ticket-bulk-action",
        target: "bulk",
        outcome: "failure",
        reason: "unsupported",
        details: {
          action,
          requested: ticketIds.length,
          actorUserId
        }
      })
      return res.redirect(appendAlertQuery(returnTo, "warning", i18n.t("tickets.page.bulk.unsupported")))
    }

    const runtimeAction = action === "claim-self" ? "claim" : action
    const aggregate = {
      requested: ticketIds.length,
      succeeded: 0,
      skipped: 0,
      failed: 0
    }

    for (const ticketId of ticketIds) {
      const detail = typeof runtimeBridge.getTicketDetail === "function"
        ? await runtimeBridge.getTicketDetail(ticketId, actorUserId)
        : (() => {
            const ticket = runtimeBridge.listTickets().find((candidate) => candidate.id === ticketId) || null
            return ticket ? buildFallbackTicketDetail({ ticket, configService }) : null
          })()
      const availability = detail?.actionAvailability?.[runtimeAction]
      if (!detail || (availability && !availability.enabled)) {
        aggregate.skipped += 1
        continue
      }

      try {
        const result = await runtimeBridge.runTicketAction!({
          ticketId,
          action: runtimeAction,
          actorUserId,
          reason
        })
        if (result.ok) {
          aggregate.succeeded += 1
        } else if (result.status === "warning") {
          aggregate.skipped += 1
        } else {
          aggregate.failed += 1
        }
      } catch {
        aggregate.failed += 1
      }
    }

    await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "ticket-bulk-action",
      target: "bulk",
      outcome: aggregate.failed > 0 ? "failure" : "success",
      reason: action,
      details: {
        action,
        runtimeAction,
        requested: aggregate.requested,
        succeeded: aggregate.succeeded,
        skipped: aggregate.skipped,
        failed: aggregate.failed,
        actorUserId
      }
    })

    const tone = buildBulkActionTone(aggregate)
    return res.redirect(appendAlertQuery(returnTo, tone, i18n.t("tickets.page.bulk.result", aggregate)))
  })

  app.get(joinBasePath(basePath, "admin/tickets/:ticketId"), adminGuard.page("ticket.workbench"), async (req, res, next) => {
    try {
      const snapshot = runtimeBridge.getSnapshot(context.projectRoot)
      const runtimeAvailable = snapshot.ticketSummary.available === true
      const readsSupported = supportsTicketWorkbenchReads(runtimeBridge) && runtimeAvailable
      const writesSupported = supportsTicketWorkbenchWrites(runtimeBridge)
      const actorUserId = adminGuard.getAccess(res)?.identity?.userId || ""
      let detail = readsSupported && typeof runtimeBridge.getTicketDetail === "function"
        ? await runtimeBridge.getTicketDetail(req.params.ticketId, actorUserId)
        : null

      if (!detail && readsSupported) {
        const ticket = runtimeBridge.listTickets().find((candidate) => candidate.id === req.params.ticketId) || null
        detail = ticket ? buildFallbackTicketDetail({ ticket, configService }) : null
      }

      if (detail && !detail.telemetry && readsSupported && supportsTicketTelemetryReads(runtimeBridge) && runtimeBridge.getTicketTelemetrySignals) {
        try {
          const telemetrySignals = await runtimeBridge.getTicketTelemetrySignals([detail.ticket.id])
          detail = {
            ...detail,
            telemetry: telemetrySignals[detail.ticket.id] || null
          }
        } catch {
          detail = { ...detail, telemetry: null }
        }
      }

      if (readsSupported && !detail) {
        return res.status(404).send(routeText.ticketNotFound)
      }

      const model = buildTicketWorkbenchDetailModel({
        basePath,
        returnTo: req.query.returnTo,
        ticketId: req.params.ticketId,
        detail,
        writesSupported,
        readsSupported,
        warningMessage: runtimeAvailable
          ? writesSupported ? "" : "Ticket action writes are unavailable in the current dashboard runtime."
          : "The Open Ticket runtime is not exposing ticket detail to the dashboard right now.",
        t: i18n.t
      })

      renderPage(res, "admin-shell", buildAdminShell(context, "tickets", {
        pageTitle: `${detail?.ticket.id || req.params.ticketId} | ${brand.title}`,
        pageEyebrow: i18n.t("tickets.detail.eyebrow"),
        pageHeadline: detail
          ? i18n.t("tickets.detail.headline", { id: detail.ticket.id })
          : i18n.t("tickets.detail.unavailableTitle"),
        pageSubtitle: i18n.t("tickets.detail.subtitle"),
        pageAlert: getAlert(req),
        summaryCards: model.summaryCards.map((card) => metricCard(card.label, card.value, card.detail, card.tone)),
        heroActions: [
          { href: model.backHref, label: i18n.t("tickets.detail.backAction"), variant: "secondary" }
        ],
        contentView: "sections/ticket-detail",
        ticketDetail: model
      }))
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "admin/tickets/:ticketId/actions/:actionId"), adminGuard.form("ticket.workbench"), async (req, res) => {
    const requestedTicketId = req.params.ticketId
    const action = parseDashboardTicketActionId(req.params.actionId)
    const rawReturnTo = req.body?.returnTo || req.query.returnTo
    const returnTo = sanitizeTicketWorkbenchReturnTo(basePath, rawReturnTo)
    const redirectToDetail = (ticketId: string, status: string, message: string) => {
      const detailHref = joinBasePath(basePath, `admin/tickets/${encodeURIComponent(ticketId)}`)
      const params = new URLSearchParams({
        status,
        msg: message,
        returnTo
      })
      return `${detailHref}?${params.toString()}`
    }

    if (!action) {
      const message = i18n.t("tickets.detail.actionResults.unsupportedAction")
      await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
        eventType: "ticket-action",
        target: requestedTicketId,
        outcome: "failure",
        reason: "invalid-action",
        details: {
          actionId: req.params.actionId,
          actorUserId: adminGuard.getAccess(res)?.identity?.userId || null
        }
      })
      return res.redirect(redirectToDetail(requestedTicketId, "warning", message))
    }

    const actorUserId = adminGuard.getAccess(res)?.identity?.userId || ""
    const actionRequest = {
      ticketId: requestedTicketId,
      action,
      actorUserId,
      reason: typeof req.body?.reason === "string" && req.body.reason.trim().length > 0 ? req.body.reason.trim() : undefined,
      assigneeUserId: typeof req.body?.assigneeUserId === "string" ? req.body.assigneeUserId : undefined,
      targetOptionId: typeof req.body?.targetOptionId === "string" ? req.body.targetOptionId : undefined,
      newCreatorUserId: typeof req.body?.newCreatorUserId === "string" ? req.body.newCreatorUserId : undefined,
      participantUserId: typeof req.body?.participantUserId === "string" ? req.body.participantUserId : undefined,
      priorityId: typeof req.body?.priorityId === "string" ? req.body.priorityId : undefined,
      topic: typeof req.body?.topic === "string" ? req.body.topic : undefined
    }
    let result
    if (action !== "refresh" && supportsTicketWorkbenchReads(runtimeBridge) && typeof runtimeBridge.getTicketDetail === "function") {
      const preflightDetail = await runtimeBridge.getTicketDetail(requestedTicketId, actorUserId)
      const preflightAvailability = preflightDetail?.actionAvailability?.[action]
      if (!preflightDetail) {
        result = {
          ok: false,
          status: "warning" as const,
          message: "tickets.detail.actionResults.missingTicket",
          ticketId: requestedTicketId
        }
      } else if (preflightAvailability && !preflightAvailability.enabled) {
        result = {
          ok: false,
          status: "warning" as const,
          message: translateTicketWorkbenchMessage(i18n.t, preflightAvailability.reason) || i18n.t("tickets.detail.availability.genericUnavailable"),
          ticketId: requestedTicketId
        }
      }
    }

    if (!result) {
      result = typeof runtimeBridge.runTicketAction === "function" && (action === "refresh" || supportsTicketWorkbenchWrites(runtimeBridge))
        ? await runtimeBridge.runTicketAction(actionRequest)
        : action === "refresh"
          ? { ok: true, status: "success" as const, message: "tickets.detail.actionResults.refreshSuccess", ticketId: requestedTicketId }
          : {
            ok: false,
            status: "warning" as const,
            message: "tickets.detail.availability.writesUnavailable",
            ticketId: requestedTicketId
          }
    }

    if (!result.ticketId) {
      result = { ...result, ticketId: requestedTicketId }
    }

    await recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "ticket-action",
      target: requestedTicketId,
      outcome: result.ok ? "success" : "failure",
      reason: action,
      details: {
        action,
        requestedTicketId,
        resultTicketId: result.ticketId,
        actorUserId,
        status: result.status,
        warnings: "warnings" in result ? result.warnings || [] : []
      }
    })

    const resultMessage = translateTicketWorkbenchMessage(i18n.t, result.message) || result.message
    res.redirect(redirectToDetail(result.ticketId || requestedTicketId, result.status, resultMessage))
  })

  app.get(joinBasePath(basePath, "admin/transcripts"), adminGuard.page("transcript.view.global"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params)
    const request = parseTranscriptListRequest(req.query as Record<string, unknown>, t)
    const summary = integration.state === "ready" && integration.service
      ? await integration.service.getSummary()
      : null
    let result: DashboardListTranscriptsResult | DashboardTranscriptOperationalListResult | null = null
    let operationsAvailability: "available" | "unsupported" | "unavailable" = integration.state === "ready" ? "unsupported" : "unavailable"
    let operationsWarningMessage = integration.state === "ready" ? undefined : integration.message
    let retentionPreview: DashboardTranscriptRetentionPreview | null = null
    let integritySummary: DashboardTranscriptIntegritySummary | null = null
    const viewerRouteReadiness = getDashboardViewerReadiness(context.config)
    const accessPolicy = integration.state === "ready"
      && integration.service
      && typeof integration.service.getAccessPolicy === "function"
      ? await integration.service.getAccessPolicy()
      : null
    let writeAvailability: "available" | "unsupported" = "unsupported"

    if (integration.state === "ready" && integration.service) {
      if (supportsTranscriptOperationsWrites(integration.service)) {
        try {
          writeAvailability = "available"
          const operationalQuery: DashboardTranscriptOperationalListQuery = {
            limit: request.limit,
            offset: request.offset
          }

          if (request.search) operationalQuery.search = request.search
          if (request.status) operationalQuery.status = request.status
          if (request.integrity) operationalQuery.integrity = request.integrity
          if (request.retention) operationalQuery.retention = request.retention
          if (request.creatorId) operationalQuery.creatorId = request.creatorId
          if (request.channelId) operationalQuery.channelId = request.channelId
          if (request.createdFrom) operationalQuery.createdFrom = request.createdFrom
          if (request.createdTo) operationalQuery.createdTo = request.createdTo
          if (request.sortProvided || request.sort !== "created-desc") {
            operationalQuery.sort = request.sort
          }

          result = await integration.service.listOperationalTranscripts(operationalQuery)
        } catch {
          writeAvailability = "unsupported"
        }
      }

      if (!result) {
        result = await integration.service.listTranscripts({
          search: request.search || undefined,
          status: request.status || undefined,
          limit: request.limit,
          offset: request.offset
        })
      }
    }

    if (integration.state === "ready" && integration.service && supportsTranscriptOperationsReads(integration.service)) {
      const operationsService = integration.service
      const [previewOutcome, integrityOutcome] = await Promise.allSettled([
        operationsService.previewRetentionSweep!(),
        operationsService.getIntegritySummary!()
      ])

      if (previewOutcome.status === "fulfilled" && integrityOutcome.status === "fulfilled") {
        operationsAvailability = "available"
        retentionPreview = previewOutcome.value
        integritySummary = integrityOutcome.value
      } else {
        operationsAvailability = "unavailable"
        operationsWarningMessage = t("transcripts.page.operations.unavailableError")
      }
    }

    const model = buildTranscriptListModel(basePath, integration, request, summary, result, {
      translate: t,
      operationsAvailability,
      writeAvailability,
      integritySummary,
      retentionPreview,
      accessPolicy,
      viewerRouteReadiness,
      operationsWarningMessage
    })
    renderPage(res, "admin-shell", buildAdminShell(context, "transcripts", {
      pageTitle: `${i18n.t("nav.transcripts")} | ${brand.title}`,
      pageEyebrow: i18n.t("transcripts.page.eyebrow"),
      pageHeadline: i18n.t("transcripts.page.headline"),
      pageSubtitle: i18n.t("transcripts.page.subtitle"),
      pageAlert: getAlert(req),
      hidePageIntro: true,
      pageClass: "page-transcript-operations",
      contentView: "sections/transcripts",
      transcriptList: model
    }))
  })

  app.get(joinBasePath(basePath, "admin/transcripts/:target"), adminGuard.page("transcript.view.global"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const alert = getAlert(req) || buildTranscriptAvailabilityAlert(integration, { alwaysWhenUnavailable: true })
    const t = (key: string, params?: Record<string, string | number>) => i18n.t(key, params)
    const eventsRequest = parseTranscriptEventsRequest(req.query as Record<string, unknown>)
    const safeReturnTo = sanitizeTranscriptWorkspaceReturnTo(basePath, req.query.returnTo)
    const viewerRouteReadiness = getDashboardViewerReadiness(context.config)
    const accessPolicy = integration.state === "ready"
      && integration.service
      && typeof integration.service.getAccessPolicy === "function"
      ? await integration.service.getAccessPolicy()
      : null

    if (integration.state !== "ready" || !integration.service) {
      return renderPage(res, "admin-shell", buildAdminShell(context, "transcripts", {
        pageTitle: `${i18n.t("nav.transcripts")} | ${brand.title}`,
        pageEyebrow: i18n.t("transcripts.detail.eyebrow"),
        pageHeadline: i18n.t("transcripts.detail.unavailableTitle"),
        pageSubtitle: i18n.t("transcripts.detail.subtitleUnavailable"),
        pageAlert: alert,
        summaryCards: buildTranscriptSummaryCards(integration, null).map((card, index) => (
          index === 0
            ? statusCard(card.label, card.value, card.detail, card.tone)
            : metricCard(card.label, card.value, card.detail, card.tone)
        )),
        heroActions: [
          { href: safeReturnTo, label: i18n.t("transcripts.detail.backAction"), variant: "secondary" },
          { href: joinBasePath(basePath, "visual/transcripts"), label: i18n.t("transcripts.detail.configAction"), variant: "secondary" }
        ],
        contentView: "sections/transcript-detail",
        transcriptDetail: null
      }))
    }

    const detail = await integration.service.getTranscriptDetail(req.params.target)
    if (!detail) {
      return res.status(404).send(routeText.transcriptNotFound)
    }

    let operationsAvailability: "available" | "unsupported" | "unavailable" = "unsupported"
    const writeAvailability: "available" | "unsupported" = supportsTranscriptOperationsWrites(integration.service)
      ? "available"
      : "unsupported"
    let integrityReport: DashboardTranscriptIntegrityReport | null = null
    let eventsResult: DashboardListTranscriptEventsResult | null = null
    let integrityWarningMessage = t("transcripts.detail.integrity.unavailableUnsupported")
    let eventWarningMessage = t("transcripts.detail.events.unavailableUnsupported")

    if (supportsTranscriptOperationsReads(integration.service)) {
      const operationsService = integration.service
      const [integrityOutcome, eventsOutcome] = await Promise.allSettled([
        operationsService.scanTranscriptIntegrity!(req.params.target),
        operationsService.listTranscriptEvents!(req.params.target, {
          limit: eventsRequest.limit,
          offset: eventsRequest.offset
        })
      ])

      if (integrityOutcome.status === "fulfilled" && eventsOutcome.status === "fulfilled") {
        operationsAvailability = "available"
        eventsResult = eventsOutcome.value

        if (integrityOutcome.value) {
          integrityReport = integrityOutcome.value
          integrityWarningMessage = ""
        } else {
          integrityWarningMessage = t("transcripts.detail.integrity.unavailableMissing")
        }

        eventWarningMessage = ""
      } else {
        operationsAvailability = "unavailable"
        integrityWarningMessage = t("transcripts.detail.integrity.unavailableError")
        eventWarningMessage = t("transcripts.detail.events.unavailableError")
      }
    }

    const model = buildTranscriptDetailModel(basePath, integration, detail, {
      translate: t,
      operationsAvailability,
      writeAvailability,
      integrityReport,
      eventsResult,
      eventsRequest,
      accessPolicy,
      viewerRouteReadiness,
      returnTo: req.query.returnTo,
      integrityWarningMessage,
      eventWarningMessage
    })
    const integrityCard = buildTranscriptDetailIntegritySummaryCard(integrityReport, operationsAvailability, t)
    renderPage(res, "admin-shell", buildAdminShell(context, "transcripts", {
      pageTitle: `${detail.transcript.id} | ${brand.title}`,
      pageEyebrow: i18n.t("transcripts.detail.eyebrow"),
      pageHeadline: i18n.t("transcripts.detail.headline", { id: detail.transcript.id }),
      pageSubtitle: i18n.t("transcripts.detail.subtitle"),
      pageAlert: alert,
      summaryCards: [
        statusCard(
          i18n.t("transcripts.detail.summary.status"),
          detail.transcript.status.toUpperCase(),
          detail.transcript.statusReason || i18n.t("transcripts.detail.summary.noStatusReason"),
          model.transcript.statusBadge.tone
        ),
        metricCard(
          i18n.t("transcripts.detail.summary.messages"),
          String(detail.transcript.messageCount),
          i18n.t("transcripts.detail.summary.messagesDetail", { count: detail.transcript.attachmentCount })
        ),
        metricCard(
          i18n.t("transcripts.detail.summary.warnings"),
          String(detail.transcript.warningCount),
          i18n.t("transcripts.detail.summary.warningsDetail", { size: model.transcript.totalBytesLabel }),
          detail.transcript.warningCount > 0 ? "warning" : "muted"
        ),
        metricCard(
          i18n.t("transcripts.detail.summary.updated"),
          model.transcript.updatedLabel,
          i18n.t("transcripts.detail.summary.updatedDetail", { created: model.transcript.createdLabel })
        ),
        metricCard(
          integrityCard.label,
          integrityCard.value,
          integrityCard.detail,
          integrityCard.tone
        )
      ],
      heroActions: [
        { href: model.backHref, label: i18n.t("transcripts.detail.backAction"), variant: "secondary" },
        { href: model.configHref, label: i18n.t("transcripts.detail.configAction"), variant: "secondary" },
        { href: model.pluginHref, label: i18n.t("transcripts.detail.pluginAction"), variant: "subtle" }
      ],
      contentView: "sections/transcript-detail",
      transcriptDetail: model
    }))
  })

  app.post(joinBasePath(basePath, "admin/transcripts/:target/revoke"), adminGuard.form("transcript.manage"), async (req, res, next) => {
    if (req.params.target === "bulk") {
      return next()
    }

    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(integration.message)}`)
    }

    const detail = await integration.service.getTranscriptDetail(req.params.target)
    if (!detail) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(routeText.transcriptNotFound)}`)
    }

    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined
    const result = await integration.service.revokeTranscript(detail.transcript.id, reason)
    void recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "transcript-action",
      target: detail.transcript.id,
      outcome: result.ok ? "success" : "failure",
      reason: "revoke",
      details: {
        action: "revoke",
        transcriptId: detail.transcript.id,
        requestReason: reason || null,
        status: result.status
      }
    })
    const tone = result.ok ? "success" : "danger"
    res.redirect(`${joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(detail.transcript.id)}`)}?status=${tone}&msg=${encodeURIComponent(result.message)}`)
  })

  app.post(joinBasePath(basePath, "admin/transcripts/:target/reissue"), adminGuard.form("transcript.manage"), async (req, res, next) => {
    if (req.params.target === "bulk") {
      return next()
    }

    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(integration.message)}`)
    }

    const detail = await integration.service.getTranscriptDetail(req.params.target)
    if (!detail) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(routeText.transcriptNotFound)}`)
    }

    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined
    const result = await integration.service.reissueTranscript(detail.transcript.id, reason)
    void recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "transcript-action",
      target: detail.transcript.id,
      outcome: result.ok ? "success" : "failure",
      reason: "reissue",
      details: {
        action: "reissue",
        transcriptId: detail.transcript.id,
        requestReason: reason || null,
        status: result.status
      }
    })
    const tone = result.ok ? "success" : "danger"
    res.redirect(`${joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(detail.transcript.id)}`)}?status=${tone}&msg=${encodeURIComponent(result.message)}`)
  })

  app.post(joinBasePath(basePath, "admin/transcripts/:target/delete"), adminGuard.form("transcript.manage"), async (req, res, next) => {
    if (req.params.target === "bulk") {
      return next()
    }

    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(integration.message)}`)
    }

    const detail = await integration.service.getTranscriptDetail(req.params.target)
    if (!detail) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(routeText.transcriptNotFound)}`)
    }

    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined
    const result = await integration.service.deleteTranscript(detail.transcript.id, reason)
    void recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "transcript-action",
      target: detail.transcript.id,
      outcome: result.ok ? "success" : "failure",
      reason: "delete",
      details: {
        action: "delete",
        transcriptId: detail.transcript.id,
        requestReason: reason || null,
        status: result.status
      }
    })
    const tone = result.ok ? "success" : "danger"
    res.redirect(`${joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(detail.transcript.id)}`)}?status=${tone}&msg=${encodeURIComponent(result.message)}`)
  })

  app.post(joinBasePath(basePath, "admin/transcripts/bulk/revoke"), adminGuard.form("transcript.manage"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const returnTo = sanitizeTranscriptWorkspaceReturnTo(basePath, req.body?.returnTo)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=danger&msg=${encodeURIComponent(integration.message)}`)
    }
    if (!supportsTranscriptOperationsWrites(integration.service)) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=warning&msg=${encodeURIComponent(i18n.t("transcripts.page.bulk.unsupported"))}`)
    }

    const transcriptIds = Array.isArray(req.body?.transcriptIds)
      ? req.body.transcriptIds
      : typeof req.body?.transcriptIds === "string"
        ? [req.body.transcriptIds]
        : []
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined
    const result = await integration.service.bulkRevokeTranscripts(transcriptIds, reason)
    void recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "transcript-action",
      target: "bulk-revoke",
      outcome: result.failed > 0 ? "partial" : "success",
      reason: "bulk-revoke",
      details: {
        action: "bulk-revoke",
        requested: result.requested,
        succeeded: result.succeeded,
        skipped: result.skipped,
        failed: result.failed,
        requestReason: reason || null
      }
    })
    const tone = buildBulkActionTone(result)

    res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=${tone}&msg=${encodeURIComponent(result.message)}`)
  })

  app.post(joinBasePath(basePath, "admin/transcripts/bulk/delete"), adminGuard.form("transcript.manage"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const returnTo = sanitizeTranscriptWorkspaceReturnTo(basePath, req.body?.returnTo)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=danger&msg=${encodeURIComponent(integration.message)}`)
    }
    if (!supportsTranscriptOperationsWrites(integration.service)) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=warning&msg=${encodeURIComponent(i18n.t("transcripts.page.bulk.unsupported"))}`)
    }

    const transcriptIds = Array.isArray(req.body?.transcriptIds)
      ? req.body.transcriptIds
      : typeof req.body?.transcriptIds === "string"
        ? [req.body.transcriptIds]
        : []
    const reason = typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined
    const result = await integration.service.bulkDeleteTranscripts(transcriptIds, reason)
    void recordAdminAuditEvent(context, req, adminGuard.getAccess(res)?.identity, {
      eventType: "transcript-action",
      target: "bulk-delete",
      outcome: result.failed > 0 ? "partial" : "success",
      reason: "bulk-delete",
      details: {
        action: "bulk-delete",
        requested: result.requested,
        succeeded: result.succeeded,
        skipped: result.skipped,
        failed: result.failed,
        requestReason: reason || null
      }
    })
    const tone = buildBulkActionTone(result)

    res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=${tone}&msg=${encodeURIComponent(result.message)}`)
  })

  app.post(joinBasePath(basePath, "admin/transcripts/bulk/export"), adminGuard.form("transcript.manage"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const returnTo = sanitizeTranscriptWorkspaceReturnTo(basePath, req.body?.returnTo)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=danger&msg=${encodeURIComponent(integration.message)}`)
    }
    if (!supportsTranscriptOperationsWrites(integration.service)) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=warning&msg=${encodeURIComponent(i18n.t("transcripts.page.bulk.unsupported"))}`)
    }

    const transcriptIds = Array.isArray(req.body?.transcriptIds)
      ? req.body.transcriptIds
      : typeof req.body?.transcriptIds === "string"
        ? [req.body.transcriptIds]
        : []
    const result = await integration.service.prepareBulkTranscriptExport(transcriptIds)
    if (!result.ok || !result.export) {
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}status=danger&msg=${encodeURIComponent(result.message)}`)
    }

    streamPreparedTranscriptExport(
      res,
      result.export,
      () => integration.service!.releasePreparedTranscriptExport!(result.export!.exportId)
    )
  })

  app.post(joinBasePath(basePath, "admin/transcripts/:target/export"), adminGuard.form("transcript.manage"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    if (integration.state !== "ready" || !integration.service) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(integration.message)}`)
    }

    const detail = await integration.service.getTranscriptDetail(req.params.target)
    if (!detail) {
      return res.redirect(`${joinBasePath(basePath, "admin/transcripts")}?status=danger&msg=${encodeURIComponent(routeText.transcriptNotFound)}`)
    }

    const detailHref = joinBasePath(basePath, `admin/transcripts/${encodeURIComponent(detail.transcript.id)}`)
    if (!supportsTranscriptOperationsWrites(integration.service)) {
      return res.redirect(`${detailHref}?status=warning&msg=${encodeURIComponent(i18n.t("transcripts.detail.operations.exportUnavailable"))}`)
    }

    const result = await integration.service.prepareTranscriptExport(detail.transcript.id)
    if (!result.ok || !result.export) {
      return res.redirect(`${detailHref}?status=danger&msg=${encodeURIComponent(result.message)}`)
    }

    streamPreparedTranscriptExport(
      res,
      result.export,
      () => integration.service!.releasePreparedTranscriptExport!(result.export!.exportId)
    )
  })

  app.get(joinBasePath(basePath, "admin/evidence"), adminGuard.page("config.write.security"), (req, res) => {
    const verification = buildVerificationCards(context.projectRoot)
    const backupId = typeof req.query.backupId === "string" ? req.query.backupId : ""
    const configId = typeof req.query.configId === "string" ? req.query.configId : ""
    let restorePreview: Record<string, unknown> | null = null

    if (backupId && configId) {
      const definition = requireManagedConfig(configId)
      const backup = backupService.getBackup(backupId)
      if (definition && backup) {
        try {
          restorePreview = {
            backup,
            definition,
            review: prepareJsonReview(
              definition,
              configService.prettifyText(configService.readManagedText(definition.id)),
              backupService.getBackupText(backup.id, definition.id)
            ),
            restoreHref: joinBasePath(basePath, `admin/configs/${definition.id}/restore/${encodeURIComponent(backup.id)}`)
          }
        } catch {}
      }
    }

    renderPage(res, "admin-shell", buildAdminShell(context, "advanced", {
      pageTitle: `${i18n.t("backupsPage.title")} | ${brand.title}`,
      pageEyebrow: i18n.t("backupsPage.eyebrow"),
      pageHeadline: i18n.t("backupsPage.headline"),
      pageSubtitle: i18n.t("backupsPage.subtitle"),
      pageAlert: getAlert(req),
      heroActions: [
        { href: joinBasePath(basePath, "admin/advanced"), label: i18n.t("backupsPage.backAction"), variant: "secondary" }
      ],
      contentView: "sections/evidence",
      backups: backupService.listBackups().slice(0, 20),
      restorePreview,
      verification
    }))
  })
}
