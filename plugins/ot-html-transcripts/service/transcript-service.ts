import { api } from "#opendiscord"

import {
    createEmptyTranscriptOperationalListResult,
    createEmptyTranscriptSummary,
    createNotReadyActionResult,
    createTranscriptBulkActionErrorResult,
    createTranscriptPrepareBulkExportErrorResult
} from "../contracts/factories"
import { TRANSCRIPT_PLUGIN_SERVICE_ID } from "../contracts/constants"
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
