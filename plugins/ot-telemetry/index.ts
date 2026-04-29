import { api, opendiscord, utilities } from "#opendiscord"

import {
    OTTelemetryService,
    resolveTelemetryTicketId,
    type OTTelemetryFeedbackPayload,
    type OTTelemetryLifecycleEventType,
    type OTTelemetryTicketSnapshot,
    type TelemetryTicketLike
} from "./service/telemetry-service.js"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const SERVICE_ID = "ot-telemetry:service"

declare module "#opendiscord-types" {
    export interface ODPluginManagerIds_Default {
        "ot-telemetry": api.ODPlugin
    }
    export interface ODPluginClassManagerIds_Default {
        "ot-telemetry:service": OTTelemetryPluginService
    }
}

class OTTelemetryPluginService extends api.ODManagerData {
    private readonly service: OTTelemetryService
    private readonly previousSnapshots = new Map<string, OTTelemetryTicketSnapshot>()

    constructor() {
        super(SERVICE_ID)
        this.service = new OTTelemetryService({
            database: opendiscord.databases.get("opendiscord:global")
        })
    }

    restore() {
        return this.service.restore()
    }

    snapshotTicket(ticket: TelemetryTicketLike | null | undefined) {
        return this.service.createTicketSnapshot(ticket)
    }

    capturePreviousSnapshot(eventType: OTTelemetryLifecycleEventType, ticket: TelemetryTicketLike) {
        const ticketId = resolveTelemetryTicketId(ticket)
        if (!ticketId) return null
        const snapshot = this.snapshotTicket(ticket)
        this.previousSnapshots.set(previousSnapshotKey(eventType, ticketId), snapshot)
        return snapshot
    }

    consumePreviousSnapshot(eventType: OTTelemetryLifecycleEventType, ticket: TelemetryTicketLike) {
        const ticketId = resolveTelemetryTicketId(ticket)
        if (!ticketId) return null
        const key = previousSnapshotKey(eventType, ticketId)
        const snapshot = this.previousSnapshots.get(key) ?? null
        this.previousSnapshots.delete(key)
        return snapshot
    }

    appendLifecycleEvent(input: Parameters<OTTelemetryService["appendLifecycleEvent"]>[0]) {
        return this.service.appendLifecycleEvent(input)
    }

    storeFeedbackSession(payload: OTTelemetryFeedbackPayload<any>, input: Parameters<OTTelemetryService["storeFeedbackSession"]>[1] = {}) {
        return this.service.storeFeedbackSession(payload, input)
    }

    listLifecycleHistory(filters?: Parameters<OTTelemetryService["listLifecycleHistory"]>[0]) {
        return this.service.listLifecycleHistory(filters)
    }

    listFeedbackHistory(filters?: Parameters<OTTelemetryService["listFeedbackHistory"]>[0]) {
        return this.service.listFeedbackHistory(filters)
    }
}

const feedbackSnapshots = new Map<string, OTTelemetryTicketSnapshot>()

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
    classes.add(new OTTelemetryPluginService())
})

opendiscord.events.get("afterCodeExecuted").listen(async () => {
    await getTelemetryService()?.restore()
})

function previousSnapshotKey(eventType: OTTelemetryLifecycleEventType, ticketId: string) {
    return `${eventType}:${ticketId}`
}

function getTelemetryService(): OTTelemetryPluginService | null {
    try {
        if (!opendiscord.plugins.classes.exists(SERVICE_ID)) return null
        return opendiscord.plugins.classes.get(SERVICE_ID) as OTTelemetryPluginService
    } catch {
        return null
    }
}

function actorUserId(user: { id?: unknown } | null | undefined) {
    return typeof user?.id == "string" ? user.id : null
}

function cacheFeedbackSnapshot(ticket: TelemetryTicketLike) {
    const service = getTelemetryService()
    const ticketId = resolveTelemetryTicketId(ticket)
    if (!service || !ticketId) return
    feedbackSnapshots.set(ticketId, service.snapshotTicket(ticket))
}

async function safelyAppendNativeLifecycleEvent(
    eventType: OTTelemetryLifecycleEventType,
    ticket: TelemetryTicketLike,
    actor: { id?: unknown } | null | undefined
) {
    const service = getTelemetryService()
    if (!service) return
    try {
        await service.appendLifecycleEvent({
            eventType,
            ticket,
            actorUserId: actorUserId(actor),
            previousSnapshot: service.consumePreviousSnapshot(eventType, ticket)
        })
    } catch (err) {
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
    }
}

function captureNativePreviousSnapshot(eventType: OTTelemetryLifecycleEventType, ticket: TelemetryTicketLike) {
    getTelemetryService()?.capturePreviousSnapshot(eventType, ticket)
}

opendiscord.events.get("onTicketClose").listen((ticket) => {
    captureNativePreviousSnapshot("closed", ticket)
    cacheFeedbackSnapshot(ticket)
})
opendiscord.events.get("afterTicketClosed").listen((ticket, closer) => safelyAppendNativeLifecycleEvent("closed", ticket, closer))

opendiscord.events.get("onTicketReopen").listen((ticket) => captureNativePreviousSnapshot("reopened", ticket))
opendiscord.events.get("afterTicketReopened").listen((ticket, reopener) => safelyAppendNativeLifecycleEvent("reopened", ticket, reopener))

opendiscord.events.get("onTicketClaim").listen((ticket) => captureNativePreviousSnapshot("claimed", ticket))
opendiscord.events.get("afterTicketClaimed").listen((ticket, claimer) => safelyAppendNativeLifecycleEvent("claimed", ticket, claimer))

opendiscord.events.get("onTicketUnclaim").listen((ticket) => captureNativePreviousSnapshot("unclaimed", ticket))
opendiscord.events.get("afterTicketUnclaimed").listen((ticket, unclaimer) => safelyAppendNativeLifecycleEvent("unclaimed", ticket, unclaimer))

opendiscord.events.get("onTicketMove").listen((ticket) => captureNativePreviousSnapshot("moved", ticket))
opendiscord.events.get("afterTicketMoved").listen((ticket, mover) => safelyAppendNativeLifecycleEvent("moved", ticket, mover))

opendiscord.events.get("onTicketTransfer").listen((ticket) => captureNativePreviousSnapshot("transferred", ticket))
opendiscord.events.get("afterTicketTransferred").listen((ticket, changer) => safelyAppendNativeLifecycleEvent("transferred", ticket, changer))

opendiscord.events.get("onTicketDelete").listen((ticket) => {
    captureNativePreviousSnapshot("deleted", ticket)
    cacheFeedbackSnapshot(ticket)
})
opendiscord.events.get("afterTicketDeleted").listen((ticket, deleter) => safelyAppendNativeLifecycleEvent("deleted", ticket, deleter))

opendiscord.events.get("onTicketAssign").listen((ticket) => captureNativePreviousSnapshot("assigned", ticket))
opendiscord.events.get("afterTicketAssigned").listen((ticket, assigner) => safelyAppendNativeLifecycleEvent("assigned", ticket, assigner))

opendiscord.events.get("onTicketUnassign").listen((ticket) => captureNativePreviousSnapshot("unassigned", ticket))
opendiscord.events.get("afterTicketUnassigned").listen((ticket, unassigner) => safelyAppendNativeLifecycleEvent("unassigned", ticket, unassigner))

opendiscord.events.get("afterTicketCreated").listen((ticket, creator) => safelyAppendNativeLifecycleEvent("created", ticket, creator))

const feedbackEvent = opendiscord.events.get("ot-feedback:afterFeedback" as any) as api.ODEvent | null
feedbackEvent?.listen(async (payload: OTTelemetryFeedbackPayload) => {
    const service = getTelemetryService()
    if (!service) return
    const ticketId = payload?.session?.ticketId
    const ticket = typeof ticketId == "string" ? opendiscord.tickets.get(ticketId) : null
    const snapshot = typeof ticketId == "string" ? feedbackSnapshots.get(ticketId) ?? null : null
    try {
        await service.storeFeedbackSession(payload, { ticket, snapshot })
        if (typeof ticketId == "string") feedbackSnapshots.delete(ticketId)
    } catch (err) {
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
    }
})
