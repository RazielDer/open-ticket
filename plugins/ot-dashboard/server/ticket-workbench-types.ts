export type DashboardTicketTransportMode = "channel_text" | "private_thread"
export type DashboardTicketFeedbackStatus = "completed" | "ignored" | "delivery_failed" | "none"
export type DashboardTicketFeedbackStoredStatus = Exclude<DashboardTicketFeedbackStatus, "none">
export type DashboardTicketQueueState = "waiting_staff" | "owned" | "awaiting_user" | "close_requested" | "resolved"
export type DashboardTicketQueueAttention = "first-response" | "unassigned" | "stale-owner" | "close-request" | "awaiting-user"
export type DashboardQualityReviewState = "unreviewed" | "in_review" | "resolved"
export type DashboardQualityReviewRawFeedbackStatus = "available" | "partial" | "expired" | "none"
export type DashboardQualityReviewOwnerBucket = "mine" | "unassigned" | "other" | "resolved"
export type DashboardQualityReviewOverdueKind = "unreviewed" | "in_review" | null

export interface DashboardTicketQueueFacts {
  ticketId: string
  queueState: DashboardTicketQueueState
  queueAnchorAt: number | null
  attention: DashboardTicketQueueAttention[]
  firstResponseOverdue: boolean
  unassignedAttention: boolean
  staleOwner: boolean
  closeRequestAttention: boolean
  awaitingUserAttention: boolean
  unavailableReason: string | null
}

export interface DashboardTicketQueueSummary {
  activeCount: number
  waitingStaffCount: number
  firstResponseOverdueCount: number
  unassignedCount: number
  staleOwnerCount: number
  closeRequestCount: number
  awaitingUserCount: number
  unavailableReason: string | null
}

export type DashboardTicketWorkbenchViewScope = "private" | "shared"

export interface DashboardTicketWorkbenchViewRecord {
  viewId: string
  scope: DashboardTicketWorkbenchViewScope
  ownerUserId: string
  name: string
  query: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface DashboardTicketWorkbenchSavedViewSummary {
  viewId: string
  scope: DashboardTicketWorkbenchViewScope
  ownerUserId: string
  name: string
  query: Record<string, string>
  applyHref: string
  updateAction: string
  deleteAction: string
  active: boolean
  canUpdate: boolean
  canDelete: boolean
}

export interface DashboardTicketWorkbenchViewMutationRequest {
  actorUserId: string
  actorIsAdmin: boolean
  viewId?: string
  scope: DashboardTicketWorkbenchViewScope
  ownerUserId?: string | null
  name: string
  query: Record<string, string>
}

export interface DashboardTicketWorkbenchViewMutationResult {
  ok: boolean
  status: "success" | "warning" | "danger"
  message: string
  view: DashboardTicketWorkbenchViewRecord | null
}

export interface DashboardTicketTeamQueueSummary {
  teamId: string | null
  teamLabel: string
  activeCount: number
  waitingStaffCount: number
  ownedCount: number
  attentionCount: number
  firstResponseOverdueCount: number
  unassignedCount: number
  staleOwnerCount: number
  closeRequestCount: number
  awaitingUserCount: number
  oldestQueueAnchorAt: number | null
  oldestQueueAnchorLabel: string
  viewHref: string
  unavailableReason: string | null
}

export interface DashboardQualityReviewQueueSummary {
  activeCount: number
  myQueueCount: number
  unassignedCount: number
  overdueCount: number
  overdueUnreviewedCount: number
  overdueInReviewCount: number
  unavailableReason: string | null
}

export interface DashboardQualityReviewNotificationStatus {
  notificationsEnabled: boolean
  digestEnabled: boolean
  deliveryChannelCount: number
  configuredTargetCount: number | null
  validTargetCount: number | null
  lastDeliveryError: string | null
  unavailableReason: string | null
  remindersSentToday: number
  lastDigestAt: number | null
  lastDigestDate: string | null
  lastDigestCount: number
  digestDeliveredToday: boolean
  ticketReminder: {
    ticketId: string
    lastReminderAt: number | null
    lastReminderCaseUpdatedAt: number | null
    lastReminderOverdueKind: Exclude<DashboardQualityReviewOverdueKind, null> | null
  } | null
  ticketReminderCooldownUntil: number | null
}

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
  ticketId?: string | null
  teamId?: string | null
  assigneeId?: string | null
  transportMode?: DashboardTicketTransportMode | null
  eventTypes?: string[]
  order?: "asc" | "desc"
  cursor?: string | null
  limit?: number
}

export interface DashboardTicketFeedbackTelemetryQuery {
  since?: number
  until?: number
  ticketId?: string | null
  teamId?: string | null
  assigneeId?: string | null
  transportMode?: DashboardTicketTransportMode | null
  statuses?: DashboardTicketFeedbackStoredStatus[]
  order?: "asc" | "desc"
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

export interface DashboardQualityReviewCaseSignal {
  ticketId: string
  firstKnownAt: number | null
  lastSignalAt: number | null
  latestCompletedAnsweredSessionId: string | null
}

export interface DashboardQualityReviewCaseQuery {
  tickets: DashboardQualityReviewCaseSignal[]
}

export interface DashboardQualityReviewCaseSummary {
  ticketId: string
  stored: boolean
  state: DashboardQualityReviewState
  ownerUserId: string | null
  ownerLabel: string
  createdAt: number
  updatedAt: number
  resolvedAt: number | null
  lastSignalAt: number
  noteCount: number
  rawFeedbackStatus: DashboardQualityReviewRawFeedbackStatus
  latestRawFeedbackSessionId: string | null
  ownerBucket: DashboardQualityReviewOwnerBucket
  queueAnchorAt: number | null
  overdue: boolean
  overdueKind: DashboardQualityReviewOverdueKind
  overdueSince: number | null
}

export interface DashboardQualityReviewNoteRecord {
  noteId: string
  ticketId: string
  authorUserId: string
  authorLabel: string
  createdAt: number
  body: string
}

export interface DashboardQualityReviewRawAssetRecord {
  assetId: string
  fileName: string
  contentType: string | null
  byteSize: number
  relativePath: string | null
  captureStatus: "mirrored" | "failed" | "expired"
  reason: string | null
}

export interface DashboardQualityReviewRawAnswerRecord {
  position: number
  type: "text" | "rating" | "image" | "attachment" | "choice"
  label: string
  answered: boolean
  textValue: string | null
  ratingValue: number | null
  choiceIndex: number | null
  choiceLabel: string | null
  assets: DashboardQualityReviewRawAssetRecord[]
}

export interface DashboardQualityReviewRawFeedbackRecord {
  sessionId: string
  ticketId: string
  capturedAt: number
  retentionExpiresAt: number
  storageStatus: Exclude<DashboardQualityReviewRawFeedbackStatus, "none">
  warnings: string[]
  answers: DashboardQualityReviewRawAnswerRecord[]
}

export interface DashboardQualityReviewCaseDetailRecord extends DashboardQualityReviewCaseSummary {
  notes: DashboardQualityReviewNoteRecord[]
  rawFeedback: DashboardQualityReviewRawFeedbackRecord[]
}

export interface DashboardQualityReviewCaseListResult {
  cases: DashboardQualityReviewCaseSummary[]
  warnings: string[]
}

export type DashboardQualityReviewActionId = "set-state" | "assign-owner" | "clear-owner" | "add-note"

export interface DashboardQualityReviewActionRequest {
  ticketId: string
  action: DashboardQualityReviewActionId
  actorUserId: string
  state?: DashboardQualityReviewState | string | null
  ownerUserId?: string | null
  note?: string | null
}

export interface DashboardQualityReviewActionResult {
  ok: boolean
  status: "success" | "warning" | "danger"
  message: string
  warnings?: string[]
}

export interface DashboardQualityReviewAssetResult {
  status: "available" | "missing" | "expired"
  filePath: string | null
  fileName: string | null
  contentType: string | null
  byteSize: number
  message: string
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
  "pin",
  "unpin",
  "rename",
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
  renameName?: string
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
