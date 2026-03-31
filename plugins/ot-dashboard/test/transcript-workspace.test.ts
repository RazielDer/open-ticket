import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import { AddressInfo, Socket } from "net"
import { test } from "node:test"

import { createDashboardApp, type DashboardPluginRegistryBridge } from "../server/create-app"
import type { DashboardConfig } from "../server/dashboard-config"
import type { DashboardPluginDetail, DashboardRuntimeSnapshot } from "../server/dashboard-runtime-registry"
import type { DashboardRuntimeBridge } from "../server/runtime-bridge"
import {
  TRANSCRIPT_DASHBOARD_SERVICE_ID,
  type DashboardTranscriptDetail,
  type DashboardTranscriptEventRecord,
  type DashboardTranscriptIntegrityReport,
  type DashboardTranscriptIntegritySummary,
  type DashboardTranscriptOperationalListResult,
  type DashboardTranscriptPrepareBulkExportResult,
  type DashboardTranscriptPrepareExportResult,
  type DashboardTranscriptRetentionPreview,
  type DashboardTranscriptService,
  type DashboardTranscriptSummary
} from "../server/transcript-service-bridge"
import { createDashboardTranscriptPluginEntry } from "../../ot-html-transcripts/dashboard-workbench"

const pluginRoot = path.resolve(process.cwd(), "plugins", "ot-dashboard")

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

function createTempProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-transcripts-"))
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

function parseHiddenValue(html: string, name: string) {
  const match = html.match(new RegExp(`name="${name}" value="([^"]+)"`))
  return match
    ? match[1]
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", "\"")
      .replaceAll("&#39;", "'")
    : ""
}

function parseBodyData(html: string, key: string) {
  const match = html.match(new RegExp(`data-${key}="([^"]+)"`))
  return match ? match[1] : ""
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

function createTranscriptFixture(options: {
  includeOperationsReads?: boolean
  includeOperationsWrites?: boolean
  operationsThrow?: boolean
  scanReturnsNull?: boolean
  operationalTotal?: number
  accessPolicy?: {
    mode: "public" | "private-discord"
    viewerReady: boolean
    message: string
  }
  publicUrl?: string | null
} = {}) {
  const settings = {
    includeOperationsReads: true,
    includeOperationsWrites: true,
    operationsThrow: false,
    scanReturnsNull: false,
    accessPolicy: {
      mode: "public" as const,
      viewerReady: true,
      message: "Public transcript links are enabled."
    },
    publicUrl: "https://transcripts.example/transcripts/slug-current",
    ...options
  }
  const summary: DashboardTranscriptSummary = {
    total: 1,
    active: 1,
    partial: 0,
    revoked: 0,
    deleted: 0,
    failed: 0,
    building: 0,
    totalArchiveBytes: 5242880,
    queueDepth: 0,
    recoveredBuilds: 0
  }

  const detail: DashboardTranscriptDetail = {
    transcript: {
      id: "tr-001",
      status: "active",
      ticketId: "ticket-123",
      channelId: "channel-456",
      guildId: "guild-789",
      creatorId: "creator-1",
      deleterId: null,
      activeSlug: "slug-current",
      publicUrl: settings.publicUrl,
      archivePath: "runtime/ot-html-transcripts/transcripts/tr-001",
      statusReason: null,
      createdAt: new Date("2026-03-20T10:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-03-20T10:05:00.000Z").toISOString(),
      messageCount: 42,
      attachmentCount: 4,
      warningCount: 1,
      totalBytes: 5242880
    },
    links: [
      {
        id: "link-2",
        transcriptId: "tr-001",
        slug: "slug-current",
        status: "active",
        reason: null,
        createdAt: new Date("2026-03-20T10:05:00.000Z").toISOString(),
        expiresAt: new Date("2026-04-19T10:05:00.000Z").toISOString(),
        expiredAt: null,
        revokedAt: null,
        publicUrl: settings.publicUrl
      },
      {
        id: "link-expired",
        transcriptId: "tr-001",
        slug: "slug-expired",
        status: "expired",
        reason: "Link expired by policy.",
        createdAt: new Date("2026-03-15T10:00:00.000Z").toISOString(),
        expiresAt: new Date("2026-03-18T10:00:00.000Z").toISOString(),
        expiredAt: new Date("2026-03-18T10:00:00.000Z").toISOString(),
        revokedAt: null,
        publicUrl: settings.publicUrl ? settings.publicUrl.replace("slug-current", "slug-expired") : null
      },
      {
        id: "link-1",
        transcriptId: "tr-001",
        slug: "slug-old",
        status: "superseded",
        reason: "rotation",
        createdAt: new Date("2026-03-20T10:00:00.000Z").toISOString(),
        expiresAt: null,
        expiredAt: null,
        revokedAt: new Date("2026-03-20T10:05:00.000Z").toISOString(),
        publicUrl: settings.publicUrl ? settings.publicUrl.replace("slug-current", "slug-old") : null
      }
    ],
    participants: [
      { id: "participant-2", userId: "user-2", displayName: "Bravo User", role: "participant" },
      { id: "participant-1", userId: "user-1", displayName: "Alpha Creator", role: "creator" },
      { id: "participant-3", userId: "user-3", displayName: "Charlie Admin", role: "admin" }
    ],
    assets: [
      {
        id: "asset-2",
        assetName: "missing-attachment.png",
        sourceUrl: "https://cdn.example/missing-attachment.png",
        archiveRelativePath: null,
        mimeType: "image/png",
        byteSize: 0,
        status: "failed",
        reason: "Fetch failed"
      },
      {
        id: "asset-1",
        assetName: "avatar.png",
        sourceUrl: "https://cdn.example/avatar.png",
        archiveRelativePath: "assets/avatar.png",
        mimeType: "image/png",
        byteSize: 1200,
        status: "mirrored",
        reason: null
      }
    ]
  }

  const retentionPreview: DashboardTranscriptRetentionPreview = {
    enabled: true,
    runOnStartup: true,
    maxTranscriptsPerRun: 10,
    windows: {
      failedDays: 7,
      revokedDays: 30,
      deletedDays: 90
    },
    totalCandidates: 1,
    candidates: [
      {
        transcriptId: "tr-001",
        status: "revoked",
        updatedAt: new Date("2026-03-10T10:05:00.000Z").toISOString(),
        ageDays: 15,
        configuredDays: 30,
        archivePath: "runtime/ot-html-transcripts/transcripts/tr-001",
        totalBytes: 5242880
      }
    ]
  }

  const integritySummary: DashboardTranscriptIntegritySummary = {
    scannedAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
    total: 4,
    healthy: 2,
    warning: 1,
    error: 1,
    repairable: 1,
    skipped: 0,
    issueCounts: {
      "build-in-progress": 0,
      "unsafe-archive-path": 0,
      "archive-directory-missing": 0,
      "document-missing": 0,
      "document-invalid": 0,
      "document-transcript-mismatch": 0,
      "html-missing": 1,
      "asset-file-missing": 0,
      "asset-row-missing": 0,
      "orphan-asset-row": 0
    }
  }

  const integrityReport: DashboardTranscriptIntegrityReport = {
    transcript: detail.transcript,
    scannedAt: new Date("2026-03-25T12:00:00.000Z").toISOString(),
    health: "warning",
    issues: [
      {
        code: "html-missing",
        severity: "warning",
        message: "index.html is missing from the archive.",
        repairableActions: ["rerender-index-html"]
      }
    ],
    repairableActions: ["rerender-index-html"],
    archivePathSafe: true,
    archivePresent: true,
    documentPresent: true,
    htmlPresent: false
  }

  const eventItems: DashboardTranscriptEventRecord[] = Array.from({ length: 30 }, (_, index) => ({
    id: `event-${index + 1}`,
    transcriptId: detail.transcript.id,
    type: index === 0 || index === 25
      ? "custom-raw-event"
      : index === 26
        ? "link-expired"
        : index === 27
          ? "viewer-accessed"
        : index % 2 === 0
          ? "link-reissued"
          : "build-succeeded",
    reason: index % 3 === 0 ? "Operator review" : null,
    details: index === 0 || index === 25
      ? { detail: "raw fallback", index: null, slug: null }
      : { detail: null, index: index + 1, slug: `slug-${index + 1}` },
    createdAt: new Date(Date.parse("2026-03-25T12:00:00.000Z") - index * 60000).toISOString()
  }))

  const operationalResult: DashboardTranscriptOperationalListResult = {
    total: settings.operationalTotal ?? 1,
    matchingSummary: {
      total: settings.operationalTotal ?? 1,
      active: settings.operationalTotal ?? 1,
      partial: 0,
      revoked: 0,
      deleted: 0,
      failed: 0,
      building: 0
    },
    items: [{
      ...detail.transcript,
      integrityHealth: "warning",
      repairable: true,
      retentionCandidate: true,
      canBulkRevoke: true,
      canBulkDelete: false,
      canExport: true
    }]
  }

  const exportRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ot-dashboard-export-"))
  let exportCounter = 0

  function stagePreparedExport(fileName: string, body: string): DashboardTranscriptPrepareExportResult["export"] {
    exportCounter += 1
    const exportId = `export-${exportCounter}`
    const directory = path.join(exportRoot, exportId)
    fs.mkdirSync(directory, { recursive: true })
    const filePath = path.join(directory, fileName)
    fs.writeFileSync(filePath, body, "utf8")
    return {
      exportId,
      transcriptId: detail.transcript.id,
      format: "zip",
      fileName,
      filePath,
      contentType: "application/zip",
      byteSize: Buffer.byteLength(body, "utf8"),
      archiveIncluded: true,
      createdAt: new Date("2026-03-25T12:00:00.000Z").toISOString()
    }
  }

  function stagePreparedBulkExport(fileName: string, body: string): DashboardTranscriptPrepareBulkExportResult["export"] {
    exportCounter += 1
    const exportId = `bulk-export-${exportCounter}`
    const directory = path.join(exportRoot, exportId)
    fs.mkdirSync(directory, { recursive: true })
    const filePath = path.join(directory, fileName)
    fs.writeFileSync(filePath, body, "utf8")
    return {
      exportId,
      fileName,
      filePath,
      contentType: "application/zip",
      byteSize: Buffer.byteLength(body, "utf8"),
      exportedCount: 1,
      skippedCount: 0,
      createdAt: new Date("2026-03-25T12:00:00.000Z").toISOString()
    }
  }

  const calls = {
    list: [] as any[],
    listOperational: [] as any[],
    detail: [] as string[],
    bulkRevoke: [] as Array<{ ids: string[]; reason?: string }>,
    bulkDelete: [] as Array<{ ids: string[]; reason?: string }>,
    bulkExport: [] as string[][],
    prepareExport: [] as string[],
    releaseExport: [] as string[],
    reissue: [] as Array<{ id: string; reason?: string }>,
    retentionPreview: 0,
    integritySummary: 0,
    scan: [] as string[],
    events: [] as Array<{ target: string; limit?: number; offset?: number }>
  }

  const service: DashboardTranscriptService = {
    isHealthy() {
      return true
    },
    async getSummary() {
      return summary
    },
    async resolveTranscript() {
      return detail.transcript
    },
    async listTranscripts(query) {
      calls.list.push(query)
      return {
        total: 1,
        items: [detail.transcript]
      }
    },
    async getTranscriptDetail(target) {
      calls.detail.push(target)
      if (["tr-001", "ticket-123", "channel-456", "slug-current"].includes(target)) {
        return detail
      }
      return null
    },
    async getAccessPolicy() {
      return settings.accessPolicy
    },
    async revokeTranscript(id: string, reason?: string) {
      return { ok: true, action: "revoke", target: id, status: "ok", message: `Revoked ${id}.`, reason }
    },
    async reissueTranscript(id: string, reason?: string) {
      calls.reissue.push({ id, reason })
      return { ok: true, action: "reissue", target: id, status: "ok", message: `Reissued ${id}.`, reason }
    },
    async deleteTranscript(id: string, reason?: string) {
      return { ok: true, action: "delete", target: id, status: "ok", message: `Deleted ${id}.`, reason }
    }
  }

  if (settings.includeOperationsReads) {
    service.previewRetentionSweep = async () => {
      calls.retentionPreview += 1
      if (settings.operationsThrow) throw new Error("Retention preview failed")
      return retentionPreview
    }
    service.getIntegritySummary = async () => {
      calls.integritySummary += 1
      if (settings.operationsThrow) throw new Error("Integrity summary failed")
      return integritySummary
    }
    service.scanTranscriptIntegrity = async (target: string) => {
      calls.scan.push(target)
      if (settings.operationsThrow) throw new Error("Integrity scan failed")
      if (settings.scanReturnsNull) return null
      return integrityReport
    }
    service.listTranscriptEvents = async (target, query) => {
      calls.events.push({ target, limit: query.limit, offset: query.offset })
      if (settings.operationsThrow) throw new Error("Event history failed")
      const offset = query.offset || 0
      const limit = query.limit || eventItems.length
      return {
        total: eventItems.length,
        items: eventItems.slice(offset, offset + limit)
      }
    }
  }

  if (settings.includeOperationsWrites) {
    service.listOperationalTranscripts = async (query) => {
      calls.listOperational.push(query)
      if (query.createdFrom && query.createdTo && query.createdFrom > query.createdTo) {
        return {
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
        }
      }

      if (query.creatorId && query.creatorId !== detail.transcript.creatorId) {
        return {
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
        }
      }

      if (query.channelId && query.channelId !== detail.transcript.channelId) {
        return {
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
        }
      }

      if (query.createdFrom && detail.transcript.createdAt && detail.transcript.createdAt.slice(0, 10) < query.createdFrom) {
        return {
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
        }
      }

      if (query.createdTo && detail.transcript.createdAt && detail.transcript.createdAt.slice(0, 10) > query.createdTo) {
        return {
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
        }
      }

      return operationalResult
    }
    service.bulkRevokeTranscripts = async (ids: string[], reason?: string) => {
      calls.bulkRevoke.push({ ids, reason })
      return {
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
      }
    }
    service.bulkDeleteTranscripts = async (ids: string[], reason?: string) => {
      calls.bulkDelete.push({ ids, reason })
      return {
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
      }
    }
    service.prepareBulkTranscriptExport = async (ids: string[]) => {
      calls.bulkExport.push(ids)
      const prepared = stagePreparedBulkExport("transcripts-bulk.zip", JSON.stringify({
        manifest: "manifest.json",
        exports: ids
      }))
      return {
        ok: true,
        message: `Prepared a bundled export for ${ids.length} transcript(s).`,
        export: prepared,
        items: ids.map((transcriptId) => ({
          transcriptId,
          ok: true,
          status: "ok",
          message: `Prepared ${transcriptId}.`,
          fileName: `transcript-${transcriptId}.zip`
        }))
      }
    }
    service.prepareTranscriptExport = async (target: string) => {
      calls.prepareExport.push(target)
      const prepared = stagePreparedExport(`transcript-${target}.zip`, JSON.stringify({
        manifest: "manifest.json",
        transcriptId: target
      }))
      return {
        ok: true,
        target,
        transcriptId: target,
        message: `Prepared export for ${target}.`,
        export: prepared
      }
    }
    service.releasePreparedTranscriptExport = async (exportId: string) => {
      calls.releaseExport.push(exportId)
      const exportPath = path.join(exportRoot, exportId)
      if (!fs.existsSync(exportPath)) {
        return false
      }
      fs.rmSync(exportPath, { recursive: true, force: true })
      return true
    }
  }

  return {
    summary,
    detail,
    service,
    calls,
    integritySummary,
    retentionPreview,
    integrityReport,
    eventItems,
    cleanup() {
      fs.rmSync(exportRoot, { recursive: true, force: true })
    }
  }
}

function createReadyRuntimeBridge(service: DashboardTranscriptService): DashboardRuntimeBridge {
  const plugin = createPluginDetail()
  const snapshot = createSnapshot()
  const members = new Map([
    ["admin-user", buildRuntimeGuildMember("admin-user", ["role-admin"])]
  ])

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
      return members.get(userId) || null
    }
  }
}

function createTranscriptWorkbenchBridge(service: DashboardTranscriptService, mode = "html"): DashboardPluginRegistryBridge {
  const entry = createDashboardTranscriptPluginEntry({
    configs: {
      get(id: string) {
        if (id !== "opendiscord:transcripts") return null
        return {
          data: {
            general: {
              mode
            }
          }
        }
      }
    },
    plugins: {
      classes: {
        get(id: string) {
          return id === TRANSCRIPT_DASHBOARD_SERVICE_ID ? service : null
        }
      }
    }
  })

  return {
    async listSections(pluginId, context) {
      if (pluginId !== entry.pluginId) return []
      const staticSections = Array.isArray(entry.sections) ? [...entry.sections] : []
      const dynamicSections = entry.buildSections ? await entry.buildSections(context) : []
      return [...staticSections, ...dynamicSections]
    },
    getAssetKind() {
      return "json"
    }
  }
}

function takeCookie(response: Response, previous = "") {
  const setCookie = response.headers.get("set-cookie")
  return setCookie ? setCookie.split(";")[0] : previous
}

async function login(runtime: { baseUrl: string }) {
  let cookie = ""
  const getLogin = await fetch(`${runtime.baseUrl}/dash/login?returnTo=${encodeURIComponent("/dash/admin")}`, { redirect: "manual" })
  cookie = takeCookie(getLogin)
  await getLogin.text()

  const startResponse = await fetch(`${runtime.baseUrl}/dash/login/discord?returnTo=${encodeURIComponent("/dash/admin")}`, {
    redirect: "manual",
    headers: { cookie }
  })
  cookie = takeCookie(startResponse, cookie)
  assert.equal(startResponse.status, 302)
  const state = new URL(String(startResponse.headers.get("location") || "")).searchParams.get("state") || ""

  const loginResponse = await fetch(
    `${runtime.baseUrl}/dash/login/discord/callback?code=admin-user&state=${encodeURIComponent(state)}`,
    {
      redirect: "manual",
      headers: { cookie }
    }
  )
  cookie = takeCookie(loginResponse, cookie)

  assert.equal(loginResponse.status, 302)
  assert.equal(loginResponse.headers.get("location"), "/dash/admin")
  await loginResponse.arrayBuffer()

  return { cookie }
}

async function startTestServer(
  basePath = "/dash",
  runtimeBridge?: DashboardRuntimeBridge,
  pluginRegistryBridge?: DashboardPluginRegistryBridge
) {
  const projectRoot = createTempProjectRoot()
  const authOnlyRuntimeBridge: DashboardRuntimeBridge = runtimeBridge || {
    getSnapshot() {
      return createSnapshot()
    },
    listPlugins() {
      return []
    },
    getPluginDetail() {
      return null
    },
    listTickets() {
      return []
    },
    getRuntimeSource() {
      return null
    },
    getGuildId() {
      return "guild-1"
    },
    async resolveGuildMember(userId: string) {
      return userId === "admin-user"
        ? buildRuntimeGuildMember("admin-user", ["role-admin"])
        : null
    }
  }
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
      logoPath: "./public/assets/logo.png",
      faviconPath: "./public/assets/favicon.png"
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
        clientId: "",
        clientSecret: ""
      }
    },
    rbac: {
      ownerUserIds: [],
      roleIds: {
        reviewer: [],
        editor: [],
        admin: ["role-admin"]
      },
      userIds: {
        reviewer: [],
        editor: [],
        admin: []
      }
    }
  }

  const { app, context } = createDashboardApp({
    projectRoot,
    pluginRoot,
    configOverride: config,
    runtimeBridge: authOnlyRuntimeBridge,
    pluginRegistryBridge,
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

test("overview and transcript routes warn when html mode is configured without a runtime transcript service", async (t) => {
  const runtime = await startTestServer()
  t.after(async () => {
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const overviewHtml = await (await fetch(`${runtime.baseUrl}/dash/admin`, {
    headers: { cookie }
  })).text()
  assert.match(overviewHtml, /transcript operations are unavailable/i)
  assert.match(overviewHtml, /\/dash\/admin\/transcripts/)

  const transcriptHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(transcriptHtml, /Review transcript archives here\. Single-record actions stay on transcript detail pages, and bulk tools stay with the table below\./)
  assert.doesNotMatch(transcriptHtml, /Search transcript records, inspect archived details, and open advanced transcript actions only on the detail page\./)
  assert.match(transcriptHtml, /runtime is not registered/i)

  const visualHtml = await (await fetch(`${runtime.baseUrl}/dash/visual/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(visualHtml, /Open transcript workspace/)
  assert.match(visualHtml, /Default transcript channel ID/)
  assert.match(visualHtml, /\/dash\/admin\/transcripts/)
})

test("transcript workspace preserves advanced filter state, filtered summaries, bulk return targets, and plugin workbench behavior", async (t) => {
  const fixture = createTranscriptFixture({ operationalTotal: 60 })
  const runtime = await startTestServer(
    "/dash",
    createReadyRuntimeBridge(fixture.service),
    createTranscriptWorkbenchBridge(fixture.service)
  )
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts?q=customer&status=active&integrity=repairable&retention=candidate&creatorId=creator-1&channelId=channel-456&createdFrom=2026-03-20&createdTo=2026-03-21&sort=updated-asc&limit=50&page=2`, {
    headers: { cookie }
  })).text()
  const listCsrfToken = parseBodyData(listHtml, "csrf-token")
  const listReturnTo = parseHiddenValue(listHtml, "returnTo")
  assert.match(listHtml, /Transcript records/)
  assert.match(listHtml, /Filtered summary/)
  assert.match(listHtml, /Active filters/)
  assert.match(listHtml, /Clear filters/)
  assert.match(listHtml, /Operations overview/)
  assert.match(listHtml, /Integrity overview/)
  assert.match(listHtml, /Retention overview/)
  assert.match(listHtml, /Bulk actions/)
  assert.match(listHtml, /Revoke selected/)
  assert.match(listHtml, /Delete selected/)
  assert.match(listHtml, /Export selected/)
  assert.match(listHtml, /1 candidate\(s\)/)
  assert.match(listHtml, /Startup sweep/)
  assert.match(listHtml, />on</)
  assert.match(listHtml, /tr-001/)
  assert.match(listHtml, /https:\/\/transcripts\.example\/transcripts\/slug-current/)
  assert.match(listHtml, /Archive/)
  assert.match(listHtml, /Access/)
  assert.match(listHtml, /Creator ID/)
  assert.match(listHtml, /Channel ID/)
  assert.match(listHtml, /Created from/)
  assert.match(listHtml, /Created to/)
  assert.match(listHtml, /Least recently updated/)
  assert.equal(fixture.calls.list.length, 0)
  assert.deepEqual(fixture.calls.listOperational[0], {
    search: "customer",
    status: "active",
    integrity: "repairable",
    retention: "candidate",
    creatorId: "creator-1",
    channelId: "channel-456",
    createdFrom: "2026-03-20",
    createdTo: "2026-03-21",
    sort: "updated-asc",
    limit: 50,
    offset: 50
  })
  assert.match(listHtml, /href="\/dash\/admin\/transcripts\?limit=50">Clear filters<\/a>/)
  assert.match(listHtml, /href="\/dash\/admin\/transcripts\?q=customer&amp;status=active&amp;integrity=repairable&amp;retention=candidate&amp;creatorId=creator-1&amp;channelId=channel-456&amp;createdFrom=2026-03-20&amp;createdTo=2026-03-21&amp;sort=updated-asc&amp;limit=50">Previous<\/a>/)
  assert.match(listReturnTo, /integrity=repairable/)
  assert.match(listReturnTo, /retention=candidate/)
  assert.match(listReturnTo, /creatorId=creator-1/)
  assert.match(listReturnTo, /channelId=channel-456/)
  assert.match(listReturnTo, /createdFrom=2026-03-20/)
  assert.match(listReturnTo, /createdTo=2026-03-21/)
  assert.match(listReturnTo, /sort=updated-asc/)
  assert.match(listReturnTo, /page=2/)
  assert.equal(listHtml.includes(`/dash/admin/transcripts/tr-001?returnTo=${encodeURIComponent(listReturnTo)}`), true)
  assert.equal(fixture.calls.retentionPreview, 1)
  assert.equal(fixture.calls.integritySummary, 1)

  const bulkRevokeResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/bulk/revoke`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken: listCsrfToken,
      returnTo: listReturnTo,
      reason: "Rotate selection",
      transcriptIds: "tr-001"
    }).toString()
  })
  await bulkRevokeResponse.arrayBuffer()

  assert.equal(bulkRevokeResponse.status, 302)
  assert.match(String(bulkRevokeResponse.headers.get("location") || ""), /integrity=repairable/)
  assert.match(String(bulkRevokeResponse.headers.get("location") || ""), /retention=candidate/)
  assert.deepEqual(fixture.calls.bulkRevoke[0], { ids: ["tr-001"], reason: "Rotate selection" })

  const bulkDeleteResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/bulk/delete`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken: listCsrfToken,
      returnTo: "https://invalid.example/escape",
      reason: "Cleanup selection",
      transcriptIds: "tr-001"
    }).toString()
  })
  await bulkDeleteResponse.arrayBuffer()

  assert.equal(bulkDeleteResponse.status, 302)
  assert.match(String(bulkDeleteResponse.headers.get("location") || ""), /^\/dash\/admin\/transcripts\?status=success&msg=/)
  assert.deepEqual(fixture.calls.bulkDelete[0], { ids: ["tr-001"], reason: "Cleanup selection" })

  const bulkExportResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/bulk/export`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken: listCsrfToken,
      returnTo: listReturnTo,
      transcriptIds: "tr-001"
    }).toString()
  })
  const bulkExportBody = await bulkExportResponse.text()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(bulkExportResponse.status, 200)
  assert.match(String(bulkExportResponse.headers.get("content-disposition") || ""), /attachment; filename="transcripts-bulk\.zip"/)
  assert.match(bulkExportBody, /manifest/)
  assert.deepEqual(fixture.calls.bulkExport[0], ["tr-001"])
  assert.equal(fixture.calls.releaseExport.includes("bulk-export-1"), true)

  const detailResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/ticket-123?returnTo=${encodeURIComponent(listReturnTo)}&eventsPage=2`, {
    headers: { cookie }
  })
  const detailHtml = await detailResponse.text()
  const csrfToken = parseBodyData(detailHtml, "csrf-token")

  assert.equal(detailResponse.status, 200)
  assert.match(detailHtml, /Transcript tr-001/)
  assert.match(detailHtml, /Current public access/)
  assert.match(detailHtml, /Event history/)
  assert.match(detailHtml, /custom-raw-event/)
  assert.match(detailHtml, /Link expired/)
  assert.match(detailHtml, /Viewer accessed transcript/)
  assert.match(detailHtml, /Showing 26-30 of 30/)
  assert.match(detailHtml, /Alpha Creator/)
  assert.match(detailHtml, /missing-attachment\.png/)
  assert.match(detailHtml, /Integrity/)
  assert.match(detailHtml, /Archive path safe/)
  assert.match(detailHtml, /Expires/)
  assert.match(detailHtml, /Expired/)
  assert.match(detailHtml, /slug-expired/)
  assert.match(detailHtml, /Link expired by policy\./)
  assert.match(detailHtml, /rerender-index-html/)
  assert.match(detailHtml, /Download export/)
  assert.match(detailHtml, />Previous</)
  assert.doesNotMatch(detailHtml, /eventsPage=3/)
  assert.equal(detailHtml.includes(`href="${listReturnTo.replaceAll("&", "&amp;")}"`), true)
  assert.equal(detailHtml.includes(`eventsPage=1&amp;returnTo=${encodeURIComponent(listReturnTo)}`), true)
  assert.deepEqual(fixture.calls.scan[0], "ticket-123")
  assert.deepEqual(fixture.calls.events[0], { target: "ticket-123", limit: 25, offset: 25 })

  const reissueResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/channel-456/reissue`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken,
      reason: "Rotate link"
    }).toString()
  })
  await reissueResponse.arrayBuffer()

  assert.equal(reissueResponse.status, 302)
  assert.match(String(reissueResponse.headers.get("location") || ""), /\/dash\/admin\/transcripts\/tr-001\?status=success&msg=/)
  assert.deepEqual(fixture.calls.reissue[0], { id: "tr-001", reason: "Rotate link" })

  const detailExportResponse = await fetch(`${runtime.baseUrl}/dash/admin/transcripts/channel-456/export`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      csrfToken
    }).toString()
  })
  const detailExportBody = await detailExportResponse.text()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(detailExportResponse.status, 200)
  assert.match(String(detailExportResponse.headers.get("content-disposition") || ""), /attachment; filename="transcript-tr-001\.zip"/)
  assert.match(detailExportBody, /manifest/)
  assert.deepEqual(fixture.calls.prepareExport, ["tr-001"])
  assert.equal(fixture.calls.releaseExport.includes("export-2"), true)

  const pluginHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/plugins/ot-html-transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(pluginHtml, /Transcript workspace/)
  assert.match(pluginHtml, /Open transcript workspace/)
  assert.match(pluginHtml, /Open transcript settings/)
  assert.match(pluginHtml, /Ready/)
  assert.match(pluginHtml, /Configured mode: HTML\./)
  assert.match(pluginHtml, /Global transcript settings provide the default channel/)
  assert.match(pluginHtml, /ticket option editor/)
  assert.match(pluginHtml, /1 active, 0 partial, 0 revoked/)
  assert.match(pluginHtml, /0 deleted, 0 building/)
  assert.match(pluginHtml, /0 queued, 0 recovered on startup/)
})

test("transcript workspace drops invalid dates, keeps reversed dates visible, and suppresses default sort chips", async (t) => {
  const fixture = createTranscriptFixture()
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const invalidHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts?creatorId=creator-1&channelId=channel-456&createdFrom=2026-03-20x&createdTo=not-a-date&sort=not-a-real-sort&limit=25`, {
    headers: { cookie }
  })).text()

  assert.deepEqual(fixture.calls.listOperational[0], {
    creatorId: "creator-1",
    channelId: "channel-456",
    limit: 25,
    offset: 0
  })
  assert.match(invalidHtml, /name="createdFrom" value=""/)
  assert.match(invalidHtml, /name="createdTo" value=""/)
  assert.doesNotMatch(invalidHtml, /<strong>Sort:<\/strong>/)

  const reversedHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts?creatorId=creator-1&createdFrom=2026-03-21&createdTo=2026-03-20&sort=updated-desc`, {
    headers: { cookie }
  })).text()

  assert.deepEqual(fixture.calls.listOperational[1], {
    creatorId: "creator-1",
    createdFrom: "2026-03-21",
    createdTo: "2026-03-20",
    sort: "updated-desc",
    limit: 25,
    offset: 0
  })
  assert.match(reversedHtml, /No transcript records to show/)
  assert.match(reversedHtml, /name="createdFrom" value="2026-03-21"/)
  assert.match(reversedHtml, /name="createdTo" value="2026-03-20"/)
  assert.match(reversedHtml, /<strong>Created from:<\/strong> 2026-03-21/)
  assert.match(reversedHtml, /<strong>Created to:<\/strong> 2026-03-20/)
  assert.match(reversedHtml, /<strong>Sort:<\/strong> Recently updated/)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001?returnTo=https://invalid.example/out`, {
    headers: { cookie }
  })).text()
  assert.equal(detailHtml.includes("https://invalid.example/out"), false)
  assert.equal(detailHtml.includes('href="/dash/admin/transcripts"'), true)
})

test("transcript admin pages show private-mode and viewer-readiness notices without replacing the admin workspace", async (t) => {
  const fixture = createTranscriptFixture({
    accessPolicy: {
      mode: "private-discord",
      viewerReady: false,
      message: "Dashboard transcript viewer URLs are unavailable. Load ot-dashboard and configure a valid publicBaseUrl before issuing private transcript links."
    },
    publicUrl: null
  })
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(listHtml, /Private transcript mode/)
  assert.match(listHtml, /require Discord sign-in/i)
  assert.match(listHtml, /Viewer links cannot be issued/)
  assert.match(listHtml, /Dashboard transcript viewer URLs are unavailable/i)
  assert.match(listHtml, /Viewer routes are not ready/)
  assert.match(listHtml, /Dashboard publicBaseUrl must be set/i)
  assert.match(listHtml, /Review transcript archives here\. Single-record actions stay on transcript detail pages, and bulk tools stay with the table below\./)
  assert.doesNotMatch(listHtml, /Search transcript records, inspect archived details, and open advanced transcript actions only on the detail page\./)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001`, {
    headers: { cookie }
  })).text()
  assert.match(detailHtml, /Private transcript mode/)
  assert.match(detailHtml, /Viewer routes are not ready/)
  assert.match(detailHtml, /This transcript does not currently expose an active public URL\./)
  assert.match(detailHtml, /Revoke active link/)
  assert.match(detailHtml, /Delete archive/)
})

test("transcript pages keep inventory and detail flows when operations read methods are missing", async (t) => {
  const fixture = createTranscriptFixture({ includeOperationsReads: false })
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(listHtml, /This overview fills in when the transcript service can answer read-only archive checks again\./)
  assert.match(listHtml, /Bulk actions/)
  assert.match(listHtml, /tr-001/)
  assert.equal(fixture.calls.retentionPreview, 0)
  assert.equal(fixture.calls.integritySummary, 0)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001`, {
    headers: { cookie }
  })).text()
  assert.match(detailHtml, /Integrity data is unavailable/)
  assert.match(detailHtml, /Event history is unavailable/)
  assert.match(detailHtml, /Alpha Creator/)
  assert.match(detailHtml, /Download export/)
  assert.match(detailHtml, /Revoke active link/)
  assert.equal(fixture.calls.scan.length, 0)
  assert.equal(fixture.calls.events.length, 0)
})

test("transcript pages keep slice 09 read-only rendering when slice 10 write methods are missing", async (t) => {
  const fixture = createTranscriptFixture({ includeOperationsWrites: false })
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(listHtml, /Integrity overview/)
  assert.match(listHtml, /Retention overview/)
  assert.doesNotMatch(listHtml, /Bulk actions/)
  assert.equal(fixture.calls.list.length, 1)
  assert.equal(fixture.calls.listOperational.length, 0)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001`, {
    headers: { cookie }
  })).text()
  assert.match(detailHtml, /Download export/)
  assert.match(detailHtml, /does not expose direct transcript export downloads yet/i)
  assert.match(detailHtml, /Revoke active link/)
  assert.match(detailHtml, /Delete archive/)
})

test("transcript pages keep existing archive data visible when operations reads throw", async (t) => {
  const fixture = createTranscriptFixture({ operationsThrow: true })
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const listHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts`, {
    headers: { cookie }
  })).text()
  assert.match(listHtml, /This overview fills in when the transcript service can answer read-only archive checks again\./)
  assert.match(listHtml, /Bulk actions/)
  assert.match(listHtml, /tr-001/)
  assert.equal(fixture.calls.retentionPreview, 1)
  assert.equal(fixture.calls.integritySummary, 1)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001`, {
    headers: { cookie }
  })).text()
  assert.match(detailHtml, /Integrity data is unavailable/)
  assert.match(detailHtml, /Event history is unavailable/)
  assert.match(detailHtml, /missing-attachment\.png/)
  assert.match(detailHtml, /Download export/)
  assert.match(detailHtml, /Delete archive/)
  assert.equal(fixture.calls.scan.length, 1)
  assert.equal(fixture.calls.events.length, 1)
})

test("detail page treats a null integrity scan as an integrity-only warning while preserving event history", async (t) => {
  const fixture = createTranscriptFixture({ scanReturnsNull: true })
  const runtime = await startTestServer("/dash", createReadyRuntimeBridge(fixture.service))
  t.after(async () => {
    fixture.cleanup()
    await stopTestServer(runtime)
  })

  const { cookie } = await login(runtime)

  const detailHtml = await (await fetch(`${runtime.baseUrl}/dash/admin/transcripts/tr-001`, {
    headers: { cookie }
  })).text()
  assert.match(detailHtml, /Integrity data is unavailable/)
  assert.match(detailHtml, /The transcript service returned no integrity report for this transcript\./)
  assert.match(detailHtml, /Event history/)
  assert.match(detailHtml, /custom-raw-event/)
})
