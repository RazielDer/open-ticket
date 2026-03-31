import type {
    ActionResult,
    TranscriptAdminAction,
    TranscriptBulkActionResult,
    TranscriptOperationalMatchingSummary,
    TranscriptOperationalListResult,
    TranscriptPrepareBulkExportResult,
    TranscriptSummary
} from "./types"

export function createEmptyTranscriptSummary(): TranscriptSummary {
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
}

export function createNotReadyActionResult(action: TranscriptAdminAction, target: string, reason?: string): ActionResult {
    return {
        ok: false,
        action,
        target,
        status: "not-ready",
        message: "The local transcript service is not healthy.",
        reason
    }
}

export function createOkActionResult(action: TranscriptAdminAction, target: string, message: string, reason?: string): ActionResult {
    return {
        ok: true,
        action,
        target,
        status: "ok",
        message,
        reason
    }
}

export function createErrorActionResult(action: TranscriptAdminAction, target: string, message: string, reason?: string): ActionResult {
    return {
        ok: false,
        action,
        target,
        status: "error",
        message,
        reason
    }
}

export function createEmptyTranscriptOperationalListResult(): TranscriptOperationalListResult {
    return {
        total: 0,
        matchingSummary: createEmptyTranscriptOperationalMatchingSummary(),
        items: []
    }
}

export function createEmptyTranscriptOperationalMatchingSummary(): TranscriptOperationalMatchingSummary {
    return {
        total: 0,
        active: 0,
        partial: 0,
        revoked: 0,
        deleted: 0,
        failed: 0,
        building: 0
    }
}

export function createTranscriptBulkActionErrorResult(
    action: TranscriptBulkActionResult["action"],
    message: string
): TranscriptBulkActionResult {
    return {
        action,
        requested: 0,
        succeeded: 0,
        skipped: 0,
        failed: 0,
        items: [],
        message
    }
}

export function createTranscriptPrepareBulkExportErrorResult(message: string): TranscriptPrepareBulkExportResult {
    return {
        ok: false,
        message,
        export: null,
        items: []
    }
}
