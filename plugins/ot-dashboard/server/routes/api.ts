import express from "express"

import { buildDashboardAuditActor, createAdminGuard, getAdminSession } from "../auth"
import { isDashboardConfigOperationError, isDashboardGeneralFormValidationError } from "../config-service"
import { joinBasePath } from "../dashboard-config"
import type { DashboardAppContext } from "../create-app"
import { renderGeneralPage } from "./pages"

function sendArrayEditorError(res: express.Response, error: unknown) {
  if (isDashboardConfigOperationError(error)) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      guidance: error.guidance,
      references: error.references
    })
  }

  return res.status(400).json({ success: false, error: (error as Error).message })
}

function recordAdminAuditEvent(
  context: DashboardAppContext,
  req: express.Request,
  input: {
    eventType: string
    target: string
    outcome?: string | null
    reason?: string | null
    details?: Record<string, unknown>
  }
) {
  return context.authStore.recordAuditEvent({
    eventType: input.eventType,
    sessionScope: "admin",
    sessionId: req.sessionID,
    actor: buildDashboardAuditActor(getAdminSession(req)),
    target: input.target,
    outcome: input.outcome ?? "success",
    reason: input.reason ?? null,
    details: input.details ?? {}
  }).catch(() => {})
}

function buildGeneralValidationMessage(context: DashboardAppContext, code: string) {
  switch (code) {
    case "GLOBAL_ADMINS_INVALID_JSON":
      return context.i18n.t("general.fields.globalAdminsErrorInvalidJson")
    case "GLOBAL_ADMINS_NOT_ARRAY":
      return context.i18n.t("general.fields.globalAdminsErrorNotArray")
    case "GLOBAL_ADMINS_NUMBER":
      return context.i18n.t("general.fields.globalAdminsErrorNumber")
    case "GLOBAL_ADMINS_EMPTY_STRING":
      return context.i18n.t("general.fields.globalAdminsErrorEmptyString")
    case "GLOBAL_ADMINS_NON_STRING":
      return context.i18n.t("general.fields.globalAdminsErrorNonString")
    case "GLOBAL_ADMINS_INVALID_ROLE_ID":
    default:
      return context.i18n.t("general.fields.globalAdminsErrorInvalidRoleId")
  }
}

function normalizeAiAssistRouteInput(
  body: unknown,
  action: "summarize" | "answerFaq" | "suggestReply"
) {
  const data = body && typeof body === "object" ? body as Record<string, unknown> : {}
  if (action === "summarize") {
    return { prompt: "", instructions: "" }
  }
  if (action === "answerFaq") {
    return { prompt: typeof data.question === "string" ? data.question : "", instructions: "" }
  }
  return { prompt: "", instructions: typeof data.instructions === "string" ? data.instructions : "" }
}

export function registerApiRoutes(app: express.Express, context: DashboardAppContext) {
  const { basePath, configService } = context
  const adminGuard = createAdminGuard(context)

  const handleAiAssistRequest = async (
    req: express.Request,
    res: express.Response,
    action: "summarize" | "answerFaq" | "suggestReply"
  ) => {
    const session = getAdminSession(req)
    const actorUserId = String(session?.userId || "").trim()
    const ticketId = String(req.params.ticketId || "").trim()
    if (!actorUserId || !ticketId || typeof context.runtimeBridge.runTicketAiAssist !== "function") {
      const outcome = "unavailable"
      void recordAdminAuditEvent(context, req, {
        eventType: "ai-assist-request",
        target: ticketId || "unknown-ticket",
        outcome,
        details: { action, profileId: null, providerId: null, confidence: null }
      })
      return res.status(400).json({ success: false, outcome, error: "AI assist is unavailable for this dashboard session." })
    }

    const assistInput = normalizeAiAssistRouteInput(req.body, action)
    const result = await context.runtimeBridge.runTicketAiAssist({
      ticketId,
      action,
      actorUserId,
      prompt: assistInput.prompt,
      instructions: assistInput.instructions
    })

    void recordAdminAuditEvent(context, req, {
      eventType: "ai-assist-request",
      target: ticketId,
      outcome: result.outcome,
      reason: result.degradedReason,
      details: {
        action,
        profileId: result.profileId,
        providerId: result.providerId,
        confidence: result.confidence
      }
    })

    const status = result.ok ? 200 : result.outcome === "denied" ? 403 : result.outcome === "busy" ? 409 : 400
    const error = result.ok ? null : result.degradedReason || result.message || "AI assist request failed."
    res.status(status).json({
      success: result.ok,
      ...(error ? { error } : {}),
      result
    })
  }

  app.post(joinBasePath(basePath, "api/config/general"), adminGuard.form("config.write.general"), (req, res) => {
    try {
      configService.saveGeneralForm(req.body || {})
      void recordAdminAuditEvent(context, req, {
        eventType: "config-save",
        target: "general",
        reason: "visual-general-form",
        details: {
          configId: "general",
          mode: "visual-form"
        }
      })
      res.redirect(`${joinBasePath(basePath, "visual/general")}?saved=1`)
    } catch (error) {
      const savedGeneral = configService.readManagedJson<Record<string, unknown>>("general")
      let generalDraft = savedGeneral
      try {
        generalDraft = configService.normalizeGeneralDraft(req.body || {}, savedGeneral)
      } catch {
        generalDraft = savedGeneral
      }

      res.status(400)
      if (isDashboardGeneralFormValidationError(error)) {
        return renderGeneralPage(res, context, {
          config: generalDraft,
          globalAdminsDraft: typeof req.body?.globalAdmins === "string" ? req.body.globalAdmins : "",
          globalAdminsErrorMessage: buildGeneralValidationMessage(context, error.code),
          globalAdminsWarningMessage: ""
        })
      }

      return renderGeneralPage(res, context, {
        config: generalDraft,
        globalAdminsDraft: typeof req.body?.globalAdmins === "string" ? req.body.globalAdmins : undefined,
        errorMessage: context.i18n.t("general.saveError", { message: (error as Error).message })
      })
    }
  })

  app.post(joinBasePath(basePath, "api/config/transcripts"), adminGuard.form("transcript.manage"), (req, res) => {
    try {
      configService.saveTranscriptsForm(req.body || {})
      void recordAdminAuditEvent(context, req, {
        eventType: "config-save",
        target: "transcripts",
        reason: "visual-transcripts-form",
        details: {
          configId: "transcripts",
          mode: "visual-form"
        }
      })
      res.redirect(`${joinBasePath(basePath, "visual/transcripts")}?saved=1`)
    } catch (error) {
      res.status(400).send(`Error saving config: ${(error as Error).message}`)
    }
  })

  app.get(joinBasePath(basePath, "api/options"), adminGuard.api("config.write.visual"), (_req, res) => {
    try {
      const options = configService.readManagedJson<Record<string, unknown>[]>("options")
      res.json({ success: true, options, count: options.length })
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message })
    }
  })

  app.post(joinBasePath(basePath, "api/options/save"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.saveOption(req.body?.option || {}, Number(req.body?.editIndex))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "options",
        reason: "options-save",
        details: {
          configId: "options",
          operation: "save",
          editIndex: Number(req.body?.editIndex)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/options/delete/:index"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.deleteArrayItem("options", Number(req.params.index))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "options",
        reason: "options-delete",
        details: {
          configId: "options",
          operation: "delete",
          index: Number(req.params.index)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/options/reorder"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []
      const result = configService.reorderArrayItems("options", orderedIds)
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "options",
        reason: "options-reorder",
        details: {
          configId: "options",
          operation: "reorder",
          orderedCount: orderedIds.length
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.get(joinBasePath(basePath, "api/panels/available-options"), adminGuard.api("config.write.visual"), (_req, res) => {
    try {
      res.json({ success: true, options: configService.getAvailableOptions() })
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message })
    }
  })

  app.post(joinBasePath(basePath, "api/panels/save"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.savePanel(req.body?.panel || {}, Number(req.body?.editIndex))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "panels",
        reason: "panels-save",
        details: {
          configId: "panels",
          operation: "save",
          editIndex: Number(req.body?.editIndex)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/panels/delete/:index"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.deleteArrayItem("panels", Number(req.params.index))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "panels",
        reason: "panels-delete",
        details: {
          configId: "panels",
          operation: "delete",
          index: Number(req.params.index)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/panels/reorder"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []
      const result = configService.reorderArrayItems("panels", orderedIds)
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "panels",
        reason: "panels-reorder",
        details: {
          configId: "panels",
          operation: "reorder",
          orderedCount: orderedIds.length
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/questions/save"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.saveQuestion(req.body?.question || {}, Number(req.body?.editIndex))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "questions",
        reason: "questions-save",
        details: {
          configId: "questions",
          operation: "save",
          editIndex: Number(req.body?.editIndex)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/questions/delete/:index"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const result = configService.deleteArrayItem("questions", Number(req.params.index))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "questions",
        reason: "questions-delete",
        details: {
          configId: "questions",
          operation: "delete",
          index: Number(req.params.index)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/questions/reorder"), adminGuard.api("config.write.visual"), (req, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []
      const result = configService.reorderArrayItems("questions", orderedIds)
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "questions",
        reason: "questions-reorder",
        details: {
          configId: "questions",
          operation: "reorder",
          orderedCount: orderedIds.length
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/support-teams/save"), adminGuard.api("config.write.general"), (req, res) => {
    try {
      const result = configService.saveSupportTeam(req.body?.team || {}, Number(req.body?.editIndex))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "support-teams",
        reason: "support-teams-save",
        details: {
          configId: "support-teams",
          operation: "save",
          editIndex: Number(req.body?.editIndex)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/support-teams/delete/:index"), adminGuard.api("config.write.general"), (req, res) => {
    try {
      const result = configService.deleteArrayItem("support-teams", Number(req.params.index))
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "support-teams",
        reason: "support-teams-delete",
        details: {
          configId: "support-teams",
          operation: "delete",
          index: Number(req.params.index)
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/support-teams/reorder"), adminGuard.api("config.write.general"), (req, res) => {
    try {
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : []
      const result = configService.reorderArrayItems("support-teams", orderedIds)
      void recordAdminAuditEvent(context, req, {
        eventType: "visual-config-save",
        target: "support-teams",
        reason: "support-teams-reorder",
        details: {
          configId: "support-teams",
          operation: "reorder",
          orderedCount: orderedIds.length
        }
      })
      res.json(result)
    } catch (error) {
      sendArrayEditorError(res, error)
    }
  })

  app.post(joinBasePath(basePath, "api/tickets/:ticketId/ai/summarize"), adminGuard.api("ticket.workbench"), async (req, res, next) => {
    try {
      await handleAiAssistRequest(req, res, "summarize")
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "api/tickets/:ticketId/ai/answer-faq"), adminGuard.api("ticket.workbench"), async (req, res, next) => {
    try {
      await handleAiAssistRequest(req, res, "answerFaq")
    } catch (error) {
      next(error)
    }
  })

  app.post(joinBasePath(basePath, "api/tickets/:ticketId/ai/suggest-reply"), adminGuard.api("ticket.workbench"), async (req, res, next) => {
    try {
      await handleAiAssistRequest(req, res, "suggestReply")
    } catch (error) {
      next(error)
    }
  })
}
