import {
  getDashboardActionProvider,
  listDashboardActionProviders,
  type DashboardActionResult
} from "./dashboard-action-registry"
import type { DashboardRuntimeSnapshot } from "./dashboard-runtime-registry"

export interface DashboardActionProviderBridge {
  list: (
    snapshot: DashboardRuntimeSnapshot,
    options?: {
      pluginId?: string | null
    }
  ) => ReturnType<typeof listDashboardActionProviders>
  run: (providerId: string, actionId: string, snapshot: DashboardRuntimeSnapshot, projectRoot: string) => Promise<DashboardActionResult>
}

export const defaultDashboardActionProviderBridge: DashboardActionProviderBridge = {
  list(snapshot, options) {
    return listDashboardActionProviders(snapshot, options)
  },
  async run(providerId, actionId, snapshot, projectRoot) {
    const provider = getDashboardActionProvider(providerId)
    if (!provider) {
      return {
        ok: false,
        message: `Unknown action provider: ${providerId}`
      }
    }

    const availability = provider.availability(snapshot)
    if (!availability.available) {
      return {
        ok: false,
        message: availability.reason || "The selected provider is unavailable."
      }
    }

    const action = provider.actions(snapshot).find((item) => item.id === actionId)
    if (!action) {
      return {
        ok: false,
        message: `Unknown action: ${actionId}`
      }
    }

    return await provider.run(actionId, { snapshot, projectRoot })
  }
}
