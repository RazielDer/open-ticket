import fs from "fs"
import path from "path"

export interface DashboardAuthConfig {
  password?: string
  passwordHash?: string
  sessionSecret?: string
  maxAgeHours?: number
  sqlitePath?: string
  discord?: {
    clientId?: string
    clientSecret?: string
  }
  breakglass?: {
    enabled?: boolean
    passwordHash?: string
  }
  loginRateLimit?: {
    windowMinutes?: number
    maxAttempts?: number
  }
}

export interface DashboardBrandConfig {
  title?: string
  logoPath?: string
  faviconPath?: string
  primaryColor?: string
  accentColor?: string
  backgroundColor?: string
  surfaceColor?: string
  textColor?: string
  creditName?: string
  creditUrl?: string
}

export interface DashboardViewerAuthConfig {
  discord: {
    clientId: string
    clientSecret: string
  }
}

export interface DashboardRbacConfig {
  ownerUserIds: string[]
  roleIds: {
    reviewer: string[]
    editor: string[]
    admin: string[]
  }
  userIds: {
    reviewer: string[]
    editor: string[]
    admin: string[]
  }
}

export interface DashboardConfig {
  host: string
  port: number
  basePath: string
  publicBaseUrl: string
  viewerPublicBaseUrl: string
  trustProxyHops: number
  dashboardName: string
  locale: string
  auth: DashboardAuthConfig
  viewerAuth: DashboardViewerAuthConfig
  brand: DashboardBrandConfig
  rbac: DashboardRbacConfig
}

export const DEFAULT_DASHBOARD_HOST = "127.0.0.1"
export const DEFAULT_DASHBOARD_PASSWORD = "change-me"
export const DEFAULT_DASHBOARD_SESSION_SECRET = "change-this-session-secret"

const DEFAULT_CONFIG: DashboardConfig = {
  host: DEFAULT_DASHBOARD_HOST,
  port: 3360,
  basePath: "/",
  publicBaseUrl: "",
  viewerPublicBaseUrl: "",
  trustProxyHops: 1,
  dashboardName: "Open Ticket Dashboard",
  locale: "english",
  auth: {
    password: DEFAULT_DASHBOARD_PASSWORD,
    passwordHash: "",
    sessionSecret: DEFAULT_DASHBOARD_SESSION_SECRET,
    sqlitePath: "runtime/ot-dashboard/auth.sqlite",
    discord: {
      clientId: "",
      clientSecret: ""
    },
    breakglass: {
      enabled: false,
      passwordHash: ""
    },
    maxAgeHours: 12,
    loginRateLimit: {
      windowMinutes: 15,
      maxAttempts: 8
    }
  },
  viewerAuth: {
    discord: {
      clientId: "",
      clientSecret: ""
    }
  },
  brand: {
    title: "Open Ticket Dashboard",
    logoPath: "",
    faviconPath: "./public/assets/eotfs-dashboard-favicon.png",
    primaryColor: "#c46332",
    accentColor: "#f0aa45",
    backgroundColor: "#0e1117",
    surfaceColor: "#181d27",
    textColor: "#f7f2e7",
    creditName: "",
    creditUrl: ""
  },
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

function normalizeBasePath(input?: string): string {
  const source = String(input || "/").trim() || "/"
  if (source === "/") return "/"
  const withoutEdges = source.replace(/^\/+|\/+$/g, "")
  return `/${withoutEdges}`
}

export function normalizeDashboardPublicBaseUrl(input?: string): string {
  return String(input || "").trim().replace(/\/+$/, "")
}

export function parseDashboardPublicBaseUrl(input?: string): URL | null {
  const normalized = normalizeDashboardPublicBaseUrl(input)
  if (!normalized) return null

  try {
    const parsed = new URL(normalized)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : null
  } catch {
    return null
  }
}

export function isLoopbackHost(input?: string): boolean {
  const normalized = String(input || "").trim().toLowerCase().replace(/\.$/, "")
  if (!normalized) return false
  if (normalized === "localhost" || normalized === "::1" || normalized === "::ffff:127.0.0.1") return true
  return /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

function parseBooleanInput(value: unknown, fallback = false) {
  if (value === true || value === "true" || value === "1" || value === "on") return true
  if (value === false || value === "false" || value === "0" || value === "off") return false
  return fallback
}

function parseNonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return Math.floor(parsed)
}

function normalizeStringList(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : []

  const values: string[] = []
  const seen = new Set<string>()

  for (const candidate of source) {
    const normalized = String(candidate || "").trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    values.push(normalized)
  }

  return values
}

function normalizeTrustProxyHops(candidate: unknown, host: string) {
  const parsed = parseNonNegativeInteger(candidate)
  if (parsed !== null) {
    return parsed
  }

  return isLoopbackHost(host) ? 1 : 0
}

function buildCanonicalUrl(baseUrl: string, basePath: string, routePath: string) {
  const parsedBaseUrl = parseDashboardPublicBaseUrl(baseUrl)
  if (!parsedBaseUrl) {
    return null
  }

  const trimmedPath = String(routePath || "").trim().replace(/^\/+/, "")
  return parsedBaseUrl.toString().replace(/\/+$/, "") + joinBasePath(basePath, trimmedPath)
}

export function resolveDashboardDiscordAuthConfig(config: DashboardConfig) {
  return {
    clientId: String(config.auth.discord?.clientId || config.viewerAuth.discord.clientId || "").trim(),
    clientSecret: String(config.auth.discord?.clientSecret || config.viewerAuth.discord.clientSecret || "").trim()
  }
}

export function resolveDashboardViewerBaseUrl(config: DashboardConfig) {
  return parseDashboardPublicBaseUrl(config.viewerPublicBaseUrl)
    || parseDashboardPublicBaseUrl(config.publicBaseUrl)
}

export function resolveDashboardTrustProxy(config: DashboardConfig): number {
  return normalizeTrustProxyHops(config.trustProxyHops, config.host)
}

export function getDashboardSecurityWarnings(config: DashboardConfig): string[] {
  const warnings: string[] = []
  const sessionSecret = String(config.auth.sessionSecret || "").trim()
  const normalizedPublicBaseUrl = normalizeDashboardPublicBaseUrl(config.publicBaseUrl)
  const normalizedViewerPublicBaseUrl = normalizeDashboardPublicBaseUrl(config.viewerPublicBaseUrl)
  const discord = resolveDashboardDiscordAuthConfig(config)
  const breakglassEnabled = config.auth.breakglass?.enabled === true
  const breakglassPasswordHash = String(config.auth.breakglass?.passwordHash || "").trim()

  if (!isLoopbackHost(config.host)) {
    warnings.push("Dashboard host is not loopback-only. Bind it to 127.0.0.1 and publish it through Cloudflare or another trusted reverse proxy.")
  }

  if (!isLoopbackHost(config.host) && resolveDashboardTrustProxy(config) === 0) {
    warnings.push("Dashboard trustProxyHops resolves to 0 on a non-loopback bind. Set trustProxyHops to the exact reverse-proxy hop count before exposing the dashboard.")
  }

  if (breakglassEnabled && !breakglassPasswordHash) {
    warnings.push("Dashboard breakglass auth is enabled without auth.breakglass.passwordHash. Disable breakglass or configure a hashed emergency password before exposing the admin host.")
  }

  if (!sessionSecret || sessionSecret === DEFAULT_DASHBOARD_SESSION_SECRET || sessionSecret.length < 32) {
    warnings.push("Dashboard auth.sessionSecret is missing, still using the placeholder, or too short. Replace it with a long random value.")
  }

  if (!normalizedPublicBaseUrl) {
    warnings.push("Dashboard publicBaseUrl is not set. Configure the admin-host canonical URL before exposing the dashboard.")
  } else {
    const parsed = parseDashboardPublicBaseUrl(normalizedPublicBaseUrl)
    if (!parsed) {
      warnings.push("Dashboard publicBaseUrl is invalid. Use an absolute http or https URL.")
    } else if (parsed.protocol !== "https:" && !isLoopbackHost(parsed.hostname)) {
      warnings.push("Dashboard publicBaseUrl uses http. Put the dashboard behind HTTPS at the edge before exposing it.")
    }
  }

  if (normalizedViewerPublicBaseUrl) {
    const parsed = parseDashboardPublicBaseUrl(normalizedViewerPublicBaseUrl)
    if (!parsed) {
      warnings.push("Dashboard viewerPublicBaseUrl is invalid. Use an absolute http or https URL.")
    } else if (parsed.protocol !== "https:" && !isLoopbackHost(parsed.hostname)) {
      warnings.push("Dashboard viewerPublicBaseUrl uses http. Put the viewer host behind HTTPS at the edge before exposing it.")
    }
  }

  if (!discord.clientId) {
    warnings.push("Dashboard Discord OAuth client id is missing. Configure auth.discord.clientId or the compatibility viewerAuth.discord.clientId before using Discord sign-in.")
  }

  if (!discord.clientSecret) {
    warnings.push("Dashboard Discord OAuth client secret is missing. Configure auth.discord.clientSecret or the compatibility viewerAuth.discord.clientSecret before using Discord sign-in.")
  }

  return warnings
}

function readPluginConfig(pluginRoot: string): Partial<DashboardConfig> {
  const configPath = path.join(pluginRoot, "config.json")
  if (!fs.existsSync(configPath)) {
    return {}
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<DashboardConfig>
}

export function joinBasePath(basePath: string, ...segments: string[]): string {
  return path.posix.join(basePath, ...segments)
}

export function buildDashboardPublicUrl(config: DashboardConfig, routePath: string): string | null {
  return buildCanonicalUrl(config.publicBaseUrl, config.basePath, routePath)
}

export function buildDashboardViewerPublicUrl(config: DashboardConfig, routePath: string): string | null {
  const viewerBaseUrl = resolveDashboardViewerBaseUrl(config)
  if (!viewerBaseUrl) {
    return null
  }

  const trimmedPath = String(routePath || "").trim().replace(/^\/+/, "")
  return viewerBaseUrl.toString().replace(/\/+$/, "") + joinBasePath(config.basePath, trimmedPath)
}

export function getDashboardViewerReadiness(config: DashboardConfig) {
  if (!resolveDashboardViewerBaseUrl(config)) {
    return {
      ready: false,
      message: "Dashboard publicBaseUrl must be set to an absolute http or https URL before private transcript viewer routes can be used. Whitelist review submit stays blocked until the viewer host can issue transcript URLs."
    }
  }

  const discord = resolveDashboardDiscordAuthConfig(config)
  if (!discord.clientId) {
    return {
      ready: false,
      message: "Dashboard viewer Discord client id is required before private transcript viewer routes can be used. Whitelist review submit stays blocked until Discord viewer auth is configured."
    }
  }

  if (!discord.clientSecret) {
    return {
      ready: false,
      message: "Dashboard viewer Discord client secret is required before private transcript viewer routes can be used. Whitelist review submit stays blocked until Discord viewer auth is configured."
    }
  }

  return {
    ready: true,
    message: "Dashboard private transcript viewer routes are ready for whitelist review submit and private transcript URLs."
  }
}

export function loadDashboardConfig(pluginRoot: string): DashboardConfig {
  const fileConfig = readPluginConfig(pluginRoot)
  const resolvedHost = String(process.env.OT_DASHBOARD_HOST || fileConfig.host || DEFAULT_CONFIG.host)

  return {
    host: resolvedHost,
    port: Number(process.env.OT_DASHBOARD_PORT || fileConfig.port || DEFAULT_CONFIG.port),
    basePath: normalizeBasePath(process.env.OT_DASHBOARD_BASE_PATH || fileConfig.basePath || DEFAULT_CONFIG.basePath),
    publicBaseUrl: normalizeDashboardPublicBaseUrl(
      process.env.OT_DASHBOARD_PUBLIC_BASE_URL
        || fileConfig.publicBaseUrl
        || DEFAULT_CONFIG.publicBaseUrl
    ),
    viewerPublicBaseUrl: normalizeDashboardPublicBaseUrl(
      process.env.OT_DASHBOARD_VIEWER_PUBLIC_BASE_URL
        || fileConfig.viewerPublicBaseUrl
        || DEFAULT_CONFIG.viewerPublicBaseUrl
    ),
    trustProxyHops: normalizeTrustProxyHops(
      process.env.OT_DASHBOARD_TRUST_PROXY_HOPS ?? fileConfig.trustProxyHops,
      resolvedHost
    ),
    dashboardName: String(fileConfig.dashboardName || DEFAULT_CONFIG.dashboardName),
    locale: String(process.env.OT_DASHBOARD_LOCALE || fileConfig.locale || DEFAULT_CONFIG.locale),
    auth: {
      passwordHash: String(process.env.OT_DASHBOARD_PASSWORD_HASH || fileConfig.auth?.passwordHash || DEFAULT_CONFIG.auth.passwordHash || ""),
      password: String(process.env.OT_DASHBOARD_PASSWORD || fileConfig.auth?.password || DEFAULT_CONFIG.auth.password || ""),
      sessionSecret: String(process.env.OT_DASHBOARD_SESSION_SECRET || fileConfig.auth?.sessionSecret || DEFAULT_CONFIG.auth.sessionSecret),
      sqlitePath: String(
        process.env.OT_DASHBOARD_AUTH_SQLITE_PATH
          || fileConfig.auth?.sqlitePath
          || DEFAULT_CONFIG.auth.sqlitePath
      ),
      discord: {
        clientId: String(
          process.env.OT_DASHBOARD_DISCORD_CLIENT_ID
            || fileConfig.auth?.discord?.clientId
            || process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID
            || fileConfig.viewerAuth?.discord?.clientId
            || DEFAULT_CONFIG.auth.discord?.clientId
        ),
        clientSecret: String(
          process.env.OT_DASHBOARD_DISCORD_CLIENT_SECRET
            || fileConfig.auth?.discord?.clientSecret
            || process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET
            || fileConfig.viewerAuth?.discord?.clientSecret
            || DEFAULT_CONFIG.auth.discord?.clientSecret
        )
      },
      breakglass: {
        enabled: parseBooleanInput(
          process.env.OT_DASHBOARD_BREAKGLASS_ENABLED ?? fileConfig.auth?.breakglass?.enabled,
          DEFAULT_CONFIG.auth.breakglass?.enabled
        ),
        passwordHash: String(
          process.env.OT_DASHBOARD_BREAKGLASS_PASSWORD_HASH
            || fileConfig.auth?.breakglass?.passwordHash
            || DEFAULT_CONFIG.auth.breakglass?.passwordHash
        )
      },
      maxAgeHours: Number(process.env.OT_DASHBOARD_MAX_AGE_HOURS || fileConfig.auth?.maxAgeHours || DEFAULT_CONFIG.auth.maxAgeHours),
      loginRateLimit: {
        windowMinutes: Number(process.env.OT_DASHBOARD_RATE_WINDOW_MINUTES || fileConfig.auth?.loginRateLimit?.windowMinutes || DEFAULT_CONFIG.auth.loginRateLimit?.windowMinutes),
        maxAttempts: Number(process.env.OT_DASHBOARD_RATE_MAX_ATTEMPTS || fileConfig.auth?.loginRateLimit?.maxAttempts || DEFAULT_CONFIG.auth.loginRateLimit?.maxAttempts)
      }
    },
    viewerAuth: {
      discord: {
        clientId: String(
          process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_ID
            || fileConfig.viewerAuth?.discord?.clientId
            || DEFAULT_CONFIG.viewerAuth.discord.clientId
        ),
        clientSecret: String(
          process.env.OT_DASHBOARD_VIEWER_DISCORD_CLIENT_SECRET
            || fileConfig.viewerAuth?.discord?.clientSecret
            || DEFAULT_CONFIG.viewerAuth.discord.clientSecret
        )
      }
    },
    brand: {
      title: String(fileConfig.brand?.title || fileConfig.dashboardName || DEFAULT_CONFIG.brand.title),
      logoPath: String(fileConfig.brand?.logoPath || DEFAULT_CONFIG.brand.logoPath),
      faviconPath: String(fileConfig.brand?.faviconPath || DEFAULT_CONFIG.brand.faviconPath),
      primaryColor: String(fileConfig.brand?.primaryColor || DEFAULT_CONFIG.brand.primaryColor),
      accentColor: String(fileConfig.brand?.accentColor || DEFAULT_CONFIG.brand.accentColor),
      backgroundColor: String(fileConfig.brand?.backgroundColor || DEFAULT_CONFIG.brand.backgroundColor),
      surfaceColor: String(fileConfig.brand?.surfaceColor || DEFAULT_CONFIG.brand.surfaceColor),
      textColor: String(fileConfig.brand?.textColor || DEFAULT_CONFIG.brand.textColor),
      creditName: String(fileConfig.brand?.creditName || DEFAULT_CONFIG.brand.creditName),
      creditUrl: String(fileConfig.brand?.creditUrl || DEFAULT_CONFIG.brand.creditUrl)
    },
    rbac: {
      ownerUserIds: normalizeStringList(
        process.env.OT_DASHBOARD_RBAC_OWNER_USER_IDS
          || fileConfig.rbac?.ownerUserIds
          || DEFAULT_CONFIG.rbac.ownerUserIds
      ),
      roleIds: {
        reviewer: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_REVIEWER_ROLE_IDS
            || fileConfig.rbac?.roleIds?.reviewer
            || DEFAULT_CONFIG.rbac.roleIds.reviewer
        ),
        editor: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_EDITOR_ROLE_IDS
            || fileConfig.rbac?.roleIds?.editor
            || DEFAULT_CONFIG.rbac.roleIds.editor
        ),
        admin: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_ADMIN_ROLE_IDS
            || fileConfig.rbac?.roleIds?.admin
            || DEFAULT_CONFIG.rbac.roleIds.admin
        )
      },
      userIds: {
        reviewer: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_REVIEWER_USER_IDS
            || fileConfig.rbac?.userIds?.reviewer
            || DEFAULT_CONFIG.rbac.userIds.reviewer
        ),
        editor: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_EDITOR_USER_IDS
            || fileConfig.rbac?.userIds?.editor
            || DEFAULT_CONFIG.rbac.userIds.editor
        ),
        admin: normalizeStringList(
          process.env.OT_DASHBOARD_RBAC_ADMIN_USER_IDS
            || fileConfig.rbac?.userIds?.admin
            || DEFAULT_CONFIG.rbac.userIds.admin
        )
      }
    }
  }
}
