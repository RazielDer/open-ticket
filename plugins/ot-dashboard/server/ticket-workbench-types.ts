export type DashboardTicketTransportMode = "channel_text" | "private_thread"

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
  "close",
  "reopen",
  "refresh"
] as const

export type DashboardTicketActionId = (typeof DASHBOARD_TICKET_ACTION_IDS)[number]

export interface DashboardTicketActionAvailability {
  enabled: boolean
  reason: string | null
}

export interface DashboardTicketProviderLock {
  providerId: string
  title: string
  message: string
  lockedActions: DashboardTicketActionId[]
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
