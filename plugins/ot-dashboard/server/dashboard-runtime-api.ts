import {
  registerDashboardActionProvider,
  type DashboardActionProvider
} from "./dashboard-action-registry"
import {
  registerDashboardPluginEntry,
  type DashboardPluginDashboardEntry
} from "./dashboard-plugin-registry"
import {
  buildDashboardPublicUrl,
  buildDashboardViewerPublicUrl,
  type DashboardConfig
} from "./dashboard-config"
import type { DashboardAuditEventInput } from "./auth-store"

export const DASHBOARD_RUNTIME_API_SYMBOL = Symbol.for("open-ticket.ot-dashboard")

export type DashboardRuntimeAuditEventInput = Omit<DashboardAuditEventInput, "sessionScope" | "sessionId"> & {
  sessionScope?: DashboardAuditEventInput["sessionScope"]
  sessionId?: DashboardAuditEventInput["sessionId"]
}

export interface DashboardRuntimeApi {
  registerActionProvider: (provider: DashboardActionProvider) => void
  registerPluginEntry: (entry: DashboardPluginDashboardEntry) => void
  buildPublicUrl: (routePath: string) => string | null
  buildViewerPublicUrl: (routePath: string) => string | null
  recordAuditEvent: (event: DashboardRuntimeAuditEventInput) => Promise<boolean>
}

export interface DashboardRuntimeApiInstallOptions {
  recordAuditEvent?: (event: DashboardRuntimeAuditEventInput) => Promise<void> | void
}

const DEFAULT_RUNTIME_CONFIG: DashboardConfig = {
  host: "127.0.0.1",
  port: 0,
  basePath: "/",
  publicBaseUrl: "",
  viewerPublicBaseUrl: "",
  trustProxyHops: 1,
  dashboardName: "Open Ticket Dashboard",
  locale: "english",
  auth: {
    sqlitePath: "runtime/ot-dashboard/auth.sqlite",
    discord: {
      clientId: "",
      clientSecret: ""
    },
    breakglass: {
      enabled: false,
      passwordHash: ""
    }
  },
  viewerAuth: {
    discord: {
      clientId: "",
      clientSecret: ""
    }
  },
  brand: {},
  rbac: {
    ownerUserIds: [],
    roleIds: {
      reviewer: [],
      editor: [],
      admin: []
    },
    userIds: {
      reviewer: [],
      editor: [],
      admin: []
    }
  }
}

function buildDashboardRuntimeApi(config: DashboardConfig, options: DashboardRuntimeApiInstallOptions = {}): DashboardRuntimeApi {
  return {
    registerActionProvider(provider) {
      registerDashboardActionProvider(provider)
    },
    registerPluginEntry(entry) {
      registerDashboardPluginEntry(entry)
    },
    buildPublicUrl(routePath) {
      return buildDashboardPublicUrl(config, routePath)
    },
    buildViewerPublicUrl(routePath) {
      return buildDashboardViewerPublicUrl(config, routePath)
    },
    async recordAuditEvent(event) {
      if (typeof options.recordAuditEvent !== "function") return false
      try {
        await options.recordAuditEvent(event)
        return true
      } catch {
        return false
      }
    }
  }
}

export function installDashboardRuntimeApi(config: DashboardConfig = DEFAULT_RUNTIME_CONFIG, options: DashboardRuntimeApiInstallOptions = {}) {
  const api = Object.freeze(buildDashboardRuntimeApi(config, options))
  ;(globalThis as Record<symbol, DashboardRuntimeApi>)[DASHBOARD_RUNTIME_API_SYMBOL] = api
  return api
}

export function getDashboardRuntimeApi(): DashboardRuntimeApi | null {
  const api = (globalThis as Record<symbol, DashboardRuntimeApi | undefined>)[DASHBOARD_RUNTIME_API_SYMBOL]
  return api || null
}
