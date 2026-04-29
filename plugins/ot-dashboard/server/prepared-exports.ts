import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import type { DashboardRuntimeBridge } from "./runtime-bridge"
import type {
  DashboardPreparedDataExportRecord,
  DashboardPreparedExportFormat,
  DashboardPreparedExportScope
} from "./ticket-workbench-types"

export const DASHBOARD_PREPARED_EXPORTS_CATEGORY = "opendiscord:dashboard:prepared-exports"
export const DASHBOARD_PREPARED_EXPORT_TTL_MS = 30 * 60 * 1000

type DashboardPreparedExportDatabase = {
  get?: (category: string, key: string) => unknown | Promise<unknown>
  set?: (category: string, key: string, value: unknown) => unknown | Promise<unknown>
  delete?: (category: string, key: string) => unknown | Promise<unknown>
  getCategory?: (category: string) => Array<{ key: string; value: unknown }> | undefined | Promise<Array<{ key: string; value: unknown }> | undefined>
}

export interface DashboardPreparedExportPayload {
  scope: DashboardPreparedExportScope
  format: DashboardPreparedExportFormat
  createdByUserId: string
  fileName: string
  contentType: string
  body: Buffer | string
  now?: number
}

export type DashboardPreparedExportReleaseResult =
  | { status: "available"; record: DashboardPreparedDataExportRecord; body: Buffer }
  | { status: "missing" | "expired" | "denied" }

function preparedExportRoot(projectRoot: string) {
  return path.resolve(projectRoot, "runtime", "ot-dashboard", "prepared-exports")
}

function getPreparedExportDatabase(runtimeBridge: DashboardRuntimeBridge): DashboardPreparedExportDatabase | null {
  const runtime = runtimeBridge.getRuntimeSource?.() as any
  try {
    return runtime?.databases?.get?.("opendiscord:global") || null
  } catch {
    return null
  }
}

function generateExportId() {
  const value = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : crypto.randomBytes(16).toString("hex")
  return `dexp_${value}`
}

function safeFileName(fileName: string) {
  const baseName = path.basename(String(fileName || "").trim())
  return baseName.replace(/[^A-Za-z0-9._-]/g, "_") || "dashboard-export.dat"
}

function normalizePreparedExportRecord(exportId: string, value: unknown): DashboardPreparedDataExportRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Partial<DashboardPreparedDataExportRecord>
  const scope = record.scope
  const format = record.format
  if (typeof record.exportId !== "string" || record.exportId !== exportId) return null
  if (scope !== "tickets-list" && scope !== "ticket-detail" && scope !== "analytics-report") return null
  if (format !== "csv" && format !== "json") return null
  if (typeof record.createdByUserId !== "string" || !record.createdByUserId.trim()) return null
  if (typeof record.fileName !== "string" || !record.fileName.trim()) return null
  if (typeof record.relativePath !== "string" || !record.relativePath.trim()) return null
  if (typeof record.contentType !== "string" || !record.contentType.trim()) return null
  if (typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)) return null
  if (typeof record.expiresAt !== "number" || !Number.isFinite(record.expiresAt)) return null
  if (typeof record.byteSize !== "number" || !Number.isFinite(record.byteSize) || record.byteSize < 0) return null
  return record as DashboardPreparedDataExportRecord
}

function resolvePreparedExportPath(projectRoot: string, relativePath: string) {
  const root = preparedExportRoot(projectRoot)
  if (!relativePath || path.isAbsolute(relativePath)) return null
  const normalized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "")
  if (normalized.includes("..") || !normalized.startsWith(`prepared-exports${path.sep}`)) return null
  const filePath = path.resolve(projectRoot, "runtime", "ot-dashboard", normalized)
  const relative = path.relative(root, filePath)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null
  return filePath
}

async function deletePreparedExportFile(projectRoot: string, record: DashboardPreparedDataExportRecord) {
  const filePath = resolvePreparedExportPath(projectRoot, record.relativePath)
  if (!filePath) return
  await fs.rm(filePath, { force: true }).catch(() => undefined)
  await fs.rmdir(path.dirname(filePath)).catch(() => undefined)
}

async function deletePreparedExportRecord(database: DashboardPreparedExportDatabase, exportId: string) {
  if (typeof database.delete !== "function") return
  try {
    await database.delete(DASHBOARD_PREPARED_EXPORTS_CATEGORY, exportId)
  } catch {}
}

export async function cleanupExpiredPreparedExports(input: {
  projectRoot: string
  runtimeBridge: DashboardRuntimeBridge
  now?: number
}) {
  const database = getPreparedExportDatabase(input.runtimeBridge)
  if (!database || typeof database.getCategory !== "function") return 0
  const now = input.now ?? Date.now()
  const records = await database.getCategory(DASHBOARD_PREPARED_EXPORTS_CATEGORY)
  let removed = 0
  for (const entry of Array.isArray(records) ? records : []) {
    const record = normalizePreparedExportRecord(String(entry.key || ""), entry.value)
    if (!record || record.expiresAt <= now || !resolvePreparedExportPath(input.projectRoot, record.relativePath)) {
      if (record) await deletePreparedExportFile(input.projectRoot, record)
      await deletePreparedExportRecord(database, String(entry.key || ""))
      removed += 1
    }
  }
  return removed
}

export function registerPreparedExportHousekeeping(input: {
  projectRoot: string
  runtimeBridge: DashboardRuntimeBridge
}) {
  void cleanupExpiredPreparedExports(input).catch(() => undefined)
  const timer = setInterval(() => {
    void cleanupExpiredPreparedExports(input).catch(() => undefined)
  }, 60 * 60 * 1000)
  timer.unref?.()
}

export async function prepareDashboardExport(input: {
  projectRoot: string
  runtimeBridge: DashboardRuntimeBridge
  payload: DashboardPreparedExportPayload
}): Promise<DashboardPreparedDataExportRecord> {
  const database = getPreparedExportDatabase(input.runtimeBridge)
  if (!database || typeof database.set !== "function") {
    throw new Error("Prepared export registry is unavailable.")
  }
  await cleanupExpiredPreparedExports({ projectRoot: input.projectRoot, runtimeBridge: input.runtimeBridge, now: input.payload.now })
  const now = input.payload.now ?? Date.now()
  const exportId = generateExportId()
  const fileName = safeFileName(input.payload.fileName)
  const body = Buffer.isBuffer(input.payload.body) ? input.payload.body : Buffer.from(input.payload.body, "utf8")
  const relativePath = path.join("prepared-exports", exportId, fileName)
  const filePath = resolvePreparedExportPath(input.projectRoot, relativePath)
  if (!filePath) throw new Error("Prepared export path is invalid.")
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  await fs.writeFile(filePath, body, { mode: 0o600 })
  const record: DashboardPreparedDataExportRecord = {
    exportId,
    scope: input.payload.scope,
    format: input.payload.format,
    createdByUserId: input.payload.createdByUserId,
    createdAt: now,
    expiresAt: now + DASHBOARD_PREPARED_EXPORT_TTL_MS,
    fileName,
    relativePath,
    contentType: input.payload.contentType,
    byteSize: body.length
  }
  await database.set(DASHBOARD_PREPARED_EXPORTS_CATEGORY, exportId, record)
  return record
}

export async function releaseDashboardPreparedExport(input: {
  projectRoot: string
  runtimeBridge: DashboardRuntimeBridge
  exportId: string
  actorUserId: string
  now?: number
}): Promise<DashboardPreparedExportReleaseResult> {
  const database = getPreparedExportDatabase(input.runtimeBridge)
  const exportId = String(input.exportId || "").trim()
  if (!database || typeof database.get !== "function" || typeof database.delete !== "function" || !exportId) {
    return { status: "missing" }
  }
  const record = normalizePreparedExportRecord(exportId, await database.get(DASHBOARD_PREPARED_EXPORTS_CATEGORY, exportId))
  if (!record) {
    await deletePreparedExportRecord(database, exportId)
    return { status: "missing" }
  }
  if (record.createdByUserId !== input.actorUserId) return { status: "denied" }
  const filePath = resolvePreparedExportPath(input.projectRoot, record.relativePath)
  if (!filePath) {
    await deletePreparedExportRecord(database, exportId)
    return { status: "missing" }
  }
  if (record.expiresAt <= (input.now ?? Date.now())) {
    await deletePreparedExportFile(input.projectRoot, record)
    await deletePreparedExportRecord(database, exportId)
    return { status: "expired" }
  }
  try {
    const body = await fs.readFile(filePath)
    await deletePreparedExportFile(input.projectRoot, record)
    await database.delete(DASHBOARD_PREPARED_EXPORTS_CATEGORY, exportId)
    return { status: "available", record, body }
  } catch {
    await deletePreparedExportRecord(database, exportId)
    return { status: "missing" }
  }
}
