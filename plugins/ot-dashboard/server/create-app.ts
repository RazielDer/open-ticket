import path from "path"

import compression from "compression"
import express from "express"
import favicon from "serve-favicon"
import helmet from "helmet"

import {
  getDashboardPluginAssetKind,
  listDashboardPluginSections,
  type DashboardPluginAssetKind,
  type DashboardPluginSection,
  type DashboardPluginSectionResolverContext
} from "./dashboard-plugin-registry"
import { createBackupService, type DashboardBackupService } from "./backup-service"
import { defaultDashboardActionProviderBridge, type DashboardActionProviderBridge } from "./action-provider-bridge"
import { DashboardAuthStore } from "./auth-store"
import { buildBrand } from "./brand"
import {
  applyDashboardPrivateHeaders,
  createDiscordAdminAuthClient,
  createDiscordViewerAuthClient,
  createRateLimiter,
  createSessionHandlers,
  type DashboardAdminAuthClient,
  type DashboardViewerAuthClient
} from "./auth"
import { createConfigService, type DashboardConfigService } from "./config-service"
import { csrfProtection } from "./csrf"
import { joinBasePath, loadDashboardConfig, resolveDashboardTrustProxy, type DashboardConfig } from "./dashboard-config"
import { canonicalHostMiddleware, classifyDashboardRouteFamily, selectDashboardSessionScope } from "./host-routing"
import { loadI18n, type DashboardI18n } from "./i18n"
import { createPluginManagementService, type DashboardPluginManagementService } from "./plugin-management-service"
import { registerApiRoutes } from "./routes/api"
import { registerPageRoutes } from "./routes/pages"
import { registerViewerRoutes } from "./routes/viewer"
import { defaultDashboardRuntimeBridge, type DashboardRuntimeBridge } from "./runtime-bridge"
import { registerPreparedExportHousekeeping } from "./prepared-exports"

export interface DashboardPluginRegistryBridge {
  listSections: (pluginId: string, context: DashboardPluginSectionResolverContext) => Promise<DashboardPluginSection[]>
  getAssetKind: (pluginId: string, relativePath: string) => DashboardPluginAssetKind
}

export interface DashboardAppContext {
  pluginRoot: string
  projectRoot: string
  publicDir: string
  viewsDir: string
  basePath: string
  config: DashboardConfig
  brand: ReturnType<typeof buildBrand>
  i18n: DashboardI18n
  configService: DashboardConfigService
  backupService: DashboardBackupService
  runtimeBridge: DashboardRuntimeBridge
  pluginManagementService: DashboardPluginManagementService
  pluginRegistryBridge: DashboardPluginRegistryBridge
  actionProviderBridge: DashboardActionProviderBridge
  authStore: DashboardAuthStore
  rateLimiter: ReturnType<typeof createRateLimiter>
  adminAuthClient: DashboardAdminAuthClient
  viewerAuthClient: DashboardViewerAuthClient
}

export interface CreateDashboardAppOptions {
  pluginRoot?: string
  projectRoot?: string
  configOverride?: DashboardConfig
  runtimeBridge?: DashboardRuntimeBridge
  actionProviderBridge?: DashboardActionProviderBridge
  backupService?: DashboardBackupService
  pluginManagementService?: DashboardPluginManagementService
  pluginRegistryBridge?: DashboardPluginRegistryBridge
  adminAuthClient?: DashboardAdminAuthClient
  viewerAuthClient?: DashboardViewerAuthClient
}

export function createDashboardApp(options: CreateDashboardAppOptions = {}) {
  const projectRoot = options.projectRoot || process.cwd()
  const pluginRoot = options.pluginRoot || path.resolve(projectRoot, "plugins", "ot-dashboard")
  const publicDir = path.join(pluginRoot, "public")
  const viewsDir = path.join(publicDir, "views")
  const config = options.configOverride || loadDashboardConfig(pluginRoot)
  const brand = buildBrand(pluginRoot, config.brand, config.dashboardName)
  const i18n = loadI18n(pluginRoot, config.locale)
  const configService = createConfigService(projectRoot, pluginRoot)
  const backupService = options.backupService || createBackupService(projectRoot, configService)
  const runtimeBridge = options.runtimeBridge || defaultDashboardRuntimeBridge
  const pluginRegistryBridge = options.pluginRegistryBridge || {
    listSections(pluginId: string, context: DashboardPluginSectionResolverContext) {
      return listDashboardPluginSections(pluginId, context)
    },
    getAssetKind(pluginId: string, relativePath: string) {
      return getDashboardPluginAssetKind(pluginId, relativePath)
    }
  }
  const pluginManagementService = options.pluginManagementService || createPluginManagementService(projectRoot, runtimeBridge)
  const actionProviderBridge = options.actionProviderBridge || defaultDashboardActionProviderBridge
  const authStore = new DashboardAuthStore(
    projectRoot,
    String(config.auth.sqlitePath || "runtime/ot-dashboard/auth.sqlite"),
    Math.max(1, Number(config.auth.maxAgeHours || 12)) * 60 * 60 * 1000
  )
  const rateLimiter = createRateLimiter(config, authStore)
  const adminAuthClient = options.adminAuthClient || createDiscordAdminAuthClient()
  const viewerAuthClient = options.viewerAuthClient || createDiscordViewerAuthClient()

  const context: DashboardAppContext = {
    pluginRoot,
    projectRoot,
    publicDir,
    viewsDir,
    basePath: config.basePath,
    config,
    brand,
    i18n,
    configService,
    backupService,
    runtimeBridge,
    pluginManagementService,
    pluginRegistryBridge,
    actionProviderBridge,
    authStore,
    rateLimiter,
    adminAuthClient,
    viewerAuthClient
  }

  const app = express()
  app.disable("x-powered-by")
  app.set("trust proxy", resolveDashboardTrustProxy(config))
  app.set("view engine", "ejs")
  app.set("views", viewsDir)

  app.use(express.urlencoded({ extended: true }))
  app.use(express.json())

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "https:"],
          "font-src": ["'self'", "https:", "data:"],
          "script-src": ["'self'", "'unsafe-inline'", "https:"],
          "style-src": ["'self'", "'unsafe-inline'", "https:"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  )
  app.use(compression())
  app.use(config.basePath, express.static(publicDir, { fallthrough: true, redirect: false }))

  if (brand.faviconAbsolutePath && !/^https?:\/\//i.test(brand.faviconAbsolutePath)) {
    app.use(favicon(brand.faviconAbsolutePath))
  }

  const sessionHandlers = createSessionHandlers(config, authStore)
  app.use(canonicalHostMiddleware(config))
  app.use((req, res, next) => {
    const routeFamily = (res.locals.dashboardRouteFamily as ReturnType<typeof classifyDashboardRouteFamily> | undefined)
      || classifyDashboardRouteFamily(req.path || "/", config.basePath)
    const isViewerAssetRoute = routeFamily === "viewer" && /\/transcripts\/[^/]+\/assets\/[^/]+$/i.test(req.path || "")

    if ((routeFamily === "admin" || routeFamily === "viewer") && !isViewerAssetRoute) {
      applyDashboardPrivateHeaders(res)
    }

    next()
  })
  app.use((req, res, next) => {
    const routeFamily = (res.locals.dashboardRouteFamily as ReturnType<typeof classifyDashboardRouteFamily> | undefined)
      || classifyDashboardRouteFamily(req.path || "/", config.basePath)
    const scope = selectDashboardSessionScope(routeFamily)
    return (scope === "viewer" ? sessionHandlers.viewer : sessionHandlers.admin)(req, res, next)
  })
  app.use(csrfProtection)
  app.use((req, res, next) => {
    res.locals.basePath = config.basePath
    res.locals.dashboardName = config.dashboardName
    res.locals.brand = brand
    res.locals.locale = i18n.locale
    res.locals.t = i18n.t
    res.locals.csrfToken = res.locals.csrfToken || (req.session as any)?.csrfToken
    res.locals.assetPath = (asset: string) => joinBasePath(config.basePath, asset.replace(/^\/+/, ""))
    next()
  })

  registerApiRoutes(app, context)
  registerViewerRoutes(app, context)
  registerPageRoutes(app, context)
  registerPreparedExportHousekeeping({ projectRoot, runtimeBridge })

  return { app, context }
}
