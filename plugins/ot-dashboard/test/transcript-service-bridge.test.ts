import assert from "node:assert/strict"
import { test } from "node:test"

import type { DashboardConfigService } from "../server/config-service"
import type { DashboardPluginDetail, DashboardRuntimeSnapshot } from "../server/dashboard-runtime-registry"
import type { DashboardRuntimeBridge } from "../server/runtime-bridge"
import {
  DASHBOARD_TRANSCRIPT_ACCESS_MODES,
  DASHBOARD_TRANSCRIPT_LINK_STATUSES,
  TRANSCRIPT_DASHBOARD_SERVICE_ID,
  resolveTranscriptIntegration,
  supportsTranscriptOperationsReads,
  supportsTranscriptOperationsWrites,
  supportsTranscriptStylePreview,
  supportsTranscriptViewerAccess,
  type DashboardTranscriptService
} from "../server/transcript-service-bridge"

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

function createConfigService(mode = "html") {
  return {
    readManagedJson() {
      return { general: { mode } }
    }
  } as unknown as DashboardConfigService
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
    warnings: [],
    ...overrides
  }
}

function createService(
  healthy = true,
  includeOperationsReads = false,
  includeOperationsWrites = false,
  includeViewerAccess = false,
  includeStylePreview = false
): DashboardTranscriptService {
  const service: DashboardTranscriptService = {
    isHealthy() {
      return healthy
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
        mode: "public",
        viewerReady: true,
        message: "Public transcript links are enabled."
      }
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

  if (includeOperationsReads) {
    service.listTranscriptEvents = async () => ({ total: 0, items: [] })
    service.previewRetentionSweep = async () => ({
      enabled: false,
      runOnStartup: false,
      maxTranscriptsPerRun: 0,
      windows: { failedDays: 0, revokedDays: 0, deletedDays: 0 },
      totalCandidates: 0,
      candidates: []
    })
    service.getIntegritySummary = async () => ({
      scannedAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
      total: 0,
      healthy: 0,
      warning: 0,
      error: 0,
      repairable: 0,
      skipped: 0,
      issueCounts: {
        "build-in-progress": 0,
        "unsafe-archive-path": 0,
        "archive-directory-missing": 0,
        "document-missing": 0,
        "document-invalid": 0,
        "document-transcript-mismatch": 0,
        "html-missing": 0,
        "asset-file-missing": 0,
        "asset-row-missing": 0,
        "orphan-asset-row": 0
      }
    })
    service.scanTranscriptIntegrity = async () => null
  }

  if (includeOperationsWrites) {
    service.prepareTranscriptExport = async (target: string) => ({
      ok: true,
      target,
      transcriptId: target,
      message: "prepared",
      export: {
        exportId: "export-1",
        transcriptId: target,
        format: "zip",
        fileName: `transcript-${target}.zip`,
        filePath: `C:/tmp/transcript-${target}.zip`,
        contentType: "application/zip",
        byteSize: 10,
        archiveIncluded: true,
        createdAt: new Date("2026-03-25T12:00:00.000Z").toISOString()
      }
    })
    service.releasePreparedTranscriptExport = async () => true
    service.listOperationalTranscripts = async () => ({
      total: 0,
      matchingSummary: {
        total: 0,
        active: 0,
        partial: 0,
        revoked: 0,
        deleted: 0,
        failed: 0,
        building: 0
      },
      items: []
    })
    service.bulkRevokeTranscripts = async () => ({
      action: "revoke",
      requested: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      items: [],
      message: "bulk revoke"
    })
    service.bulkDeleteTranscripts = async () => ({
      action: "delete",
      requested: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      items: [],
      message: "bulk delete"
    })
    service.prepareBulkTranscriptExport = async () => ({
      ok: true,
      message: "bulk export",
      export: {
        exportId: "bulk-export-1",
        fileName: "transcripts-bulk.zip",
        filePath: "C:/tmp/transcripts-bulk.zip",
        contentType: "application/zip",
        byteSize: 10,
        exportedCount: 0,
        skippedCount: 0,
        createdAt: new Date("2026-03-25T12:00:00.000Z").toISOString()
      },
      items: []
    })
  }

  if (includeViewerAccess) {
    service.listViewerAccessibleTranscripts = async () => ({
      total: 1,
      items: [{
        id: "tr-1",
        status: "active",
        ticketId: "ticket-1",
        channelId: "channel-1",
        guildId: "guild-1",
        creatorId: "creator-1",
        deleterId: null,
        activeSlug: "slug-1",
        publicUrl: "https://records.example/transcripts/slug-1",
        archivePath: "/archives/tr-1",
        statusReason: null,
        createdAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
        messageCount: 1,
        attachmentCount: 0,
        warningCount: 0,
        totalBytes: 1,
        accessPath: "creator-current-guild"
      }]
    })
    service.renderViewerTranscript = async () => ({
      status: "ok",
      message: "",
      html: "<html></html>",
      contentSecurityPolicy: "default-src 'none'",
      accessPath: "creator-current-guild"
    })
    service.resolveViewerTranscriptAsset = async () => ({
      status: "ok",
      message: "",
      filePath: "C:/tmp/asset.png",
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
      accessPath: "creator-current-guild"
    })
  }

  if (includeStylePreview) {
    service.listTranscriptStylePresets = async () => [{
      id: "discord-classic",
      label: "Discord Classic",
      description: "Keeps the familiar Discord charcoal and gold transcript look.",
      draft: {
        background: { enableCustomBackground: true, backgroundColor: "#101318", backgroundImage: "" },
        header: { enableCustomHeader: true, backgroundColor: "#202225", decoColor: "#f8ba00", textColor: "#ffffff" },
        stats: { enableCustomStats: true, backgroundColor: "#202225", keyTextColor: "#8b919c", valueTextColor: "#ffffff", hideBackgroundColor: "#40444a", hideTextColor: "#ffffff" },
        favicon: { enableCustomFavicon: false, imageUrl: "" }
      }
    }]
    service.renderTranscriptStylePreview = async () => ({
      status: "ok",
      message: "",
      html: "<html><body>preview</body></html>",
      contentSecurityPolicy: "default-src 'none'; frame-ancestors 'self'"
    })
  }

  return service
}

function createRuntimeBridge(options: {
  plugin?: DashboardPluginDetail | null
  service?: DashboardTranscriptService | null
  runtimeAvailable?: boolean
}): DashboardRuntimeBridge {
  const snapshot = createSnapshot()
  return {
    getSnapshot() {
      return snapshot
    },
    listPlugins() {
      return options.plugin ? [options.plugin] : []
    },
    getPluginDetail(_projectRoot, pluginId) {
      return options.plugin && pluginId === options.plugin.id ? options.plugin : null
    },
    listTickets() {
      return []
    },
    getRuntimeSource() {
      if (options.runtimeAvailable === false) return null
      return {
        processStartupDate: new Date("2026-03-25T11:59:00.000Z"),
        readyStartupDate: new Date("2026-03-25T12:00:00.000Z"),
        plugins: {
          getAll() {
            return []
          },
          classes: {
            get(id: string) {
              return id === TRANSCRIPT_DASHBOARD_SERVICE_ID ? options.service || null : null
            }
          }
        }
      }
    }
  }
}

test("resolveTranscriptIntegration reports runtime-unavailable when no runtime is registered", () => {
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: createPluginDetail(),
      runtimeAvailable: false
    })
  )

  assert.equal(integration.state, "runtime-unavailable")
  assert.equal(integration.htmlMode, true)
  assert.match(integration.message, /not registered/i)
})

test("resolveTranscriptIntegration reports missing-plugin when runtime exists without the transcript plugin", () => {
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: null,
      service: null
    })
  )

  assert.equal(integration.state, "missing-plugin")
  assert.match(integration.message, /not installed/i)
})

test("resolveTranscriptIntegration reports missing-service when the plugin exists without a registered class", () => {
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: createPluginDetail(),
      service: null
    })
  )

  assert.equal(integration.state, "missing-service")
  assert.match(integration.message, /service/i)
})

test("resolveTranscriptIntegration reports unhealthy when the service is present but failing health checks", () => {
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: createPluginDetail(),
      service: createService(false)
    })
  )

  assert.equal(integration.state, "unhealthy")
  assert.match(integration.message, /unhealthy/i)
})

test("resolveTranscriptIntegration reports ready when the transcript service is healthy", () => {
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: createPluginDetail(),
      service: createService(true)
    })
  )

  assert.equal(integration.state, "ready")
  assert.equal(integration.service?.isHealthy(), true)
  assert.equal(integration.plugin?.id, "ot-html-transcripts")
})

test("resolveTranscriptIntegration stays ready when the base service is healthy but operations reads are absent", () => {
  const service = createService(true, false)
  const integration = resolveTranscriptIntegration(
    process.cwd(),
    createConfigService("html"),
    createRuntimeBridge({
      plugin: createPluginDetail(),
      service
    })
  )

  assert.equal(integration.state, "ready")
  assert.equal(supportsTranscriptOperationsReads(integration.service), false)
})

test("supportsTranscriptOperationsReads detects the additive read-only operations surface", () => {
  const service = createService(true, true)
  assert.equal(supportsTranscriptOperationsReads(service), true)
})

test("supportsTranscriptOperationsWrites detects the additive bulk and export surface", () => {
  const service = createService(true, true, true)
  assert.equal(supportsTranscriptOperationsWrites(service), true)
})

test("supportsTranscriptViewerAccess detects the private viewer service surface", () => {
  const service = createService(true, false, false, true)
  assert.equal(supportsTranscriptViewerAccess(service), true)
})

test("supportsTranscriptStylePreview detects the transcript preset and preview surface", () => {
  const service = createService(true, false, false, false, true)
  assert.equal(supportsTranscriptStylePreview(service), true)
})

test("dashboard bridge exposes the additive expired transcript link status", () => {
  assert.equal(DASHBOARD_TRANSCRIPT_LINK_STATUSES.includes("expired"), true)
})

test("dashboard bridge exposes the locked transcript access modes", () => {
  assert.deepEqual(DASHBOARD_TRANSCRIPT_ACCESS_MODES, ["public", "private-discord"])
})
