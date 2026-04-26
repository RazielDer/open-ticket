import { api, opendiscord, utilities } from "#opendiscord"
import * as discord from "discord.js"

import { OTAiAssistService } from "./service/ai-assist-runtime"
import {
  REFERENCE_PROVIDER_ID,
  REFERENCE_PROVIDER_MISSING_CONFIG_REASON,
  createReferenceAiAssistProvider,
  isReferenceAiAssistConfigured
} from "./providers/reference-provider"
import type { TicketPlatformAiAssistCapability } from "../../src/core/api/openticket/ticket-platform"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

const SERVICE_ID = "ot-ai-assist:service"
const COMMAND_ID = "ot-ai-assist:assist"
const acot = discord.ApplicationCommandOptionType
const DASHBOARD_RUNTIME_API_SYMBOL = Symbol.for("open-ticket.ot-dashboard")

declare module "#opendiscord-types" {
  export interface ODPluginManagerIds_Default {
    "ot-ai-assist": api.ODPlugin
  }
  export interface ODPluginClassManagerIds_Default {
    "ot-ai-assist:service": OTAiAssistPluginService
  }
  export interface ODSlashCommandManagerIds_Default {
    "ot-ai-assist:assist": api.ODSlashCommand
  }
  export interface ODCommandResponderManagerIds_Default {
    "ot-ai-assist:assist": { source: "slash"; params: {}; workers: "ot-ai-assist:assist" }
  }
}

class OTAiAssistPluginService extends api.ODManagerData {
  private readonly service: OTAiAssistService

  constructor() {
    super(SERVICE_ID)
    this.service = new OTAiAssistService({
      projectRoot: process.cwd(),
      getConfigData(id) {
        return opendiscord.configs.get(id)?.data
      },
      getProvider(id) {
        return api.getTicketPlatformRuntimeApi()?.getAiAssistProvider(id) ?? null
      },
      async getFormsDrafts() {
        const formsService = opendiscord.plugins.classes.get("ot-ticket-forms:service") as any
        return typeof formsService?.listTicketDrafts === "function" ? await formsService.listTicketDrafts() : []
      }
    })
  }

  getTicketAiAssistSummary(input: { ticket: unknown; channel?: unknown; guild?: unknown }) {
    return this.service.getTicketAiAssistSummary(input)
  }

  runTicketAiAssist(input: Parameters<OTAiAssistService["runTicketAiAssist"]>[0]) {
    return this.service.runTicketAiAssist(input)
  }
}

const runtimeApi = api.getTicketPlatformRuntimeApi()
if (runtimeApi) {
  runtimeApi.registerAiAssistProvider(createReferenceAiAssistProvider())
}

opendiscord.events.get("onPluginClassLoad").listen((classes) => {
  classes.add(new OTAiAssistPluginService())
})

opendiscord.events.get("onStartScreenLoad").listen(() => {
  if (isReferenceAiAssistConfigured()) return
  opendiscord.log(REFERENCE_PROVIDER_MISSING_CONFIG_REASON, "plugin", [
    { key: "provider", value: REFERENCE_PROVIDER_ID }
  ])
})

opendiscord.events.get("onSlashCommandLoad").listen((slash) => {
  slash.add(new api.ODSlashCommand(COMMAND_ID, {
    name: "assist",
    description: "Run private ticket AI assist.",
    type: discord.ApplicationCommandType.ChatInput,
    contexts: [discord.InteractionContextType.Guild],
    integrationTypes: [discord.ApplicationIntegrationType.GuildInstall],
    options: [
      {
        name: "action",
        description: "AI assist action.",
        type: acot.String,
        required: true,
        choices: [
          { name: "summarize", value: "summarize" },
          { name: "faq", value: "faq" },
          { name: "draft", value: "draft" }
        ]
      },
      {
        name: "prompt",
        description: "FAQ question or optional draft instructions.",
        type: acot.String,
        required: false
      }
    ]
  }))
})

function quickMessage(content: string) {
  return new api.ODQuickMessage("ot-ai-assist:reply", {
    content,
    ephemeral: true
  }).build()
}

function mapAction(value: string): TicketPlatformAiAssistCapability | null {
  if (value === "summarize") return "summarize"
  if (value === "faq") return "answerFaq"
  if (value === "draft") return "suggestReply"
  return null
}

function resultText(result: Awaited<ReturnType<OTAiAssistService["runTicketAiAssist"]>>) {
  return result.summary || result.answer || result.draft || result.degradedReason || "AI assist request completed."
}

async function recordAiAssistAudit(input: {
  ticketId: string | null
  actorUser: discord.User
  action: TicketPlatformAiAssistCapability | "unknown"
  outcome: string
  profileId?: string | null
  providerId?: string | null
  confidence?: string | null
  reason?: string | null
}) {
  const details = {
    action: input.action,
    profileId: input.profileId ?? null,
    providerId: input.providerId ?? null,
    confidence: input.confidence ?? null
  }
  const runtimeApi = (globalThis as Record<symbol, {
    recordAuditEvent?: (event: {
      eventType: string
      sessionScope?: "admin" | "viewer" | null
      sessionId?: string | null
      actor?: { userId?: string | null; username?: string | null; globalName?: string | null } | null
      target?: string | null
      outcome?: string | null
      reason?: string | null
      details?: Record<string, unknown> | null
    }) => Promise<boolean>
  } | undefined>)[DASHBOARD_RUNTIME_API_SYMBOL]

  const recorded = typeof runtimeApi?.recordAuditEvent === "function"
    ? await runtimeApi.recordAuditEvent({
        eventType: "ai-assist-request",
        sessionScope: null,
        sessionId: null,
        actor: {
          userId: input.actorUser.id,
          username: input.actorUser.username,
          globalName: input.actorUser.globalName
        },
        target: input.ticketId || "unknown-ticket",
        outcome: input.outcome,
        reason: input.reason ?? null,
        details
      })
    : false

  opendiscord.log("ai-assist-request", "info", [
    { key: "ticketid", value: input.ticketId || "unknown-ticket", hidden: true },
    { key: "userid", value: input.actorUser.id, hidden: true },
    { key: "action", value: input.action },
    { key: "profile", value: input.profileId || "" },
    { key: "provider", value: input.providerId || "" },
    { key: "outcome", value: input.outcome },
    { key: "confidence", value: input.confidence || "" },
    { key: "dashboardAudit", value: recorded ? "recorded" : "unavailable" }
  ])
}

opendiscord.events.get("onCommandResponderLoad").listen((commands) => {
  const generalConfig = opendiscord.configs.get("opendiscord:general")
  commands.add(new api.ODCommandResponder(COMMAND_ID, generalConfig.data.prefix, "assist"))
  commands.get(COMMAND_ID).workers.add(
    new api.ODWorker(COMMAND_ID, 0, async (instance, _params, source, cancel) => {
      if (source !== "slash") return cancel()
      const { guild, channel, user, member } = instance
      if (!guild || !channel) {
        await recordAiAssistAudit({ ticketId: null, actorUser: user, action: "unknown", outcome: "unavailable", reason: "AI assist is only available in a guild ticket channel." })
        await instance.reply(await quickMessage("AI assist is only available in a guild ticket channel."))
        return cancel()
      }

      const action = mapAction(instance.options.getString("action", true) || "")
      const prompt = instance.options.getString("prompt", false) || ""
      if (!action) {
        await recordAiAssistAudit({ ticketId: null, actorUser: user, action: "unknown", outcome: "unavailable", reason: "Unknown AI assist action." })
        await instance.reply(await quickMessage("Unknown AI assist action."))
        return cancel()
      }
      if (action === "answerFaq" && prompt.trim().length < 1) {
        await recordAiAssistAudit({ ticketId: null, actorUser: user, action, outcome: "unavailable", reason: "FAQ assist requires a prompt." })
        await instance.reply(await quickMessage("FAQ assist requires a prompt."))
        return cancel()
      }

      const ticket = opendiscord.tickets.get(channel.id)
      if (!ticket || ticket.get("opendiscord:open")?.value !== true) {
        await recordAiAssistAudit({ ticketId: null, actorUser: user, action, outcome: "unavailable", reason: "AI assist is only available in the current open ticket channel." })
        await instance.reply(await quickMessage("AI assist is only available in the current open ticket channel."))
        return cancel()
      }

      const closePermission = generalConfig.data.system.permissions.close
      const permission = await opendiscord.permissions.checkCommandPerms(closePermission, "support", user, member, channel, guild)
      if (!permission.hasPerms) {
        await recordAiAssistAudit({ ticketId: ticket.id.value, actorUser: user, action, outcome: "denied", reason: "Open Ticket denied this AI assist request." })
        await instance.reply(await quickMessage("Open Ticket denied this AI assist request."))
        return cancel()
      }

      await instance.defer(true)
      const service = opendiscord.plugins.classes.get(SERVICE_ID) as OTAiAssistPluginService | null
      const result = service
        ? await service.runTicketAiAssist({
            ticket,
            channel,
            guild,
            actorUser: user,
            action,
            source: "slash",
            prompt: action === "answerFaq" ? prompt : null,
            instructions: action === "suggestReply" ? prompt : null
          })
        : {
            profileId: null,
            providerId: null,
            action,
            outcome: "unavailable" as const,
            confidence: null,
            summary: null,
            answer: null,
            draft: null,
            citations: [],
            warnings: [],
            degradedReason: "AI assist service is unavailable."
          }

      await recordAiAssistAudit({
        ticketId: ticket.id.value,
        actorUser: user,
        action,
        outcome: result.outcome,
        profileId: result.profileId,
        providerId: result.providerId,
        confidence: result.confidence,
        reason: result.degradedReason
      })
      await instance.reply(await quickMessage(resultText(result)))
    })
  )
})
