import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { finished } from "node:stream/promises"

export const QUALITY_REVIEW_CASES_CATEGORY = "opendiscord:quality-review:cases"
export const QUALITY_REVIEW_NOTES_CATEGORY = "opendiscord:quality-review:notes"
export const QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY = "opendiscord:quality-review:raw-feedback"

export const QUALITY_REVIEW_STATES = ["unreviewed", "in_review", "resolved"] as const
export const QUALITY_REVIEW_ACTIONS = ["set-state", "assign-owner", "clear-owner", "add-note"] as const

export type OTQualityReviewState = (typeof QUALITY_REVIEW_STATES)[number]
export type OTQualityReviewAction = (typeof QUALITY_REVIEW_ACTIONS)[number]
export type OTQualityReviewRawFeedbackStorageStatus = "available" | "partial" | "expired"
export type OTQualityReviewRawFeedbackListStatus = OTQualityReviewRawFeedbackStorageStatus | "none"
export type OTQualityReviewRawAssetCaptureStatus = "mirrored" | "failed" | "expired"

export interface OTQualityReviewConfig {
    rawFeedbackRetentionDays: number
    maxMirroredFileBytes: number
    maxMirroredSessionBytes: number
}

export interface OTQualityReviewCaseRecord {
    ticketId: string
    state: OTQualityReviewState
    ownerUserId: string | null
    createdAt: number
    updatedAt: number
    resolvedAt: number | null
    lastSignalAt: number
}

export interface OTQualityReviewNoteRecord {
    noteId: string
    ticketId: string
    authorUserId: string
    authorLabel: string
    createdAt: number
    body: string
}

export interface OTQualityReviewRawAssetRecord {
    assetId: string
    fileName: string
    contentType: string | null
    byteSize: number
    relativePath: string | null
    captureStatus: OTQualityReviewRawAssetCaptureStatus
    reason: string | null
}

export interface OTQualityReviewRawAnswerRecord {
    position: number
    type: "text" | "rating" | "image" | "attachment" | "choice"
    label: string
    answered: boolean
    textValue: string | null
    ratingValue: number | null
    choiceIndex: number | null
    choiceLabel: string | null
    assets: OTQualityReviewRawAssetRecord[]
}

export interface OTQualityReviewRawFeedbackRecord {
    sessionId: string
    ticketId: string
    capturedAt: number
    retentionExpiresAt: number
    storageStatus: OTQualityReviewRawFeedbackStorageStatus
    warnings: string[]
    answers: OTQualityReviewRawAnswerRecord[]
}

export interface OTQualityReviewCaseSignal {
    ticketId: string
    firstKnownAt?: number | null
    lastSignalAt?: number | null
    latestCompletedAnsweredSessionId?: string | null
}

export interface OTQualityReviewCaseSummary {
    ticketId: string
    stored: boolean
    state: OTQualityReviewState
    ownerUserId: string | null
    createdAt: number
    updatedAt: number
    resolvedAt: number | null
    lastSignalAt: number
    noteCount: number
    rawFeedbackStatus: OTQualityReviewRawFeedbackListStatus
    latestRawFeedbackSessionId: string | null
}

export interface OTQualityReviewCaseDetail extends OTQualityReviewCaseSummary {
    notes: OTQualityReviewNoteRecord[]
    rawFeedback: OTQualityReviewRawFeedbackRecord[]
}

export interface OTQualityReviewActionRequest {
    ticketId: string
    action: OTQualityReviewAction
    actorUserId: string
    actorLabel?: string | null
    state?: OTQualityReviewState | string | null
    ownerUserId?: string | null
    note?: string | null
    firstKnownAt?: number | null
    lastSignalAt?: number | null
}

export interface OTQualityReviewActionResult {
    ok: boolean
    status: "success" | "warning" | "danger"
    message: string
    warnings?: string[]
}

export interface OTQualityReviewAssetResult {
    status: "available" | "missing" | "expired"
    filePath: string | null
    fileName: string | null
    contentType: string | null
    byteSize: number
    message: string
}

export interface QualityReviewDatabaseCategoryEntry {
    key: string
    value: unknown
}

export interface QualityReviewDatabase {
    set(category: string, key: string, value: any): boolean | Promise<boolean>
    get?(category: string, key: string): unknown | Promise<unknown>
    delete?(category: string, key: string): boolean | Promise<boolean>
    getCategory(category: string): QualityReviewDatabaseCategoryEntry[] | undefined | Promise<QualityReviewDatabaseCategoryEntry[] | undefined>
}

export interface OTQualityReviewServiceDependencies {
    database: QualityReviewDatabase
    assetRoot: string
    config?: Partial<OTQualityReviewConfig> | null
    now?: () => number
    randomId?: () => string
    fetchAsset?: (url: string) => Promise<Response>
}

type FeedbackSessionLike = {
    sessionId?: unknown
    ticketId?: unknown
    triggerMode?: unknown
    status?: unknown
    completedAt?: unknown
    respondentUserId?: unknown
    closeCountAtTrigger?: unknown
}

type FeedbackResponseLike = {
    label?: unknown
    type?: unknown
    answer?: unknown
    choices?: unknown
}

type AttachmentLike = {
    url?: unknown
    name?: unknown
    contentType?: unknown
    content_type?: unknown
    size?: unknown
}

const DAY_MS = 24 * 60 * 60 * 1000
const NOTE_MAX_LENGTH = 4000
const DEFAULT_CONFIG: OTQualityReviewConfig = {
    rawFeedbackRetentionDays: 90,
    maxMirroredFileBytes: 26214400,
    maxMirroredSessionBytes: 262144000
}

export class OTQualityReviewService {
    private readonly database: QualityReviewDatabase
    private readonly assetRoot: string
    private readonly now: () => number
    private readonly randomId: () => string
    private readonly fetchAsset: (url: string) => Promise<Response>
    private config: OTQualityReviewConfig

    constructor(dependencies: OTQualityReviewServiceDependencies) {
        this.database = dependencies.database
        this.assetRoot = path.resolve(dependencies.assetRoot)
        this.now = dependencies.now ?? Date.now
        this.randomId = dependencies.randomId ?? crypto.randomUUID
        this.fetchAsset = dependencies.fetchAsset ?? ((url) => fetch(url))
        this.config = normalizeConfig(dependencies.config)
    }

    updateConfig(config: Partial<OTQualityReviewConfig> | null | undefined) {
        this.config = normalizeConfig(config)
    }

    async restore() {
        const cases = await this.readCases()
        const notes = await this.readNotes()
        const rawFeedback = await this.readRawFeedback()
        return {
            cases: cases.length,
            notes: notes.length,
            rawFeedback: rawFeedback.length
        }
    }

    async captureFeedbackPayload<Response extends FeedbackResponseLike>(
        payload: { session?: FeedbackSessionLike | null; responses?: Response[] | null }
    ): Promise<OTQualityReviewRawFeedbackRecord | null> {
        const session = normalizeFeedbackSession(payload?.session)
        if (!session || session.status !== "completed") return null
        const responses = Array.isArray(payload.responses) ? payload.responses : []
        if (!responses.some((response) => isAnswered(response.answer))) return null

        await fs.promises.mkdir(this.assetRoot, { recursive: true })
        const capturedAt = normalizeTimestamp(session.completedAt, this.now())
        const warnings: string[] = []
        let mirroredBytes = 0
        const answers: OTQualityReviewRawAnswerRecord[] = []

        for (let index = 0; index < responses.length; index += 1) {
            const response = responses[index]
            const answer = response.answer
            const type = answerType(response.type)
            const answered = isAnswered(answer)
            const answerRecord: OTQualityReviewRawAnswerRecord = {
                position: index + 1,
                type,
                label: normalizeString(response.label),
                answered,
                textValue: type === "text" && typeof answer === "string" ? answer : null,
                ratingValue: type === "rating" ? numberOrNull(answer) : null,
                choiceIndex: null,
                choiceLabel: null,
                assets: []
            }

            if (type === "choice" && typeof answer === "string") {
                const choices = Array.isArray(response.choices) ? response.choices.map((choice) => String(choice)) : []
                answerRecord.choiceLabel = answer
                const choiceIndex = choices.indexOf(answer)
                answerRecord.choiceIndex = choiceIndex >= 0 ? choiceIndex : null
            }

            if ((type === "image" || type === "attachment") && answered) {
                const mirror = await this.mirrorAnswerAsset({
                    ticketId: session.ticketId,
                    sessionId: session.sessionId,
                    answer,
                    remainingSessionBytes: Math.max(0, this.config.maxMirroredSessionBytes - mirroredBytes)
                })
                answerRecord.assets.push(mirror.asset)
                if (mirror.asset.captureStatus === "mirrored") {
                    mirroredBytes += mirror.asset.byteSize
                }
                warnings.push(...mirror.warnings)
            }

            answers.push(answerRecord)
        }

        const record: OTQualityReviewRawFeedbackRecord = {
            sessionId: session.sessionId,
            ticketId: session.ticketId,
            capturedAt,
            retentionExpiresAt: capturedAt + this.config.rawFeedbackRetentionDays * DAY_MS,
            storageStatus: warnings.length > 0 ? "partial" : "available",
            warnings: uniqueStrings(warnings),
            answers
        }

        await this.database.set(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, record.sessionId, record)
        return record
    }

    async listDashboardQualityReviewCases(query: { tickets?: OTQualityReviewCaseSignal[] | null } = {}) {
        await this.sweepExpiredRawFeedback()
        const casesByTicket = new Map((await this.readCases()).map((record) => [record.ticketId, record]))
        const notes = await this.readNotes()
        const rawFeedback = await this.readRawFeedback()
        const noteCounts = countNotesByTicket(notes)
        const rawBySession = new Map(rawFeedback.map((record) => [record.sessionId, record]))
        const signals = Array.isArray(query.tickets) ? query.tickets : []

        return {
            cases: signals.map((signal) => {
                const ticketId = normalizeString(signal.ticketId)
                const latestSessionId = stringOrNull(signal.latestCompletedAnsweredSessionId)
                const raw = latestSessionId ? rawBySession.get(latestSessionId) || null : null
                return this.buildCaseSummary({
                    signal: { ...signal, ticketId },
                    stored: casesByTicket.get(ticketId) || null,
                    noteCount: noteCounts.get(ticketId) || 0,
                    rawFeedbackStatus: latestSessionId ? raw?.storageStatus || "none" : "none",
                    latestRawFeedbackSessionId: raw?.sessionId || null
                })
            }).filter((record) => record.ticketId)
        }
    }

    async getDashboardQualityReviewCase(
        ticketId: string,
        signal: Omit<OTQualityReviewCaseSignal, "ticketId"> = {}
    ): Promise<OTQualityReviewCaseDetail | null> {
        const normalizedTicketId = normalizeString(ticketId)
        if (!normalizedTicketId) return null
        await this.sweepExpiredRawFeedback()
        const stored = await this.readCase(normalizedTicketId)
        const notes = (await this.readNotes())
            .filter((record) => record.ticketId === normalizedTicketId)
            .sort((left, right) => right.createdAt - left.createdAt || left.noteId.localeCompare(right.noteId))
        const rawFeedback = (await this.readRawFeedback())
            .filter((record) => record.ticketId === normalizedTicketId)
            .sort((left, right) => right.capturedAt - left.capturedAt || left.sessionId.localeCompare(right.sessionId))
        const latestSessionId = stringOrNull(signal.latestCompletedAnsweredSessionId)
        const rawForLatest = latestSessionId ? rawFeedback.find((record) => record.sessionId === latestSessionId) || null : null
        const summary = this.buildCaseSummary({
            signal: { ...signal, ticketId: normalizedTicketId },
            stored,
            noteCount: notes.length,
            rawFeedbackStatus: latestSessionId ? rawForLatest?.storageStatus || "none" : rawFeedback[0]?.storageStatus || "none",
            latestRawFeedbackSessionId: rawForLatest?.sessionId || rawFeedback[0]?.sessionId || null
        })

        return {
            ...summary,
            notes,
            rawFeedback
        }
    }

    async runDashboardQualityReviewAction(input: OTQualityReviewActionRequest): Promise<OTQualityReviewActionResult> {
        const ticketId = normalizeString(input.ticketId)
        if (!ticketId) return actionWarning("Quality review ticket id is required.")
        if (!isQualityReviewAction(input.action)) return actionWarning("Unsupported quality review action.")

        const now = this.now()
        const previous = await this.readCase(ticketId)
        const signal = {
            ticketId,
            firstKnownAt: numberOrNull(input.firstKnownAt),
            lastSignalAt: numberOrNull(input.lastSignalAt)
        }
        const effective = this.buildCaseSummary({
            signal,
            stored: previous,
            noteCount: 0,
            rawFeedbackStatus: "none",
            latestRawFeedbackSessionId: null
        })
        const base: OTQualityReviewCaseRecord = {
            ticketId,
            state: effective.state,
            ownerUserId: effective.ownerUserId,
            createdAt: previous?.createdAt || effective.createdAt || now,
            updatedAt: now,
            resolvedAt: effective.resolvedAt,
            lastSignalAt: effective.lastSignalAt
        }

        if (input.action === "set-state") {
            const state = normalizeString(input.state)
            if (!isQualityReviewState(state)) return actionWarning("Unsupported quality review state.")
            const next: OTQualityReviewCaseRecord = {
                ...base,
                state,
                resolvedAt: state === "resolved" ? now : null,
                updatedAt: now
            }
            await this.database.set(QUALITY_REVIEW_CASES_CATEGORY, ticketId, next)
            return actionSuccess("Quality review state updated.")
        }

        if (input.action === "assign-owner") {
            const ownerUserId = normalizeString(input.ownerUserId)
            if (!ownerUserId) return actionWarning("Owner user id is required.")
            const next: OTQualityReviewCaseRecord = {
                ...base,
                ownerUserId,
                updatedAt: now
            }
            await this.database.set(QUALITY_REVIEW_CASES_CATEGORY, ticketId, next)
            return actionSuccess("Quality review owner assigned.")
        }

        if (input.action === "clear-owner") {
            const next: OTQualityReviewCaseRecord = {
                ...base,
                ownerUserId: null,
                updatedAt: now
            }
            await this.database.set(QUALITY_REVIEW_CASES_CATEGORY, ticketId, next)
            return actionSuccess("Quality review owner cleared.")
        }

        const noteBody = normalizeString(input.note)
        if (!noteBody) return actionWarning("Quality review note cannot be empty.")
        if (noteBody.length > NOTE_MAX_LENGTH) return actionWarning(`Quality review notes must be ${NOTE_MAX_LENGTH} characters or fewer.`)

        await this.database.set(QUALITY_REVIEW_CASES_CATEGORY, ticketId, base)
        const note: OTQualityReviewNoteRecord = {
            noteId: this.randomId(),
            ticketId,
            authorUserId: normalizeString(input.actorUserId) || "unknown",
            authorLabel: normalizeString(input.actorLabel) || normalizeString(input.actorUserId) || "Unknown author",
            createdAt: now,
            body: noteBody
        }
        await this.database.set(QUALITY_REVIEW_NOTES_CATEGORY, note.noteId, note)
        return actionSuccess("Quality review note added.")
    }

    async resolveQualityReviewAsset(ticketId: string, sessionId: string, assetId: string): Promise<OTQualityReviewAssetResult> {
        const normalizedTicketId = normalizeString(ticketId)
        const normalizedSessionId = normalizeString(sessionId)
        const normalizedAssetId = normalizeString(assetId)
        if (!normalizedTicketId || !normalizedSessionId || !normalizedAssetId) {
            return assetMissing("Quality review asset is missing.")
        }

        const record = await this.readRawFeedbackRecord(normalizedSessionId)
        if (!record || record.ticketId !== normalizedTicketId) return assetMissing("Quality review asset is missing.")
        const current = await this.expireRawFeedbackRecordIfNeeded(record)
        const asset = current.answers.flatMap((answer) => answer.assets).find((candidate) => candidate.assetId === normalizedAssetId) || null
        if (!asset) return assetMissing("Quality review asset is missing.")
        if (current.storageStatus === "expired" || asset.captureStatus === "expired") {
            return {
                status: "expired",
                filePath: null,
                fileName: asset.fileName,
                contentType: asset.contentType,
                byteSize: asset.byteSize,
                message: "Quality review asset expired."
            }
        }
        if (asset.captureStatus !== "mirrored" || !asset.relativePath) return assetMissing("Quality review asset is missing.")

        const resolved = await this.resolveExistingAssetFilePath(asset.relativePath)
        if (!resolved) return assetMissing("Quality review asset is missing.")

        return {
            status: "available",
            filePath: resolved,
            fileName: asset.fileName,
            contentType: asset.contentType,
            byteSize: asset.byteSize,
            message: "Quality review asset available."
        }
    }

    async sweepExpiredRawFeedback(now = this.now()) {
        const records = await this.readRawFeedback()
        let expired = 0
        for (const record of records) {
            if (record.storageStatus === "expired" || record.retentionExpiresAt > now) continue
            await this.expireRawFeedbackRecord(record)
            expired += 1
        }
        return expired
    }

    private async mirrorAnswerAsset(input: {
        ticketId: string
        sessionId: string
        answer: unknown
        remainingSessionBytes: number
    }): Promise<{ asset: OTQualityReviewRawAssetRecord; warnings: string[] }> {
        const assetId = this.randomId()
        const attachment = normalizeAttachment(input.answer)
        const fileName = `${safePathSegment(assetId)}${safeExtension(attachment?.name, attachment?.contentType)}`
        const relativePath = toPosixPath(safePathSegment(input.ticketId), safePathSegment(input.sessionId), fileName)
        const baseRecord: OTQualityReviewRawAssetRecord = {
            assetId,
            fileName,
            contentType: attachment?.contentType || null,
            byteSize: 0,
            relativePath: null,
            captureStatus: "failed",
            reason: null
        }

        if (!attachment?.url) {
            return {
                asset: { ...baseRecord, reason: "Attachment URL unavailable." },
                warnings: ["Attachment could not be mirrored because the source URL was unavailable."]
            }
        }
        if (input.remainingSessionBytes < 1) {
            return {
                asset: { ...baseRecord, reason: "Session byte limit reached." },
                warnings: ["Attachment could not be mirrored because the session byte limit was reached."]
            }
        }
        if (attachment.size != null && attachment.size > this.config.maxMirroredFileBytes) {
            return {
                asset: { ...baseRecord, byteSize: attachment.size, reason: "File byte limit exceeded." },
                warnings: ["Attachment could not be mirrored because the file byte limit was exceeded."]
            }
        }
        if (attachment.size != null && attachment.size > input.remainingSessionBytes) {
            return {
                asset: { ...baseRecord, byteSize: attachment.size, reason: "Session byte limit exceeded." },
                warnings: ["Attachment could not be mirrored because the session byte limit was exceeded."]
            }
        }

        const destination = this.resolveAssetPath(relativePath)
        if (!destination) {
            return {
                asset: { ...baseRecord, reason: "Unsafe asset path rejected." },
                warnings: ["Attachment could not be mirrored because the destination path was unsafe."]
            }
        }

        try {
            await fs.promises.mkdir(path.dirname(destination), { recursive: true })
            const result = await this.downloadAsset(attachment.url, destination, input.remainingSessionBytes)
            return {
                asset: {
                    ...baseRecord,
                    contentType: result.contentType || attachment.contentType || null,
                    byteSize: result.byteSize,
                    relativePath,
                    captureStatus: "mirrored",
                    reason: null
                },
                warnings: []
            }
        } catch (error) {
            await fs.promises.rm(destination, { force: true }).catch(() => {})
            return {
                asset: {
                    ...baseRecord,
                    reason: safeMirrorFailureReason(error)
                },
                warnings: ["Attachment could not be mirrored into quality-review custody."]
            }
        }
    }

    private async downloadAsset(sourceUrl: string, destinationPath: string, remainingSessionBytes: number) {
        const response = await this.fetchAsset(sourceUrl)
        if (!response.ok || !response.body) {
            throw new Error("Asset download failed.")
        }

        const advertisedLength = Number(response.headers.get("content-length") ?? "0")
        if (advertisedLength > 0 && advertisedLength > this.config.maxMirroredFileBytes) {
            throw new Error("File byte limit exceeded.")
        }
        if (advertisedLength > 0 && advertisedLength > remainingSessionBytes) {
            throw new Error("Session byte limit exceeded.")
        }

        const fileHandle = fs.createWriteStream(destinationPath)
        const reader = response.body.getReader()
        let totalBytes = 0

        try {
            while (true) {
                const chunk = await reader.read()
                if (chunk.done) break
                totalBytes += chunk.value.length
                if (totalBytes > this.config.maxMirroredFileBytes) {
                    throw new Error("File byte limit exceeded.")
                }
                if (totalBytes > remainingSessionBytes) {
                    throw new Error("Session byte limit exceeded.")
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

    private buildCaseSummary(input: {
        signal: OTQualityReviewCaseSignal
        stored: OTQualityReviewCaseRecord | null
        noteCount: number
        rawFeedbackStatus: OTQualityReviewRawFeedbackListStatus
        latestRawFeedbackSessionId: string | null
    }): OTQualityReviewCaseSummary {
        const ticketId = normalizeString(input.signal.ticketId)
        const lastSignalAt = normalizeTimestamp(input.signal.lastSignalAt, input.stored?.lastSignalAt || this.now())
        const createdAt = normalizeTimestamp(input.stored?.createdAt, normalizeTimestamp(input.signal.firstKnownAt, lastSignalAt))
        const storedResolvedAt = input.stored?.resolvedAt ?? null
        const resetResolvedCase = input.stored?.state === "resolved"
            && typeof storedResolvedAt === "number"
            && lastSignalAt > storedResolvedAt

        return {
            ticketId,
            stored: Boolean(input.stored),
            state: resetResolvedCase ? "unreviewed" : input.stored?.state || "unreviewed",
            ownerUserId: resetResolvedCase ? null : input.stored?.ownerUserId || null,
            createdAt,
            updatedAt: input.stored?.updatedAt || createdAt,
            resolvedAt: resetResolvedCase ? null : storedResolvedAt,
            lastSignalAt,
            noteCount: input.noteCount,
            rawFeedbackStatus: input.rawFeedbackStatus,
            latestRawFeedbackSessionId: input.latestRawFeedbackSessionId
        }
    }

    private async expireRawFeedbackRecordIfNeeded(record: OTQualityReviewRawFeedbackRecord) {
        if (record.storageStatus === "expired" || record.retentionExpiresAt > this.now()) return record
        return await this.expireRawFeedbackRecord(record)
    }

    private async expireRawFeedbackRecord(record: OTQualityReviewRawFeedbackRecord) {
        await this.deleteMirroredFiles(record)
        const expired: OTQualityReviewRawFeedbackRecord = {
            ...record,
            storageStatus: "expired",
            answers: record.answers.map((answer) => ({
                ...answer,
                textValue: null,
                assets: answer.assets.map((asset) => ({
                    ...asset,
                    relativePath: null,
                    captureStatus: "expired",
                    reason: "Retention expired."
                }))
            }))
        }
        await this.database.set(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, expired.sessionId, expired)
        return expired
    }

    private async deleteMirroredFiles(record: OTQualityReviewRawFeedbackRecord) {
        const sessionDir = this.resolveAssetPath(toPosixPath(safePathSegment(record.ticketId), safePathSegment(record.sessionId)))
        if (sessionDir) {
            await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
        }
    }

    private resolveAssetPath(relativePath: string | null | undefined) {
        const normalized = normalizeString(relativePath)
        if (!normalized || path.isAbsolute(normalized) || normalized.includes("\\") || normalized.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
            return null
        }
        const resolved = path.resolve(this.assetRoot, ...normalized.split("/"))
        if (!this.pathIsInsideOrSame(resolved, this.assetRoot)) return null
        return resolved
    }

    private async resolveExistingAssetFilePath(relativePath: string | null | undefined) {
        const resolved = this.resolveAssetPath(relativePath)
        if (!resolved) return null

        const rootRealPath = await fs.promises.realpath(this.assetRoot).catch(() => null)
        if (!rootRealPath) return null

        const stat = await fs.promises.lstat(resolved).catch(() => null)
        if (!stat || stat.isSymbolicLink() || !stat.isFile()) return null

        const fileRealPath = await fs.promises.realpath(resolved).catch(() => null)
        if (!fileRealPath || !this.pathIsInsideOrSame(fileRealPath, rootRealPath)) return null

        return fileRealPath
    }

    private pathIsInsideOrSame(candidate: string, root: string) {
        const resolvedRoot = path.resolve(root)
        const resolvedCandidate = path.resolve(candidate)
        const comparableRoot = process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot
        const comparableCandidate = process.platform === "win32" ? resolvedCandidate.toLowerCase() : resolvedCandidate
        const rootWithSeparator = comparableRoot.endsWith(path.sep) ? comparableRoot : `${comparableRoot}${path.sep}`
        return comparableCandidate === comparableRoot || comparableCandidate.startsWith(rootWithSeparator)
    }

    private async readCase(ticketId: string) {
        const value = typeof this.database.get === "function"
            ? await this.database.get(QUALITY_REVIEW_CASES_CATEGORY, ticketId)
            : (await this.readCases()).find((record) => record.ticketId === ticketId) || null
        return isCaseRecord(value) ? value : null
    }

    private async readRawFeedbackRecord(sessionId: string) {
        const value = typeof this.database.get === "function"
            ? await this.database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, sessionId)
            : (await this.readRawFeedback()).find((record) => record.sessionId === sessionId) || null
        return isRawFeedbackRecord(value) ? value : null
    }

    private async readCases() {
        return (await this.readCategory(QUALITY_REVIEW_CASES_CATEGORY)).filter(isCaseRecord)
    }

    private async readNotes() {
        return (await this.readCategory(QUALITY_REVIEW_NOTES_CATEGORY)).filter(isNoteRecord)
    }

    private async readRawFeedback() {
        return (await this.readCategory(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY)).filter(isRawFeedbackRecord)
    }

    private async readCategory(category: string) {
        return (await this.database.getCategory(category) ?? []).map((entry) => entry.value)
    }
}

function normalizeConfig(config: Partial<OTQualityReviewConfig> | null | undefined): OTQualityReviewConfig {
    return {
        rawFeedbackRetentionDays: boundedInteger(config?.rawFeedbackRetentionDays, 1, 365, DEFAULT_CONFIG.rawFeedbackRetentionDays),
        maxMirroredFileBytes: positiveInteger(config?.maxMirroredFileBytes, DEFAULT_CONFIG.maxMirroredFileBytes),
        maxMirroredSessionBytes: positiveInteger(config?.maxMirroredSessionBytes, DEFAULT_CONFIG.maxMirroredSessionBytes)
    }
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) return fallback
    return parsed
}

function positiveInteger(value: unknown, fallback: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return parsed
}

function normalizeFeedbackSession(value: FeedbackSessionLike | null | undefined) {
    const sessionId = stringOrNull(value?.sessionId)
    const ticketId = stringOrNull(value?.ticketId)
    const triggerMode = normalizeString(value?.triggerMode)
    const status = normalizeString(value?.status)
    if (!sessionId || !ticketId) return null
    if (triggerMode !== "close" && triggerMode !== "delete" && triggerMode !== "first-close-only") return null
    if (status !== "completed" && status !== "ignored" && status !== "delivery_failed") return null
    return {
        sessionId,
        ticketId,
        triggerMode,
        status,
        completedAt: numberOrNull(value?.completedAt),
        respondentUserId: stringOrNull(value?.respondentUserId),
        closeCountAtTrigger: numberOrNull(value?.closeCountAtTrigger) ?? 0
    }
}

function normalizeAttachment(value: unknown) {
    if (!value || typeof value !== "object") return null
    const attachment = value as AttachmentLike
    const url = stringOrNull(attachment.url)
    const name = stringOrNull(attachment.name)
    const contentType = stringOrNull(attachment.contentType) || stringOrNull(attachment.content_type)
    const size = numberOrNull(attachment.size)
    return { url, name, contentType, size }
}

function isAnswered(value: unknown) {
    return value !== null && value !== undefined
}

function answerType(value: unknown): OTQualityReviewRawAnswerRecord["type"] {
    return value === "rating" || value === "image" || value === "attachment" || value === "choice" ? value : "text"
}

function isQualityReviewAction(value: unknown): value is OTQualityReviewAction {
    return (QUALITY_REVIEW_ACTIONS as readonly string[]).includes(normalizeString(value))
}

function isQualityReviewState(value: unknown): value is OTQualityReviewState {
    return (QUALITY_REVIEW_STATES as readonly string[]).includes(normalizeString(value))
}

function stringOrNull(value: unknown) {
    const normalized = normalizeString(value)
    return normalized || null
}

function normalizeString(value: unknown) {
    return typeof value === "string" ? value.trim() : ""
}

function numberOrNull(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
    return null
}

function normalizeTimestamp(value: unknown, fallback: number) {
    return numberOrNull(value) ?? fallback
}

function safePathSegment(value: string) {
    const normalized = normalizeString(value).replace(/[^A-Za-z0-9._-]/g, "_")
    return normalized || "unknown"
}

function safeExtension(name: string | null | undefined, contentType: string | null | undefined) {
    const fromName = path.extname(normalizeString(name)).toLowerCase().replace(/[^a-z0-9.]/g, "")
    if (fromName && fromName.length <= 12) return fromName
    switch (normalizeString(contentType).toLowerCase()) {
        case "image/png": return ".png"
        case "image/jpeg": return ".jpg"
        case "image/webp": return ".webp"
        case "image/gif": return ".gif"
        case "text/plain": return ".txt"
        case "application/pdf": return ".pdf"
        case "application/zip": return ".zip"
        default: return ".bin"
    }
}

function toPosixPath(...segments: string[]) {
    return segments.join("/")
}

function uniqueStrings(values: string[]) {
    return [...new Set(values.map(normalizeString).filter(Boolean))]
}

function countNotesByTicket(notes: OTQualityReviewNoteRecord[]) {
    const counts = new Map<string, number>()
    for (const note of notes) {
        counts.set(note.ticketId, (counts.get(note.ticketId) || 0) + 1)
    }
    return counts
}

function safeMirrorFailureReason(error: unknown) {
    if (!(error instanceof Error)) return "Attachment mirror failed."
    if (error.message.includes("File byte limit")) return "File byte limit exceeded."
    if (error.message.includes("Session byte limit")) return "Session byte limit exceeded."
    return "Attachment mirror failed."
}

function actionSuccess(message: string): OTQualityReviewActionResult {
    return { ok: true, status: "success", message }
}

function actionWarning(message: string): OTQualityReviewActionResult {
    return { ok: false, status: "warning", message }
}

function assetMissing(message: string): OTQualityReviewAssetResult {
    return {
        status: "missing",
        filePath: null,
        fileName: null,
        contentType: null,
        byteSize: 0,
        message
    }
}

function isCaseRecord(value: unknown): value is OTQualityReviewCaseRecord {
    const record = value as OTQualityReviewCaseRecord
    return Boolean(
        record
        && typeof record === "object"
        && typeof record.ticketId === "string"
        && isQualityReviewState(record.state)
        && (typeof record.ownerUserId === "string" || record.ownerUserId === null)
        && typeof record.createdAt === "number"
        && typeof record.updatedAt === "number"
        && (typeof record.resolvedAt === "number" || record.resolvedAt === null)
        && typeof record.lastSignalAt === "number"
    )
}

function isNoteRecord(value: unknown): value is OTQualityReviewNoteRecord {
    const record = value as OTQualityReviewNoteRecord
    return Boolean(
        record
        && typeof record === "object"
        && typeof record.noteId === "string"
        && typeof record.ticketId === "string"
        && typeof record.authorUserId === "string"
        && typeof record.authorLabel === "string"
        && typeof record.createdAt === "number"
        && typeof record.body === "string"
    )
}

function isRawFeedbackRecord(value: unknown): value is OTQualityReviewRawFeedbackRecord {
    const record = value as OTQualityReviewRawFeedbackRecord
    return Boolean(
        record
        && typeof record === "object"
        && typeof record.sessionId === "string"
        && typeof record.ticketId === "string"
        && typeof record.capturedAt === "number"
        && typeof record.retentionExpiresAt === "number"
        && (record.storageStatus === "available" || record.storageStatus === "partial" || record.storageStatus === "expired")
        && Array.isArray(record.warnings)
        && Array.isArray(record.answers)
    )
}
