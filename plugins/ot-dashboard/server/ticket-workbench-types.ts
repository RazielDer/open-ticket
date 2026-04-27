export type DashboardTicketTransportMode = "channel_text" | "private_thread"
export type DashboardTicketFeedbackStatus = "completed" | "ignored" | "delivery_failed" | "none"
export type DashboardTicketFeedbackStoredStatus = Exclude<DashboardTicketFeedbackStatus, "none">

export interface DashboardTicketTelemetrySnapshot {
  creatorUserId: string | null
  optionId: string | null
  transportMode: DashboardTicketTransportMode | null
  assignedTeamId: string | null
  assignedStaffUserId: string | null
  assignmentStrategy: string | null
  integrationProfileId: string | null
  aiAssistProfileId: string | null
  closeRequestState: string | null
  awaitingUserState: string | null
  firstStaffResponseAt: number | null
  resolvedAt: number | null
  closed: boolean
}

export interface DashboardTicketLifecycleTelemetryRecord {
  recordId: string
  ticketId: string
  eventType: string
  occurredAt: number
  actorUserId: string | null
  snapshot: DashboardTicketTelemetrySnapshot
  previousSnapshot: DashboardTicketTelemetrySnapshot | null
}

export interface DashboardTicketFeedbackQuestionSummary {
  position: number
  type: "text" | "rating" | "image" | "attachment" | "choice"
  label: string
  answered: boolean
  ratingValue: number | null
  choiceIndex: number | null
  choiceLabel: string | null
}

export interface DashboardTicketFeedbackTelemetryRecord {
  sessionId: string
  ticketId: string
  triggerMode: "close" | "delete" | "first-close-only"
  triggeredAt: number
  completedAt: number | null
  status: DashboardTicketFeedbackStoredStatus
  respondentUserId: string | null
  closeCountAtTrigger: number
  snapshot: DashboardTicketTelemetrySnapshot
  questionSummaries: DashboardTicketFeedbackQuestionSummary[]
}

export interface DashboardTicketLifecycleTelemetryQuery {
  since?: number
  until?: number
  teamId?: string | null
  assigneeId?: string | null
  transportMode?: DashboardTicketTransportMode | null
  eventTypes?: string[]
  cursor?: string | null
  limit?: number
}

export interface DashboardTicketFeedbackTelemetryQuery {
  since?: number
  until?: number
  teamId?: string | null
  assigneeId?: string | null
  transportMode?: DashboardTicketTransportMode | null
  statuses?: DashboardTicketFeedbackStoredStatus[]
  cursor?: string | null
  limit?: number
}

export interface DashboardTicketLifecycleTelemetryResult {
  items: DashboardTicketLifecycleTelemetryRecord[]
  nextCursor: string | null
  truncated: boolean
  warnings: string[]
}

export interface DashboardTicketFeedbackTelemetryResult {
  items: DashboardTicketFeedbackTelemetryRecord[]
  nextCursor: string | null
  truncated: boolean
  warnings: string[]
}

export interface DashboardTicketFeedbackRatingSignal {
  questionKey: string
  label: string
  value: number | null
}

export interface DashboardTicketTelemetrySignals {
  hasEverReopened: boolean
  reopenCount: number
  lastReopenedAt: number | null
  latestFeedbackStatus: DashboardTicketFeedbackStatus
  latestFeedbackTriggeredAt: number | null
  latestFeedbackCompletedAt: number | null
  latestRatings: DashboardTicketFeedbackRatingSignal[]
}

export const DASHBOARD_TICKET_ACTION_IDS = [
  "claim",
  "unclaim",
  "assign",
  "escalate",
  "move",
  "transfer",
  "add-participant",
  "remove-participant",
  "set-priority",
  "set-topic",
  "approve-close-request",
  "dismiss-close-request",
  "set-awaiting-user",
  "clear-awaiting-user",
  "close",
  "reopen",
  "refresh"
] as const

export type DashboardTicketActionId = (typeof DASHBOARD_TICKET_ACTION_IDS)[number]
export const DASHBOARD_TICKET_BULK_ACTION_IDS = ["claim-self","unclaim","close","reopen"] as const
export type DashboardTicketBulkActionId = (typeof DASHBOARD_TICKET_BULK_ACTION_IDS)[number]
export type DashboardTicketProviderLockedActionId =
  | DashboardTicketActionId
  | "request-close"
  | "cancel-close-request"
  | "delete"
  | "pin"
  | "unpin"
  | "rename"

export interface DashboardTicketActionAvailability {
  enabled: boolean
  reason: string | null
}

export interface DashboardTicketProviderLock {
  providerId: string
  title: string
  message: string
  lockedActions: DashboardTicketProviderLockedActionId[]
}

export interface DashboardTicketIntegrationSummary {
  profileId: string
  providerId: string
  label: string
  state: "ready" | "degraded" | "locked" | "unavailable"
  summary: string | null
  degradedReason: string | null
  lockedTicketActions: DashboardTicketProviderLockedActionId[]
}

export type DashboardTicketAiAssistAction = "summarize" | "answerFaq" | "suggestReply"
export type DashboardTicketAiAssistOutcome = "success" | "unavailable" | "busy" | "low-confidence" | "provider-error" | "denied"
export type DashboardTicketAiAssistConfidence = "high" | "medium" | "low"

export interface DashboardTicketAiAssistCitation {
  kind: "ticket-message" | "knowledge-source" | "managed-form"
  sourceId: string
  label: string
  locator: string | null
  excerpt: string | null
}

export interface DashboardTicketAiAssistSummary {
  profileId: string
  providerId: string
  label: string
  available: boolean
  actions: DashboardTicketAiAssistAction[]
  reason: string | null
}

export interface DashboardTicketAiAssistResult {
  ok: boolean
  outcome: DashboardTicketAiAssistOutcome
  action: DashboardTicketAiAssistAction
  message: string
  profileId: string | null
  providerId: string | null
  confidence: DashboardTicketAiAssistConfidence | null
  summary?: string | null
  answer?: string | null
  draft?: string | null
  citations: DashboardTicketAiAssistCitation[]
  warnings: string[]
  degradedReason: string | null
  ticketId?: string
}

export interface DashboardTicketAiAssistRequest {
  ticketId: string
  action: DashboardTicketAiAssistAction
  actorUserId: string
  prompt?: string
  instructions?: string
}

export interface DashboardTicketAssignableStaffChoice {
  userId: string
  label: string
}

export interface DashboardTicketEscalationTargetChoice {
  optionId: string
  optionLabel: string
  panelId: string | null
  panelLabel: string | null
  transportMode: DashboardTicketTransportMode
}

export interface DashboardTicketMoveTargetChoice {
  optionId: string
  optionLabel: string
  panelId: string | null
  panelLabel: string | null
  transportMode: DashboardTicketTransportMode
  teamId: string | null
  teamLabel: string | null
}

export interface DashboardTicketTransferCandidateChoice {
  userId: string
  label: string
}

export interface DashboardTicketParticipantChoice {
  userId: string
  label: string
  present: boolean
}

export interface DashboardTicketPriorityChoice {
  priorityId: string
  label: string
}

export interface DashboardTicketDetailRecord {
  ticket: import("./dashboard-runtime-registry").DashboardTicketRecord
  panelId: string | null
  panelLabel: string | null
  optionLabel: string | null
  creatorLabel: string | null
  teamLabel: string | null
  assigneeLabel: string | null
  priorityId: string | null
  priorityLabel: string | null
  topic: string | null
  originalApplicantUserId: string | null
  originalApplicantLabel: string | null
  creatorTransferWarning: string | null
  participantLabels: string[]
  actionAvailability: Record<DashboardTicketActionId, DashboardTicketActionAvailability>
  assignableStaff: DashboardTicketAssignableStaffChoice[]
  escalationTargets: DashboardTicketEscalationTargetChoice[]
  moveTargets: DashboardTicketMoveTargetChoice[]
  transferCandidates: DashboardTicketTransferCandidateChoice[]
  participantChoices: DashboardTicketParticipantChoice[]
  priorityChoices: DashboardTicketPriorityChoice[]
  providerLock: DashboardTicketProviderLock | null
  integration: DashboardTicketIntegrationSummary | null
  aiAssist: DashboardTicketAiAssistSummary | null
  telemetry: DashboardTicketTelemetrySignals | null
}

export interface DashboardTicketActionRequest {
  ticketId: string
  action: DashboardTicketActionId
  actorUserId: string
  reason?: string
  assigneeUserId?: string
  targetOptionId?: string
  newCreatorUserId?: string
  participantUserId?: string
  priorityId?: string
  topic?: string
}

export interface DashboardTicketActionResult {
  ok: boolean
  status: "success" | "warning" | "danger"
  message: string
  warnings?: string[]
  ticketId?: string
}

export interface DashboardTicketBulkActionRequest {
  ticketIds: string[]
  action: DashboardTicketBulkActionId
  actorUserId: string
  reason?: string
}

export interface DashboardTicketBulkActionResult {
  requested: number
  succeeded: number
  skipped: number
  failed: number
}
