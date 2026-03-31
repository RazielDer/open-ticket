import crypto from "crypto"
import * as fs from "fs"
import path from "path"
import { finished } from "stream/promises"

import type { LocalAssetRef, LocalTranscriptDocument, TranscriptWarning } from "../contracts/document"
import type { OTHtmlTranscriptsConfigData } from "../contracts/types"
import { inferSafeContentType, getUrlExtension, isInlineSafeContentType, isRiskyAssetExtension, sanitizeAssetExtension } from "./content-policy"

export interface MirroredAssetRecord {
    assetName: string
    sourceUrl: string
    localPath: string
    mimeType: string
    byteSize: number
    status: "mirrored" | "failed" | "skipped"
    reason?: string | null
}

export interface AssetMirrorResult {
    warnings: TranscriptWarning[]
    totalBytes: number
    mirroredCount: number
    assetRecords: MirroredAssetRecord[]
}

interface AssetRequest {
    sourceUrl: string
    refs: LocalAssetRef[]
    assetName: string
}

export async function mirrorDocumentAssets(document: LocalTranscriptDocument, tempArchivePath: string, config: OTHtmlTranscriptsConfigData): Promise<AssetMirrorResult> {
    const assetsDir = path.join(tempArchivePath, "assets")
    await fs.promises.mkdir(assetsDir, { recursive: true })

    const warnings: TranscriptWarning[] = []
    const assetRecords: MirroredAssetRecord[] = []
    let totalBytes = 0
    let mirroredCount = 0

    const requests = collectAssetRequests(document)
    const limitedRequests = requests.slice(0, config.assets.maxCountPerTranscript)
    const skippedRequests = requests.slice(config.assets.maxCountPerTranscript)

    for (const request of skippedRequests) {
        markRefsUnavailable(request.refs, "skipped", "Asset count limit reached.")
        warnings.push({
            code: "asset-limit-count",
            message: "Skipped asset because the transcript hit the maxCountPerTranscript limit.",
            sourceUrl: request.sourceUrl
        })
        assetRecords.push({
            assetName: request.assetName,
            sourceUrl: request.sourceUrl,
            localPath: "",
            mimeType: "application/octet-stream",
            byteSize: 0,
            status: "skipped",
            reason: "Asset count limit reached."
        })
    }

    await runWithConcurrency(limitedRequests, config.queue.maxAssetFetches, async (request) => {
        const extension = sanitizeAssetExtension(getUrlExtension(request.sourceUrl))
        if (isRiskyAssetExtension(extension)) {
            markRefsUnavailable(request.refs, "skipped", "Risky asset type is not archived.")
            warnings.push({
                code: "asset-risky-type",
                message: "Skipped risky asset type while building the archive.",
                sourceUrl: request.sourceUrl
            })
            assetRecords.push({
                assetName: request.assetName,
                sourceUrl: request.sourceUrl,
                localPath: "",
                mimeType: "application/octet-stream",
                byteSize: 0,
                status: "skipped",
                reason: "Risky asset type is not archived."
            })
            return
        }

        const remainingBudget = config.assets.maxBytesPerTranscript - totalBytes
        if (remainingBudget <= 0) {
            markRefsUnavailable(request.refs, "skipped", "Transcript asset byte limit reached.")
            warnings.push({
                code: "asset-limit-total",
                message: "Skipped asset because the transcript hit the maxBytesPerTranscript limit.",
                sourceUrl: request.sourceUrl
            })
            assetRecords.push({
                assetName: request.assetName,
                sourceUrl: request.sourceUrl,
                localPath: "",
                mimeType: "application/octet-stream",
                byteSize: 0,
                status: "skipped",
                reason: "Transcript asset byte limit reached."
            })
            return
        }

        const destinationPath = path.join(assetsDir, request.assetName)
        try {
            const download = await downloadAsset(request.sourceUrl, destinationPath, config.assets.maxBytesPerFile, remainingBudget)
            const contentType = inferSafeContentType(path.extname(request.assetName), download.contentType)
            if (!contentType) {
                await fs.promises.rm(destinationPath, { force: true })
                markRefsUnavailable(request.refs, "skipped", "Asset type cannot be safely served.")
                warnings.push({
                    code: "asset-risky-served-type",
                    message: "Skipped asset because it could not be served safely.",
                    sourceUrl: request.sourceUrl
                })
                assetRecords.push({
                    assetName: request.assetName,
                    sourceUrl: request.sourceUrl,
                    localPath: "",
                    mimeType: "application/octet-stream",
                    byteSize: 0,
                    status: "skipped",
                    reason: "Asset type cannot be safely served."
                })
                return
            }

            totalBytes += download.byteSize
            mirroredCount++
            for (const ref of request.refs) {
                ref.assetName = request.assetName
                ref.archivePath = "assets/" + request.assetName
                ref.mimeType = ref.inlinePreferred && !isInlineSafeContentType(contentType) ? contentType : contentType
                ref.byteSize = download.byteSize
                ref.status = "mirrored"
                delete ref.unavailableReason
            }
            assetRecords.push({
                assetName: request.assetName,
                sourceUrl: request.sourceUrl,
                localPath: "assets/" + request.assetName,
                mimeType: contentType,
                byteSize: download.byteSize,
                status: "mirrored",
                reason: null
            })
        } catch (error) {
            await fs.promises.rm(destinationPath, { force: true }).catch(() => {})
            const reason = error instanceof Error ? error.message : String(error)
            markRefsUnavailable(request.refs, reason.includes("limit") ? "skipped" : "failed", reason)
            warnings.push({
                code: "asset-download-failed",
                message: "Failed to mirror asset: " + reason,
                sourceUrl: request.sourceUrl
            })
            assetRecords.push({
                assetName: request.assetName,
                sourceUrl: request.sourceUrl,
                localPath: "",
                mimeType: "application/octet-stream",
                byteSize: 0,
                status: reason.includes("limit") ? "skipped" : "failed",
                reason
            })
        }
    })

    return {
        warnings,
        totalBytes,
        mirroredCount,
        assetRecords
    }
}

function collectAssetRequests(document: LocalTranscriptDocument) {
    const refs = collectAllAssetRefs(document)
    const requestsByUrl = new Map<string, AssetRequest>()

    refs.forEach((ref, index) => {
        const existing = requestsByUrl.get(ref.sourceUrl)
        if (existing) {
            existing.refs.push(ref)
            return
        }

        requestsByUrl.set(ref.sourceUrl, {
            sourceUrl: ref.sourceUrl,
            refs: [ref],
            assetName: createAssetName(index, ref.sourceUrl)
        })
    })

    return Array.from(requestsByUrl.values())
}

function collectAllAssetRefs(document: LocalTranscriptDocument) {
    const refs: LocalAssetRef[] = []
    const add = (ref: LocalAssetRef | null | undefined) => {
        if (ref && ref.sourceUrl.length > 0) refs.push(ref)
    }

    add(document.style.background.backgroundAsset)
    add(document.style.favicon.faviconAsset)
    add(document.bot.avatar)
    add(document.guild.icon)
    add(document.ticket.createdBy?.avatar)
    add(document.ticket.closedBy?.avatar)
    add(document.ticket.claimedBy?.avatar)
    add(document.ticket.pinnedBy?.avatar)
    add(document.ticket.deletedBy?.avatar)

    for (const message of document.messages) {
        add(message.author.avatar)
        add(message.reply.user?.avatar)

        for (const embed of message.embeds) {
            add(embed.authorAsset)
            add(embed.footerAsset)
            add(embed.image)
            add(embed.thumbnail)
        }

        for (const attachment of message.attachments) add(attachment.asset)

        for (const component of message.components) {
            if (component.type == "buttons") {
                component.buttons.forEach((button) => add(button.iconAsset))
            } else if (component.type == "dropdown") {
                component.options.forEach((option) => add(option.iconAsset))
            } else {
                component.reactions.forEach((reaction) => add(reaction.asset))
            }
        }
    }

    return refs
}

function createAssetName(index: number, sourceUrl: string) {
    const extension = sanitizeAssetExtension(getUrlExtension(sourceUrl))
    const hash = crypto.createHash("sha1").update(sourceUrl).digest("hex").slice(0, 12)
    return String(index + 1).padStart(4, "0") + "-" + hash + extension
}

function markRefsUnavailable(refs: LocalAssetRef[], status: "failed" | "skipped", reason: string) {
    for (const ref of refs) {
        ref.assetName = null
        ref.archivePath = null
        ref.mimeType = null
        ref.byteSize = 0
        ref.status = status
        ref.unavailableReason = reason
    }
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
    const poolSize = Math.max(1, concurrency)
    let index = 0

    await Promise.all(Array.from({ length: Math.min(poolSize, items.length) }, async () => {
        while (index < items.length) {
            const current = items[index]
            index += 1
            await worker(current)
        }
    }))
}

async function downloadAsset(sourceUrl: string, destinationPath: string, maxBytesPerFile: number, remainingBudget: number) {
    const response = await fetch(sourceUrl)
    if (!response.ok || !response.body) {
        throw new Error("HTTP " + response.status + " while downloading asset.")
    }

    const advertisedLength = Number(response.headers.get("content-length") ?? "0")
    if (advertisedLength > 0 && advertisedLength > maxBytesPerFile) {
        throw new Error("asset exceeds maxBytesPerFile limit")
    }
    if (advertisedLength > 0 && advertisedLength > remainingBudget) {
        throw new Error("asset exceeds maxBytesPerTranscript limit")
    }

    const fileHandle = fs.createWriteStream(destinationPath)
    const reader = response.body.getReader()
    let totalBytes = 0

    try {
        while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            totalBytes += chunk.value.length

            if (totalBytes > maxBytesPerFile) {
                throw new Error("asset exceeds maxBytesPerFile limit")
            }
            if (totalBytes > remainingBudget) {
                throw new Error("asset exceeds maxBytesPerTranscript limit")
            }

            fileHandle.write(Buffer.from(chunk.value))
        }

        fileHandle.end()
        await finished(fileHandle)

        return {
            byteSize: totalBytes,
            contentType: response.headers.get("content-type")
        }
    } catch (error) {
        fileHandle.destroy()
        throw error
    }
}
