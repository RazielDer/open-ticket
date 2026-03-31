import type { DashboardRuntimeSnapshot } from "./dashboard-runtime-registry"

export interface DashboardActionResult {
  ok: boolean
  message: string
  warnings?: string[]
}

export interface DashboardActionAvailability {
  available: boolean
  reason?: string
}

export interface DashboardActionConfirmation {
  required: boolean
  text: string
}

export type DashboardActionGuardRequirement = "required" | "not-required"

export interface DashboardActionGuard {
  auth: DashboardActionGuardRequirement
  csrf: DashboardActionGuardRequirement
  runtimeAvailability: DashboardActionGuardRequirement
}

export interface DashboardActionDefinition {
  id: string
  label: string
  description: string
  confirmation: DashboardActionConfirmation
  guard: DashboardActionGuard
}

export interface DashboardActionContext {
  snapshot: DashboardRuntimeSnapshot
  projectRoot?: string
}

export interface DashboardActionProvider {
  id: string
  title: string
  pluginId?: string | null
  availability: (snapshot: DashboardRuntimeSnapshot) => DashboardActionAvailability
  actions: (snapshot: DashboardRuntimeSnapshot) => DashboardActionDefinition[]
  run: (actionId: string, context: DashboardActionContext) => Promise<DashboardActionResult> | DashboardActionResult
}

const providers = new Map<string, DashboardActionProvider>()

export function registerDashboardActionProvider(provider: DashboardActionProvider) {
  providers.set(provider.id, provider)
}

export function clearDashboardActionProviders() {
  providers.clear()
}

export function getDashboardActionProvider(id: string) {
  return providers.get(id)
}

export function listDashboardActionProviders(
  snapshot: DashboardRuntimeSnapshot,
  options: {
    pluginId?: string | null
  } = {}
) {
  const pluginId = options.pluginId ?? null
  return Array.from(providers.values())
    .filter((provider) => {
      const owner = provider.pluginId ?? null
      return pluginId ? owner === pluginId : owner === null
    })
    .map((provider) => ({
      id: provider.id,
      title: provider.title,
      pluginId: provider.pluginId ?? null,
      availability: provider.availability(snapshot),
      actions: provider.actions(snapshot)
    }))
}
