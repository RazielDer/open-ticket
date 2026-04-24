export type ODSupportTeamAssignmentStrategy = "manual"|"round_robin"

export interface RoundRobinEligibleMember {
    id:string,
    bot?:boolean,
    roleIds:string[]
}

export interface RoundRobinCursorState {
    lastAssignedUserId?:unknown,
    updatedAt?:unknown
}

export interface TicketRoutingMetadataValues {
    assignedTeamId:string|null,
    assignedStaffUserId:string|null,
    assignmentStrategy:string|null
}

type TicketDataTarget = {
    get: (id:string) => {value:unknown}
}

export function normalizeStringList(value:unknown): string[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const normalized:string[] = []
    for (const entry of value){
        const text = typeof entry == "string" ? entry.trim() : String(entry ?? "").trim()
        if (!text || seen.has(text)) continue
        seen.add(text)
        normalized.push(text)
    }
    return normalized
}

export function normalizeAssignmentStrategy(value:unknown): ODSupportTeamAssignmentStrategy {
    return value == "round_robin" ? "round_robin" : "manual"
}

export function resolveRoundRobinAssignee(
    members:RoundRobinEligibleMember[],
    roleIds:string[],
    lastAssignedUserId:string|null = null
): string|null {
    const teamRoleIds = new Set(normalizeStringList(roleIds))
    if (teamRoleIds.size < 1) return null

    const eligibleIds = [...new Set(members
        .filter((member) => !member.bot)
        .filter((member) => normalizeStringList(member.roleIds).some((roleId) => teamRoleIds.has(roleId)))
        .map((member) => String(member.id || "").trim())
        .filter(Boolean))]
        .sort((left,right) => left.localeCompare(right))

    if (eligibleIds.length < 1) return null
    if (!lastAssignedUserId) return eligibleIds[0]

    const lastIndex = eligibleIds.indexOf(lastAssignedUserId)
    if (lastIndex < 0 || lastIndex >= eligibleIds.length - 1) return eligibleIds[0]
    return eligibleIds[lastIndex + 1]
}

export function resolveRoundRobinCursorAssignment(
    members:RoundRobinEligibleMember[],
    roleIds:string[],
    cursor:RoundRobinCursorState|null|undefined,
    updatedAt:number = Date.now()
) {
    const lastAssignedUserId = typeof cursor?.lastAssignedUserId == "string" ? cursor.lastAssignedUserId : null
    const selectedUserId = resolveRoundRobinAssignee(members,roleIds,lastAssignedUserId)
    if (!selectedUserId){
        return {
            selectedUserId:null,
            shouldPersist:false,
            cursor:null
        }
    }

    return {
        selectedUserId,
        shouldPersist:true,
        cursor:{
            lastAssignedUserId:selectedUserId,
            updatedAt
        }
    }
}

export function applyTicketRoutingMetadataValues(ticket:TicketDataTarget, metadata:TicketRoutingMetadataValues) {
    ticket.get("opendiscord:assigned-team").value = metadata.assignedTeamId
    ticket.get("opendiscord:assigned-staff").value = metadata.assignedStaffUserId
    ticket.get("opendiscord:assignment-strategy").value = metadata.assignmentStrategy
}

export function setTicketAssignedStaffValue(ticket:TicketDataTarget, userId:string|null) {
    ticket.get("opendiscord:assigned-staff").value = userId
}

export function clearTicketClaimStateValues(ticket:TicketDataTarget) {
    ticket.get("opendiscord:claimed").value = false
    ticket.get("opendiscord:claimed-by").value = null
    ticket.get("opendiscord:claimed-on").value = null
    setTicketAssignedStaffValue(ticket,null)
}
