import path from "node:path"
import * as discord from "discord.js"

import { api, opendiscord, utilities } from "#opendiscord"
import {
    buildDashboardPublicUrl,
    joinBasePath,
    loadDashboardConfig
} from "../ot-dashboard/server/dashboard-config.js"

import {
    OTQualityReviewService,
    type OTQualityReviewConfig,
    type OTQualityReviewNotificationDelivery,
    type OTQualityReviewNotificationMessagePayload,
    type OTQualityReviewNotificationTargetKind
} from "./service/quality-review-service.js"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const SERVICE_ID = "ot-quality-review:service"
const CONFIG_ID = "ot-quality-review:config"
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000
const BACKGROUND_TICK_MS = 60 * 1000

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
    private backgroundTimer: NodeJS.Timeout | null = null
    private lastRawFeedbackSweepAt = 0
    private lastReminderScanAt = 0

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

    async runNotificationCycle(now = Date.now()) {
        this.service.updateConfig(readConfig())
        return await this.service.runNotificationCycle({
            tickets: await collectQualityReviewNotificationSignals(),
            now,
            queueHref: buildDashboardQualityReviewQueueHref(),
            delivery: createDiscordNotificationDelivery()
        })
    }

    startBackgroundManager() {
        if (this.backgroundTimer) return
        this.backgroundTimer = setInterval(() => {
            void this.runBackgroundTick().catch((err) => {
                opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
            })
        }, BACKGROUND_TICK_MS)
        this.backgroundTimer.unref?.()
    }

    async runBackgroundTick(now = Date.now()) {
        const config = readConfig()
        this.service.updateConfig(config)
        if (now - this.lastRawFeedbackSweepAt >= SWEEP_INTERVAL_MS) {
            this.lastRawFeedbackSweepAt = now
            await this.service.sweepExpiredRawFeedback(now)
        }
        if (!config.notificationsEnabled) return null
        if (now - this.lastReminderScanAt < config.reminderCheckMinutes * BACKGROUND_TICK_MS) return null
        this.lastReminderScanAt = now
        return await this.runNotificationCycle(now)
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

    getDashboardQualityReviewNotificationStatus(input?: Parameters<OTQualityReviewService["getDashboardQualityReviewNotificationStatus"]>[0]) {
        this.service.updateConfig(readConfig())
        return this.service.getDashboardQualityReviewNotificationStatus(input)
    }
}

function readConfig(): OTQualityReviewConfig {
    const data = (opendiscord.configs.exists(CONFIG_ID)
        ? opendiscord.configs.get(CONFIG_ID).data
        : {}) as Partial<OTQualityReviewConfig>
    return {
        rawFeedbackRetentionDays: typeof data.rawFeedbackRetentionDays === "number" ? data.rawFeedbackRetentionDays : 90,
        maxMirroredFileBytes: typeof data.maxMirroredFileBytes === "number" ? data.maxMirroredFileBytes : 26214400,
        maxMirroredSessionBytes: typeof data.maxMirroredSessionBytes === "number" ? data.maxMirroredSessionBytes : 262144000,
        notificationsEnabled: data.notificationsEnabled === true,
        deliveryChannelIds: Array.isArray(data.deliveryChannelIds) ? data.deliveryChannelIds.map(String) : [],
        reminderCheckMinutes: typeof data.reminderCheckMinutes === "number" ? data.reminderCheckMinutes : 60,
        overdueReminderCooldownHours: typeof data.overdueReminderCooldownHours === "number" ? data.overdueReminderCooldownHours : 24,
        digestEnabled: data.digestEnabled === true,
        digestHourUtc: typeof data.digestHourUtc === "number" ? data.digestHourUtc : 14,
        digestMaxTickets: typeof data.digestMaxTickets === "number" ? data.digestMaxTickets : 10
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

function getTelemetryService(): any | null {
    try {
        if (!opendiscord.plugins.classes.exists("ot-telemetry:service")) return null
        return opendiscord.plugins.classes.get("ot-telemetry:service") as any
    } catch {
        return null
    }
}

async function collectQualityReviewNotificationSignals() {
    const telemetry = getTelemetryService()
    if (!telemetry || typeof telemetry.listFeedbackHistory !== "function" || typeof telemetry.listLifecycleHistory !== "function") {
        return []
    }
    const [feedback, lifecycle] = await Promise.all([
        telemetry.listFeedbackHistory().catch(() => []),
        telemetry.listLifecycleHistory().catch(() => [])
    ])
    const byTicket = new Map<string, {
        ticketId: string
        firstKnownAt: number | null
        lastSignalAt: number | null
        latestCompletedAnsweredSessionId: string | null
        latestCompletedAnsweredAt: number
    }>()
    const ensure = (ticketId: string) => {
        const normalized = normalizeString(ticketId)
        if (!normalized) return null
        let record = byTicket.get(normalized)
        if (!record) {
            record = {
                ticketId: normalized,
                firstKnownAt: null,
                lastSignalAt: null,
                latestCompletedAnsweredSessionId: null,
                latestCompletedAnsweredAt: 0
            }
            byTicket.set(normalized, record)
        }
        return record
    }
    for (const item of Array.isArray(feedback) ? feedback : []) {
        const record = ensure(item?.ticketId)
        if (!record) continue
        const occurredAt = feedbackSignalTime(item)
        record.firstKnownAt = minTimestamp(record.firstKnownAt, occurredAt)
        record.lastSignalAt = maxTimestamp(record.lastSignalAt, occurredAt)
        const completedAt = typeof item?.completedAt === "number" ? item.completedAt : 0
        if (item?.status === "completed" && completedAt >= record.latestCompletedAnsweredAt && hasAnsweredQuestion(item)) {
            record.latestCompletedAnsweredAt = completedAt
            record.latestCompletedAnsweredSessionId = normalizeString(item?.sessionId) || null
        }
    }
    for (const item of Array.isArray(lifecycle) ? lifecycle : []) {
        const record = ensure(item?.ticketId)
        if (!record) continue
        const occurredAt = typeof item?.occurredAt === "number" ? item.occurredAt : 0
        record.firstKnownAt = minTimestamp(record.firstKnownAt, occurredAt)
        record.lastSignalAt = maxTimestamp(record.lastSignalAt, occurredAt)
    }
    return [...byTicket.values()].map(({ latestCompletedAnsweredAt, ...record }) => record)
}

function createDiscordNotificationDelivery(): OTQualityReviewNotificationDelivery | null {
    const guild = opendiscord.client.mainServer
    if (!guild) return null
    return {
        expectedGuildId: guild.id,
        async resolveTarget(channelId) {
            const channel = await guild.channels.fetch(channelId).catch(() => null)
            if (!channel) return null
            const botMember = guild.members.me
                || (opendiscord.client.client.user
                    ? await guild.members.fetch(opendiscord.client.client.user.id).catch(() => null)
                    : null)
            const permissions = botMember && "permissionsFor" in channel
                ? (channel as any).permissionsFor(botMember)
                : null
            return {
                id: channelId,
                guildId: "guildId" in channel ? String((channel as any).guildId || "") : String((channel as any).guild?.id || ""),
                kind: notificationTargetKind(channel),
                canView: Boolean(permissions?.has("ViewChannel")),
                canSend: Boolean(permissions?.has("SendMessages")),
                send: async (payload: OTQualityReviewNotificationMessagePayload) => {
                    await (channel as any).send(payload)
                }
            }
        }
    }
}

function notificationTargetKind(channel: { type?: unknown }): OTQualityReviewNotificationTargetKind {
    switch (channel.type) {
        case discord.ChannelType.GuildText:
            return "text"
        case discord.ChannelType.GuildAnnouncement:
            return "announcement"
        case discord.ChannelType.PublicThread:
        case discord.ChannelType.PrivateThread:
        case discord.ChannelType.AnnouncementThread:
            return "thread"
        case discord.ChannelType.GuildForum:
            return "forum"
        case (discord.ChannelType as any).GuildMedia:
            return "media"
        case discord.ChannelType.GuildVoice:
            return "voice"
        case discord.ChannelType.GuildStageVoice:
            return "stage"
        case discord.ChannelType.DM:
        case discord.ChannelType.GroupDM:
            return "dm"
        default:
            return "unknown"
    }
}

function buildDashboardQualityReviewQueueHref() {
    try {
        const dashboardConfig = loadDashboardConfig(path.resolve(process.cwd(), "plugins", "ot-dashboard"))
        return buildDashboardPublicUrl(dashboardConfig, "admin/quality-review")
            || joinBasePath(dashboardConfig.basePath, "admin/quality-review")
    } catch {
        return "/admin/quality-review"
    }
}

function normalizeString(value: unknown) {
    return typeof value === "string" ? value.trim() : ""
}

function minTimestamp(current: number | null, candidate: number) {
    if (!Number.isFinite(candidate) || candidate <= 0) return current
    return current === null ? candidate : Math.min(current, candidate)
}

function maxTimestamp(current: number | null, candidate: number) {
    if (!Number.isFinite(candidate) || candidate <= 0) return current
    return current === null ? candidate : Math.max(current, candidate)
}

function feedbackSignalTime(item: any) {
    return typeof item?.completedAt === "number" && item.completedAt > 0
        ? item.completedAt
        : typeof item?.triggeredAt === "number"
            ? item.triggeredAt
            : 0
}

function hasAnsweredQuestion(item: any) {
    return Array.isArray(item?.questionSummaries) && item.questionSummaries.some((question: any) => question?.answered === true)
}

opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(new OTQualityReviewConfigFile(CONFIG_ID, "config.json", "./plugins/ot-quality-review/"))
})

opendiscord.events.get("onCheckerLoad").listen((checkers) => {
    const config = opendiscord.configs.get(CONFIG_ID)
    const structure = new api.ODCheckerObjectStructure(CONFIG_ID, { children: [
        { key: "rawFeedbackRetentionDays", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:raw-retention-days", { min: 1, max: 365, floatAllowed: false }) },
        { key: "maxMirroredFileBytes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:max-file-bytes", { min: 1, floatAllowed: false }) },
        { key: "maxMirroredSessionBytes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:max-session-bytes", { min: 1, floatAllowed: false }) },
        { key: "notificationsEnabled", optional: false, priority: 0, checker: new api.ODCheckerBooleanStructure("ot-quality-review:notifications-enabled", {}) },
        { key: "deliveryChannelIds", optional: false, priority: 0, checker: new api.ODCheckerCustomStructure_DiscordIdArray("ot-quality-review:delivery-channel-ids", "channel", [], { allowDoubles: false }) },
        { key: "reminderCheckMinutes", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:reminder-check-minutes", { min: 15, max: 1440, floatAllowed: false }) },
        { key: "overdueReminderCooldownHours", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:reminder-cooldown-hours", { min: 1, max: 168, floatAllowed: false }) },
        { key: "digestEnabled", optional: false, priority: 0, checker: new api.ODCheckerBooleanStructure("ot-quality-review:digest-enabled", {}) },
        { key: "digestHourUtc", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:digest-hour-utc", { min: 0, max: 23, floatAllowed: false }) },
        { key: "digestMaxTickets", optional: false, priority: 0, checker: new api.ODCheckerNumberStructure("ot-quality-review:digest-max-tickets", { min: 1, max: 25, floatAllowed: false }) }
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
    service.startBackgroundManager()
})

const feedbackEvent = opendiscord.events.get("ot-feedback:afterFeedback" as any) as api.ODEvent | null
feedbackEvent?.listen(async (payload) => {
    try {
        await getService()?.captureFeedbackPayload(payload as any)
    } catch (err) {
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
    }
})
