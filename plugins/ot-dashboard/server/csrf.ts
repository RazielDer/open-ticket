import crypto from "crypto"

import type express from "express"

import { sanitizeReturnTo } from "./auth"
import { joinBasePath } from "./dashboard-config"

function ensureToken(req: express.Request): string {
  const sessionData = req.session as any
  if (!sessionData.csrfToken) {
    sessionData.csrfToken = crypto.randomBytes(24).toString("hex")
  }
  return sessionData.csrfToken
}

function inferBasePathFromLoginPath(pathname: string) {
  const loginSuffix = "/login"
  if (!pathname.endsWith(loginSuffix)) {
    return "/"
  }

  const prefix = pathname.slice(0, -loginSuffix.length)
  return prefix || "/"
}

function loginCsrfRecovery(req: express.Request, res: express.Response) {
  const basePath = inferBasePathFromLoginPath(String(req.path || ""))
  const loginPath = joinBasePath(basePath, "login")
  const returnTo = sanitizeReturnTo(basePath, req.body?.returnTo)
  const params = new URLSearchParams({
    flash: "csrfExpired",
    returnTo
  })

  return res.redirect(`${loginPath}?${params.toString()}`)
}

function invalidTokenResponse(req: express.Request, res: express.Response) {
  const wantsJson = req.path.includes("/api/") || req.accepts(["json", "html"]) === "json"
  if (wantsJson) {
    return res.status(403).json({ success: false, error: "Invalid CSRF token" })
  }

  return res.status(403).send("Invalid CSRF token")
}

export const csrfProtection: express.RequestHandler = (req, res, next) => {
  const token = ensureToken(req)
  res.locals.csrfToken = token

  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next()
  }

  const submitted = req.body?.csrfToken || req.headers["x-csrf-token"] || req.headers["csrf-token"]
  if (typeof submitted !== "string" || submitted !== token) {
    if (req.method === "POST" && String(req.path || "").endsWith("/login")) {
      return loginCsrfRecovery(req, res)
    }
    return invalidTokenResponse(req, res)
  }

  next()
}
