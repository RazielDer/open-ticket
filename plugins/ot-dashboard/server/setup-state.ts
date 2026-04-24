import type { ManagedConfigId } from "./config-registry"
import { TRANSCRIPT_MODES } from "./dashboard-contract"
import type { DashboardTranscriptIntegration } from "./transcript-service-bridge"

export type SetupState = "needs_setup" | "needs_attention" | "optional" | "ready"

export interface SetupStatusItem {
  id: ManagedConfigId
  state: SetupState
  reason: string
}

export interface SetupNextStep {
  id: ManagedConfigId | "operations"
  state: SetupState | "ready"
  reason: string
}

export interface SetupEvaluation {
  items: SetupStatusItem[]
  byId: Record<ManagedConfigId, SetupStatusItem>
  nextStep: SetupNextStep
  htmlTranscriptWarning: boolean
}

export interface SetupStateInput {
  general: Record<string, unknown> | null | undefined
  options: Array<Record<string, unknown>> | null | undefined
  panels: Array<Record<string, unknown>> | null | undefined
  questions: Array<Record<string, unknown>> | null | undefined
  supportTeams?: Array<Record<string, unknown>> | null | undefined
  transcripts: Record<string, any> | null | undefined
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
}

function buildGeneralStatus(general: Record<string, unknown> | null | undefined): SetupStatusItem {
  const token = typeof general?.token === "string" ? general.token.trim() : ""
  const serverId = typeof general?.serverId === "string" ? general.serverId.trim() : ""
  const slashCommands = general?.slashCommands === true
  const textCommands = general?.textCommands === true
  const tokenFromENV = general?.tokenFromENV === true

  if (!serverId) {
    return { id: "general", state: "needs_setup", reason: "missing_server_id" }
  }

  if (!slashCommands && !textCommands) {
    return { id: "general", state: "needs_setup", reason: "missing_command_mode" }
  }

  if (!tokenFromENV && !token) {
    return { id: "general", state: "needs_setup", reason: "missing_token" }
  }

  return { id: "general", state: "ready", reason: "configured" }
}

function buildCollectionStatus(id: "options" | "panels", collection: Array<Record<string, unknown>> | null | undefined): SetupStatusItem {
  if (!Array.isArray(collection) || collection.length === 0) {
    return { id, state: "needs_setup", reason: "empty" }
  }

  return { id, state: "ready", reason: "configured" }
}

function buildQuestionsStatus(collection: Array<Record<string, unknown>> | null | undefined): SetupStatusItem {
  if (!Array.isArray(collection) || collection.length === 0) {
    return { id: "questions", state: "optional", reason: "empty_optional" }
  }

  return { id: "questions", state: "ready", reason: "configured" }
}

function buildSupportTeamsStatus(collection: Array<Record<string, unknown>> | null | undefined): SetupStatusItem {
  if (!Array.isArray(collection) || collection.length === 0) {
    return { id: "support-teams", state: "optional", reason: "empty_optional" }
  }

  return { id: "support-teams", state: "ready", reason: "configured" }
}

function buildTranscriptsStatus(transcripts: Record<string, any> | null | undefined): SetupStatusItem {
  const enabled = transcripts?.general?.enabled === true
  const mode = typeof transcripts?.general?.mode === "string" ? transcripts.general.mode.trim() : ""

  if (!enabled) {
    return { id: "transcripts", state: "optional", reason: "disabled" }
  }

  if (!hasText(mode) || !TRANSCRIPT_MODES.includes(mode as any)) {
    return { id: "transcripts", state: "needs_attention", reason: "invalid_mode" }
  }

  return { id: "transcripts", state: "ready", reason: "configured" }
}

function buildNextStep(items: SetupStatusItem[], htmlTranscriptWarning: boolean): SetupNextStep {
  const actionOrder: ManagedConfigId[] = ["general", "options", "panels", "transcripts"]
  for (const id of actionOrder) {
    const item = items.find((entry) => entry.id === id)
    if (!item) continue
    if (item.state === "needs_setup" || item.state === "needs_attention") {
      return {
        id: item.id,
        state: item.state,
        reason: item.reason
      }
    }
  }

  if (htmlTranscriptWarning) {
    return {
      id: "transcripts",
      state: "needs_attention",
      reason: "html_integration_unavailable"
    }
  }

  const questions = items.find((entry) => entry.id === "questions")
  if (questions?.state === "optional") {
    return {
      id: "questions",
      state: "optional",
      reason: questions.reason
    }
  }

  return {
    id: "operations",
    state: "ready",
    reason: "daily_operations"
  }
}

export function evaluateSetupState(
  input: SetupStateInput,
  transcriptIntegration: Pick<DashboardTranscriptIntegration, "state" | "htmlMode"> | null = null
): SetupEvaluation {
  const items: SetupStatusItem[] = [
    buildGeneralStatus(input.general),
    buildCollectionStatus("options", input.options),
    buildCollectionStatus("panels", input.panels),
    buildQuestionsStatus(input.questions),
    buildSupportTeamsStatus(input.supportTeams),
    buildTranscriptsStatus(input.transcripts)
  ]

  const htmlTranscriptWarning = transcriptIntegration?.htmlMode === true && transcriptIntegration.state !== "ready"

  return {
    items,
    byId: items.reduce<Record<ManagedConfigId, SetupStatusItem>>((accumulator, item) => {
      accumulator[item.id] = item
      return accumulator
    }, {} as Record<ManagedConfigId, SetupStatusItem>),
    nextStep: buildNextStep(items, htmlTranscriptWarning),
    htmlTranscriptWarning
  }
}
