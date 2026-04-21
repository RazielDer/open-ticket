const BRIDGE_ROLE_ID_RE = /^\d{17,20}$/

export interface ParsedBridgeAuthorizedRoleIds {
    roleIds: string[]
    invalidTokens: string[]
}

export function parseBridgeAuthorizedRoleIds(rawValue: string | null | undefined): ParsedBridgeAuthorizedRoleIds {
    const roleIds: string[] = []
    const invalidTokens: string[] = []
    const seenRoleIds = new Set<string>()
    const seenInvalidTokens = new Set<string>()

    if (typeof rawValue != "string") {
        return { roleIds, invalidTokens }
    }

    for (const token of rawValue.split(",")) {
        const normalized = token.trim()
        if (normalized.length < 1) continue
        if (BRIDGE_ROLE_ID_RE.test(normalized)) {
            if (seenRoleIds.has(normalized)) continue
            seenRoleIds.add(normalized)
            roleIds.push(normalized)
            continue
        }
        if (seenInvalidTokens.has(normalized)) continue
        seenInvalidTokens.add(normalized)
        invalidTokens.push(normalized)
    }

    return { roleIds, invalidTokens }
}

export function findUnresolvedBridgeAuthorizedRoleIds(
    configuredRoleIds: readonly string[],
    resolvedRoleIds: readonly string[] | ReadonlySet<string>
): string[] {
    const resolvedRoleIdSet = resolvedRoleIds instanceof Set
        ? resolvedRoleIds
        : new Set(resolvedRoleIds)
    const unresolvedRoleIds: string[] = []
    const seenConfiguredRoleIds = new Set<string>()

    for (const roleId of configuredRoleIds) {
        if (seenConfiguredRoleIds.has(roleId)) continue
        seenConfiguredRoleIds.add(roleId)
        if (resolvedRoleIdSet.has(roleId)) continue
        unresolvedRoleIds.push(roleId)
    }

    return unresolvedRoleIds
}
