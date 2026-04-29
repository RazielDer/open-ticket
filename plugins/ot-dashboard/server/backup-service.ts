import fs from "fs"
import path from "path"
import crypto from "crypto"

import type { DashboardConfigService } from "./config-service"
import type { ManagedConfigId } from "./config-registry"
import { MANAGED_CONFIGS } from "./config-registry"

export interface DashboardBackupConfigEntry {
  id: ManagedConfigId
  fileName: string
  size: number
}

export interface DashboardBackupMetadata {
  id: string
  createdAt: string
  note: string
  source: string
  configs: DashboardBackupConfigEntry[]
}

export interface DashboardBackupService {
  rootDir: string
  createBackup: (note: string, source: string) => DashboardBackupMetadata
  listBackups: () => DashboardBackupMetadata[]
  getBackup: (backupId: string) => DashboardBackupMetadata | null
  getBackupText: (backupId: string, id: ManagedConfigId) => string
}

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
}

function backupDirectory(rootDir: string, backupId: string) {
  return path.join(rootDir, backupId)
}

function metadataPath(rootDir: string, backupId: string) {
  return path.join(backupDirectory(rootDir, backupId), "metadata.json")
}

function filePath(rootDir: string, backupId: string, fileName: string) {
  return path.join(backupDirectory(rootDir, backupId), fileName)
}

function generateBackupId() {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(4).toString("hex")}`
}

function readMetadata(rootDir: string, backupId: string): DashboardBackupMetadata | null {
  try {
    return JSON.parse(fs.readFileSync(metadataPath(rootDir, backupId), "utf8")) as DashboardBackupMetadata
  } catch {
    return null
  }
}

export function createBackupService(projectRoot: string, configService: DashboardConfigService): DashboardBackupService {
  const rootDir = path.resolve(projectRoot, "runtime", "ot-dashboard", "backups")

  const createBackup = (note: string, source: string): DashboardBackupMetadata => {
    ensureDirectory(rootDir)
    const id = generateBackupId()
    const directory = backupDirectory(rootDir, id)
    ensureDirectory(directory)

    const configs = MANAGED_CONFIGS.map((definition) => {
      const text = configService.readManagedBackupText(definition.id)
      fs.writeFileSync(filePath(rootDir, id, definition.fileName), text, "utf8")
      return {
        id: definition.id,
        fileName: definition.fileName,
        size: Buffer.byteLength(text)
      }
    })

    const metadata: DashboardBackupMetadata = {
      id,
      createdAt: new Date().toISOString(),
      note: note.trim(),
      source,
      configs
    }

    fs.writeFileSync(metadataPath(rootDir, id), JSON.stringify(metadata, null, 2) + "\n", "utf8")
    return metadata
  }

  return {
    rootDir,
    createBackup,
    listBackups() {
      ensureDirectory(rootDir)
      return fs
        .readdirSync(rootDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => readMetadata(rootDir, entry.name))
        .filter((item): item is DashboardBackupMetadata => Boolean(item))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    },
    getBackup(backupId) {
      return readMetadata(rootDir, backupId)
    },
    getBackupText(backupId, id) {
      const definition = MANAGED_CONFIGS.find((item) => item.id === id)
      if (!definition) {
        throw new Error(`Unknown managed config: ${id}`)
      }
      return fs.readFileSync(filePath(rootDir, backupId, definition.fileName), "utf8")
    }
  }
}
