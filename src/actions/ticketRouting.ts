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
export const TICKET_OPTION_CHANNEL_CATEGORY_ID = "opendiscord:channel-category"
export const TICKET_OPTION_CHANNEL_BACKUP_CATEGORY_ID = "opendiscord:channel-category-backup"
export const TICKET_OPTION_CHANNEL_OVERFLOW_CATEGORIES_ID = "opendiscord:channel-categories-overflow"
export const TICKET_OPTION_CHANNEL_CLOSED_CATEGORY_ID = "opendiscord:channel-category-closed"
export const TICKET_OPTION_CHANNEL_CLAIMED_CATEGORIES_ID = "opendiscord:channel-categories-claimed"
export const SUPPORT_TEAM_ROUND_ROBIN_CATEGORY = "opendiscord:support-teams:round-robin"
export const TICKET_CATEGORY_FULL_CHILD_COUNT = 50
export const TICKET_CATEGORY_NEAR_CAPACITY_CHILD_COUNT = 45

export type ODTicketOpenCategoryMode = "normal"|"overflow"|null

export type OptionDataSource = {
    get?: (id:string) => {value?:unknown}|null,
    exists?: (id:string) => boolean
}

export type ODTicketOpenCategoryRoute = {
    ok: true
    categoryId: string|null
    categoryMode: ODTicketOpenCategoryMode
    warnings: string[]
} | {
    ok: false
    reason: string
    warnings: string[]
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

function getTicketOptionString(option:OptionDataSource, id:string): string {
    if (typeof option.exists == "function" && !option.exists(id)) return ""
    const value = option.get?.(id)?.value
    return typeof value == "string" ? value.trim() : ""
}

function hasTicketOptionData(option:OptionDataSource, id:string): boolean {
    if (typeof option.exists == "function") return option.exists(id)
    return option.get?.(id)?.value !== undefined
}

function getTicketOptionClaimedCategoryIds(option:OptionDataSource): string[] {
    if (typeof option.exists == "function" && !option.exists(TICKET_OPTION_CHANNEL_CLAIMED_CATEGORIES_ID)) return []
    const value = option.get?.(TICKET_OPTION_CHANNEL_CLAIMED_CATEGORIES_ID)?.value
    if (!Array.isArray(value)) return []
    return normalizeStringList(value.map((entry) => entry && typeof entry == "object" && !Array.isArray(entry) ? (entry as Record<string,unknown>).category : ""))
}

export function getTicketOptionOverflowCategoryIds(option:OptionDataSource): string[] {
    const primaryCategoryId = getTicketOptionString(option,TICKET_OPTION_CHANNEL_CATEGORY_ID)
    const backupCategoryId = getTicketOptionString(option,TICKET_OPTION_CHANNEL_BACKUP_CATEGORY_ID)
    const closedCategoryId = getTicketOptionString(option,TICKET_OPTION_CHANNEL_CLOSED_CATEGORY_ID)
    const claimedCategoryIds = new Set(getTicketOptionClaimedCategoryIds(option))
    const hasOverflowCategories = hasTicketOptionData(option,TICKET_OPTION_CHANNEL_OVERFLOW_CATEGORIES_ID)
    const rawOverflow = hasOverflowCategories
        ? normalizeStringList(option.get?.(TICKET_OPTION_CHANNEL_OVERFLOW_CATEGORIES_ID)?.value)
        : []
    const source = hasOverflowCategories ? rawOverflow : (backupCategoryId ? [backupCategoryId] : [])
    const seen = new Set<string>()
    const result: string[] = []
    source.forEach((categoryId) => {
        if (!categoryId || seen.has(categoryId)) return
        seen.add(categoryId)
        if (categoryId == primaryCategoryId) return
        if (categoryId == closedCategoryId) return
        if (claimedCategoryIds.has(categoryId)) return
        result.push(categoryId)
    })
    return result
}

export function normalizeOpenCategoryMode(value:unknown): ODTicketOpenCategoryMode {
    if (value == "normal" || value == "overflow") return value as ODTicketOpenCategoryMode
    if (value == "backup") return "overflow"
    return null
}

function getCategoryChildCount(category:discord.CategoryChannel): number {
    const children = category.children as unknown as { cache?: { size?: number }, size?: number }
    if (typeof children?.cache?.size == "number") return children.cache.size
    if (typeof children?.size == "number") return children.size
    return 0
}

function logOpenCategoryWarning(logPrefix:string, message:string, categoryId:string, mode:ODTicketOpenCategoryMode, childCount:number|null = null) {
    opendiscord.log(`${logPrefix}: ${message}`,"warning",[
        {key:"categoryid",value:categoryId,hidden:true},
        {key:"mode",value:mode ?? "/"},
        ...(childCount == null ? [] : [{key:"children",value:String(childCount)}])
    ])
}

export async function resolveTicketOpenCategoryRoute(input:{
    guild: discord.Guild
    option: OptionDataSource
    logPrefix: string
}): Promise<ODTicketOpenCategoryRoute> {
    const primaryCategoryId = getTicketOptionString(input.option,TICKET_OPTION_CHANNEL_CATEGORY_ID)
    const warnings: string[] = []
    if (!primaryCategoryId) {
        const message = "Skipping primary ticket category because it is not configured."
        warnings.push(message)
        opendiscord.log(`${input.logPrefix}: ${message}`,"warning",[
            {key:"mode",value:"normal"}
        ])
    }
    const candidates: Array<{categoryId:string, mode:Exclude<ODTicketOpenCategoryMode,null>}> = [
        ...(primaryCategoryId ? [{categoryId:primaryCategoryId,mode:"normal" as const}] : []),
        ...getTicketOptionOverflowCategoryIds(input.option).map((categoryId) => ({categoryId,mode:"overflow" as const}))
    ]
    const seen = new Set<string>()
    if (candidates.length < 1) {
        const reason = "No configured ticket category has capacity for this ticket."
        opendiscord.log(`${input.logPrefix}: ${reason}`,"error",[
            {key:"primary",value:primaryCategoryId || "/",hidden:true},
            {key:"overflowCount",value:"0"}
        ])
        return {ok:false,reason,warnings}
    }

    for (const candidate of candidates) {
        if (!candidate.categoryId || seen.has(candidate.categoryId)) continue
        seen.add(candidate.categoryId)

        const category = await opendiscord.client.fetchGuildCategoryChannel(input.guild,candidate.categoryId)
        if (!category) {
            const message = "Skipping ticket category because it no longer resolves."
            warnings.push(message)
            logOpenCategoryWarning(input.logPrefix,message,candidate.categoryId,candidate.mode)
            continue
        }

        const childCount = getCategoryChildCount(category)
        if (childCount >= TICKET_CATEGORY_FULL_CHILD_COUNT) {
            const message = "Skipping ticket category because it is at Discord channel capacity."
            warnings.push(message)
            logOpenCategoryWarning(input.logPrefix,message,candidate.categoryId,candidate.mode,childCount)
            continue
        }
        if (childCount >= TICKET_CATEGORY_NEAR_CAPACITY_CHILD_COUNT) {
            const message = "Ticket category is nearing Discord channel capacity."
            warnings.push(message)
            logOpenCategoryWarning(input.logPrefix,message,candidate.categoryId,candidate.mode,childCount)
        }

        return {ok:true,categoryId:category.id,categoryMode:candidate.mode,warnings}
    }

    const reason = "No configured ticket category has capacity for this ticket."
    opendiscord.log(`${input.logPrefix}: ${reason}`,"error",[
        {key:"primary",value:primaryCategoryId || "/",hidden:true},
        {key:"overflowCount",value:String(candidates.filter((candidate) => candidate.mode == "overflow").length)}
    ])
    return {ok:false,reason,warnings}
}

export function applyTicketCategoryRoute(ticket:api.ODTicket, route:{categoryId:string|null, categoryMode:ODTicketOpenCategoryMode}) {
    ticket.get("opendiscord:category").value = route.categoryId
    ticket.get("opendiscord:category-mode").value = route.categoryMode
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
