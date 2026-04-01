import * as crypto from "crypto"

export const BRIDGE_SCHEMA_VERSION = "eotfs.ticket_bridge.whitelist_intake.v1" as const
export const BRIDGE_CASE_CREATED_EVENT = "case_created" as const
export const BRIDGE_TRANSCRIPT_ATTACHED_EVENT = "transcript_attached" as const
export const BRIDGE_TRANSCRIPT_ATTACHED_STATUS = "attached" as const
export const BRIDGE_RENDER_STATE_UNSTAGED = "unstaged" as const
export const BRIDGE_RENDER_STATE_DEGRADED = "degraded" as const
export const BRIDGE_POLL_INTERVAL_MS = 30_000
export const BRIDGE_MAX_POLL_ATTEMPTS = 40

export const BRIDGE_OPERATION_ELIGIBILITY = "eligibility" as const
export const BRIDGE_OPERATION_STATUS = "status" as const
export const BRIDGE_OPERATION_ACTION = "action" as const

export const BRIDGE_ACTION_ACCEPT = "accept" as const
export const BRIDGE_ACTION_RETRY = "retry" as const
export const BRIDGE_ACTION_DUPLICATE = "duplicate" as const
export const BRIDGE_ACTION_HARD_DENY = "hard_deny" as const
export const BRIDGE_ACTION_RETRY_APPLY = "retry_apply" as const
export const BRIDGE_ACTION_REFRESH_STATUS = "refresh_status" as const
export const BRIDGE_ACTION_REFRESH_REVIEW_PACKET = "refresh_review_packet" as const

export const BRIDGE_BLOCK_STATE_NONE = "none" as const
export const BRIDGE_BLOCK_STATE_RETRY_COOLDOWN = "retry_cooldown" as const
export const BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT = "limit_lockout" as const
export const BRIDGE_BLOCK_STATE_HARD_DENY_PENDING = "hard_deny_pending" as const
export const BRIDGE_BLOCK_STATE_HARD_DENY_REPAIR_REQUIRED = "hard_deny_repair_required" as const
export const BRIDGE_BLOCK_STATE_HARD_DENY_MANUAL = "hard_deny_manual" as const

export const BRIDGE_CASE_STATUS_PENDING_REVIEW = "pending_review" as const
export const BRIDGE_CASE_STATUS_DUPLICATE_REJECTED = "duplicate_rejected" as const
export const BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY = "accepted_pending_apply" as const
export const BRIDGE_CASE_STATUS_ACCEPTED_APPLIED = "accepted_applied" as const
export const BRIDGE_CASE_STATUS_ACCEPTED_FAILED = "accepted_failed" as const
export const BRIDGE_CASE_STATUS_RETRY_DENIED = "retry_denied" as const
export const BRIDGE_CASE_STATUS_LIMIT_LOCKED = "limit_locked" as const
export const BRIDGE_CASE_STATUS_HARD_DENY_PENDING = "hard_deny_pending" as const
export const BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED = "hard_deny_repair_required" as const
export const BRIDGE_REVIEWABLE_CASE_STATUSES = [
    BRIDGE_CASE_STATUS_PENDING_REVIEW,
    BRIDGE_CASE_STATUS_RETRY_DENIED,
    BRIDGE_CASE_STATUS_LIMIT_LOCKED
] as const

export type BridgeOperationKind =
    | typeof BRIDGE_OPERATION_ELIGIBILITY
    | typeof BRIDGE_OPERATION_STATUS
    | typeof BRIDGE_OPERATION_ACTION

export type BridgeActionKind =
    | typeof BRIDGE_ACTION_ACCEPT
    | typeof BRIDGE_ACTION_RETRY
    | typeof BRIDGE_ACTION_DUPLICATE
    | typeof BRIDGE_ACTION_HARD_DENY
    | typeof BRIDGE_ACTION_RETRY_APPLY
    | typeof BRIDGE_ACTION_REFRESH_STATUS

export type BridgeRenderState =
    | typeof BRIDGE_RENDER_STATE_UNSTAGED
    | typeof BRIDGE_RENDER_STATE_DEGRADED
    | typeof BRIDGE_CASE_STATUS_PENDING_REVIEW
    | typeof BRIDGE_CASE_STATUS_DUPLICATE_REJECTED
    | typeof BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY
    | typeof BRIDGE_CASE_STATUS_ACCEPTED_APPLIED
    | typeof BRIDGE_CASE_STATUS_ACCEPTED_FAILED
    | typeof BRIDGE_CASE_STATUS_RETRY_DENIED
    | typeof BRIDGE_CASE_STATUS_LIMIT_LOCKED
    | typeof BRIDGE_CASE_STATUS_HARD_DENY_PENDING
    | typeof BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED

export type BridgeControlButtonAction =
    | "send"
    | "refresh_review_packet"
    | "accept"
    | "retry"
    | "duplicate"
    | "hard_deny_review"
    | "retry_apply"
    | "refresh_status"

export interface BridgeFormContractData {
    discordUsernamePosition: number
    alderonIdsPosition: number
    rulesPasswordPosition: number
    requiredAcknowledgementPositions: number[]
}

export interface BridgeConfigData {
    integrationId: string
    endpointBaseUrl: string
    sharedSecret: string
    eligibleOptionIds: string[]
    formId: string
    targetGroupKey: string
    formContract: BridgeFormContractData
}

export interface BridgeCompletedFormAnswer {
    position: number
    question: string
    answer: string | null
}

export interface BridgeCompletedFormSnapshot {
    ticketChannelId: string
    ticketChannelName: string
    ticketOptionId: string
    applicantDiscordUserId: string
    formId: string
    completedAt: string
    answers: BridgeCompletedFormAnswer[]
}

export interface BridgeTicketContext {
    ticketChannelId: string
    ticketChannelName: string
    optionId: string
    optionName: string
    creatorDiscordUserId: string | null
}

export interface BridgeTargetSelector {
    mode: "group"
    group_key: string
}

export interface BridgeCaseCreatedPayload {
    schema_version: typeof BRIDGE_SCHEMA_VERSION
    event_kind: typeof BRIDGE_CASE_CREATED_EVENT
    source_system: "open_ticket"
    source_ticket_id: string
    source_ticket_ref: string
    source_ticket_name: string
    source_option_id: string
    source_option_name: string
    source_creator_discord_user_id: string
    source_handoff_discord_user_id: string
    source_form_id: string
    source_form_completed_at: string
    answers: BridgeCompletedFormAnswer[]
    applicant_ready: boolean
    alderon_ids: string[]
    alderon_ids_csv: string
    target_selector: BridgeTargetSelector
    transcript_url: null
}

export interface BridgeTranscriptAttachedPayload {
    schema_version: typeof BRIDGE_SCHEMA_VERSION
    event_kind: typeof BRIDGE_TRANSCRIPT_ATTACHED_EVENT
    source_system: "open_ticket"
    source_ticket_id: string
    source_ticket_ref: string
    transcript_url: string
    transcript_status: string
}

export interface BridgeCaseCreatedAck {
    caseId: string
    ticketRef: string
    duplicate: boolean
}

export interface BridgePolicySnapshot {
    max_retry_denials: number
    retry_cooldown_minutes: number
    limit_lockout_minutes: number
    next_retry_outcome: string
    total_staged_attempts: number
    active_retry_denial_count: number
    lifetime_retry_denial_count: number
    lifetime_limit_lockout_count: number
    duplicate_rejection_count: number
    accept_count: number
    hard_deny_count: number
    current_block_state: string
    block_expires_at: string | null
    historical_alderon_ids: string[]
    override_actor_user_id: number | null
    override_reason: string | null
    override_updated_at: string | null
}

export interface BridgeActionAvailability {
    accept: boolean
    retry: boolean
    duplicate: boolean
    hard_deny: boolean
    retry_apply: boolean
    refresh_status: boolean
    accept_disabled_reason: string | null
    retry_warning: string | null
}

export interface BridgeEligibilityResponse {
    applicant_discord_user_id: string
    eligible: boolean
    current_block_state: string
    block_expires_at: string | null
    policy: BridgePolicySnapshot
}

export interface BridgeStatusResponse {
    bridge_case_id: string
    source_ticket_ref: string
    status: string
    render_version: number
    transcript_ready: boolean
    ticket_log_link: string | null
    duplicate_active_whitelist: boolean
    current_block_state: string
    block_expires_at: string | null
    policy: BridgePolicySnapshot
    action_availability: BridgeActionAvailability
    apply_closeout_state: string
    reviewed_hard_deny_targets: string[]
}

export interface BridgeActionResponse extends BridgeStatusResponse {
    action_kind: string
    close_ticket_ready: boolean
    apply_request_id: string | null
    approval_id: string | null
    player_visible_critique: string | null
}

export interface BridgeControlButtonDescriptor {
    action: BridgeControlButtonAction
    label: string
    style: "success" | "primary" | "secondary" | "danger"
    disabled: boolean
}

export interface BridgeControlDescriptor {
    renderState: BridgeRenderState
    lines: string[]
    buttons: BridgeControlButtonDescriptor[]
}

export interface BridgeCreateTicketDecision {
    allow: boolean
    reason: string | null
    failOpen: boolean
}

export interface BridgeOptionLimitSnapshot {
    optionId: string
    limitsEnabled: boolean
    userMaximum: number | null
}

export interface BridgeOpenTicketSnapshot {
    ticketChannelId: string
    optionId: string
    creatorDiscordUserId: string | null
    closed: boolean
}

export interface BridgeHandoffState {
    ticketChannelId: string
    sourceTicketRef: string
    bridgeCaseId: string | null
    ticketRef: string
    targetGroupKey: string
    applicantDiscordUserId: string
    ticketCreatorDiscordUserId: string | null
    creatorTransferDetected: boolean
    createdEventId: string | null
    transcriptEventId: string | null
    transcriptUrl: string | null
    transcriptStatus: string | null
    controlMessageId: string | null
    lastRenderedState: BridgeRenderState | null
    renderVersion: number
    lastPolicySnapshot: BridgePolicySnapshot | null
    lastStatus: BridgeStatusResponse | null
    pollAttemptCount: number
    lastPolledAt: string | null
    nextPollAt: string | null
    lastPollError: string | null
    degradedReason: string | null
    updatedAt: string
}

export function createBridgeStateKey(ticketChannelId: string): string {
    return ticketChannelId
}

export function isEligibleOptionId(eligibleOptionIds: string[], optionId: string): boolean {
    return eligibleOptionIds.includes(optionId)
}

export function normalizeEndpointBaseUrl(endpointBaseUrl: string): string {
    return endpointBaseUrl.trim().replace(/\/+$/, "")
}

const BRIDGE_AGID_PLAIN_RE = /^\d{9}$/
const BRIDGE_AGID_GROUPED_RE = /^\d{3}-\d{3}-\d{3}$/

function collapseInternalWhitespace(value: string | null | undefined): string {
    if (typeof value != "string") return ""
    return value.trim().replace(/\s+/g, " ")
}

function normalizeDiscordIdentityValue(value: string | null | undefined): string | null {
    const normalized = collapseInternalWhitespace(value).toLowerCase()
    return normalized.length > 0 ? normalized : null
}

function normalizeCreatorIdentityAliases(values: readonly string[] | null | undefined): string[] {
    if (!values || values.length < 1) return []
    const seen = new Set<string>()
    const normalizedAliases: string[] = []
    for (const value of values) {
        const normalized = normalizeDiscordIdentityValue(value)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        normalizedAliases.push(normalized)
    }
    return normalizedAliases
}

export function matchesCreatorIdentityAlias(
    answer: string | null | undefined,
    creatorIdentityAliases: readonly string[] | null | undefined
): boolean {
    const normalizedAnswer = normalizeDiscordIdentityValue(answer)
    if (!normalizedAnswer) return false
    const normalizedAliases = normalizeCreatorIdentityAliases(creatorIdentityAliases)
    if (normalizedAliases.length < 1) return false
    return normalizedAliases.includes(normalizedAnswer)
}

export function canonicalizeAlderonGameId(rawValue: string | null | undefined): string | null {
    const normalized = collapseInternalWhitespace(rawValue)
    if (normalized.length < 1) return null
    if (BRIDGE_AGID_PLAIN_RE.test(normalized)) {
        return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`
    }
    if (BRIDGE_AGID_GROUPED_RE.test(normalized)) {
        return normalized
    }
    return null
}

export interface BridgeParsedAlderonIdsResult {
    ids: string[]
    hadAny: boolean
    invalid: boolean
    duplicates: boolean
}

export function parseAlderonGameIds(rawValue: string | null | undefined): BridgeParsedAlderonIdsResult {
    if (typeof rawValue != "string") {
        return {
            ids: [],
            hadAny: false,
            invalid: false,
            duplicates: false
        }
    }

    const seen = new Set<string>()
    const ids: string[] = []
    let hadAny = false
    let invalid = false
    let duplicates = false

    for (const part of rawValue.split(",")) {
        const normalized = part.trim()
        if (normalized.length < 1) continue
        hadAny = true
        const canonical = canonicalizeAlderonGameId(normalized)
        if (!canonical) {
            invalid = true
            continue
        }
        if (seen.has(canonical)) {
            duplicates = true
            continue
        }
        seen.add(canonical)
        ids.push(canonical)
    }

    return {
        ids,
        hadAny,
        invalid,
        duplicates
    }
}

export function extractFormAnswer(snapshot: BridgeCompletedFormSnapshot, position: number): string | null {
    const answer = snapshot.answers.find((entry) => entry.position == position)
    if (!answer || typeof answer.answer != "string") return null
    const normalized = answer.answer.trim()
    return normalized.length > 0 ? normalized : null
}

export function isAffirmativeAcknowledgementAnswer(answer: string | null | undefined): boolean {
    return (answer ?? "").trim().toLowerCase() == "yes"
}

export function normalizeAcceptedRulesPasswords(values: readonly string[]): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()
    for (const value of values) {
        const candidate = value.trim().toLowerCase()
        if (candidate.length < 1 || seen.has(candidate)) continue
        seen.add(candidate)
        normalized.push(candidate)
    }
    return normalized
}

export interface BridgeFormValidationResult {
    ok: boolean
    errors: string[]
    alderonIds: string[]
}

export function validateCompletedFormForHandoff(
    completedForm: BridgeCompletedFormSnapshot,
    formContract: BridgeFormContractData,
    acceptedRulesPasswords: readonly string[],
    creatorIdentityAliases: readonly string[] | null = null
): BridgeFormValidationResult {
    const errors: string[] = []
    const normalizedPasswords = normalizeAcceptedRulesPasswords(acceptedRulesPasswords)
    const discordUsernameAnswer = extractFormAnswer(completedForm, formContract.discordUsernamePosition)
    const rulesPasswordAnswer = extractFormAnswer(completedForm, formContract.rulesPasswordPosition)
    const alderonIdParse = parseAlderonGameIds(extractFormAnswer(completedForm, formContract.alderonIdsPosition))

    if (normalizedPasswords.length < 1) {
        errors.push("Set EOTFS_OT_WHITELIST_RULES_PASSWORDS in the OT runtime environment before staging whitelist applications.")
    } else if (!rulesPasswordAnswer || !normalizedPasswords.includes(rulesPasswordAnswer.trim().toLowerCase())) {
        errors.push(`Q${formContract.rulesPasswordPosition} rules password did not match an accepted value.`)
    }

    if (normalizeCreatorIdentityAliases(creatorIdentityAliases).length > 0 && !matchesCreatorIdentityAlias(discordUsernameAnswer, creatorIdentityAliases)) {
        errors.push(`Q${formContract.discordUsernamePosition} must match the ticket creator's live Discord username, global name, or server nickname.`)
    }

    if (!alderonIdParse.hadAny) {
        errors.push(`Q${formContract.alderonIdsPosition} field must contain at least one AGID.`)
    }
    if (alderonIdParse.invalid) {
        errors.push(`Q${formContract.alderonIdsPosition} each AGID must be \`123456789\` or \`123-456-789\`.`)
    }
    if (alderonIdParse.duplicates) {
        errors.push(`Q${formContract.alderonIdsPosition} duplicate AGIDs are not allowed.`)
    }

    for (const position of formContract.requiredAcknowledgementPositions) {
        if (isAffirmativeAcknowledgementAnswer(extractFormAnswer(completedForm, position))) continue
        const question = completedForm.answers.find((entry) => entry.position == position)?.question ?? "Acknowledgement"
        errors.push(`Q${position} must be answered Yes: ${question}`)
    }

    return {
        ok: errors.length < 1,
        errors,
        alderonIds: alderonIdParse.ids
    }
}

export function extractTranscriptUrl(record: { publicUrl: string | null } | null): string | null {
    if (!record || typeof record.publicUrl != "string") return null
    const normalized = record.publicUrl.trim()
    return normalized.length > 0 ? normalized : null
}

export function createSignedBridgeHeaders(sharedSecret: string, timestamp: string, eventId: string, rawBody: string) {
    const signature = crypto
        .createHmac("sha256", sharedSecret)
        .update(`${timestamp}\n${rawBody}`)
        .digest("hex")

    return {
        "Content-Type": "application/json",
        "X-Bridge-Timestamp": timestamp,
        "X-Bridge-Event-Id": eventId,
        "X-Bridge-Signature": `sha256=${signature}`
    }
}

export function buildCaseCreatedPayload(
    ticket: BridgeTicketContext,
    completedForm: BridgeCompletedFormSnapshot,
    handoffDiscordUserId: string,
    targetGroupKey: string,
    alderonIds: readonly string[]
): BridgeCaseCreatedPayload {
    const creatorDiscordUserId = (completedForm.applicantDiscordUserId || ticket.creatorDiscordUserId || "").trim()
    if (creatorDiscordUserId.length < 1) {
        throw new Error("Whitelist bridge payload requires the ticket creator Discord user id.")
    }

    if (alderonIds.length < 1) {
        throw new Error("Whitelist bridge payload requires at least one Alderon ID.")
    }

    const targetGroupKeyNormalized = targetGroupKey.trim()
    if (targetGroupKeyNormalized.length < 1) {
        throw new Error("Whitelist bridge payload requires a target group key.")
    }

    const orderedAnswers = [...completedForm.answers]
        .sort((left, right) => left.position - right.position)
        .map((answer) => ({
            position: answer.position,
            question: answer.question,
            answer: answer.answer
        }))

    return {
        schema_version: BRIDGE_SCHEMA_VERSION,
        event_kind: BRIDGE_CASE_CREATED_EVENT,
        source_system: "open_ticket",
        source_ticket_id: ticket.ticketChannelId,
        source_ticket_ref: `ot:${ticket.ticketChannelId}`,
        source_ticket_name: ticket.ticketChannelName,
        source_option_id: ticket.optionId,
        source_option_name: ticket.optionName,
        source_creator_discord_user_id: creatorDiscordUserId,
        source_handoff_discord_user_id: handoffDiscordUserId,
        source_form_id: completedForm.formId,
        source_form_completed_at: completedForm.completedAt,
        answers: orderedAnswers,
        applicant_ready: true,
        alderon_ids: [...alderonIds],
        alderon_ids_csv: alderonIds.join(", "),
        target_selector: {
            mode: "group",
            group_key: targetGroupKeyNormalized
        },
        transcript_url: null
    }
}

export function buildTranscriptAttachedPayload(ticketChannelId: string, transcriptUrl: string, transcriptStatus: string = BRIDGE_TRANSCRIPT_ATTACHED_STATUS): BridgeTranscriptAttachedPayload {
    const normalizedTranscriptUrl = transcriptUrl.trim()
    if (normalizedTranscriptUrl.length < 1) {
        throw new Error("Transcript attachment requires a transcript URL.")
    }

    return {
        schema_version: BRIDGE_SCHEMA_VERSION,
        event_kind: BRIDGE_TRANSCRIPT_ATTACHED_EVENT,
        source_system: "open_ticket",
        source_ticket_id: ticketChannelId,
        source_ticket_ref: `ot:${ticketChannelId}`,
        transcript_url: normalizedTranscriptUrl,
        transcript_status: transcriptStatus
    }
}

export function parseCaseCreatedAck(responseBody: unknown, fallbackTicketRef: string): BridgeCaseCreatedAck {
    if (!responseBody || typeof responseBody != "object") {
        throw new Error("Whitelist bridge case_created response must be a JSON object.")
    }

    const body = responseBody as Record<string, unknown>
    const caseIdValue = body.case_id ?? body.bridge_case_id
    if (typeof caseIdValue != "string" || caseIdValue.trim().length < 1) {
        throw new Error("Whitelist bridge case_created response must include case_id.")
    }

    const ticketRefValue = typeof body.ticket_ref == "string" && body.ticket_ref.trim().length > 0
        ? body.ticket_ref.trim()
        : fallbackTicketRef

    return {
        caseId: caseIdValue.trim(),
        ticketRef: ticketRefValue,
        duplicate: body.duplicate === true
    }
}

export function createHandoffState(
    ticketChannelId: string,
    targetGroupKey: string,
    eventId: string,
    ack: BridgeCaseCreatedAck,
    updatedAt: string,
    applicantDiscordUserId: string,
    ticketCreatorDiscordUserId: string | null
): BridgeHandoffState {
    const normalizedApplicantDiscordUserId = applicantDiscordUserId.trim()
    if (normalizedApplicantDiscordUserId.length < 1) {
        throw new Error("Whitelist bridge handoff state requires applicantDiscordUserId.")
    }
    const normalizedTicketCreatorDiscordUserId = typeof ticketCreatorDiscordUserId == "string"
        ? ticketCreatorDiscordUserId.trim() || null
        : null
    return {
        ticketChannelId,
        sourceTicketRef: `ot:${ticketChannelId}`,
        bridgeCaseId: ack.caseId,
        ticketRef: ack.ticketRef,
        targetGroupKey,
        applicantDiscordUserId: normalizedApplicantDiscordUserId,
        ticketCreatorDiscordUserId: normalizedTicketCreatorDiscordUserId,
        creatorTransferDetected: normalizedTicketCreatorDiscordUserId !== null && normalizedTicketCreatorDiscordUserId != normalizedApplicantDiscordUserId,
        createdEventId: eventId,
        transcriptEventId: null,
        transcriptUrl: null,
        transcriptStatus: null,
        controlMessageId: null,
        lastRenderedState: null,
        renderVersion: 0,
        lastPolicySnapshot: null,
        lastStatus: null,
        pollAttemptCount: 0,
        lastPolledAt: null,
        nextPollAt: null,
        lastPollError: null,
        degradedReason: null,
        updatedAt
    }
}

export function applyTranscriptAttachment(state: BridgeHandoffState, eventId: string, transcriptUrl: string, transcriptStatus: string, updatedAt: string): BridgeHandoffState {
    return {
        ...state,
        transcriptEventId: eventId,
        transcriptUrl,
        transcriptStatus,
        updatedAt
    }
}
