import { api, opendiscord, utilities } from "#opendiscord"

import {
    OTQualityReviewService,
    type OTQualityReviewConfig
} from "./service/quality-review-service.js"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const SERVICE_ID = "ot-quality-review:service"
const CONFIG_ID = "ot-quality-review:config"
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

class OTQualityReviewConfigFile extends api.ODJsonConfig {
    declare data: OTQualityReviewConfig
}

declare module "#opendiscord-types" {
    export interface ODPluginManagerIds_Default {
        "ot-quality-review": api.ODPlugin
    }
    export interface ODConfigManagerIds_Default {
        "ot-quality-review:config": OTQualityReviewConfigFile
    }
    export interface ODCheckerManagerIds_Default {
        "ot-quality-review:config": api.ODChecker
    }
    export interface ODPluginClassManagerIds_Default {
        "ot-quality-review:service": OTQualityReviewPluginService
    }
}

class OTQualityReviewPluginService extends api.ODManagerData {
    private readonly service: OTQualityReviewService
    private sweepTimer: NodeJS.Timeout | null = null

    constructor() {
        super(SERVICE_ID)
        this.service = new OTQualityReviewService({
            database: opendiscord.databases.get("opendiscord:global"),
            assetRoot: "./runtime/ot-quality-review/assets",
            config: readConfig()
        })
    }

    restore() {
        this.service.updateConfig(readConfig())
        return this.service.restore()
    }

    async sweepExpiredRawFeedback() {
        this.service.updateConfig(readConfig())
        return await this.service.sweepExpiredRawFeedback()
    }

    startRetentionSweeper() {
        if (this.sweepTimer) return
        this.sweepTimer = setInterval(() => {
            void this.sweepExpiredRawFeedback().catch((err) => {
                opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
            })
        }, SWEEP_INTERVAL_MS)
        this.sweepTimer.unref?.()
    }

    captureFeedbackPayload(payload: { session?: unknown; responses?: unknown[] }) {
        this.service.updateConfig(readConfig())
        return this.service.captureFeedbackPayload(payload as any)
    }

    listDashboardQualityReviewCases(input: Parameters<OTQualityReviewService["listDashboardQualityReviewCases"]>[0]) {
        this.service.updateConfig(readConfig())
        return this.service.listDashboardQualityReviewCases(input)
    }

    getDashboardQualityReviewCase(ticketId: string, signal?: Parameters<OTQualityReviewService["getDashboardQualityReviewCase"]>[1]) {
        this.service.updateConfig(readConfig())
        return this.service.getDashboardQualityReviewCase(ticketId, signal)
    }

    runDashboardQualityReviewAction(input: Parameters<OTQualityReviewService["runDashboardQualityReviewAction"]>[0]) {
        this.service.updateConfig(readConfig())
        return this.service.runDashboardQualityReviewAction(input)
    }

    resolveQualityReviewAsset(ticketId: string, sessionId: string, assetId: string) {
        this.service.updateConfig(readConfig())
        return this.service.resolveQualityReviewAsset(ticketId, sessionId, assetId)
    }
}

function readConfig(): OTQualityReviewConfig {
    const data = (opendiscord.configs.exists(CONFIG_ID)
        ? opendiscord.configs.get(CONFIG_ID).data
        : {}) as Partial<OTQualityReviewConfig>
    return {
        rawFeedbackRetentionDays: typeof data.rawFeedbackRetentionDays === "number" ? data.rawFeedbackRetentionDays : 90,
        maxMirroredFileBytes: typeof data.maxMirroredFileBytes === "number" ? data.maxMirroredFileBytes : 26214400,
        maxMirroredSessionBytes: typeof data.maxMirroredSessionBytes === "number" ? data.maxMirroredSessionBytes : 262144000
    }
}

function getService(): OTQualityReviewPluginService | null {
    try {
        if (!opendiscord.plugins.classes.exists(SERVICE_ID)) return null
        return opendiscord.plugins.classes.get(SERVICE_ID) as OTQualityReviewPluginService
    } catch {
        return null
    }
}

opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(new OTQualityReviewConfigFile(CONFIG_ID, "config.json", "./plugins/ot-quality-review/"))
})

opendiscord.events.get("onCheckerLoad").listen((checkers) => {
    const config = opendiscord.configs.get(CONFIG_ID)
    const structure = new api.ODCheckerObjectStructure(CONFIG_ID, { children: [
        { key: "rawFeedbackRetentionDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:raw-retention-days", { min: 1, max: 365, floatAllowed: false }) },
        { key: "maxMirroredFileBytes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:max-file-bytes", { min: 1, floatAllowed: false }) },
        { key: "maxMirroredSessionBytes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:max-session-bytes", { min: 1, floatAllowed: false }) }
    ] })
    checkers.add(new api.ODChecker(CONFIG_ID, checkers.storage, 0, config, structure))
})

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
    classes.add(new OTQualityReviewPluginService())
})

opendiscord.events.get("afterCodeExecuted").listen(async () => {
    const service = getService()
    if (!service) return
    await service.restore()
    await service.sweepExpiredRawFeedback()
    service.startRetentionSweeper()
})

const feedbackEvent = opendiscord.events.get("ot-feedback:afterFeedback" as any) as api.ODEvent | null
feedbackEvent?.listen(async (payload) => {
    try {
        await getService()?.captureFeedbackPayload(payload as any)
    } catch (err) {
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
    }
})
