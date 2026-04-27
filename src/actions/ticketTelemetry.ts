import { api, opendiscord } from "../index"
import type {
    OTTelemetryLifecycleEventType,
    OTTelemetryTicketSnapshot
} from "../../plugins/ot-telemetry/service/telemetry-service.js"

type TelemetryServiceLike = {
    snapshotTicket?: (ticket: unknown) => OTTelemetryTicketSnapshot
    appendLifecycleEvent?: (input: {
        eventType: OTTelemetryLifecycleEventType
        ticket: unknown
        actorUserId?: string | null
        occurredAt?: number
        previousSnapshot?: OTTelemetryTicketSnapshot | null
    }) => Promise<unknown> | unknown
}

const SERVICE_ID = "ot-telemetry:service"

function getTicketTelemetryService(): TelemetryServiceLike | null {
    try {
        if (!opendiscord.plugins.classes.exists(SERVICE_ID)) return null
        return opendiscord.plugins.classes.get(SERVICE_ID) as unknown as TelemetryServiceLike
    } catch {
        return null
    }
}

export function snapshotTicketForTelemetry(ticket: unknown): OTTelemetryTicketSnapshot | null {
    try {
        const service = getTicketTelemetryService()
        return typeof service?.snapshotTicket == "function" ? service.snapshotTicket(ticket) : null
    } catch {
        return null
    }
}

export async function appendTicketTelemetryLifecycleEvent(input: {
    eventType: OTTelemetryLifecycleEventType
    ticket: unknown
    actorUserId?: string | null
    occurredAt?: number
    previousSnapshot?: OTTelemetryTicketSnapshot | null
}) {
    const service = getTicketTelemetryService()
    if (typeof service?.appendLifecycleEvent != "function") return false
    try {
        await service.appendLifecycleEvent(input)
        return true
    } catch (err) {
        opendiscord.debugfile.writeErrorMessage(new api.ODError(err, "uncaughtException"))
        return false
    }
}
