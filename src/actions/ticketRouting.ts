import {opendiscord, api} from "../index"
import * as discord from "discord.js"

import { ODTICKET_PLATFORM_METADATA_DEFAULTS } from "../core/api/openticket/ticket-platform"
import {
    applyTicketRoutingMetadataValues,
    clearTicketClaimStateValues,
    normalizeAssignmentStrategy,
    normalizeStringList,
    resolveRoundRobinAssignee,
    resolveRoundRobinCursorAssignment,
    setTicketAssignedStaffValue,
    type ODSupportTeamAssignmentStrategy,
    type RoundRobinEligibleMember
} from "./ticketRoutingCore"

export {
    normalizeAssignmentStrategy,
    applyTicketRoutingMetadataValues,
    clearTicketClaimStateValues,
    resolveRoundRobinAssignee,
    resolveRoundRobinCursorAssignment,
    setTicketAssignedStaffValue,
    type ODSupportTeamAssignmentStrategy,
    type RoundRobinEligibleMember
}

export interface ODSupportTeamConfigEntry {
    id:string,
    name:string,
    roleIds:string[],
    assignmentStrategy:ODSupportTeamAssignmentStrategy
}

export const TICKET_OPTION_ROUTING_SUPPORT_TEAM_ID = "opendiscord:routing-support-team"
export const TICKET_OPTION_ROUTING_ESCALATION_TARGETS_ID = "opendiscord:routing-escalation-targets"
export const SUPPORT_TEAM_ROUND_ROBIN_CATEGORY = "opendiscord:support-teams:round-robin"

type OptionDataSource = {
    get?: (id:string) => {value?:unknown}|null,
    exists?: (id:string) => boolean
}

export function getTicketOptionSupportTeamId(option:OptionDataSource): string {
    if (!option.exists?.(TICKET_OPTION_ROUTING_SUPPORT_TEAM_ID)) return ""
    const value = option.get?.(TICKET_OPTION_ROUTING_SUPPORT_TEAM_ID)?.value
    return typeof value == "string" ? value.trim() : ""
}

export function getTicketOptionEscalationTargetIds(option:OptionDataSource): string[] {
    if (!option.exists?.(TICKET_OPTION_ROUTING_ESCALATION_TARGETS_ID)) return []
    return normalizeStringList(option.get?.(TICKET_OPTION_ROUTING_ESCALATION_TARGETS_ID)?.value)
}

export function getSupportTeamsConfig(): ODSupportTeamConfigEntry[] {
    const config = opendiscord.configs.get("opendiscord:support-teams")
    if (!config || !Array.isArray(config.data)) return []

    return config.data
        .filter((team): team is ODSupportTeamConfigEntry => {
            return Boolean(team) && typeof team.id == "string" && typeof team.name == "string" && Array.isArray(team.roleIds)
        })
        .map((team) => ({
            id: team.id.trim(),
            name: team.name,
            roleIds: normalizeStringList(team.roleIds),
            assignmentStrategy: normalizeAssignmentStrategy(team.assignmentStrategy)
        }))
        .filter((team) => team.id.length > 0)
}

export function getSupportTeamById(teamId:string): ODSupportTeamConfigEntry|null {
    const normalizedId = typeof teamId == "string" ? teamId.trim() : ""
    if (!normalizedId) return null
    return getSupportTeamsConfig().find((team) => team.id == normalizedId) ?? null
}

export function getTicketOptionSupportTeam(option:OptionDataSource): ODSupportTeamConfigEntry|null {
    return getSupportTeamById(getTicketOptionSupportTeamId(option))
}

export function getTicketOptionSupportTeamRoleIds(option:OptionDataSource): string[] {
    return getTicketOptionSupportTeam(option)?.roleIds ?? []
}

async function collectGuildMembers(guild:discord.Guild): Promise<RoundRobinEligibleMember[]> {
    let members = guild.members.cache
    try{
        members = await guild.members.fetch()
    }catch{
        // Keep the cached guild members when the full fetch is unavailable.
    }

    return [...members.values()].map((member) => ({
        id: member.user?.id ?? member.id,
        bot: Boolean(member.user?.bot),
        roleIds: [...member.roles.cache.keys()]
    }))
}

function readRoundRobinCursor(value:unknown): string|null {
    if (!value || typeof value != "object" || Array.isArray(value)) return null
    const raw = (value as Record<string, unknown>).lastAssignedUserId
    return typeof raw == "string" && raw.trim().length > 0 ? raw.trim() : null
}

export async function selectRoundRobinAssignee(team:ODSupportTeamConfigEntry, guild:discord.Guild): Promise<string|null> {
    const database = opendiscord.databases.get("opendiscord:global")
    const previousCursor = readRoundRobinCursor(await database.get(SUPPORT_TEAM_ROUND_ROBIN_CATEGORY,team.id))
    const assignment = resolveRoundRobinCursorAssignment(await collectGuildMembers(guild),team.roleIds,{lastAssignedUserId:previousCursor})
    if (!assignment.selectedUserId || !assignment.shouldPersist || !assignment.cursor) return null

    await database.set(SUPPORT_TEAM_ROUND_ROBIN_CATEGORY,team.id,assignment.cursor)

    return assignment.selectedUserId
}

export async function buildTicketRoutingMetadata(option:api.ODTicketOption, guild:discord.Guild) {
    const team = getTicketOptionSupportTeam(option)
    if (!team){
        return {
            assignedTeamId: ODTICKET_PLATFORM_METADATA_DEFAULTS.assignedTeamId,
            assignedStaffUserId: ODTICKET_PLATFORM_METADATA_DEFAULTS.assignedStaffUserId,
            assignmentStrategy: ODTICKET_PLATFORM_METADATA_DEFAULTS.assignmentStrategy
        }
    }

    const assignmentStrategy = normalizeAssignmentStrategy(team.assignmentStrategy)
    const assignedStaffUserId = assignmentStrategy == "round_robin"
        ? await selectRoundRobinAssignee(team,guild)
        : null

    return {
        assignedTeamId: team.id,
        assignedStaffUserId,
        assignmentStrategy
    }
}

export async function applyTicketRoutingAssignment(ticket:api.ODTicket, guild:discord.Guild, option:api.ODTicketOption = ticket.option) {
    const metadata = await buildTicketRoutingMetadata(option,guild)
    applyTicketRoutingMetadataValues(ticket,metadata)
}

export function setTicketAssignedStaff(ticket:api.ODTicket, userId:string|null) {
    setTicketAssignedStaffValue(ticket,userId)
}

export function clearTicketClaimState(ticket:api.ODTicket) {
    clearTicketClaimStateValues(ticket)
}
