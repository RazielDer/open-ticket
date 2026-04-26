import type {
  TicketAiAssistAnswerFaqResult,
  TicketAiAssistHookInput,
  TicketAiAssistSuggestReplyResult,
  TicketAiAssistSummarizeResult,
  TicketAiAssistValidateProfileSettingsInput,
  TicketPlatformAiAssistProvider
} from "../../../src/core/api/openticket/ticket-platform.js"

export const REFERENCE_PROVIDER_ID = "reference"
export const REFERENCE_PROVIDER_MISSING_CONFIG_REASON = "Reference AI provider is not configured on this host"

export interface ReferenceProviderEnv {
  OT_AI_ASSIST_REFERENCE_API_KEY?: string
  OT_AI_ASSIST_REFERENCE_MODEL?: string
  OT_AI_ASSIST_REFERENCE_BASE_URL?: string
}

function trim(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function isReferenceAiAssistConfigured(env: ReferenceProviderEnv = process.env) {
  return trim(env.OT_AI_ASSIST_REFERENCE_API_KEY).length > 0 && trim(env.OT_AI_ASSIST_REFERENCE_MODEL).length > 0
}

function baseResult() {
  return {
    outcome: "success" as const,
    confidence: "medium" as const,
    citations: [],
    degradedReason: null,
    warnings: []
  }
}

function unavailableBase() {
  return {
    outcome: "unavailable" as const,
    confidence: null,
    citations: [],
    degradedReason: REFERENCE_PROVIDER_MISSING_CONFIG_REASON,
    warnings: []
  }
}

function validateProfileSettings(input: TicketAiAssistValidateProfileSettingsInput) {
  void input.profile
  void input.referencedByOptionIds
  void input.knowledgeSources
  const secretKey = Object.keys(input.settings || {}).find((key) => /secret|token|password|api[_-]?key|authorization|credential/i.test(key))
  if (secretKey) {
    throw new Error(`AI assist profile settings must not contain secret-shaped key "${secretKey}". Use host environment variables for provider secrets.`)
  }
}

function latestRequesterText(input: TicketAiAssistHookInput) {
  return input.context.messages
    .map((message) => message.content)
    .filter(Boolean)
    .slice(-3)
    .join(" ")
}

export function createReferenceAiAssistProvider(env: ReferenceProviderEnv = process.env): TicketPlatformAiAssistProvider {
  const configured = () => isReferenceAiAssistConfigured(env)

  return {
    id: REFERENCE_PROVIDER_ID,
    pluginId: "ot-ai-assist",
    capabilities: ["summarize", "answerFaq", "suggestReply"],
    validateProfileSettings,
    summarize(input): TicketAiAssistSummarizeResult {
      if (!configured()) return { ...unavailableBase(), summary: null }
      const messageCount = input.context.messages.length
      const optionId = input.context.ticketMetadata?.optionId
      const summary = optionId
        ? `Ticket summary for option ${optionId}: ${messageCount} recent live message(s) reviewed.`
        : `Ticket summary: ${messageCount} recent live message(s) reviewed.`
      return { ...baseResult(), summary }
    },
    answerFaq(input): TicketAiAssistAnswerFaqResult {
      if (!configured()) return { ...unavailableBase(), answer: null }
      const knowledge = input.knowledge[0]
      const fallback = input.request.prompt
        ? `No configured FAQ entry directly answered "${input.request.prompt}".`
        : "No FAQ prompt was provided."
      return {
        ...baseResult(),
        confidence: knowledge ? "high" : "low",
        answer: knowledge ? knowledge.content : fallback,
        citations: knowledge
          ? [{
              kind: "knowledge-source",
              sourceId: knowledge.sourceId,
              label: knowledge.label,
              locator: knowledge.locator,
              excerpt: knowledge.content.slice(0, 240)
            }]
          : []
      }
    },
    suggestReply(input): TicketAiAssistSuggestReplyResult {
      if (!configured()) return { ...unavailableBase(), draft: null }
      const recent = latestRequesterText(input)
      const instructions = trim(input.request.instructions)
      const draft = instructions
        ? `Draft reply: ${instructions}`
        : recent
          ? `Draft reply: Thanks for the update. We reviewed your latest message and will follow up with the next step shortly.`
          : `Draft reply: Thanks for reaching out. We will review this ticket and follow up shortly.`
      return { ...baseResult(), draft }
    }
  }
}
