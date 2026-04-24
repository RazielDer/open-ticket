import express from "express"

import {
  buildDashboardAuditActor,
  buildAdminDiscordAuthorizeUrl,
  clearAdminSession,
  createAdminGuard,
  createAdminOAuthState,
  getAdminSession,
  regenerateSession,
  resolveAdminReturnTo,
  resolveDashboardAdminAccess,
  sanitizeReturnTo,
  setAdminSession
} from "../auth"
import { getManagedConfig, type ManagedConfigId } from "../config-registry"
import {
  EMOJI_STYLES,
  OPTION_BUTTON_COLORS,
  OPTION_CHANNEL_SUFFIXES,
  OPTION_TYPES,
  PANEL_DESCRIBE_LAYOUTS,
  PANEL_DROPDOWN_OPTION_TYPE,
  QUESTION_ID_MAX_LENGTH,
  QUESTION_ID_MIN_LENGTH,
  QUESTION_ID_PATTERN,
  QUESTION_LENGTH_MAX,
  QUESTION_LENGTH_MIN,
  QUESTION_NAME_MAX_LENGTH,
  QUESTION_NAME_MIN_LENGTH,
  QUESTION_PLACEHOLDER_MAX_LENGTH,
  QUESTION_TYPES,
  ROLE_MODES,
  STATUS_MODES,
  STATUS_TYPES,
  SUPPORT_TEAM_ASSIGNMENT_STRATEGIES,
  TRANSCRIPT_FILE_MODES,
  TRANSCRIPT_MODES,
  TRANSCRIPT_TEXT_LAYOUTS
} from "../dashboard-contract"
import { buildDashboardPublicUrl, isLoopbackHost, joinBasePath } from "../dashboard-config"
import type { DashboardAppContext } from "../create-app"
import {
  type DashboardTranscriptStylePreset,
  resolveTranscriptIntegration,
  supportsTranscriptStylePreview
} from "../transcript-service-bridge"
import { buildConfigDetailModel, formatDate } from "../control-center"
import { registerAdminRoutes } from "./admin"

function renderPage(res: express.Response, view: string, locals: Record<string, unknown> = {}) {
  res.render(view, {
    ...locals
  })
}

function recordAdminAuditEvent(
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
    sessionScope: "admin",
    sessionId: req.sessionID,
    actor: actorOverride ?? buildDashboardAuditActor(getAdminSession(req)),
    target: input.target ?? null,
    outcome: input.outcome ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {}
  }).catch(() => {})
}

function buildLocalRequestUrl(req: express.Request, basePath: string, routePath: string) {
  const requestHost = String(req.get("host") || "").trim()
  const requestProtocol = String(req.protocol || "http").trim() || "http"
  const requestHostname = String(req.hostname || requestHost.split(":")[0] || "").trim()

  if (!requestHost || !isLoopbackHost(requestHostname)) {
    return null
  }

  return `${requestProtocol}://${requestHost}${joinBasePath(basePath, routePath)}`
}

function buildAdminCallbackUrl(req: express.Request, context: DashboardAppContext) {
  return buildDashboardPublicUrl(context.config, "/login/discord/callback")
    || buildLocalRequestUrl(req, context.basePath, "login/discord/callback")
}

interface DashboardSelectOption {
  value: string
  label: string
}

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function buildTranscriptPreviewPlaceholderHtml(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:"Segoe UI","Trebuchet MS",sans-serif;background:#0f1722;color:#eff3f8;padding:24px}main{max-width:720px;margin:0 auto;padding:24px;border-radius:20px;background:#162232;border:1px solid rgba(255,255,255,0.12)}h1{margin:0 0 12px;font-size:24px}p{margin:0;line-height:1.55;color:rgba(239,243,248,0.84)}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

function buildTranscriptEditorOptions(values: readonly string[], labelFor: (value: string) => string): DashboardSelectOption[] {
  return values.map((value) => ({
    value,
    label: labelFor(value)
  }))
}

function savedFlag(req: express.Request): boolean {
  return req.query.saved === "1"
}

function buildWorkspaceTools(context: DashboardAppContext, id: Exclude<ManagedConfigId, "transcripts">) {
  const definition = getManagedConfig(id)
  if (!definition) {
    throw new Error(`Unknown managed config: ${id}`)
  }

  const detail = buildConfigDetailModel(context, definition)

  return {
    fileId: definition.id,
    fileName: definition.fileName,
    rawHref: joinBasePath(context.basePath, definition.rawPath),
    exportHref: joinBasePath(context.basePath, `admin/configs/${definition.id}/export`),
    reviewAction: joinBasePath(context.basePath, `admin/configs/${definition.id}/review`),
    backupAction: joinBasePath(context.basePath, "admin/configs/backups/create"),
    returnTo: joinBasePath(context.basePath, definition.visualPath),
    reviewDraftText: detail.currentText,
    restoreItems: detail.backupItems.map((backup) => ({
      id: backup.id,
      createdLabel: formatDate(backup.createdAt),
      restoreHref: backup.restoreHref
    }))
  }
}

function buildGeneralGlobalAdminsWarningMessage(context: DashboardAppContext, input: unknown) {
  const inspection = context.configService.inspectGeneralGlobalAdmins(input)

  if (inspection.mode === "legacy_recovered") {
    return context.i18n.t("general.fields.globalAdminsRecoveredWarning")
  }

  if (inspection.mode === "invalid_saved") {
    return context.i18n.t("general.fields.globalAdminsInvalidSavedWarning")
  }

  return ""
}

export function renderGeneralPage(
  res: express.Response,
  context: DashboardAppContext,
  locals: {
    config?: Record<string, unknown>
    saved?: boolean
    errorMessage?: string
    globalAdminsDraft?: string
    globalAdminsErrorMessage?: string
    globalAdminsWarningMessage?: string
  } = {}
) {
  const { brand, configService, i18n } = context
  const config = locals.config || configService.readManagedJson<Record<string, unknown>>("general")
  const globalAdminsInspection = configService.inspectGeneralGlobalAdmins((config as Record<string, any>).globalAdmins)

  renderPage(res, "config-general", {
    pageTitle: `${i18n.t("general.title")} | ${brand.title}`,
    config,
    languages: configService.listAvailableLanguages(),
    statusTypes: STATUS_TYPES,
    statusModes: STATUS_MODES,
    emojiStyles: EMOJI_STYLES,
    advancedTools: buildWorkspaceTools(context, "general"),
    saved: Boolean(locals.saved),
    errorMessage: locals.errorMessage || "",
    globalAdminsDraft: typeof locals.globalAdminsDraft === "string"
      ? locals.globalAdminsDraft
      : globalAdminsInspection.draftText,
    globalAdminsErrorMessage: locals.globalAdminsErrorMessage || "",
    globalAdminsWarningMessage: typeof locals.globalAdminsWarningMessage === "string"
      ? locals.globalAdminsWarningMessage
      : buildGeneralGlobalAdminsWarningMessage(context, (config as Record<string, any>).globalAdmins),
    pageKey: "general"
  })
}

function renderRawEditor(
  res: express.Response,
  definition: NonNullable<ReturnType<typeof getManagedConfig>>,
  context: DashboardAppContext,
  locals: {
    jsonText: string
    saved?: boolean
    errorMessage?: string
  }
) {
  const { brand, i18n } = context

  renderPage(res, "editor", {
    pageTitle: `${definition.fileName} | ${brand.title}`,
    fileId: definition.id,
    fileName: definition.fileName,
    jsonText: locals.jsonText,
    saved: Boolean(locals.saved),
    errorMessage: locals.errorMessage || "",
    rawHref: joinBasePath(context.basePath, definition.rawPath),
    visualHref: joinBasePath(context.basePath, definition.visualPath),
    messages: JSON.stringify({
      saveShortcut: i18n.t("editor.saveShortcut"),
      dirty: i18n.t("editor.unsaved")
    }),
    pageKey: "editor"
  })
}

export function registerPageRoutes(app: express.Express, context: DashboardAppContext) {
  const { basePath, i18n, config, brand, configService, runtimeBridge } = context
  const loginPath = joinBasePath(basePath, "login")
  const adminPath = joinBasePath(basePath, "admin")
  const adminDiscordPath = joinBasePath(basePath, "login/discord")
  const adminDiscordCallbackPath = joinBasePath(basePath, "login/discord/callback")
  const adminGuard = createAdminGuard(context)

  app.get(basePath, (_req, res) => {
    res.redirect(`${loginPath}?returnTo=${encodeURIComponent(adminPath)}`)
  })

  app.get(joinBasePath(basePath, "health"), (_req, res) => {
    res.json({ ok: true })
  })

  app.get(loginPath, async (req, res, next) => {
    try {
      const flash = req.query.flash === "csrfExpired" ? i18n.t("flash.csrfExpired") : ""
      const message = flash || (typeof req.query.msg === "string" ? req.query.msg : "")
      const returnTo = sanitizeReturnTo(basePath, req.query.returnTo, adminPath)
      const adminIdentity = getAdminSession(req)

      if (adminIdentity) {
        const access = await resolveDashboardAdminAccess(config, basePath, runtimeBridge, adminIdentity)
        if (access.canAccessAdminHost) {
          return res.redirect(resolveAdminReturnTo(basePath, access, returnTo))
        }

        clearAdminSession(req)
      }

      renderPage(res, "login", {
        pageTitle: `${i18n.t("login.title")} | ${brand.title}`,
        message,
        returnTo,
        discordAuthHref: `${adminDiscordPath}?returnTo=${encodeURIComponent(returnTo)}`,
        breakglassEnabled: config.auth.breakglass?.enabled === true,
        pageKey: "login"
      })
    } catch (error) {
      next(error)
    }
  })

  app.get(adminDiscordPath, async (req, res, next) => {
    try {
      const returnTo = sanitizeReturnTo(basePath, req.query.returnTo, adminPath)
      const adminIdentity = getAdminSession(req)
      if (adminIdentity) {
        const access = await resolveDashboardAdminAccess(config, basePath, runtimeBridge, adminIdentity)
        if (access.canAccessAdminHost) {
          return res.redirect(resolveAdminReturnTo(basePath, access, returnTo))
        }

        clearAdminSession(req)
      }

      const redirectUri = buildAdminCallbackUrl(req, context)
      if (!redirectUri) {
        return res.redirect(`${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordNotReady"))}&returnTo=${encodeURIComponent(returnTo)}`)
      }

      const oauthState = createAdminOAuthState(returnTo)
      await context.authStore.storeOAuthState({
        scope: "admin-discord",
        sessionScope: "admin",
        sessionId: req.sessionID,
        state: oauthState.state,
        returnTo: oauthState.returnTo,
        expiresAt: Date.now() + (10 * 60 * 1000)
      })

      res.redirect(buildAdminDiscordAuthorizeUrl(config, redirectUri, oauthState.state))
    } catch (error) {
      next(error)
    }
  })

  app.get(adminDiscordCallbackPath, async (req, res, next) => {
    try {
      const requestedState = typeof req.query.state === "string" ? req.query.state : ""
      const redirectUri = buildAdminCallbackUrl(req, context)
      if (!redirectUri) {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: adminPath,
          outcome: "failure",
          reason: "oauth-not-ready",
          details: {
            returnTo: sanitizeReturnTo(basePath, req.query.returnTo, adminPath)
          }
        })
        return res.redirect(`${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordNotReady"))}`)
      }

      const storedState = requestedState
        ? await context.authStore.consumeOAuthState({
          scope: "admin-discord",
          sessionScope: "admin",
          sessionId: req.sessionID,
          state: requestedState
        })
        : null

      if (!storedState) {
        await context.authStore.clearOAuthStatesForSession("admin-discord", "admin", req.sessionID)
        const fallbackReturnTo = sanitizeReturnTo(basePath, req.query.returnTo, adminPath)
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: fallbackReturnTo,
          outcome: "failure",
          reason: "state-expired",
          details: {
            returnTo: fallbackReturnTo
          }
        })
        return res.redirect(
          `${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordStateExpired"))}&returnTo=${encodeURIComponent(fallbackReturnTo)}`
        )
      }

      if (typeof req.query.code !== "string" || req.query.code.length === 0) {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: storedState.returnTo || adminPath,
          outcome: "failure",
          reason: "code-missing",
          details: {
            returnTo: storedState.returnTo || adminPath
          }
        })
        return res.redirect(
          `${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordCodeMissing"))}&returnTo=${encodeURIComponent(storedState.returnTo)}`
        )
      }

      let adminIdentity: Awaited<ReturnType<typeof context.adminAuthClient.fetchAdminIdentity>> | null = null
      try {
        const accessToken = await context.adminAuthClient.exchangeCode(req.query.code, redirectUri, config)
        adminIdentity = await context.adminAuthClient.fetchAdminIdentity(accessToken)
      } catch {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: storedState.returnTo || adminPath,
          outcome: "failure",
          reason: "discord-auth-failed",
          details: {
            returnTo: storedState.returnTo || adminPath
          }
        })
        return res.redirect(
          `${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordAuthFailed"))}&returnTo=${encodeURIComponent(storedState.returnTo || adminPath)}`
        )
      }

      if (!adminIdentity) {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: storedState.returnTo || adminPath,
          outcome: "failure",
          reason: "identity-missing",
          details: {
            returnTo: storedState.returnTo || adminPath
          }
        })
        return res.redirect(
          `${loginPath}?msg=${encodeURIComponent(i18n.t("flash.discordAuthFailed"))}&returnTo=${encodeURIComponent(storedState.returnTo || adminPath)}`
        )
      }

      const access = await resolveDashboardAdminAccess(config, basePath, runtimeBridge, adminIdentity)

      if (!access.canAccessAdminHost) {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-login-failure",
          target: storedState.returnTo || adminPath,
          outcome: "denied",
          reason: access.membership === "missing" ? "admin-access-missing-membership" : "admin-access-denied",
          details: {
            returnTo: storedState.returnTo || adminPath,
            membership: access.membership,
            tier: access.tier,
            source: access.source,
            freshnessMs: access.freshnessMs
          }
        }, buildDashboardAuditActor(adminIdentity))
        return res.redirect(
          `${loginPath}?msg=${encodeURIComponent(i18n.t("flash.adminAccessDenied"))}&returnTo=${encodeURIComponent(storedState.returnTo || adminPath)}`
        )
      }

      await regenerateSession(req)
      setAdminSession(req, {
        ...adminIdentity,
        accessTierAtAuth: access.tier
      })
      await recordAdminAuditEvent(context, req, {
        eventType: "admin-login-success",
        target: storedState.returnTo || access.preferredEntryPath,
        outcome: "success",
        reason: "discord-oauth",
        details: {
          returnTo: storedState.returnTo || access.preferredEntryPath,
          redirectTo: resolveAdminReturnTo(basePath, access, storedState.returnTo),
          membership: access.membership,
          tier: access.tier,
          source: access.source,
          freshnessMs: access.freshnessMs
        }
      }, buildDashboardAuditActor(adminIdentity))
      res.redirect(resolveAdminReturnTo(basePath, access, storedState.returnTo))
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "logout"), async (req, res, next) => {
    try {
      const adminIdentity = getAdminSession(req)
      if (adminIdentity) {
        await recordAdminAuditEvent(context, req, {
          eventType: "admin-logout",
          target: loginPath,
          outcome: "success",
          reason: "explicit-logout",
          details: {
            returnTo: loginPath
          }
        }, buildDashboardAuditActor(adminIdentity))
      }
      await regenerateSession(req)
      res.redirect(`${loginPath}?msg=${encodeURIComponent(i18n.t("flash.loggedOut"))}`)
    } catch (error) {
      next(error)
    }
  })

  registerAdminRoutes(app, context)

  app.get(joinBasePath(basePath, "config/:id"), adminGuard.page("config.write.general"), (req, res) => {
    const definition = getManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    renderRawEditor(res, definition, context, {
      jsonText: configService.prettifyText(configService.readManagedText(definition.id)),
      saved: savedFlag(req)
    })
  })

  app.post(joinBasePath(basePath, "config/:id"), adminGuard.form("config.write.general"), (req, res) => {
    const definition = getManagedConfig(req.params.id)
    if (!definition) {
      return res.status(404).send(i18n.t("editor.notFound"))
    }

    try {
      configService.saveRawJson(definition.id, String(req.body?.json || ""))
      void recordAdminAuditEvent(context, req, {
        eventType: "config-save",
        target: definition.id,
        outcome: "success",
        reason: "raw-json-editor",
        details: {
          configId: definition.id,
          mode: "raw-json-editor"
        }
      })
      res.redirect(`${joinBasePath(basePath, `config/${definition.id}`)}?saved=1`)
    } catch (error) {
      res.status(400)
      renderRawEditor(res, definition, context, {
        jsonText: String(req.body?.json || ""),
        errorMessage: i18n.t("editor.invalidJson", { message: (error as Error).message })
      })
    }
  })

  app.get(joinBasePath(basePath, "visual/general"), adminGuard.page("config.write.general"), (req, res) => {
    renderGeneralPage(res, context, {
      saved: savedFlag(req)
    })
  })

  app.get(joinBasePath(basePath, "visual/options"), adminGuard.page("config.write.visual"), (req, res) => {
    renderPage(res, "config-options", {
      pageTitle: `${i18n.t("options.title")} | ${brand.title}`,
      options: configService.readManagedJson<Record<string, unknown>[]>("options"),
      availableQuestions: configService.listAvailableQuestions(),
      supportTeams: configService.listAvailableSupportTeams(),
      dependencyGraph: JSON.stringify(configService.getEditorDependencyGraph()),
      optionTypes: OPTION_TYPES,
      buttonColors: OPTION_BUTTON_COLORS,
      channelSuffixes: OPTION_CHANNEL_SUFFIXES,
      roleModes: ROLE_MODES,
      advancedTools: buildWorkspaceTools(context, "options"),
      saved: savedFlag(req),
      messages: JSON.stringify(i18n.pick([
        "common.cancel",
        "common.closeDialog",
        "common.delete",
        "common.save",
        "common.edit",
        "common.add",
        "options.modal.addTitle",
        "options.modal.editTitle",
        "options.flash.validationClaimedCategory",
        "options.flash.validationButtonColor",
        "options.flash.validationChannelSuffix",
        "options.flash.validationRoleMode",
        "options.flash.validationMessageJson",
        "options.flash.validationRoutingTargets",
        "options.flash.deleteConfirm",
        "options.flash.deleteSuccess",
        "options.flash.saveSuccess",
        "options.flash.validationType",
        "options.flash.validationName",
        "options.flash.validationUrl"
      ])),
      pageKey: "options"
    })
  })

  app.get(joinBasePath(basePath, "visual/support-teams"), adminGuard.page("config.write.general"), (req, res) => {
    renderPage(res, "config-support-teams", {
      pageTitle: `${i18n.t("supportTeams.title")} | ${brand.title}`,
      supportTeams: configService.readManagedJson<Record<string, unknown>[]>("support-teams"),
      dependencyGraph: JSON.stringify(configService.getEditorDependencyGraph()),
      assignmentStrategies: SUPPORT_TEAM_ASSIGNMENT_STRATEGIES,
      advancedTools: buildWorkspaceTools(context, "support-teams"),
      saved: savedFlag(req),
      messages: JSON.stringify(i18n.pick([
        "common.cancel",
        "common.closeDialog",
        "common.delete",
        "common.save",
        "common.edit",
        "common.add",
        "supportTeams.modal.addTitle",
        "supportTeams.modal.editTitle",
        "supportTeams.flash.deleteConfirm",
        "supportTeams.flash.deleteSuccess",
        "supportTeams.flash.saveSuccess",
        "supportTeams.flash.validationId",
        "supportTeams.flash.validationName",
        "supportTeams.flash.validationRoles",
        "supportTeams.flash.validationStrategy"
      ])),
      pageKey: "support-teams"
    })
  })

  app.get(joinBasePath(basePath, "visual/panels"), adminGuard.page("config.write.visual"), (req, res) => {
    renderPage(res, "config-panels", {
      pageTitle: `${i18n.t("panels.title")} | ${brand.title}`,
      panels: configService.readManagedJson<Record<string, unknown>[]>("panels"),
      availableOptions: configService.getAvailableOptions(),
      dependencyGraph: JSON.stringify(configService.getEditorDependencyGraph()),
      describeLayouts: PANEL_DESCRIBE_LAYOUTS,
      advancedTools: buildWorkspaceTools(context, "panels"),
      contracts: JSON.stringify({
        dropdownOptionType: PANEL_DROPDOWN_OPTION_TYPE
      }),
      saved: savedFlag(req),
      messages: JSON.stringify(i18n.pick([
        "common.cancel",
        "common.closeDialog",
        "common.delete",
        "common.save",
        "common.edit",
        "common.add",
        "panels.modal.addTitle",
        "panels.modal.editTitle",
        "panels.flash.validationDropdownOptions",
        "panels.flash.validationUnknownOptions",
        "panels.flash.validationLayout",
        "panels.flash.availableOptions",
        "panels.flash.dropdownHint",
        "panels.flash.deleteConfirm",
        "panels.flash.deleteSuccess",
        "panels.flash.saveSuccess",
        "panels.flash.validationOptions"
      ])),
      pageKey: "panels"
    })
  })

  app.get(joinBasePath(basePath, "visual/questions"), adminGuard.page("config.write.visual"), (req, res) => {
    renderPage(res, "config-questions", {
      pageTitle: `${i18n.t("questions.title")} | ${brand.title}`,
      questions: configService.readManagedJson<Record<string, unknown>[]>("questions"),
      dependencyGraph: JSON.stringify(configService.getEditorDependencyGraph()),
      questionTypes: QUESTION_TYPES,
      advancedTools: buildWorkspaceTools(context, "questions"),
      contracts: JSON.stringify({
        idPattern: QUESTION_ID_PATTERN,
        idMinLength: QUESTION_ID_MIN_LENGTH,
        idMaxLength: QUESTION_ID_MAX_LENGTH,
        nameMinLength: QUESTION_NAME_MIN_LENGTH,
        nameMaxLength: QUESTION_NAME_MAX_LENGTH,
        placeholderMaxLength: QUESTION_PLACEHOLDER_MAX_LENGTH,
        lengthMin: QUESTION_LENGTH_MIN,
        lengthMax: QUESTION_LENGTH_MAX
      }),
      saved: savedFlag(req),
      messages: JSON.stringify(i18n.pick([
        "common.cancel",
        "common.closeDialog",
        "common.delete",
        "common.save",
        "common.edit",
        "common.add",
        "questions.modal.addTitle",
        "questions.modal.editTitle",
        "questions.flash.deleteConfirm",
        "questions.flash.deleteSuccess",
        "questions.flash.saveSuccess",
        "questions.flash.validationId",
        "questions.flash.validationIdFormat",
        "questions.flash.validationIdLength",
        "questions.flash.validationName",
        "questions.flash.validationNameLength",
        "questions.flash.validationPlaceholderLength",
        "questions.flash.validationMinimum",
        "questions.flash.validationMaximum",
        "questions.flash.validationLength"
      ])),
      pageKey: "questions"
    })
  })

  app.get(joinBasePath(basePath, "visual/transcripts"), adminGuard.page("transcript.manage"), async (req, res) => {
    const transcriptConfig = configService.readManagedJson<Record<string, unknown>>("transcripts")
    const savedTranscriptHtmlStyle = configService.normalizeTranscriptHtmlStyleDraft(transcriptConfig)
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const previewGetHref = joinBasePath(basePath, "visual/transcripts/preview")
    const previewPostHref = joinBasePath(basePath, "visual/transcripts/preview")
    const transcriptModeOptions = buildTranscriptEditorOptions(
      TRANSCRIPT_MODES,
      (value) => i18n.t(`transcripts.editor.enums.mode.${value}`)
    )
    const transcriptTextLayoutOptions = buildTranscriptEditorOptions(
      TRANSCRIPT_TEXT_LAYOUTS,
      (value) => i18n.t(`transcripts.editor.enums.textLayout.${value}`)
    )
    const transcriptFileModeOptions = buildTranscriptEditorOptions(
      TRANSCRIPT_FILE_MODES,
      (value) => i18n.t(`transcripts.editor.enums.fileMode.${value}`)
    )
    let transcriptStylePresets: DashboardTranscriptStylePreset[] = []
    let transcriptPreviewAvailable = false
    let transcriptPreviewWarningMessage = integration.state === "ready" && integration.service
      ? i18n.t("transcripts.editor.preview.unavailableUnsupported")
      : i18n.t("transcripts.editor.preview.unavailableService")

    if (integration.state === "ready" && integration.service && supportsTranscriptStylePreview(integration.service)) {
      try {
        transcriptStylePresets = await integration.service.listTranscriptStylePresets!()
        transcriptPreviewAvailable = true
        transcriptPreviewWarningMessage = ""
      } catch {
        transcriptPreviewWarningMessage = i18n.t("transcripts.editor.preview.unavailableError")
      }
    } else if (integration.state === "ready" && integration.service) {
      transcriptPreviewWarningMessage = i18n.t("transcripts.editor.preview.unavailableUnsupported")
    }

    const transcriptPresetDisplay = transcriptStylePresets.reduce<Record<string, { label: string; description: string }>>((display, preset) => {
      const presetId = String(preset.id || "")
      display[presetId] = {
        label: i18n.t(`transcripts.editor.presets.${presetId}.label`),
        description: i18n.t(`transcripts.editor.presets.${presetId}.description`)
      }
      return display
    }, {})
    const transcriptEditorMessages = i18n.pick([
      "transcripts.editor.preview.applyPresetAction",
      "transcripts.editor.preview.resetAction",
      "transcripts.editor.preview.refreshAction",
      "transcripts.editor.preview.iframeTitle"
    ])

    renderPage(res, "config-transcripts", {
      pageTitle: `${i18n.t("transcripts.title")} | ${brand.title}`,
      config: transcriptConfig,
      transcriptModeOptions,
      transcriptTextLayoutOptions,
      transcriptFileModeOptions,
      savedTranscriptHtmlStyle,
      transcriptStylePresets,
      transcriptPresetDisplay,
      transcriptEditorMessages,
      transcriptPreviewAvailable,
      transcriptPreviewWarningMessage,
      transcriptPreviewGetHref: previewGetHref,
      transcriptPreviewPostHref: previewPostHref,
      saved: savedFlag(req),
      pageKey: "transcripts"
    })
  })

  app.get(joinBasePath(basePath, "visual/transcripts/preview"), adminGuard.page("transcript.manage"), async (_req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const previewUnavailableTitle = i18n.t("transcripts.editor.preview.unavailableTitle")

    if (integration.state !== "ready" || !integration.service) {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableService"))
      )
    }

    if (!supportsTranscriptStylePreview(integration.service)) {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableUnsupported"))
      )
    }

    try {
      const styleDraft = configService.normalizeTranscriptHtmlStyleDraft(
        configService.readManagedJson<Record<string, unknown>>("transcripts")
      )
      const result = await integration.service.renderTranscriptStylePreview!(styleDraft)

      if (result.contentSecurityPolicy) {
        res.setHeader("Content-Security-Policy", result.contentSecurityPolicy)
      }

      if (result.status !== "ok" || !result.html) {
        return res.status(503).type("html").send(
          result.html || buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, result.message || i18n.t("transcripts.editor.preview.unavailableError"))
        )
      }

      return res.status(200).type("html").send(result.html)
    } catch {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableError"))
      )
    }
  })

  app.post(joinBasePath(basePath, "visual/transcripts/preview"), adminGuard.form("transcript.manage"), async (req, res) => {
    const integration = resolveTranscriptIntegration(context.projectRoot, configService, runtimeBridge)
    const previewUnavailableTitle = i18n.t("transcripts.editor.preview.unavailableTitle")

    if (integration.state !== "ready" || !integration.service) {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableService"))
      )
    }

    if (!supportsTranscriptStylePreview(integration.service)) {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableUnsupported"))
      )
    }

    try {
      const savedDraft = configService.normalizeTranscriptHtmlStyleDraft(
        configService.readManagedJson<Record<string, unknown>>("transcripts")
      )
      const styleDraft = configService.normalizeTranscriptHtmlStyleDraft(req.body || {}, savedDraft)
      const result = await integration.service.renderTranscriptStylePreview!(styleDraft)

      if (result.contentSecurityPolicy) {
        res.setHeader("Content-Security-Policy", result.contentSecurityPolicy)
      }

      if (result.status !== "ok" || !result.html) {
        return res.status(503).type("html").send(
          result.html || buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, result.message || i18n.t("transcripts.editor.preview.unavailableError"))
        )
      }

      return res.status(200).type("html").send(result.html)
    } catch {
      return res.status(503).type("html").send(
        buildTranscriptPreviewPlaceholderHtml(previewUnavailableTitle, i18n.t("transcripts.editor.preview.unavailableError"))
      )
    }
  })
}
