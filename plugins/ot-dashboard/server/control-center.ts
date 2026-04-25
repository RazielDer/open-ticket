import crypto from "crypto"
import fs from "fs"
import path from "path"

import type express from "express"

import {
  createDashboardPluginSectionResolverContext,
  type DashboardPluginAssetKind,
  type DashboardPluginSection
} from "./dashboard-plugin-registry"
import type { DashboardPluginDetail, DashboardPluginInventoryItem } from "./dashboard-runtime-registry"
import { MANAGED_CONFIGS, getManagedConfig, type ManagedConfigDefinition, type ManagedConfigId } from "./config-registry"
import type { DashboardAppContext } from "./create-app"
import { joinBasePath } from "./dashboard-config"

export type PendingReviewStore = Record<string, PendingJsonReview>

export type PendingJsonReview =
  | {
      kind: "managed-config"
      id: ManagedConfigId
      candidateText: string
      sourceLabel: string
      createdAt: string
    }
  | {
      kind: "plugin-manifest"
      pluginId: string
      candidateText: string
      sourceLabel: string
      createdAt: string
    }
  | {
      kind: "plugin-asset"
      pluginId: string
      assetPath: string
      assetKind: DashboardPluginAssetKind
      candidateText: string
      sourceLabel: string
      createdAt: string
    }

export type DashboardTone = "success" | "warning" | "danger" | "muted"

export interface DashboardStatusStrip {
  tone: DashboardTone
  label: string
  updatedLabel: string
  detail: string
  attentionLabel: string
}

export interface DashboardSummaryCardInput {
  label: string
  value: string
  detail: string
  kind?: "status" | "metric"
  tone?: DashboardTone
}

const PLUGIN_INVENTORY_GROUPS = [
  { id: "needs-attention", titleKey: "addOns.status.needsAttention" },
  { id: "running", titleKey: "addOns.status.running" },
  { id: "installed-not-loaded", titleKey: "addOns.status.installedNotLoaded" },
  { id: "disabled", titleKey: "addOns.status.disabled" }
] as const

type DashboardPluginInventoryGroupId = (typeof PLUGIN_INVENTORY_GROUPS)[number]["id"]

export function formatDate(value: string | number | null | undefined) {
  if (!value) return "Unavailable"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unavailable"
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

export function getAlert(req: express.Request) {
  const message = typeof req.query.msg === "string" ? req.query.msg : ""
  if (!message) return null
  const rawTone = typeof req.query.status === "string" ? req.query.status : "success"
  const tone = rawTone === "error" || rawTone === "danger"
    ? "danger"
    : rawTone === "warning"
      ? "warning"
      : rawTone === "muted"
        ? "muted"
        : "success"
  return { tone, message }
}

export function getPendingReviewStore(req: express.Request) {
  const session = req.session as any
  session.pendingJsonReviews = session.pendingJsonReviews || {}
  return session.pendingJsonReviews as PendingReviewStore
}

export function stashPendingReview(req: express.Request, review: PendingJsonReview) {
  const token = crypto.randomBytes(16).toString("hex")
  getPendingReviewStore(req)[token] = review
  return token
}

export function consumePendingReview(req: express.Request, token: string) {
  const store = getPendingReviewStore(req)
  const review = store[token]
  delete store[token]
  return review || null
}

export function buildAdminNav(context: DashboardAppContext, activeKey: string) {
  const { basePath, i18n } = context
  const items = [
    { key: "home", label: i18n.t("nav.home"), href: joinBasePath(basePath, "admin"), requiredCapability: "admin.shell" },
    { key: "tickets", label: i18n.t("nav.tickets"), href: joinBasePath(basePath, "admin/tickets"), requiredCapability: "ticket.workbench" },
    { key: "analytics", label: i18n.t("nav.analytics"), href: joinBasePath(basePath, "admin/analytics"), requiredCapability: "analytics.view" },
    { key: "transcripts", label: i18n.t("nav.transcripts"), href: joinBasePath(basePath, "admin/transcripts"), requiredCapability: "transcript.view.global" },
    { key: "addons", label: i18n.t("nav.addOns"), href: joinBasePath(basePath, "admin/plugins"), requiredCapability: "plugin.manage" },
    { key: "advanced", label: i18n.t("nav.advanced"), href: joinBasePath(basePath, "admin/advanced"), requiredCapability: "config.write.security" }
  ]

  return items.map((item) => ({
    ...item,
    active: item.key === activeKey
  }))
}

function buildAvailabilityLabel(context: DashboardAppContext, availability: string) {
  switch (availability) {
    case "ready":
      return context.i18n.t("shell.status.ready")
    case "starting":
      return context.i18n.t("shell.status.starting")
    case "degraded":
      return context.i18n.t("shell.status.degraded")
    default:
      return context.i18n.t("shell.status.unavailable")
  }
}

export function buildStatusStrip(
  context: DashboardAppContext,
  snapshot: ReturnType<DashboardAppContext["runtimeBridge"]["getSnapshot"]>
): DashboardStatusStrip {
  const tone = snapshot.availability === "ready"
    ? "success"
    : snapshot.availability === "starting"
      ? "muted"
      : snapshot.availability === "degraded"
        ? "warning"
        : "danger"

  return {
    tone,
    label: context.i18n.t("shell.statusHeading"),
    updatedLabel: context.i18n.t("shell.statusUpdated", {
      capturedAt: formatDate(snapshot.capturedAt)
    }),
    detail: context.i18n.t("shell.statusDetails", {
      plugins: snapshot.pluginSummary.discovered,
      tickets: snapshot.ticketSummary.total
    }),
    attentionLabel: buildAvailabilityLabel(context, snapshot.availability)
  }
}

export function buildActionCards(
  context: DashboardAppContext,
  snapshot: ReturnType<DashboardAppContext["runtimeBridge"]["getSnapshot"]>,
  options: {
    pluginId?: string | null
  } = {}
) {
  return context.actionProviderBridge.list(snapshot, { pluginId: options.pluginId ?? null }).map((provider) => ({
    id: provider.id,
    title: provider.title,
    pluginId: provider.pluginId || null,
    available: provider.availability.available,
    reason: provider.availability.reason || "",
    actions: provider.actions.map((action) => ({
      ...action,
      href: joinBasePath(context.basePath, `admin/actions/${provider.id}/${encodeURIComponent(action.id)}`),
      confirmationText: action.confirmation.text
    }))
  }))
}

export function buildAdminShell(
  context: DashboardAppContext,
  activeKey: string,
  locals: {
    pageTitle: string
    pageEyebrow: string
    pageHeadline: string
    pageSubtitle: string
    summaryCards?: DashboardSummaryCardInput[]
    heroActions?: Array<{ href: string; label: string; variant?: string; target?: string; rel?: string }>
    pageAlert?: { tone: string; message: string } | null
    contentView: string
    includeJsonEditor?: boolean
    hidePageIntro?: boolean
    [key: string]: unknown
  }
) {
  const snapshot = context.runtimeBridge.getSnapshot(context.projectRoot)
  const navItems = buildAdminNav(context, activeKey)
  return {
    ...locals,
    navItems,
    statusStrip: buildStatusStrip(context, snapshot),
    landingHref: joinBasePath(context.basePath, ""),
    healthHref: joinBasePath(context.basePath, "health"),
    logoutAction: joinBasePath(context.basePath, "logout"),
    heroActions: locals.heroActions || [],
    pageClass: String(locals.pageClass || ""),
    pageAlert: locals.pageAlert || null,
    hidePageIntro: locals.hidePageIntro === true,
    summaryCards: (locals.summaryCards || []).map((card) => ({
      ...card,
      kind: card.kind || "metric"
    })),
    includeJsonEditor: locals.includeJsonEditor === true,
    snapshot
  }
}

export function buildConfigItems(context: DashboardAppContext) {
  return MANAGED_CONFIGS.map((definition) => {
    const value = context.configService.readManagedJson<any>(definition.id)
    const entryCount = Array.isArray(value) ? value.length : Object.keys(value || {}).length
    const sectionCount = Array.isArray(value) ? value.length : Object.keys(value || {}).length

    return {
      ...definition,
      title: context.i18n.t(definition.titleKey),
      description: context.i18n.t(definition.descriptionKey),
      entryCount,
      sectionCount,
      kindLabel: definition.kind === "array" ? "Array config" : "Object config",
      controlHref: joinBasePath(context.basePath, `admin/configs/${definition.id}`),
      visualHref: joinBasePath(context.basePath, definition.visualPath),
      rawHref: joinBasePath(context.basePath, definition.rawPath),
      exportHref: joinBasePath(context.basePath, `admin/configs/${definition.id}/export`),
      searchText: [
        definition.id,
        definition.fileName,
        context.i18n.t(definition.titleKey),
        context.i18n.t(definition.descriptionKey)
      ].join(" ").toLowerCase()
    }
  })
}

export function buildSectionLinks(definition: ManagedConfigDefinition, value: any) {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      anchor: `section-${index + 1}`,
      label: String(item?.name || item?.id || `${definition.id} ${index + 1}`),
      detail: String(item?.type || item?.description || item?.mode || `Entry ${index + 1}`)
    }))
  }

  return Object.entries(value || {}).map(([key, child]) => ({
    anchor: `section-${key}`,
    label: key,
    detail: Array.isArray(child)
      ? `${child.length} entries`
      : child && typeof child === "object"
        ? `${Object.keys(child as Record<string, unknown>).length} keys`
        : typeof child
  }))
}

export function buildParityWarnings(id: ManagedConfigId) {
  const warnings: Record<ManagedConfigId, string[]> = {
    general: [
      "Visual editing covers the common dashboard-facing fields. Raw JSON remains the safest path for rarely used nested objects and future runtime keys."
    ],
    options: [
      "Visual option editing preserves advanced nested ticket data, but raw JSON remains authoritative for structures the modal does not expose directly."
    ],
    panels: [
      "Panel layout helpers stay in sync with current checker rules, but raw JSON remains available for large embed payloads and future plugin-dependent keys."
    ],
    questions: [
      "The guided editor enforces current question constraints. Use raw JSON when you need a full-fidelity review of the stored schema."
    ],
    "support-teams": [
      "Support-team edits are admin-only because team ids are referenced by ticket-option routing and escalation guards."
    ],
    "integration-profiles": [
      "Integration profile backups redact provider-declared secret settings. Restores keep existing secret values when a redacted placeholder is applied."
    ],
    transcripts: [
      "Transcript styling changes can be extensive. Review the raw JSON before applying broad import or restore operations."
    ]
  }

  return warnings[id] || []
}

export function buildConfigDetailModel(context: DashboardAppContext, definition: ManagedConfigDefinition, textOverride?: string) {
  const text = textOverride ?? context.configService.prettifyText(context.configService.readManagedText(definition.id))
  let value: any = null
  try {
    value = JSON.parse(text)
  } catch {
    value = definition.kind === "array" ? [] : {}
  }
  return {
    definition,
    currentText: text,
    sectionLinks: buildSectionLinks(definition, value),
    parityWarnings: buildParityWarnings(definition.id),
    backupItems: context.backupService.listBackups().slice(0, 12).map((backup) => ({
      ...backup,
      previewHref: joinBasePath(context.basePath, `admin/evidence?backupId=${encodeURIComponent(backup.id)}&configId=${definition.id}`),
      restoreHref: joinBasePath(context.basePath, `admin/configs/${definition.id}/restore/${encodeURIComponent(backup.id)}`)
    }))
  }
}

function describePluginStatus(
  context: DashboardAppContext,
  plugin: Pick<DashboardPluginInventoryItem, "crashed" | "executed" | "enabled" | "hasManifest">
) {
  if (plugin.crashed) return { label: context.i18n.t("addOns.status.needsAttention"), tone: "danger" }
  if (plugin.executed) return { label: context.i18n.t("addOns.status.running"), tone: "success" }
  if (plugin.enabled === false) return { label: context.i18n.t("addOns.status.disabled"), tone: "muted" }
  if (plugin.hasManifest) return { label: context.i18n.t("addOns.status.installedNotLoaded"), tone: "warning" }
  return { label: context.i18n.t("addOns.status.needsAttention"), tone: "warning" }
}

function describePluginInventoryGroup(
  plugin: Pick<DashboardPluginInventoryItem, "crashed" | "executed" | "enabled" | "hasManifest">
): DashboardPluginInventoryGroupId {
  if (plugin.crashed) return "needs-attention"
  if (plugin.executed) return "running"
  if (plugin.enabled === false) return "disabled"
  if (plugin.hasManifest) return "installed-not-loaded"
  return "needs-attention"
}

function formatPluginSource(context: DashboardAppContext, source: DashboardPluginInventoryItem["source"]) {
  switch (source) {
    case "manifest":
      return context.i18n.t("addOns.sources.manifest")
    case "runtime":
      return context.i18n.t("addOns.sources.runtime")
    default:
      return context.i18n.t("addOns.sources.runtimeAndManifest")
  }
}

export function buildPluginInventoryItems(context: DashboardAppContext) {
  return context.pluginManagementService.listPlugins().map((plugin) => {
    const status = describePluginStatus(context, plugin)
    const groupId = describePluginInventoryGroup(plugin)
    const assetPreview = plugin.configEntryPoints.slice(0, 2)
    const tagPreview = plugin.tags.slice(0, 4)
    return {
      ...plugin,
      status,
      groupId,
      sortLabel: (plugin.name || plugin.id).toLocaleLowerCase("en-US"),
      authorsLabel: plugin.authors.join(", ") || context.i18n.t("addOns.authorsUnknown"),
      sourceLabel: formatPluginSource(context, plugin.source),
      detailHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(plugin.id)}`),
      manifestExportHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(plugin.id)}/manifest/export`),
      assetPreview,
      remainingAssetCount: Math.max(plugin.configEntryPoints.length - assetPreview.length, 0),
      tagPreview,
      remainingTagCount: Math.max(plugin.tags.length - tagPreview.length, 0),
      searchText: [
        plugin.id,
        plugin.name,
        plugin.shortDescription,
        plugin.tags.join(" "),
        plugin.authors.join(" "),
        plugin.configEntryPoints.join(" "),
        status.label,
        formatPluginSource(context, plugin.source)
      ].join(" ").toLowerCase()
    }
  })
}

export function buildPluginInventoryGroups(
  context: DashboardAppContext,
  items = buildPluginInventoryItems(context)
) {
  return PLUGIN_INVENTORY_GROUPS
    .map((group) => {
      const groupItems = items
        .filter((item) => item.groupId === group.id)
        .sort((left, right) => {
          const byLabel = left.sortLabel.localeCompare(right.sortLabel, "en-US", { sensitivity: "base" })
          return byLabel !== 0 ? byLabel : left.id.localeCompare(right.id, "en-US", { sensitivity: "base" })
        })

      if (groupItems.length === 0) return null

      return {
        id: group.id,
        title: context.i18n.t(group.titleKey),
        countLabel: context.i18n.t("addOns.inventoryCount", { count: groupItems.length }),
        items: groupItems
      }
    })
    .filter(Boolean)
}

function formatList(values: string[], fallback = "None declared") {
  return values.length > 0 ? values.join(", ") : fallback
}

function buildPluginSectionModels(sections: DashboardPluginSection[]) {
  return sections.map((section) => ({
    ...section,
    items: "items" in section ? [...section.items] : undefined,
    summaryItems: "summaryItems" in section && Array.isArray(section.summaryItems)
      ? section.summaryItems.map((item) => ({ ...item }))
      : undefined,
    badge: "badge" in section && section.badge ? { ...section.badge } : undefined,
    actions: "actions" in section && Array.isArray(section.actions)
      ? section.actions.map((action) => ({ ...action }))
      : undefined
  }))
}

export async function buildPluginDetailModel(context: DashboardAppContext, detail: DashboardPluginDetail) {
  const backups = context.pluginManagementService.listBackups(detail.id).slice(0, 12)
  return {
    ...detail,
    status: describePluginStatus(context, detail),
    sourceLabel: formatPluginSource(context, detail.source),
    authorsLabel: detail.authors.join(", ") || context.i18n.t("addOns.authorsUnknown"),
    supportedVersionsLabel: formatList(detail.supportedVersions, context.i18n.t("addOns.supportedVersionsNone")),
    requiredPluginsLabel: formatList(detail.requiredPlugins),
    incompatiblePluginsLabel: formatList(detail.incompatiblePlugins),
    missingDependenciesLabel: formatList(detail.missingDependencies, context.i18n.t("addOns.detail.compatibility.noneMissing")),
    missingRequiredPluginsLabel: formatList(detail.missingRequiredPlugins, context.i18n.t("addOns.detail.compatibility.noneMissing")),
    activeIncompatiblePluginsLabel: formatList(detail.activeIncompatiblePlugins, context.i18n.t("addOns.detail.compatibility.noneActive")),
    crashReasonLabel: detail.crashReason || context.i18n.t("addOns.detail.compatibility.noCrashReason"),
    manifestAvailabilityLabel: detail.hasManifest
      ? context.i18n.t("addOns.detail.overview.manifestAvailable")
      : context.i18n.t("addOns.detail.overview.manifestUnavailable"),
    manifestReviewAction: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(detail.id)}/manifest/review`),
    manifestExportHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(detail.id)}/manifest/export`),
    backupCreateAction: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(detail.id)}/backups/create`),
    assetItems: detail.editableAssets.map((asset) => {
      const assetId = context.pluginManagementService.encodeAssetId(asset.relativePath)
      return {
        ...asset,
        assetId,
        detailHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(detail.id)}/assets/${assetId}`),
        exportHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(detail.id)}/assets/${assetId}/export`)
      }
    }),
    backupItems: backups.map((backup) => ({
      ...backup,
      createdLabel: formatDate(backup.createdAt),
      fileCount: backup.files.length
    })),
    registrySections: buildPluginSectionModels(await context.pluginRegistryBridge.listSections(
      detail.id,
      createDashboardPluginSectionResolverContext(context.basePath)
    ))
  }
}

export function buildPluginAssetDetailModel(
  context: DashboardAppContext,
  pluginId: string,
  assetId: string,
  textOverride?: string
) {
  const plugin = context.pluginManagementService.getPluginDetail(pluginId)
  const asset = context.pluginManagementService.getAsset(pluginId, assetId)
  if (!plugin || !asset) {
    return null
  }

  const currentText = textOverride ?? context.pluginManagementService.readAssetText(pluginId, assetId)
  const backups = context.pluginManagementService.listBackups(pluginId)
    .filter((backup) => backup.files.some((file) => file.relativePath === asset.relativePath))
    .slice(0, 12)

  return {
    plugin,
    asset: {
      ...asset,
      assetId,
      currentText,
      exportHref: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(plugin.id)}/assets/${assetId}/export`),
      reviewAction: joinBasePath(context.basePath, `admin/plugins/${encodeURIComponent(plugin.id)}/assets/${assetId}/review`)
    },
    backupItems: backups.map((backup) => ({
      ...backup,
      createdLabel: formatDate(backup.createdAt),
      restoreHref: joinBasePath(
        context.basePath,
        `admin/plugins/${encodeURIComponent(plugin.id)}/assets/${assetId}/restore/${encodeURIComponent(backup.id)}`
      )
    }))
  }
}

export function buildVerificationCards(projectRoot: string) {
  const verificationPath = path.resolve(projectRoot, "evidence", "ot-dashboard-plugin-self-containment-verification.md")
  const exists = fs.existsSync(verificationPath)
  const updatedAt = exists ? formatDate(fs.statSync(verificationPath).mtime.toISOString()) : "Not written yet"

  return {
    verificationPath,
    exists,
    updatedAt,
    commands: [
      "npm --prefix plugins/ot-dashboard run build:editor",
      "npm run typecheck",
      "npm run build",
      "node --test dist/plugins/ot-dashboard/test"
    ]
  }
}

export function requireManagedConfig(id: string) {
  return getManagedConfig(id)
}
