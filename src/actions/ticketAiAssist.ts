///////////////////////////////////////
//TICKET AI ASSIST PROFILE BINDING
///////////////////////////////////////
import {api} from "../index"

export const TICKET_OPTION_AI_ASSIST_PROFILE_ID = "opendiscord:ai-assist-profile"

function normalizeString(value: unknown): string {
    return typeof value == "string" ? value.trim() : ""
}

export function getTicketOptionAiAssistProfileId(option: api.ODTicketOption | null | undefined): string {
    if (!option) return ""
    const data = option.get(TICKET_OPTION_AI_ASSIST_PROFILE_ID)
    return normalizeString(data?.value)
}

export function getTicketAiAssistProfileId(ticket: api.ODTicket | null | undefined): string {
    if (!ticket) return ""
    const stored = api.resolveTicketAiAssistProfileState(ticket)
    if (stored.hasStoredValue) return stored.profileId
    return getTicketOptionAiAssistProfileId(ticket.option)
}

export function setTicketAiAssistProfileIdFromOption(ticket: api.ODTicket, option: api.ODTicketOption = ticket.option) {
    const profileId = getTicketOptionAiAssistProfileId(option)
    ticket.get("opendiscord:ai-assist-profile").value = profileId
    return profileId
}
