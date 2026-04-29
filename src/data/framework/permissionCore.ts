type OptionPermissionSource = {
    get?: (id:string) => {value?:unknown}|null,
    exists?: (id:string) => boolean
}

function normalizeStringList(value:unknown): string[] {
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

function getOptionStringList(option:OptionPermissionSource, id:string): string[] {
    if (!option.exists?.(id)) return []
    return normalizeStringList(option.get?.(id)?.value)
}

export function getTicketOptionPermissionRoleIds(option:OptionPermissionSource, supportTeamRoleIds:string[] = []): string[] {
    return normalizeStringList([
        ...getOptionStringList(option,"opendiscord:admins"),
        ...getOptionStringList(option,"opendiscord:admins-readonly"),
        ...supportTeamRoleIds
    ])
}

export function buildTicketPermissionId(ticketId:string, roleId:string): string {
    return "opendiscord:ticket-admin_"+ticketId+"_"+roleId
}

export function diffTicketPermissionRoleIds(previousRoleIds:string[], nextRoleIds:string[]) {
    const previous = new Set(normalizeStringList(previousRoleIds))
    const next = new Set(normalizeStringList(nextRoleIds))

    return {
        remove: [...previous].filter((roleId) => !next.has(roleId)),
        add: [...next].filter((roleId) => !previous.has(roleId))
    }
}
