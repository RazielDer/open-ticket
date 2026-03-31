import * as fs from "fs"
import path from "path"

import type { OTHtmlTranscriptsConfigData } from "../contracts/types"

export interface TranscriptStoragePaths {
    archiveRoot: string
    tempRoot: string
    sqlitePath: string
}

export function resolveTranscriptStoragePaths(config: OTHtmlTranscriptsConfigData): TranscriptStoragePaths {
    const archiveRoot = path.resolve(process.cwd(), config.storage.archiveRoot)
    const sqlitePath = path.resolve(process.cwd(), config.storage.sqlitePath)
    const tempRoot = path.join(path.dirname(archiveRoot), ".tmp")

    return { archiveRoot, tempRoot, sqlitePath }
}

export function getTranscriptArchivePath(config: OTHtmlTranscriptsConfigData, transcriptId: string): string {
    const { archiveRoot } = resolveTranscriptStoragePaths(config)
    return path.join(archiveRoot, transcriptId)
}

export function getTranscriptTempPath(config: OTHtmlTranscriptsConfigData, transcriptId: string): string {
    const { tempRoot } = resolveTranscriptStoragePaths(config)
    return path.join(tempRoot, transcriptId)
}

export function ensurePathWithinRoot(rootPath: string, targetPath: string): string {
    const normalizedRoot = path.resolve(rootPath)
    const normalizedTarget = path.resolve(targetPath)
    const relative = path.relative(normalizedRoot, normalizedTarget)

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Resolved path escapes the configured archive root.")
    }

    return normalizedTarget
}

export async function ensureTranscriptStorageDirs(config: OTHtmlTranscriptsConfigData) {
    const { archiveRoot, tempRoot, sqlitePath } = resolveTranscriptStoragePaths(config)

    await fs.promises.mkdir(archiveRoot, { recursive: true })
    await fs.promises.mkdir(tempRoot, { recursive: true })
    await fs.promises.mkdir(path.dirname(sqlitePath), { recursive: true })
}
