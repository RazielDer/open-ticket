import crypto from "crypto"
import fs from "fs"
import path from "path"

import type { DashboardPluginAssetKind } from "./dashboard-plugin-registry"
import type { DashboardPluginAssetItem, DashboardPluginDetail, DashboardPluginInventoryItem } from "./dashboard-runtime-registry"
import type { DashboardRuntimeBridge } from "./runtime-bridge"

export interface DashboardPluginBackupFileEntry {
  relativePath: string
  size: number
}

export interface DashboardPluginBackupMetadata {
  id: string
  pluginId: string
  createdAt: string
  note: string
  source: string
  files: DashboardPluginBackupFileEntry[]
}

export interface DashboardPluginManagementService {
  projectRoot: string
  runtimeBridge: DashboardRuntimeBridge
  listPlugins: () => DashboardPluginInventoryItem[]
  getPluginDetail: (pluginId: string) => DashboardPluginDetail | null
  encodeAssetId: (relativePath: string) => string
  decodeAssetId: (assetId: string) => string
  getAsset: (pluginId: string, assetId: string) => DashboardPluginAssetItem | null
  getManifestText: (pluginId: string) => string
  buildManifestCandidateText: (pluginId: string, patch: { enabled: boolean; priority: number }) => string
  buildAssetCandidateText: (pluginId: string, assetId: string, candidateText: string) => string
  applyManifestCandidate: (pluginId: string, candidateText: string) => DashboardPluginBackupMetadata
  applyAssetCandidate: (pluginId: string, assetId: string, candidateText: string) => DashboardPluginBackupMetadata
  readAssetText: (pluginId: string, assetId: string) => string
  listBackups: (pluginId: string) => DashboardPluginBackupMetadata[]
  createBackup: (pluginId: string, note: string, source: string) => DashboardPluginBackupMetadata
  getBackup: (pluginId: string, backupId: string) => DashboardPluginBackupMetadata | null
  getBackupText: (pluginId: string, backupId: string, relativePath: string) => string
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
}

function atomicWriteText(filePath: string, text: string) {
  ensureDirectory(path.dirname(filePath))
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, text, "utf8")
  fs.renameSync(tempPath, filePath)
}

function metadataPath(rootDir: string, backupId: string) {
  return path.join(rootDir, backupId, "metadata.json")
}

function normalizeRelativePath(value: string) {
  const normalized = path.posix.normalize(String(value || "").replace(/\\/g, "/")).replace(/^\/+/, "")
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Invalid plugin asset path.")
  }
  return normalized
}

function buildBackupId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2) + "\n"
}

function validateJsonShape(value: unknown, kind: DashboardPluginAssetKind, fileName: string) {
  if (kind === "array" && !Array.isArray(value)) {
    throw new Error(`${fileName} must contain a JSON array.`)
  }
  if (kind === "object" && (!value || typeof value !== "object" || Array.isArray(value))) {
    throw new Error(`${fileName} must contain a JSON object.`)
  }
}

function readBackupMetadata(rootDir: string, backupId: string) {
  try {
    return JSON.parse(fs.readFileSync(metadataPath(rootDir, backupId), "utf8")) as DashboardPluginBackupMetadata
  } catch {
    return null
  }
}

export function createPluginManagementService(projectRoot: string, runtimeBridge: DashboardRuntimeBridge): DashboardPluginManagementService {
  function getPluginDetail(pluginId: string) {
    return runtimeBridge.getPluginDetail(projectRoot, pluginId)
  }

  function requirePluginDetail(pluginId: string) {
    const detail = getPluginDetail(pluginId)
    if (!detail) {
      throw new Error("Plugin not found.")
    }
    return detail
  }

  function backupRoot(pluginId: string) {
    return path.resolve(projectRoot, "runtime", "ot-dashboard", "backups", "plugins", pluginId)
  }

  function resolveBackupTextPath(pluginId: string, backupId: string, relativePath: string) {
    return path.join(backupRoot(pluginId), backupId, normalizeRelativePath(relativePath))
  }

  function readJsonText(filePath: string) {
    return fs.readFileSync(filePath, "utf8")
  }

  function encodeAssetId(relativePath: string) {
    return Buffer.from(normalizeRelativePath(relativePath), "utf8").toString("base64url")
  }

  function decodeAssetId(assetId: string) {
    try {
      return normalizeRelativePath(Buffer.from(String(assetId || ""), "base64url").toString("utf8"))
    } catch {
      throw new Error("Invalid asset id.")
    }
  }

  function getAsset(pluginId: string, assetId: string) {
    const detail = requirePluginDetail(pluginId)
    let relativePath = ""
    try {
      relativePath = decodeAssetId(assetId)
    } catch {
      return null
    }
    return detail.editableAssets.find((asset) => asset.relativePath === relativePath) || null
  }

  function getManifestText(pluginId: string) {
    const detail = requirePluginDetail(pluginId)
    if (!detail.manifestPath) {
      throw new Error("This plugin does not expose a plugin.json manifest.")
    }
    return readJsonText(detail.manifestPath)
  }

  function buildManifestCandidateText(pluginId: string, patch: { enabled: boolean; priority: number }) {
    const currentText = getManifestText(pluginId)
    const currentValue = JSON.parse(currentText)
    if (!currentValue || typeof currentValue !== "object" || Array.isArray(currentValue)) {
      throw new Error("plugin.json must contain a JSON object.")
    }

    const nextValue: Record<string, unknown> = {}
    let wroteEnabled = false
    let wrotePriority = false

    for (const [key, value] of Object.entries(currentValue)) {
      if (key === "enabled") {
        nextValue[key] = patch.enabled
        wroteEnabled = true
      } else if (key === "priority") {
        nextValue[key] = patch.priority
        wrotePriority = true
      } else {
        nextValue[key] = value
      }
    }

    if (!wroteEnabled) nextValue.enabled = patch.enabled
    if (!wrotePriority) nextValue.priority = patch.priority

    return stringifyJson(nextValue)
  }

  function readAssetText(pluginId: string, assetId: string) {
    const asset = getAsset(pluginId, assetId)
    if (!asset) {
      throw new Error("Plugin asset not found.")
    }
    return readJsonText(asset.absolutePath)
  }

  function buildAssetCandidateText(pluginId: string, assetId: string, candidateText: string) {
    const asset = getAsset(pluginId, assetId)
    if (!asset) {
      throw new Error("Plugin asset not found.")
    }
    const parsed = JSON.parse(candidateText)
    validateJsonShape(parsed, asset.kind, asset.fileName)
    return stringifyJson(parsed)
  }

  function createBackup(pluginId: string, note: string, source: string) {
    const detail = requirePluginDetail(pluginId)
    const rootDir = backupRoot(detail.id)
    ensureDirectory(rootDir)

    const id = buildBackupId()
    const directory = path.join(rootDir, id)
    ensureDirectory(directory)

    const files: DashboardPluginBackupFileEntry[] = []
    const manifestText = detail.manifestPath ? readJsonText(detail.manifestPath) : null
    if (manifestText != null) {
      const manifestBackupPath = path.join(directory, "plugin.json")
      ensureDirectory(path.dirname(manifestBackupPath))
      fs.writeFileSync(manifestBackupPath, manifestText, "utf8")
      files.push({
        relativePath: "plugin.json",
        size: Buffer.byteLength(manifestText)
      })
    }

    detail.editableAssets.forEach((asset) => {
      const targetPath = path.join(directory, asset.relativePath)
      ensureDirectory(path.dirname(targetPath))
      const text = readJsonText(asset.absolutePath)
      fs.writeFileSync(targetPath, text, "utf8")
      files.push({
        relativePath: asset.relativePath,
        size: Buffer.byteLength(text)
      })
    })

    const metadata: DashboardPluginBackupMetadata = {
      id,
      pluginId: detail.id,
      createdAt: new Date().toISOString(),
      note: note.trim(),
      source,
      files
    }

    fs.writeFileSync(metadataPath(rootDir, id), stringifyJson(metadata), "utf8")
    return metadata
  }

  function listBackups(pluginId: string) {
    const detail = requirePluginDetail(pluginId)
    const rootDir = backupRoot(detail.id)
    ensureDirectory(rootDir)
    return fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readBackupMetadata(rootDir, entry.name))
      .filter((entry): entry is DashboardPluginBackupMetadata => Boolean(entry))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  function getBackup(pluginId: string, backupId: string) {
    const detail = requirePluginDetail(pluginId)
    const metadata = readBackupMetadata(backupRoot(detail.id), backupId)
    if (!metadata || metadata.pluginId !== detail.id) {
      return null
    }
    return metadata
  }

  function getBackupText(pluginId: string, backupId: string, relativePath: string) {
    const detail = requirePluginDetail(pluginId)
    const backup = getBackup(detail.id, backupId)
    if (!backup) {
      throw new Error("Backup not found.")
    }

    const normalizedPath = normalizeRelativePath(relativePath)
    if (!backup.files.some((file) => file.relativePath === normalizedPath)) {
      throw new Error("Backup file not found.")
    }

    return readJsonText(resolveBackupTextPath(detail.id, backup.id, normalizedPath))
  }

  function applyManifestCandidate(pluginId: string, candidateText: string) {
    const detail = requirePluginDetail(pluginId)
    if (!detail.manifestPath) {
      throw new Error("This plugin does not expose a plugin.json manifest.")
    }

    const parsed = JSON.parse(candidateText)
    validateJsonShape(parsed, "object", "plugin.json")
    const backup = createBackup(detail.id, "Pre-apply plugin manifest backup", "apply:manifest")
    atomicWriteText(detail.manifestPath, stringifyJson(parsed))
    return backup
  }

  function applyAssetCandidate(pluginId: string, assetId: string, candidateText: string) {
    const asset = getAsset(pluginId, assetId)
    if (!asset) {
      throw new Error("Plugin asset not found.")
    }

    const parsed = JSON.parse(candidateText)
    validateJsonShape(parsed, asset.kind, asset.fileName)
    const detail = requirePluginDetail(pluginId)
    const backup = createBackup(detail.id, `Pre-apply backup for ${asset.relativePath}`, `apply:asset:${asset.relativePath}`)
    atomicWriteText(asset.absolutePath, stringifyJson(parsed))
    return backup
  }

  return {
    projectRoot,
    runtimeBridge,
    listPlugins() {
      return runtimeBridge.listPlugins(projectRoot)
    },
    getPluginDetail,
    encodeAssetId,
    decodeAssetId,
    getAsset,
    getManifestText,
    buildManifestCandidateText,
    buildAssetCandidateText,
    applyManifestCandidate,
    applyAssetCandidate,
    readAssetText,
    listBackups,
    createBackup,
    getBackup,
    getBackupText
  }
}
