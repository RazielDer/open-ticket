import * as fs from "fs"
import path from "path"

import type { OTHtmlTranscriptsConfigData } from "../contracts/types"
import { resolveTranscriptStoragePaths } from "./archive-paths"
import { TranscriptRepository } from "./repository"

export interface TranscriptRecoveryResult {
    recoveredBuilds: number
    removedTempDirectories: number
}

const RECOVERY_MARKED_FAILED_REASON = "Recovered stale building transcript after startup."

export async function recoverTranscriptStorage(repository: TranscriptRepository, config: OTHtmlTranscriptsConfigData): Promise<TranscriptRecoveryResult> {
    const staleTranscriptIds = await repository.listTranscriptIdsByStatus("building")
    const recoveredBuilds = await repository.markStaleBuildingTranscriptsFailed()
    for (const transcriptId of staleTranscriptIds) {
        await repository.createTranscriptEvent({
            transcriptId,
            type: "recovery-marked-failed",
            reason: RECOVERY_MARKED_FAILED_REASON
        })
    }

    const removedTempDirectories = await removeOrphanTempDirectories(config)

    return {
        recoveredBuilds,
        removedTempDirectories
    }
}

async function removeOrphanTempDirectories(config: OTHtmlTranscriptsConfigData): Promise<number> {
    const { tempRoot } = resolveTranscriptStoragePaths(config)

    let entries: fs.Dirent[]
    try {
        entries = await fs.promises.readdir(tempRoot, { withFileTypes: true })
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code == "ENOENT") return 0
        throw error
    }

    const directories = entries.filter((entry) => entry.isDirectory())

    await Promise.all(directories.map(async (entry) => {
        await fs.promises.rm(path.join(tempRoot, entry.name), { recursive: true, force: true })
    }))

    return directories.length
}
