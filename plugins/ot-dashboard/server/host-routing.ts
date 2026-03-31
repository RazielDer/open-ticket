import type express from "express"

import {
  isLoopbackHost,
  parseDashboardPublicBaseUrl,
  resolveDashboardViewerBaseUrl,
  type DashboardConfig
} from "./dashboard-config"

export type DashboardRouteFamily = "admin" | "viewer" | "neutral" | "unknown"

const SAFE_METHODS = new Set(["GET", "HEAD"])

function stripBasePath(pathname: string, basePath: string) {
  if (basePath === "/") {
    return pathname.startsWith("/") ? pathname : `/${pathname}`
  }

  if (pathname === basePath) {
    return "/"
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return null
  }

  const suffix = pathname.slice(basePath.length)
  return suffix.startsWith("/") ? suffix : `/${suffix}`
}

function isStaticAssetPath(pathname: string) {
  if (pathname.startsWith("/assets/")) return true
  return /\.[a-z0-9]+$/i.test(pathname)
}

function normalizeHost(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "")
}

function readRequestHost(req: express.Request) {
  return normalizeHost(req.get("host") || req.hostname || "")
}

function isLocalBypassRequest(req: express.Request, config: DashboardConfig) {
  const requestHost = readRequestHost(req)
  const requestHostname = normalizeHost(req.hostname || "")
  const configuredHost = normalizeHost(config.host)

  return isLoopbackHost(requestHostname)
    || isLoopbackHost(requestHost.split(":")[0])
    || (configuredHost.length > 0 && requestHostname === configuredHost && isLoopbackHost(configuredHost))
}

function resolveCanonicalRouteBaseUrl(config: DashboardConfig, routeFamily: DashboardRouteFamily) {
  if (routeFamily === "admin") {
    return parseDashboardPublicBaseUrl(config.publicBaseUrl)
  }
  if (routeFamily === "viewer") {
    return resolveDashboardViewerBaseUrl(config)
  }
  return null
}

function buildCanonicalLocation(config: DashboardConfig, routeFamily: DashboardRouteFamily, originalUrl: string) {
  const target = resolveCanonicalRouteBaseUrl(config, routeFamily)
  if (!target) {
    return null
  }

  return target.toString().replace(/\/+$/, "") + originalUrl
}

function requestMatchesCanonicalHost(req: express.Request, config: DashboardConfig, routeFamily: DashboardRouteFamily) {
  const target = resolveCanonicalRouteBaseUrl(config, routeFamily)
  if (!target) {
    return true
  }

  return readRequestHost(req) === normalizeHost(target.host)
}

export function classifyDashboardRouteFamily(pathname: string, basePath: string): DashboardRouteFamily {
  const relativePath = stripBasePath(pathname, basePath)
  if (relativePath === null) {
    return "unknown"
  }

  if (relativePath === "/health") {
    return "neutral"
  }

  if (
    relativePath === "/"
    || relativePath === "/login"
    || relativePath.startsWith("/login/")
    || relativePath === "/logout"
    || relativePath === "/admin"
    || relativePath.startsWith("/admin/")
    || relativePath.startsWith("/config/")
    || relativePath.startsWith("/visual/")
    || relativePath.startsWith("/api/")
  ) {
    return "admin"
  }

  if (
    relativePath === "/transcripts"
    || relativePath.startsWith("/transcripts/")
    || relativePath === "/me/transcripts"
    || relativePath.startsWith("/me/transcripts/")
  ) {
    return "viewer"
  }

  if (isStaticAssetPath(relativePath)) {
    return "neutral"
  }

  return "unknown"
}

export function selectDashboardSessionScope(routeFamily: DashboardRouteFamily) {
  return routeFamily === "viewer" ? "viewer" : "admin"
}

export const canonicalHostMiddleware = (config: DashboardConfig): express.RequestHandler => {
  return (req, res, next) => {
    const routeFamily = classifyDashboardRouteFamily(req.path || "/", config.basePath)
    res.locals.dashboardRouteFamily = routeFamily

    if (routeFamily === "neutral") {
      return next()
    }

    if (isLocalBypassRequest(req, config)) {
      return next()
    }

    if (routeFamily === "unknown") {
      res.status(404).type("text/plain; charset=utf-8").send("Not Found")
      return
    }

    if (requestMatchesCanonicalHost(req, config, routeFamily)) {
      return next()
    }

    if (!SAFE_METHODS.has(req.method.toUpperCase())) {
      res.status(404).type("text/plain; charset=utf-8").send("Not Found")
      return
    }

    const location = buildCanonicalLocation(config, routeFamily, req.originalUrl || req.url || "/")
    if (!location) {
      return next()
    }

    res.redirect(308, location)
  }
}
