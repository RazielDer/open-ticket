import { api } from "#opendiscord"

import {
    createEmptyTranscriptOperationalListResult,
    createEmptyTranscriptSummary,
    createNotReadyActionResult,
    createTranscriptBulkActionErrorResult,
    createTranscriptPrepareBulkExportErrorResult
} from "../contracts/factories"
import { TRANSCRIPT_PLUGIN_SERVICE_ID } from "../contracts/constants"
import type { TranscriptChannelDeliveryWarning } from "../routing/channel-delivery"
import { resolveTranscriptTargetChannels } from "../routing/channel-delivery"
import type { TicketOptionTranscriptRoutingTargets } from "../routing/option-routing"
import { resolveEffectiveTranscriptChannelTargets } from "../routing/option-routing"
import type {
    ActionResult,
    ListViewerAccessibleTranscriptsQuery,
    ListViewerAccessibleTranscriptsResult,
    TranscriptAccessPolicy,
    TranscriptBulkActionResult,
    TranscriptExportFormat,
    TranscriptHtmlStyleDraft,
    TranscriptIntegrityRepairAction,
    TranscriptIntegrityRepairResult,
    TranscriptIntegritySummary,
    TranscriptOperationalListQuery,
    TranscriptOperationalListResult,
    TranscriptPrepareExportResult,
    TranscriptPrepareBulkExportResult,
    TranscriptStylePreset,
    TranscriptStylePreviewResult,
    ListTranscriptEventsQuery,
    ListTranscriptEventsResult,
    ListTranscriptsQuery,
    ListTranscriptsResult,
    TicketAnalyticsHistoryQuery,
    TicketAnalyticsHistoryResult,
    TranscriptDetail,
    TranscriptRecord,
    TranscriptRetentionExecutionResult,
    TranscriptRetentionPreview,
    TranscriptSummary,
    TranscriptViewerAccessContext,
    TranscriptViewerAssetResult,
    TranscriptViewerDocumentResult
} from "../contracts/types"
import { TranscriptHttpServer } from "../http/server"
import { TranscriptServiceCore } from "./transcript-service-core"

export interface TranscriptWhitelistBridgeReadinessResult {
    ready: boolean
    message: string
    routing: TicketOptionTranscriptRoutingTargets | null
    targetChannelId: string | null
    warnings: TranscriptChannelDeliveryWarning[]
}

export interface TranscriptWhitelistBridgeCompileResult extends TranscriptWhitelistBridgeReadinessResult {
    success: boolean
    transcriptUrl: string | null
}

function getRuntime() {
    return require("#opendiscord") as typeof import("#opendiscord")
}

function getTicketOptionId(ticket: unknown): string | null {
    const optionId = (ticket as { option?: { id?: { value?: unknown } } } | null)?.option?.id?.value
    return typeof optionId == "string" && optionId.trim().length > 0 ? optionId.trim() : null
}

function normalizeOptionalUrl(value: unknown): string | null {
    return typeof value == "string" && value.trim().length > 0 ? value.trim() : null
}

function describeWhitelistBridgeReadinessWarning(warning: TranscriptChannelDeliveryWarning | null): string {
    switch (warning?.code) {
        case "invalid-id":
            return "Whitelist review cannot start until the transcript archive lane uses a valid Discord channel id."
        case "fetch-failed":
            return "Whitelist review cannot start until the transcript archive lane can be fetched from the OT guild and verified as a text channel."
        case "missing-channel":
            return "Whitelist review cannot start until the transcript archive lane points to an existing OT-guild text channel. The configured lane may have been deleted."
        case "non-text-channel":
            return "Whitelist review cannot start until the transcript archive lane points to an OT-guild text channel."
        case "wrong-guild":
            return "Whitelist review cannot start until the transcript archive lane points to a text channel in the same OT guild as the ticket."
        default:
            return "Whitelist review cannot start until the transcript archive lane is ready."
    }
}

export class OTHtmlTranscriptService extends api.ODManagerData {
    readonly core = new TranscriptServiceCore()
    server: TranscriptHttpServer | null = null

    constructor(id: api.ODValidId = TRANSCRIPT_PLUGIN_SERVICE_ID) {
        super(id)
    }

    async initialize(config: Parameters<TranscriptServiceCore["initialize"]>[0]) {
        await this.core.initialize(config)
        this.server = new TranscriptHttpServer(this)
        await this.server.start()
    }

    async shutdown() {
        if (this.server) {
            await this.server.stop()
            this.server = null
        }
        await this.core.shutdown()
    }

    setHealthy(healthy: boolean) {
        if (!healthy) {
            void this.shutdown()
        }
    }

    setSummary(summary: TranscriptSummary) {
        void summary
    }

    isHealthy(): boolean {
        return this.core.isHealthy()
    }

    async getSummary(): Promise<TranscriptSummary> {
        if (!this.core.isHealthy()) return createEmptyTranscriptSummary()
        return await this.core.getSummary()
    }

    async resolveTranscript(target: string): Promise<TranscriptRecord | null> {
        return await this.core.resolveTranscript(target)
    }

    async resolveAdminTarget(target: string): Promise<TranscriptRecord | null> {
        return await this.core.resolveAdminTarget(target)
    }

    async listTranscripts(query: ListTranscriptsQuery): Promise<ListTranscriptsResult> {
        return await this.core.listTranscripts(query)
    }

    async listTicketAnalyticsHistory(query: TicketAnalyticsHistoryQuery): Promise<TicketAnalyticsHistoryResult> {
        if (!this.core.isHealthy()) {
            return {
                total: 0,
                items: [],
                warnings: ["Transcript analytics history is unavailable while the transcript service is unhealthy."],
                nextCursor: null,
                truncated: false
            }
        }
        return await this.core.listTicketAnalyticsHistory(query)
    }

    async listOperationalTranscripts(query: TranscriptOperationalListQuery): Promise<TranscriptOperationalListResult> {
        if (!this.core.isHealthy()) return createEmptyTranscriptOperationalListResult()
        return await this.core.listOperationalTranscripts(query)
    }

    async getAccessPolicy(): Promise<TranscriptAccessPolicy> {
        return await this.core.getAccessPolicy()
    }

    async listTranscriptStylePresets(): Promise<TranscriptStylePreset[]> {
        return await this.core.listTranscriptStylePresets()
    }

    async renderTranscriptStylePreview(styleDraft: TranscriptHtmlStyleDraft): Promise<TranscriptStylePreviewResult> {
        return await this.core.renderTranscriptStylePreview(styleDraft)
    }

    async getTranscriptDetail(target: string): Promise<TranscriptDetail | null> {
        return await this.core.getTranscriptDetail(target)
    }

    async listTranscriptEvents(target: string, query: ListTranscriptEventsQuery): Promise<ListTranscriptEventsResult> {
        return await this.core.listTranscriptEvents(target, query)
    }

    async previewRetentionSweep(): Promise<TranscriptRetentionPreview> {
        return await this.core.previewRetentionSweep()
    }

    async executeRetentionSweep(trigger?: "manual" | "startup"): Promise<TranscriptRetentionExecutionResult> {
        return await this.core.executeRetentionSweep(trigger)
    }

    async getIntegritySummary(): Promise<TranscriptIntegritySummary> {
        return await this.core.getIntegritySummary()
    }

    async scanTranscriptIntegrity(target: string) {
        return await this.core.scanTranscriptIntegrity(target)
    }

    async repairTranscriptIntegrity(target: string, actions?: TranscriptIntegrityRepairAction[]): Promise<TranscriptIntegrityRepairResult> {
        return await this.core.repairTranscriptIntegrity(target, actions)
    }

    async prepareTranscriptExport(target: string, format?: TranscriptExportFormat): Promise<TranscriptPrepareExportResult> {
        return await this.core.prepareTranscriptExport(target, format)
    }

    async releasePreparedTranscriptExport(exportId: string): Promise<boolean> {
        return await this.core.releasePreparedTranscriptExport(exportId)
    }

    async bulkRevokeTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult> {
        if (!this.core.isHealthy()) return createTranscriptBulkActionErrorResult("revoke", "Transcript service is not initialized.")
        return await this.core.bulkRevokeTranscripts(ids, reason)
    }

    async bulkDeleteTranscripts(ids: string[], reason?: string): Promise<TranscriptBulkActionResult> {
        if (!this.core.isHealthy()) return createTranscriptBulkActionErrorResult("delete", "Transcript service is not initialized.")
        return await this.core.bulkDeleteTranscripts(ids, reason)
    }

    async prepareBulkTranscriptExport(ids: string[]): Promise<TranscriptPrepareBulkExportResult> {
        if (!this.core.isHealthy()) return createTranscriptPrepareBulkExportErrorResult("Transcript service is not initialized.")
        return await this.core.prepareBulkTranscriptExport(ids)
    }

    async listViewerAccessibleTranscripts(
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext,
        query: ListViewerAccessibleTranscriptsQuery = {}
    ): Promise<ListViewerAccessibleTranscriptsResult> {
        return await this.core.listViewerAccessibleTranscripts(viewerUserId, viewerAccess, query)
    }

    async renderViewerTranscript(
        slug: string,
        viewerUserId: string,
        assetBasePath: string,
        viewerAccess: TranscriptViewerAccessContext
    ): Promise<TranscriptViewerDocumentResult> {
        return await this.core.renderViewerTranscript(slug, viewerUserId, assetBasePath, viewerAccess)
    }

    async resolveViewerTranscriptAsset(
        slug: string,
        assetName: string,
        viewerUserId: string,
        viewerAccess: TranscriptViewerAccessContext
    ): Promise<TranscriptViewerAssetResult> {
        return await this.core.resolveViewerTranscriptAsset(slug, assetName, viewerUserId, viewerAccess)
    }

    async compileHtmlTranscript(ticket: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[0], channel: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[1], user: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[2]) {
        return await this.core.compileHtmlTranscript(ticket, channel, user)
    }

    async validateWhitelistBridgeTranscriptReadiness(
        ticket: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[0],
        channel: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[1]
    ): Promise<TranscriptWhitelistBridgeReadinessResult> {
        if (!this.core.isHealthy()) {
            return {
                ready: false,
                message: "Whitelist review cannot start until the transcript service is healthy.",
                routing: null,
                targetChannelId: null,
                warnings: []
            }
        }

        const accessPolicy = await this.getAccessPolicy()
        if (accessPolicy.mode == "private-discord" && !accessPolicy.viewerReady) {
            return {
                ready: false,
                message: accessPolicy.message,
                routing: null,
                targetChannelId: null,
                warnings: []
            }
        }

        const optionId = getTicketOptionId(ticket)
        if (!optionId) {
            return {
                ready: false,
                message: "Whitelist review cannot start until transcript routing is configured for this ticket option.",
                routing: null,
                targetChannelId: null,
                warnings: []
            }
        }

        const routing = resolveEffectiveTranscriptChannelTargets(optionId)
        if (!routing || routing.targets.length < 1) {
            return {
                ready: false,
                message: "Whitelist review cannot start until a dedicated transcript archive lane is configured for this whitelist ticket option.",
                routing,
                targetChannelId: null,
                warnings: []
            }
        }

        if (routing.targets.length != 1) {
            return {
                ready: false,
                message: "Whitelist review cannot start until exactly one dedicated transcript archive lane is configured for this whitelist ticket option.",
                routing,
                targetChannelId: null,
                warnings: []
            }
        }

        const resolution = await resolveTranscriptTargetChannels({
            guild: channel.guild,
            targetIds: routing.targets,
            optionId
        })
        if (resolution.resolvedTargets.length != 1) {
            return {
                ready: false,
                message: describeWhitelistBridgeReadinessWarning(resolution.warnings[0] ?? null),
                routing,
                targetChannelId: null,
                warnings: resolution.warnings
            }
        }

        return {
            ready: true,
            message: "Whitelist transcript staging is ready.",
            routing,
            targetChannelId: resolution.resolvedTargets[0].targetId,
            warnings: resolution.warnings
        }
    }

    async compileWhitelistBridgeTranscript(
        ticket: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[0],
        channel: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[1],
        user: Parameters<TranscriptServiceCore["compileHtmlTranscript"]>[2]
    ): Promise<TranscriptWhitelistBridgeCompileResult> {
        const readiness = await this.validateWhitelistBridgeTranscriptReadiness(ticket, channel)
        if (!readiness.ready) {
            return {
                ...readiness,
                success: false,
                transcriptUrl: null
            }
        }

        const runtime = getRuntime()
        const action = runtime.opendiscord.actions.get("opendiscord:create-transcript")
        if (!action) {
            return {
                ...readiness,
                success: false,
                message: "Whitelist review cannot start until the Open Ticket transcript action is available.",
                transcriptUrl: null
            }
        }

        const actionResult = await action.run("other", {
            guild: channel.guild as never,
            channel: channel as never,
            user: user as never,
            ticket: ticket as never
        })
        const knownError = normalizeOptionalUrl(actionResult.errorReason)
            ?? normalizeOptionalUrl(actionResult.result?.errorReason)
        if (actionResult.success !== true || actionResult.result?.success !== true) {
            return {
                ...readiness,
                success: false,
                message: knownError ?? "Whitelist review cannot start until transcript generation succeeds.",
                transcriptUrl: null
            }
        }

        const transcriptUrl = normalizeOptionalUrl((await this.resolveAdminTarget(channel.id))?.publicUrl)
        if (!transcriptUrl) {
            return {
                ...readiness,
                success: false,
                message: "Whitelist review cannot start because the compiled transcript URL could not be resolved.",
                transcriptUrl: null
            }
        }

        return {
            ...readiness,
            success: true,
            message: "Whitelist transcript staging is ready.",
            transcriptUrl
        }
    }

    async revokeTranscript(id: string, reason?: string): Promise<ActionResult> {
        if (!this.core.isHealthy()) return createNotReadyActionResult("revoke", id, reason)
        return await this.core.revokeTranscript(id, reason)
    }

    async reissueTranscript(id: string, reason?: string): Promise<ActionResult> {
        if (!this.core.isHealthy()) return createNotReadyActionResult("reissue", id, reason)
        return await this.core.reissueTranscript(id, reason)
    }

    async deleteTranscript(id: string, reason?: string): Promise<ActionResult> {
        if (!this.core.isHealthy()) return createNotReadyActionResult("delete", id, reason)
        return await this.core.deleteTranscript(id, reason)
    }

    buildPublicTranscriptUrl(slug: string) {
        return this.core.buildPublicTranscriptUrl(slug)
    }
}
