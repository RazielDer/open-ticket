import express from "express"

import {
  applyDashboardPrivateHeaders,
  buildDashboardAuditActor,
  buildViewerDiscordAuthorizeUrl,
  createViewerOAuthState,
  getViewerSession,
  regenerateSession,
  resolveDashboardViewerAccess,
  sanitizeViewerReturnTo,
  setViewerSession
} from "../auth"
import { buildDashboardViewerPublicUrl, getDashboardViewerReadiness, joinBasePath } from "../dashboard-config"
import type { DashboardAppContext } from "../create-app"
import { formatDate } from "../control-center"
import {
  resolveTranscriptIntegration,
  supportsTranscriptViewerAccess
} from "../transcript-service-bridge"

function setNoSniffHeaders(res: express.Response) {
  res.setHeader("X-Content-Type-Options", "nosniff")
}

function sendText(res: express.Response, statusCode: number, message: string) {
  res.status(statusCode)
  res.type("text/plain; charset=utf-8")
  applyDashboardPrivateHeaders(res)
  setNoSniffHeaders(res)
  res.send(message)
}

function recordViewerAuditEvent(
  context: DashboardAppContext,
  req: express.Request,
  input: {
    eventType: string
    target?: string | null
    outcome?: string | null
    reason?: string | null
    details?: Record<string, unknown>
  },
  actorOverride?: ReturnType<typeof buildDashboardAuditActor> | null
) {
  return context.authStore.recordAuditEvent({
    eventType: input.eventType,
    sessionScope: "viewer",
    sessionId: req.sessionID,
    actor: actorOverride ?? buildDashboardAuditActor(getViewerSession(req)),
    target: input.target ?? null,
    outcome: input.outcome ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {}
  }).catch(() => {})
}

function buildViewerAssetBasePath(basePath: string, slug: string) {
  return `${joinBasePath(basePath, `transcripts/${encodeURIComponent(slug)}`, "assets")}/`
}

async function resolveViewerRequestAccess(
  context: DashboardAppContext,
  req: express.Request
) {
  const viewerUser = getViewerSession(req)
  if (!viewerUser) {
    return null
  }

  const access = await resolveDashboardViewerAccess(context.config, context.runtimeBridge, viewerUser)
  return {
    viewerUser,
    viewerAccess: {
      membership: access.membership,
      liveTier: access.tier,
      ownerOverride: access.ownerOverride,
      source: access.source,
      freshnessMs: access.freshnessMs,
      revalidatedAt: access.revalidatedAt
    }
  }
}

async function resolveViewerRouteState(context: DashboardAppContext) {
  const integration = resolveTranscriptIntegration(context.projectRoot, context.configService, context.runtimeBridge)
  if (integration.state !== "ready" || !integration.service || !supportsTranscriptViewerAccess(integration.service)) {
    return {
      ok: false as const,
      statusCode: 503,
      message: "Transcript viewer is unavailable.",
      accessPolicy: null,
      service: null
    }
  }

  const accessPolicy = await integration.service.getAccessPolicy()
  if (accessPolicy.mode !== "private-discord") {
    return {
      ok: false as const,
      statusCode: 404,
      message: "Not Found",
      accessPolicy,
      service: integration.service
    }
  }

  const viewerReadiness = getDashboardViewerReadiness(context.config)
  if (!viewerReadiness.ready) {
    return {
      ok: false as const,
      statusCode: 503,
      message: viewerReadiness.message,
      accessPolicy,
      service: integration.service
    }
  }

  return {
    ok: true as const,
    accessPolicy,
    service: integration.service
  }
}

function renderViewerLogin(
  res: express.Response,
  context: DashboardAppContext,
  locals: {
    message: string
    returnTo: string
  }
) {
  res.render("transcript-viewer-login", {
    pageTitle: `${context.i18n.t("transcripts.viewer.login.title")} | ${context.brand.title}`,
    message: locals.message,
    returnTo: locals.returnTo,
    discordAuthHref: `${joinBasePath(context.basePath, "transcripts/_auth/discord")}?returnTo=${encodeURIComponent(locals.returnTo)}`
  })
}

function redirectToViewerLogin(req: express.Request, res: express.Response, basePath: string) {
  const loginPath = joinBasePath(basePath, "transcripts/_auth/login")
  res.redirect(`${loginPath}?returnTo=${encodeURIComponent(req.originalUrl)}`)
}

export function registerViewerRoutes(app: express.Express, context: DashboardAppContext) {
  const basePath = context.basePath
  const myTranscriptsPath = joinBasePath(basePath, "me/transcripts")
  const viewerLoginPath = joinBasePath(basePath, "transcripts/_auth/login")
  const discordAuthPath = joinBasePath(basePath, "transcripts/_auth/discord")
  const discordCallbackPath = joinBasePath(basePath, "transcripts/_auth/discord/callback")

  app.get(viewerLoginPath, async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const returnTo = sanitizeViewerReturnTo(basePath, req.query.returnTo, myTranscriptsPath)
      const viewerUser = getViewerSession(req)
      if (viewerUser && returnTo) {
        return res.redirect(returnTo)
      }

      renderViewerLogin(res, context, {
        message: typeof req.query.msg === "string" ? req.query.msg : "",
        returnTo
      })
    } catch (error) {
      next(error)
    }
  })

  app.get(discordAuthPath, async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const returnTo = sanitizeViewerReturnTo(basePath, req.query.returnTo, myTranscriptsPath)
      if (getViewerSession(req) && returnTo) {
        return res.redirect(returnTo)
      }

      const redirectUri = buildDashboardViewerPublicUrl(context.config, "/transcripts/_auth/discord/callback")
      if (!redirectUri) {
        return sendText(res, 503, context.i18n.t("transcripts.viewer.notReady"))
      }

      const oauthState = createViewerOAuthState(returnTo)
      await context.authStore.storeOAuthState({
        scope: "viewer-discord",
        sessionScope: "viewer",
        sessionId: req.sessionID,
        state: oauthState.state,
        returnTo: oauthState.returnTo,
        expiresAt: Date.now() + (10 * 60 * 1000)
      })
      res.redirect(buildViewerDiscordAuthorizeUrl(context.config, redirectUri, oauthState.state))
    } catch (error) {
      next(error)
    }
  })

  app.get(discordCallbackPath, async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const redirectUri = buildDashboardViewerPublicUrl(context.config, "/transcripts/_auth/discord/callback")
      if (!redirectUri) {
        return sendText(res, 503, context.i18n.t("transcripts.viewer.notReady"))
      }

      const requestedState = typeof req.query.state === "string" ? req.query.state : ""
      const storedState = requestedState
        ? await context.authStore.consumeOAuthState({
          scope: "viewer-discord",
          sessionScope: "viewer",
          sessionId: req.sessionID,
          state: requestedState
        })
        : null

      if (!storedState) {
        await context.authStore.clearOAuthStatesForSession("viewer-discord", "viewer", req.sessionID)
        const loginReturnTo = sanitizeViewerReturnTo(basePath, req.query.returnTo, myTranscriptsPath)
        await recordViewerAuditEvent(context, req, {
          eventType: "viewer-login-failure",
          target: loginReturnTo,
          outcome: "failure",
          reason: "state-expired",
          details: {
            returnTo: loginReturnTo
          }
        })
        return res.redirect(
          `${viewerLoginPath}?msg=${encodeURIComponent(context.i18n.t("transcripts.viewer.login.errors.state"))}&returnTo=${encodeURIComponent(loginReturnTo)}`
        )
      }

      if (typeof req.query.code !== "string" || req.query.code.length === 0) {
        await recordViewerAuditEvent(context, req, {
          eventType: "viewer-login-failure",
          target: storedState.returnTo || myTranscriptsPath,
          outcome: "failure",
          reason: "code-missing",
          details: {
            returnTo: storedState.returnTo || myTranscriptsPath
          }
        })
        return res.redirect(
          `${viewerLoginPath}?msg=${encodeURIComponent(context.i18n.t("transcripts.viewer.login.errors.code"))}&returnTo=${encodeURIComponent(storedState.returnTo)}`
        )
      }

      let viewerIdentity: Awaited<ReturnType<typeof context.viewerAuthClient.fetchViewerIdentity>> | null = null
      try {
        const accessToken = await context.viewerAuthClient.exchangeCode(req.query.code, redirectUri, context.config)
        viewerIdentity = await context.viewerAuthClient.fetchViewerIdentity(accessToken)
      } catch {
        await recordViewerAuditEvent(context, req, {
          eventType: "viewer-login-failure",
          target: storedState.returnTo || myTranscriptsPath,
          outcome: "failure",
          reason: "discord-auth-failed",
          details: {
            returnTo: storedState.returnTo || myTranscriptsPath
          }
        })
        return res.redirect(
          `${viewerLoginPath}?msg=${encodeURIComponent(context.i18n.t("transcripts.viewer.login.errors.auth"))}&returnTo=${encodeURIComponent(storedState.returnTo || myTranscriptsPath)}`
        )
      }

      const liveAccess = await resolveDashboardViewerAccess(context.config, context.runtimeBridge, viewerIdentity)
      if (liveAccess.membership !== "member") {
        await recordViewerAuditEvent(context, req, {
          eventType: "viewer-login-failure",
          target: storedState.returnTo || myTranscriptsPath,
          outcome: "denied",
          reason: liveAccess.membership === "missing" ? "viewer-membership-missing" : "viewer-membership-unresolved",
          details: {
            returnTo: storedState.returnTo || myTranscriptsPath,
            membership: liveAccess.membership,
            tier: liveAccess.tier,
            source: liveAccess.source,
            freshnessMs: liveAccess.freshnessMs
          }
        }, buildDashboardAuditActor(viewerIdentity))
        return res.redirect(
          `${viewerLoginPath}?msg=${encodeURIComponent(context.i18n.t("transcripts.viewer.login.errors.access"))}&returnTo=${encodeURIComponent(storedState.returnTo || myTranscriptsPath)}`
        )
      }

      await regenerateSession(req)
      setViewerSession(req, {
        ...viewerIdentity,
        accessTierAtAuth: liveAccess.tier
      })
      await recordViewerAuditEvent(context, req, {
        eventType: "viewer-login-success",
        target: storedState.returnTo || myTranscriptsPath,
        outcome: "success",
        reason: "discord-oauth",
        details: {
          returnTo: storedState.returnTo || myTranscriptsPath,
          membership: liveAccess.membership,
          tier: liveAccess.tier,
          source: liveAccess.source,
          freshnessMs: liveAccess.freshnessMs
        }
      }, buildDashboardAuditActor(viewerIdentity))
      res.redirect(storedState.returnTo || myTranscriptsPath)
    } catch (error) {
      next(error)
    }
  })

  app.get(myTranscriptsPath, async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const access = await resolveViewerRequestAccess(context, req)
      if (!access) {
        return redirectToViewerLogin(req, res, basePath)
      }

      const result = await state.service.listViewerAccessibleTranscripts(
        access.viewerUser.userId,
        access.viewerAccess,
        { limit: 250, offset: 0 }
      )
      const accessPathLabels: Record<string, string> = {
        "creator-current-guild": context.i18n.t("transcripts.viewer.portal.accessPath.creator"),
        "recorded-admin-current-staff": context.i18n.t("transcripts.viewer.portal.accessPath.staff"),
        "owner-override": context.i18n.t("transcripts.viewer.portal.accessPath.owner")
      }
      const accessAlert = access.viewerAccess.ownerOverride
        ? {
            tone: "warning",
            message: context.i18n.t("transcripts.viewer.portal.ownerOverrideNotice")
          }
        : access.viewerAccess.membership !== "member" || access.viewerAccess.freshnessMs > 60_000
          ? {
              tone: "warning",
              message: context.i18n.t("transcripts.viewer.portal.failClosedNotice")
            }
          : null

      res.render("my-transcripts", {
        pageTitle: `${context.i18n.t("transcripts.viewer.portal.title")} | ${context.brand.title}`,
        pageAlert: accessAlert,
        portal: {
          total: result.total,
          membershipLabel: access.viewerAccess.membership === "member"
            ? context.i18n.t("transcripts.viewer.portal.membership.member")
            : access.viewerAccess.membership === "missing"
              ? context.i18n.t("transcripts.viewer.portal.membership.missing")
              : context.i18n.t("transcripts.viewer.portal.membership.unresolved"),
          tierLabel: access.viewerAccess.liveTier
            ? context.i18n.t(`transcripts.viewer.portal.tiers.${access.viewerAccess.liveTier}`)
            : context.i18n.t("transcripts.viewer.portal.tiers.none"),
          freshnessLabel: context.i18n.t("transcripts.viewer.portal.revalidated", {
            ageSeconds: Math.max(0, Math.floor(access.viewerAccess.freshnessMs / 1000))
          }),
          items: result.items.map((item) => ({
            id: item.id,
            ticketId: item.ticketId || context.i18n.t("common.unknown"),
            channelId: item.channelId || context.i18n.t("common.unknown"),
            createdLabel: formatDate(item.createdAt),
            updatedLabel: formatDate(item.updatedAt),
            accessLabel: accessPathLabels[item.accessPath] || item.accessPath,
            openHref: item.publicUrl || joinBasePath(basePath, `transcripts/${encodeURIComponent(item.activeSlug || item.id)}`)
          }))
        }
      })
    } catch (error) {
      next(error)
    }
  })

  app.get(joinBasePath(basePath, "transcripts/:slug"), async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const access = await resolveViewerRequestAccess(context, req)
      if (!access) {
        return redirectToViewerLogin(req, res, basePath)
      }

      const result = await state.service.renderViewerTranscript(
        req.params.slug,
        access.viewerUser.userId,
        buildViewerAssetBasePath(basePath, req.params.slug),
        access.viewerAccess
      )

      if (result.status === "not-found") {
        return sendText(res, 404, result.message || "Transcript not found.")
      }

      if (result.status === "gone") {
        return sendText(res, 410, result.message || "Transcript link is no longer available.")
      }

      res.status(200)
      res.type("text/html; charset=utf-8")
      applyDashboardPrivateHeaders(res)
      if (result.contentSecurityPolicy) {
        res.setHeader("Content-Security-Policy", result.contentSecurityPolicy)
      }
      setNoSniffHeaders(res)
      res.send(result.html || "")
    } catch (error) {
      next(error)
    }
  })

  app.get(joinBasePath(basePath, "transcripts/:slug/assets/:assetName"), async (req, res, next) => {
    try {
      const state = await resolveViewerRouteState(context)
      if (!state.ok) {
        return sendText(res, state.statusCode, state.message)
      }

      const access = await resolveViewerRequestAccess(context, req)
      if (!access) {
        return redirectToViewerLogin(req, res, basePath)
      }

      const result = await state.service.resolveViewerTranscriptAsset(
        req.params.slug,
        req.params.assetName,
        access.viewerUser.userId,
        access.viewerAccess
      )
      if (result.status === "not-found") {
        return sendText(res, 404, result.message || "Transcript asset not found.")
      }

      if (result.status === "gone") {
        return sendText(res, 410, result.message || "Transcript link is no longer available.")
      }

      if (!result.filePath) {
        return sendText(res, 404, "Transcript asset not found.")
      }

      if (result.cacheControl) {
        res.setHeader("Cache-Control", result.cacheControl)
      }
      if (result.contentType) {
        res.type(result.contentType)
      }
      setNoSniffHeaders(res)
      res.sendFile(result.filePath, (error) => {
        if (!error) return

        if (!res.headersSent) {
          sendText(res, 500, "Failed to read transcript asset.")
          return
        }

        if (!res.writableEnded) {
          res.end()
        }
      })
    } catch (error) {
      next(error)
    }
  })
}
