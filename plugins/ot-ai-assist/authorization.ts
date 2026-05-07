export const AI_ASSIST_REQUIRED_PERMISSION_LEVEL = "support" as const

export interface AiAssistAuthorizationInput {
  permissions: {
    getPermissions(user: any, channel?: any, guild?: any): Promise<{ type: string; level: number }>
    hasPermissions(minimum: typeof AI_ASSIST_REQUIRED_PERMISSION_LEVEL, data: { level: number }): boolean
  }
  user: unknown
  channel: unknown
  guild: unknown
}

export type AiAssistAuthorizationResult =
  | { hasPerms: true; permissionType: string; permissionLevel: number }
  | { hasPerms: false; reason: "no-perms" | "not-in-server" | "permission-error"; permissionType: string | null; permissionLevel: number | null }

export async function checkAiAssistStaffAuthorization(input: AiAssistAuthorizationInput): Promise<AiAssistAuthorizationResult> {
  if (!input.guild || !input.channel) {
    return { hasPerms: false, reason: "not-in-server", permissionType: null, permissionLevel: null }
  }

  try {
    const permission = await input.permissions.getPermissions(input.user, input.channel, input.guild)
    if (!input.permissions.hasPermissions(AI_ASSIST_REQUIRED_PERMISSION_LEVEL, permission)) {
      return {
        hasPerms: false,
        reason: "no-perms",
        permissionType: permission.type,
        permissionLevel: permission.level
      }
    }

    return {
      hasPerms: true,
      permissionType: permission.type,
      permissionLevel: permission.level
    }
  } catch {
    return { hasPerms: false, reason: "permission-error", permissionType: null, permissionLevel: null }
  }
}
