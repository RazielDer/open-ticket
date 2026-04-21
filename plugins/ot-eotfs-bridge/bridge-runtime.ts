import {
    BRIDGE_ACTION_ACCEPT,
    BRIDGE_ACTION_DUPLICATE,
    BRIDGE_ACTION_HARD_DENY,
    BRIDGE_ACTION_REFRESH_STATUS,
    BRIDGE_ACTION_RETRY,
    BRIDGE_ACTION_RETRY_APPLY,
    BRIDGE_BLOCK_STATE_HARD_DENY_MANUAL,
    BRIDGE_BLOCK_STATE_HARD_DENY_PENDING,
    BRIDGE_BLOCK_STATE_HARD_DENY_REPAIR_REQUIRED,
    BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT,
    BRIDGE_BLOCK_STATE_NONE,
    BRIDGE_BLOCK_STATE_RETRY_COOLDOWN,
    BRIDGE_CASE_STATUS_ACCEPTED_APPLIED,
    BRIDGE_CASE_STATUS_ACCEPTED_FAILED,
    BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY,
    BRIDGE_CASE_STATUS_DUPLICATE_REJECTED,
    BRIDGE_CASE_STATUS_HARD_DENY_PENDING,
    BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED,
    BRIDGE_CASE_STATUS_LIMIT_LOCKED,
    BRIDGE_CASE_STATUS_PENDING_REVIEW,
    BRIDGE_CASE_STATUS_RETRY_DENIED,
    BRIDGE_MAX_POLL_ATTEMPTS,
    BRIDGE_POLL_INTERVAL_MS,
    BRIDGE_REVIEWABLE_CASE_STATUSES,
    BRIDGE_RENDER_STATE_DEGRADED,
    BRIDGE_RENDER_STATE_UNSTAGED,
    BRIDGE_TRANSCRIPT_ATTACHED_STATUS,
    BridgeActionAvailability,
    BridgeActionResponse,
    BridgeCaseCreatedPayload,
    BridgeCompletedFormSnapshot,
    BridgeFormContractData,
    BridgeControlDescriptor,
    BridgeControlEmbedPresentation,
    BridgeCreateTicketDecision,
    BridgeEligibilityResponse,
    BridgeHandoffState,
    BridgeOpenTicketSnapshot,
    BridgeOptionLimitSnapshot,
    BridgePolicySnapshot,
    BridgeRenderState,
    BridgeStatusResponse,
    BridgeTicketContext,
    BridgeTranscriptAttachedPayload,
    applyTranscriptAttachment,
    buildCaseCreatedPayload,
    buildTranscriptAttachedPayload,
    createHandoffState,
    validateCompletedFormForHandoff
} from "./bridge-core"

export type BridgeCaseCreatedPreparation =
    | { status: "ready"; payload: BridgeCaseCreatedPayload; mode: "initial" | "refresh" }
    | { status: "missing-form"; message: string }
    | { status: "invalid-form"; message: string }
    | { status: "already-bridged"; state: BridgeHandoffState }
    | { status: "refresh-blocked"; state: BridgeHandoffState; message: string }

export type BridgeTranscriptAttachPreparation =
    | { status: "ready"; payload: BridgeTranscriptAttachedPayload }
    | { status: "ignored"; reason: "missing-state" | "missing-transcript-url" | "already-attached" }

function asObject(value: unknown): Record<string, unknown> {
    return value && typeof value == "object" ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback: string = ""): string {
    return typeof value == "string" ? value.trim() : fallback
}

function asNullableString(value: unknown): string | null {
    const normalized = asString(value)
    return normalized.length > 0 ? normalized : null
}

function asBoolean(value: unknown): boolean {
    return value === true
}

function asNumber(value: unknown, fallback: number = 0): number {
    if (typeof value == "number" && Number.isFinite(value)) return value
    if (typeof value == "string" && value.trim().length > 0) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return fallback
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
        .map((entry) => asString(entry))
        .filter((entry) => entry.length > 0)
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
    const base = Number.isFinite(Date.parse(isoTimestamp))
        ? Date.parse(isoTimestamp)
        : Date.now()
    return new Date(base + milliseconds).toISOString()
}

function normalizePolicySnapshot(value: unknown): BridgePolicySnapshot {
    const policy = asObject(value)
    return {
        max_retry_denials: asNumber(policy.max_retry_denials, 99),
        retry_cooldown_minutes: asNumber(policy.retry_cooldown_minutes, 5),
        limit_lockout_minutes: asNumber(policy.limit_lockout_minutes, 43_200),
        next_retry_outcome: asString(policy.next_retry_outcome, BRIDGE_CASE_STATUS_RETRY_DENIED),
        total_staged_attempts: asNumber(policy.total_staged_attempts, 0),
        active_retry_denial_count: asNumber(policy.active_retry_denial_count, 0),
        lifetime_retry_denial_count: asNumber(policy.lifetime_retry_denial_count, 0),
        lifetime_limit_lockout_count: asNumber(policy.lifetime_limit_lockout_count, 0),
        duplicate_rejection_count: asNumber(policy.duplicate_rejection_count, 0),
        accept_count: asNumber(policy.accept_count, 0),
        hard_deny_count: asNumber(policy.hard_deny_count, 0),
        current_block_state: asString(policy.current_block_state, BRIDGE_BLOCK_STATE_NONE),
        block_expires_at: asNullableString(policy.block_expires_at),
        historical_alderon_ids: asStringArray(policy.historical_alderon_ids),
        override_actor_user_id: policy.override_actor_user_id == null ? null : asNumber(policy.override_actor_user_id, 0),
        override_reason: asNullableString(policy.override_reason),
        override_updated_at: asNullableString(policy.override_updated_at)
    }
}

function normalizeActionAvailability(value: unknown): BridgeActionAvailability {
    const availability = asObject(value)
    return {
        accept: asBoolean(availability.accept),
        retry: asBoolean(availability.retry),
        duplicate: asBoolean(availability.duplicate),
        hard_deny: asBoolean(availability.hard_deny),
        retry_apply: asBoolean(availability.retry_apply),
        refresh_status: asBoolean(availability.refresh_status),
        accept_disabled_reason: asNullableString(availability.accept_disabled_reason),
        retry_warning: asNullableString(availability.retry_warning)
    }
}

export function normalizeEligibilityResponse(
    value: unknown,
    fallbackApplicantDiscordUserId: string
): BridgeEligibilityResponse {
    const payload = asObject(value)
    return {
        applicant_discord_user_id: asString(payload.applicant_discord_user_id, fallbackApplicantDiscordUserId),
        eligible: asBoolean(payload.eligible),
        current_block_state: asString(payload.current_block_state, BRIDGE_BLOCK_STATE_NONE),
        block_expires_at: asNullableString(payload.block_expires_at),
        policy: normalizePolicySnapshot(payload.policy)
    }
}

export function normalizeStatusResponse(value: unknown): BridgeStatusResponse {
    const payload = asObject(value)
    return {
        bridge_case_id: asString(payload.bridge_case_id),
        source_ticket_ref: asString(payload.source_ticket_ref),
        status: asString(payload.status, BRIDGE_CASE_STATUS_PENDING_REVIEW),
        render_version: asNumber(payload.render_version, 1),
        transcript_ready: asBoolean(payload.transcript_ready),
        ticket_log_link: asNullableString(payload.ticket_log_link),
        duplicate_active_whitelist: asBoolean(payload.duplicate_active_whitelist),
        current_block_state: asString(payload.current_block_state, BRIDGE_BLOCK_STATE_NONE),
        block_expires_at: asNullableString(payload.block_expires_at),
        policy: normalizePolicySnapshot(payload.policy),
        action_availability: normalizeActionAvailability(payload.action_availability),
        apply_closeout_state: asString(payload.apply_closeout_state, "ticket_open"),
        player_visible_apply_summary: asNullableString(payload.player_visible_apply_summary),
        reviewed_hard_deny_targets: asStringArray(payload.reviewed_hard_deny_targets)
    }
}

export function normalizeActionResponse(value: unknown): BridgeActionResponse {
    const payload = asObject(value)
    const statusPayload = normalizeStatusResponse(payload)
    return {
        ...statusPayload,
        action_kind: asString(payload.action_kind),
        close_ticket_ready: asBoolean(payload.close_ticket_ready),
        apply_request_id: asNullableString(payload.apply_request_id),
        approval_id: asNullableString(payload.approval_id),
        player_visible_critique: asNullableString(payload.player_visible_critique),
        operator_warning: asNullableString(payload.operator_warning)
    }
}

export function isReviewableBridgeStatus(status: string | null | undefined): boolean {
    return BRIDGE_REVIEWABLE_CASE_STATUSES.includes(
        (status ?? "") as typeof BRIDGE_REVIEWABLE_CASE_STATUSES[number]
    )
}

export function createInitialBridgeState(
    ticketChannelId: string,
    targetGroupKey: string,
    applicantDiscordUserId: string,
    ticketCreatorDiscordUserId: string | null,
    updatedAt: string
): BridgeHandoffState {
    const normalizedApplicantDiscordUserId = asString(applicantDiscordUserId, "unknown") || "unknown"
    const normalizedTicketCreatorDiscordUserId = asNullableString(ticketCreatorDiscordUserId)
    return {
        ticketChannelId,
        sourceTicketRef: `ot:${ticketChannelId}`,
        bridgeCaseId: null,
        ticketRef: `ot:${ticketChannelId}`,
        targetGroupKey: asString(targetGroupKey),
        applicantDiscordUserId: normalizedApplicantDiscordUserId,
        ticketCreatorDiscordUserId: normalizedTicketCreatorDiscordUserId,
        creatorTransferDetected: normalizedTicketCreatorDiscordUserId !== null && normalizedTicketCreatorDiscordUserId != normalizedApplicantDiscordUserId,
        createdEventId: null,
        transcriptEventId: null,
        transcriptUrl: null,
        transcriptStatus: null,
        presentationStackVersion: 2,
        whitelistProcessMessageId: null,
        whitelistExpectationsMessageId: null,
        controlMessageId: null,
        lastRenderedState: BRIDGE_RENDER_STATE_UNSTAGED,
        renderVersion: 0,
        lastPolicySnapshot: null,
        lastStatus: null,
        pollAttemptCount: 0,
        lastPolledAt: null,
        nextPollAt: null,
        lastPollError: null,
        degradedReason: null,
        operatorWarning: null,
        updatedAt
    }
}

export function normalizeBridgeState(state: BridgeHandoffState): BridgeHandoffState {
    const fallback = createInitialBridgeState(
        state.ticketChannelId,
        state.targetGroupKey,
        state.applicantDiscordUserId,
        state.ticketCreatorDiscordUserId,
        state.updatedAt
    )
    const bridgeCaseId = asNullableString(state.bridgeCaseId)
    const ticketRef = asString(state.ticketRef, fallback.ticketRef) || fallback.ticketRef
    const applicantDiscordUserId = asString(state.applicantDiscordUserId, fallback.applicantDiscordUserId) || fallback.applicantDiscordUserId
    const ticketCreatorDiscordUserId = asNullableString(state.ticketCreatorDiscordUserId)
    return {
        ...fallback,
        bridgeCaseId,
        ticketRef,
        applicantDiscordUserId,
        ticketCreatorDiscordUserId,
        creatorTransferDetected: ticketCreatorDiscordUserId !== null && ticketCreatorDiscordUserId != applicantDiscordUserId,
        createdEventId: asNullableString(state.createdEventId),
        transcriptEventId: asNullableString(state.transcriptEventId),
        transcriptUrl: asNullableString(state.transcriptUrl),
        transcriptStatus: asNullableString(state.transcriptStatus),
        presentationStackVersion: asNumber(state.presentationStackVersion, 0),
        whitelistProcessMessageId: asNullableString(state.whitelistProcessMessageId),
        whitelistExpectationsMessageId: asNullableString(state.whitelistExpectationsMessageId),
        controlMessageId: asNullableString(state.controlMessageId),
        lastRenderedState: (asNullableString(state.lastRenderedState) as BridgeRenderState | null) ?? fallback.lastRenderedState,
        renderVersion: asNumber(state.renderVersion, 0),
        lastPolicySnapshot: state.lastPolicySnapshot ? normalizePolicySnapshot(state.lastPolicySnapshot) : null,
        lastStatus: state.lastStatus ? normalizeStatusResponse(state.lastStatus) : null,
        pollAttemptCount: asNumber(state.pollAttemptCount, 0),
        lastPolledAt: asNullableString(state.lastPolledAt),
        nextPollAt: asNullableString(state.nextPollAt),
        lastPollError: asNullableString(state.lastPollError),
        degradedReason: asNullableString(state.degradedReason),
        operatorWarning: asNullableString(state.operatorWarning),
        updatedAt: asString(state.updatedAt, fallback.updatedAt)
    }
}

export function updateTicketCreatorSnapshot(
    state: BridgeHandoffState,
    ticketCreatorDiscordUserId: string | null,
    updatedAt: string
): BridgeHandoffState {
    const normalized = asNullableString(ticketCreatorDiscordUserId)
    return {
        ...state,
        ticketCreatorDiscordUserId: normalized,
        creatorTransferDetected: normalized !== null && normalized != state.applicantDiscordUserId,
        updatedAt
    }
}

export function markBridgeRendered(
    state: BridgeHandoffState,
    controlMessageId: string,
    renderState: BridgeRenderState,
    updatedAt: string
): BridgeHandoffState {
    return {
        ...state,
        controlMessageId,
        lastRenderedState: renderState,
        renderVersion: state.renderVersion + 1,
        updatedAt
    }
}

export function markBridgeDegraded(
    state: BridgeHandoffState,
    reason: string,
    updatedAt: string
): BridgeHandoffState {
    return {
        ...state,
        degradedReason: asString(reason, "Bridge connectivity is degraded."),
        operatorWarning: state.operatorWarning,
        lastRenderedState: BRIDGE_RENDER_STATE_DEGRADED,
        lastPollError: asString(reason, "Bridge connectivity is degraded."),
        updatedAt
    }
}

export function clearBridgeDegraded(state: BridgeHandoffState, updatedAt: string): BridgeHandoffState {
    return {
        ...state,
        degradedReason: null,
        lastPollError: null,
        updatedAt
    }
}

function retainsOperatorWarning(status: string): boolean {
    return (
        status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY
        || status == BRIDGE_CASE_STATUS_ACCEPTED_FAILED
    )
}

export function beginBridgePolling(
    state: BridgeHandoffState,
    updatedAt: string,
    intervalMs: number = BRIDGE_POLL_INTERVAL_MS
): BridgeHandoffState {
    return {
        ...state,
        pollAttemptCount: 0,
        lastPolledAt: null,
        nextPollAt: addMilliseconds(updatedAt, intervalMs),
        lastPollError: null,
        updatedAt
    }
}

export function advanceBridgePolling(
    state: BridgeHandoffState,
    updatedAt: string,
    error: string | null,
    intervalMs: number = BRIDGE_POLL_INTERVAL_MS
): BridgeHandoffState {
    return {
        ...state,
        pollAttemptCount: state.pollAttemptCount + 1,
        lastPolledAt: updatedAt,
        nextPollAt: addMilliseconds(updatedAt, intervalMs),
        lastPollError: error,
        updatedAt
    }
}

export function stopBridgePolling(state: BridgeHandoffState, updatedAt: string): BridgeHandoffState {
    return {
        ...state,
        nextPollAt: null,
        lastPollError: null,
        updatedAt
    }
}

export function shouldPollBridgeState(
    state: BridgeHandoffState,
    now: string,
    maxAttempts: number = BRIDGE_MAX_POLL_ATTEMPTS
): boolean {
    if (!state.nextPollAt) return false
    if (state.pollAttemptCount >= maxAttempts) return false
    if (!state.degradedReason && state.lastStatus?.status != BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY) {
        return false
    }
    return Date.parse(now) >= Date.parse(state.nextPollAt)
}

export function applyBridgeStatus(
    state: BridgeHandoffState,
    status: BridgeStatusResponse,
    updatedAt: string
): BridgeHandoffState {
    const operatorWarning = retainsOperatorWarning(status.status)
        ? state.operatorWarning
        : null
    return {
        ...state,
        bridgeCaseId: status.bridge_case_id || state.bridgeCaseId,
        ticketRef: status.source_ticket_ref || state.ticketRef,
        transcriptUrl: status.ticket_log_link ?? state.transcriptUrl,
        transcriptStatus: status.transcript_ready
            ? BRIDGE_TRANSCRIPT_ATTACHED_STATUS
            : state.transcriptStatus,
        lastPolicySnapshot: status.policy,
        lastStatus: status,
        degradedReason: null,
        lastPollError: null,
        operatorWarning,
        updatedAt
    }
}

export function applyBridgeAction(
    state: BridgeHandoffState,
    action: BridgeActionResponse,
    updatedAt: string
): BridgeHandoffState {
    const operatorWarning = asNullableString(action.operator_warning)
    return applyBridgeStatus(
        {
            ...state,
            lastRenderedState: action.status as BridgeRenderState,
            operatorWarning: operatorWarning ?? state.operatorWarning
        },
        action,
        updatedAt
    )
}

export function prepareCaseCreatedEvent(
    ticket: BridgeTicketContext,
    completedForm: BridgeCompletedFormSnapshot | null,
    handoffDiscordUserId: string,
    targetGroupKey: string,
    formContract: BridgeFormContractData,
    acceptedRulesPasswords: readonly string[],
    existingState: BridgeHandoffState | null,
    options: {
        allowRefresh?: boolean
        creatorIdentityAliases?: readonly string[] | null
        transcriptUrl?: string | null
    } = {}
): BridgeCaseCreatedPreparation {
    if (existingState?.bridgeCaseId) {
        if (options.allowRefresh) {
            if (existingState.lastStatus?.status == BRIDGE_CASE_STATUS_RETRY_DENIED) {
                // continue and rebuild the review packet from the latest completed form snapshot
            } else {
                return {
                    status: "refresh-blocked",
                    state: existingState,
                    message: "You can resubmit the staff review packet only after staff returns the application with Retry."
                }
            }
        } else {
            return {
                status: "already-bridged",
                state: existingState
            }
        }
    }

    if (!completedForm) {
        return {
            status: "missing-form",
            message: "Complete the whitelist application before sending this ticket to staff review."
        }
    }

    const validation = validateCompletedFormForHandoff(
        completedForm,
        formContract,
        acceptedRulesPasswords,
        options.creatorIdentityAliases ?? null
    )
    if (!validation.ok) {
        return {
            status: "invalid-form",
            message: [
                "Before sending this application to staff review, fix these items:",
                ...validation.errors.map((error) => `- ${error}`)
            ].join("\n")
        }
    }

    try {
        return {
            status: "ready",
            mode: options.allowRefresh ? "refresh" : "initial",
            payload: buildCaseCreatedPayload(
                ticket,
                completedForm,
                handoffDiscordUserId,
                targetGroupKey,
                validation.alderonIds,
                options.transcriptUrl ?? null
            )
        }
    } catch (error) {
        return {
            status: "invalid-form",
            message: error instanceof Error ? error.message : "Unable to build the whitelist bridge payload."
        }
    }
}

export function finalizeCaseCreatedEvent(
    ticketChannelId: string,
    targetGroupKey: string,
    eventId: string,
    updatedAt: string,
    ack: { caseId: string; ticketRef: string; duplicate: boolean },
    applicantDiscordUserId: string,
    ticketCreatorDiscordUserId: string | null
): BridgeHandoffState {
    return createHandoffState(
        ticketChannelId,
        targetGroupKey,
        eventId,
        ack,
        updatedAt,
        applicantDiscordUserId,
        ticketCreatorDiscordUserId
    )
}

export function prepareTranscriptAttachedEvent(
    ticketChannelId: string,
    transcriptUrl: string | null,
    existingState: BridgeHandoffState | null
): BridgeTranscriptAttachPreparation {
    if (!existingState || !existingState.bridgeCaseId || existingState.bridgeCaseId.trim().length < 1) {
        return {
            status: "ignored",
            reason: "missing-state"
        }
    }

    if (!transcriptUrl || transcriptUrl.trim().length < 1) {
        return {
            status: "ignored",
            reason: "missing-transcript-url"
        }
    }

    if (existingState.transcriptUrl == transcriptUrl && existingState.transcriptStatus == BRIDGE_TRANSCRIPT_ATTACHED_STATUS) {
        return {
            status: "ignored",
            reason: "already-attached"
        }
    }

    return {
        status: "ready",
        payload: buildTranscriptAttachedPayload(ticketChannelId, transcriptUrl, BRIDGE_TRANSCRIPT_ATTACHED_STATUS)
    }
}

export function finalizeTranscriptAttachedEvent(
    existingState: BridgeHandoffState,
    eventId: string,
    transcriptUrl: string,
    updatedAt: string
): BridgeHandoffState {
    return applyTranscriptAttachment(existingState, eventId, transcriptUrl, BRIDGE_TRANSCRIPT_ATTACHED_STATUS, updatedAt)
}

export function shouldRecreateBridgeControlForPlacement(
    controlMessageCreatedTimestamp: number | null | undefined,
    applicantStartMessageCreatedTimestamp: number | null | undefined
): boolean {
    return typeof controlMessageCreatedTimestamp == "number"
        && Number.isFinite(controlMessageCreatedTimestamp)
        && typeof applicantStartMessageCreatedTimestamp == "number"
        && Number.isFinite(applicantStartMessageCreatedTimestamp)
        && controlMessageCreatedTimestamp < applicantStartMessageCreatedTimestamp
}

function formatPolicyLines(policy: BridgePolicySnapshot | null): string[] {
    if (!policy) return []
    const lines = [
        `Retry ladder: active ${policy.active_retry_denial_count}/${policy.max_retry_denials}, lifetime ${policy.lifetime_retry_denial_count}`,
        `Limit lockouts: ${policy.lifetime_limit_lockout_count}; duplicates: ${policy.duplicate_rejection_count}; accepts: ${policy.accept_count}; hard denies: ${policy.hard_deny_count}`
    ]
    if (policy.current_block_state != BRIDGE_BLOCK_STATE_NONE) {
        lines.push(
            policy.block_expires_at
                ? `Current block: ${describeBridgeBlockState(policy.current_block_state)} until ${policy.block_expires_at}`
                : `Current block: ${describeBridgeBlockState(policy.current_block_state)}`
        )
    }
    return lines
}

function humanizeBridgeToken(value: string | null | undefined): string {
    if (typeof value != "string" || value.trim().length < 1) return "Unknown"
    return value
        .trim()
        .split("_")
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ")
}

function describeBridgeCaseStatus(status: string): string {
    switch (status) {
        case BRIDGE_CASE_STATUS_PENDING_REVIEW:
            return "Waiting for staff review"
        case BRIDGE_CASE_STATUS_DUPLICATE_REJECTED:
            return "Closed as duplicate"
        case BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY:
            return "Accepted and applying now"
        case BRIDGE_CASE_STATUS_ACCEPTED_APPLIED:
            return "Whitelist applied"
        case BRIDGE_CASE_STATUS_ACCEPTED_FAILED:
            return "Apply failed"
        case BRIDGE_CASE_STATUS_RETRY_DENIED:
            return "Waiting on applicant corrections"
        case BRIDGE_CASE_STATUS_LIMIT_LOCKED:
            return "Review locked after repeated retries"
        case BRIDGE_CASE_STATUS_HARD_DENY_PENDING:
            return "Permanent denial pending"
        case BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED:
            return "Permanent denial needs repair"
        default:
            return humanizeBridgeToken(status)
    }
}

function describeBridgeBlockState(blockState: string): string {
    switch (blockState) {
        case BRIDGE_BLOCK_STATE_NONE:
            return "None"
        case BRIDGE_BLOCK_STATE_RETRY_COOLDOWN:
            return "Retry cooldown"
        case BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT:
            return "Limit lockout"
        case BRIDGE_BLOCK_STATE_HARD_DENY_PENDING:
            return "Permanent denial pending"
        case BRIDGE_BLOCK_STATE_HARD_DENY_REPAIR_REQUIRED:
            return "Permanent denial needs repair"
        case BRIDGE_BLOCK_STATE_HARD_DENY_MANUAL:
            return "Permanent denial"
        default:
            return humanizeBridgeToken(blockState)
    }
}

function describeApplyCloseoutState(applyCloseoutState: string): string {
    switch (applyCloseoutState) {
        case "ticket_open":
            return "Ticket stays open"
        case "close_ready":
            return "Ready to close the ticket"
        case "apply_failed":
            return "Apply failed"
        default:
            return humanizeBridgeToken(applyCloseoutState)
    }
}

function resolvePlayerVisibleSummary(status: BridgeStatusResponse): string | null {
    const summary = asNullableString(status.player_visible_apply_summary)
    return summary && summary.length > 0 ? summary : null
}

function isAcceptVisibleStatus(status: string): boolean {
    return status == BRIDGE_CASE_STATUS_PENDING_REVIEW || status == BRIDGE_CASE_STATUS_LIMIT_LOCKED
}

function isDuplicateResolutionStatus(status: string): boolean {
    return (
        status == BRIDGE_CASE_STATUS_PENDING_REVIEW
        || status == BRIDGE_CASE_STATUS_RETRY_DENIED
        || status == BRIDGE_CASE_STATUS_LIMIT_LOCKED
    )
}

function resolveTranscriptLifecycleState(
    state: BridgeHandoffState,
    status: BridgeStatusResponse
): {
    transcriptReady: boolean
    transcriptUrl: string | null
    legacyRepairRequired: boolean
    lifecycleLines: string[]
} {
    const transcriptUrl = status.ticket_log_link ?? state.transcriptUrl
    const transcriptReady = status.transcript_ready && typeof transcriptUrl == "string" && transcriptUrl.length > 0
    const legacyRepairRequired = !transcriptReady && !transcriptUrl && state.createdEventId !== null

    if (transcriptReady) {
        return {
            transcriptReady,
            transcriptUrl,
            legacyRepairRequired: false,
            lifecycleLines: [
                "Transcript: ready",
                `Transcript URL: ${transcriptUrl}`
            ]
        }
    }

    if (transcriptUrl) {
        return {
            transcriptReady: false,
            transcriptUrl,
            legacyRepairRequired: false,
            lifecycleLines: [
                "Transcript: fallback repair attached",
                `Transcript URL: ${transcriptUrl}`,
                "Transcript note: Use Refresh Status if this transcript was just repaired onto a legacy staged case."
            ]
        }
    }

    if (legacyRepairRequired) {
        return {
            transcriptReady: false,
            transcriptUrl: null,
            legacyRepairRequired: true,
            lifecycleLines: [
                "Transcript: blocked for legacy staged case",
                "Transcript note: This case was staged without a transcript URL before the pre-close transcript cutover. Run manual transcript repair or have the applicant retry resubmit."
            ]
        }
    }

    return {
        transcriptReady: false,
        transcriptUrl: null,
        legacyRepairRequired: false,
        lifecycleLines: [
            "Transcript: pending",
            "Transcript note: Use Refresh Status if transcript readiness has not synchronized yet."
        ]
    }
}

function resolveBridgeControlColor(renderState: BridgeRenderState): number {
    switch (renderState) {
        case BRIDGE_RENDER_STATE_DEGRADED:
            return 0xB91C1C
        case BRIDGE_CASE_STATUS_PENDING_REVIEW:
            return 0x2563EB
        case BRIDGE_CASE_STATUS_RETRY_DENIED:
            return 0xF59E0B
        case BRIDGE_CASE_STATUS_LIMIT_LOCKED:
            return 0xB45309
        case BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY:
            return 0x0284C7
        case BRIDGE_CASE_STATUS_ACCEPTED_APPLIED:
            return 0x15803D
        case BRIDGE_CASE_STATUS_ACCEPTED_FAILED:
            return 0xDC2626
        case BRIDGE_CASE_STATUS_HARD_DENY_PENDING:
        case BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED:
            return 0x991B1B
        case BRIDGE_CASE_STATUS_DUPLICATE_REJECTED:
            return 0x6B7280
        default:
            return 0x1D4ED8
    }
}

export function buildBridgeControlDescriptor(state: BridgeHandoffState): BridgeControlDescriptor {
    const lines: string[] = ["Whitelist Staff Review"]
    const buttons: BridgeControlDescriptor["buttons"] = []
    const status = state.lastStatus
    const renderState: BridgeRenderState = state.degradedReason
        ? BRIDGE_RENDER_STATE_DEGRADED
        : (status?.status as BridgeRenderState | undefined) ?? BRIDGE_RENDER_STATE_UNSTAGED

    if (state.bridgeCaseId) {
        lines.push(`Ticket ref: \`${state.ticketRef}\``)
        lines.push(`Case id: \`${state.bridgeCaseId}\``)
    }

    if (state.creatorTransferDetected) {
        lines.push(
            `Warning: applicant \`${state.applicantDiscordUserId}\` differs from current ticket owner \`${state.ticketCreatorDiscordUserId ?? "unknown"}\`. Attempt history stays pinned to the original applicant.`
        )
    } else {
        lines.push(`Applicant Discord id: \`${state.applicantDiscordUserId}\``)
    }

    if (state.degradedReason) {
        lines.push(`Bridge degraded: ${state.degradedReason}`)
        lines.push("Controls stay disabled until the bridge recovers.")
    }
    if (state.operatorWarning) {
        lines.push(`Staff warning: ${state.operatorWarning}`)
    }

    if (!status) {
        if (state.bridgeCaseId) {
            lines.push("Status sync is pending. Use Refresh Status to load the latest whitelist bridge state.")
            buttons.push({
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: state.degradedReason !== null
            })
        } else {
            lines.push("This card stays hidden until the applicant uses Submit for Review.")
        }
        return { renderState, lines, buttons }
    }

    lines.push(`Status: ${describeBridgeCaseStatus(status.status)}`)
    const transcriptLifecycle = resolveTranscriptLifecycleState(state, status)
    switch (status.status) {
        case BRIDGE_CASE_STATUS_PENDING_REVIEW:
            lines.push(
                transcriptLifecycle.transcriptReady
                    ? "The applicant has submitted the application. Transcript review is ready and Accept can proceed without deleting the ticket."
                    : transcriptLifecycle.legacyRepairRequired
                        ? "This staged case predates the pre-close transcript cutover. Accept stays blocked until a transcript URL is repaired onto the case or the applicant retry resubmits."
                        : "The applicant has submitted the application. Accept stays transcript-gated until the ticket log is attached."
            )
            break
        case BRIDGE_CASE_STATUS_RETRY_DENIED:
            lines.push("Retry stays unavailable until the applicant submits an updated review packet.")
            break
        case BRIDGE_CASE_STATUS_LIMIT_LOCKED:
            lines.push(
                transcriptLifecycle.transcriptReady
                    ? "Retry is closed after repeated denials. Accept remains available because the transcript is already ready."
                    : transcriptLifecycle.legacyRepairRequired
                        ? "Retry is closed after repeated denials. Accept stays blocked until this legacy staged case is repaired with a transcript URL or the applicant retry resubmits."
                        : "Retry is closed after repeated denials. Accept stays available once the transcript is attached."
            )
            break
        case BRIDGE_CASE_STATUS_ACCEPTED_FAILED:
            lines.push(
                resolvePlayerVisibleSummary(status)
                    ?? "Whitelist apply failed. Retry the apply after the downstream issue is repaired."
            )
            break
        case BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY:
            lines.push(
                resolvePlayerVisibleSummary(status)
                    ?? "Whitelist apply is still in progress. Use Refresh Status to confirm the final closeout state."
            )
            break
        case BRIDGE_CASE_STATUS_ACCEPTED_APPLIED:
            lines.push("Whitelist apply succeeded. Use Refresh Status if the ticket closeout has not caught up yet.")
            break
        case BRIDGE_CASE_STATUS_HARD_DENY_PENDING:
            lines.push("Permanent denial is pending downstream approval handling.")
            break
        case BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED:
            lines.push("Permanent denial needs repair before the final closeout can complete.")
            break
        case BRIDGE_CASE_STATUS_DUPLICATE_REJECTED:
            lines.push("This case was closed because the applicant already has an active whitelist.")
            break
        default:
            break
    }
    lines.push(...transcriptLifecycle.lifecycleLines)
    if (
        status.status != BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY
        && status.status != BRIDGE_CASE_STATUS_ACCEPTED_FAILED
    ) {
        const playerVisibleSummary = resolvePlayerVisibleSummary(status)
        if (playerVisibleSummary) {
            lines.push(`Applicant update: ${playerVisibleSummary}`)
        }
    }
    lines.push(`Ticket closeout: ${describeApplyCloseoutState(status.apply_closeout_state)}`)
    if (
        status.status == BRIDGE_CASE_STATUS_PENDING_REVIEW
        || status.status == BRIDGE_CASE_STATUS_LIMIT_LOCKED
        || status.status == BRIDGE_CASE_STATUS_ACCEPTED_FAILED
    ) {
        lines.push("Execution permissions: OT admin or bridge roles expose this card, but Accept and Retry Whitelist Apply require canonical Discord-side whitelist permissions.")
    }
    lines.push(...formatPolicyLines(state.lastPolicySnapshot ?? status.policy))
    if (status.duplicate_active_whitelist) {
        lines.push("Duplicate advisory: the applicant already has an active whitelist. Use Close as Duplicate to resolve this ticket.")
    }
    if (isAcceptVisibleStatus(status.status) && !status.duplicate_active_whitelist && status.action_availability.accept_disabled_reason) {
        lines.push(
            transcriptLifecycle.legacyRepairRequired
                ? "Accept status: This legacy staged case has no transcript URL. Run manual transcript repair or have the applicant retry resubmit before accepting."
                : `Accept status: ${status.action_availability.accept_disabled_reason}`
        )
    }
    if (status.action_availability.retry_warning) {
        lines.push(`Retry warning: ${status.action_availability.retry_warning}`)
    }
    if (status.reviewed_hard_deny_targets.length > 0) {
        lines.push(`Reviewed permanent denial targets: ${status.reviewed_hard_deny_targets.join(", ")}`)
    }

    const disableAll = state.degradedReason !== null
    if (status.duplicate_active_whitelist && isDuplicateResolutionStatus(status.status)) {
        buttons.push(
            {
                action: BRIDGE_ACTION_DUPLICATE,
                label: "Close as Duplicate",
                style: "primary",
                disabled: disableAll || !status.action_availability.duplicate
            },
            {
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: disableAll || !status.action_availability.refresh_status
            }
        )
    } else if (status.status == BRIDGE_CASE_STATUS_PENDING_REVIEW) {
        buttons.push(
            {
                action: BRIDGE_ACTION_ACCEPT,
                label: "Accept",
                style: "success",
                disabled: disableAll || !status.action_availability.accept
            },
            {
                action: BRIDGE_ACTION_RETRY,
                label: "Retry",
                style: "primary",
                disabled: disableAll || !status.action_availability.retry
            },
            {
                action: "hard_deny_review",
                label: "Permanent Denial",
                style: "danger",
                disabled: disableAll || !status.action_availability.hard_deny
            },
            {
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: disableAll || !status.action_availability.refresh_status
            }
        )
    } else if (status.status == BRIDGE_CASE_STATUS_RETRY_DENIED) {
        buttons.push(
            {
                action: "hard_deny_review",
                label: "Permanent Denial",
                style: "danger",
                disabled: disableAll || !status.action_availability.hard_deny
            },
            {
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: disableAll || !status.action_availability.refresh_status
            }
        )
    } else if (status.status == BRIDGE_CASE_STATUS_LIMIT_LOCKED) {
        buttons.push(
            {
                action: BRIDGE_ACTION_ACCEPT,
                label: "Accept",
                style: "success",
                disabled: disableAll || !status.action_availability.accept
            },
            {
                action: "hard_deny_review",
                label: "Permanent Denial",
                style: "danger",
                disabled: disableAll || !status.action_availability.hard_deny
            },
            {
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: disableAll || !status.action_availability.refresh_status
            }
        )
    } else if (status.status == BRIDGE_CASE_STATUS_ACCEPTED_FAILED) {
        buttons.push(
            {
                action: BRIDGE_ACTION_RETRY_APPLY,
                label: "Retry Whitelist Apply",
                style: "primary",
                disabled: disableAll || !status.action_availability.retry_apply
            },
            {
                action: BRIDGE_ACTION_REFRESH_STATUS,
                label: "Refresh Status",
                style: "secondary",
                disabled: disableAll || !status.action_availability.refresh_status
            }
        )
    } else if (
        status.status == BRIDGE_CASE_STATUS_ACCEPTED_PENDING_APPLY
        || status.status == BRIDGE_CASE_STATUS_ACCEPTED_APPLIED
        || status.status == BRIDGE_CASE_STATUS_HARD_DENY_PENDING
        || status.status == BRIDGE_CASE_STATUS_HARD_DENY_REPAIR_REQUIRED
        || status.status == BRIDGE_CASE_STATUS_DUPLICATE_REJECTED
    ) {
        buttons.push({
            action: BRIDGE_ACTION_REFRESH_STATUS,
            label: "Refresh Status",
            style: "secondary",
            disabled: disableAll || !status.action_availability.refresh_status
        })
    } else {
        buttons.push({
            action: BRIDGE_ACTION_REFRESH_STATUS,
            label: "Refresh Status",
            style: "secondary",
            disabled: disableAll || !status.action_availability.refresh_status
        })
    }

    return { renderState, lines, buttons }
}

export function buildBridgeControlEmbedPresentation(state: BridgeHandoffState): BridgeControlEmbedPresentation {
    const descriptor = buildBridgeControlDescriptor(state)
    const descriptionLines: string[] = []
    const caseLines: string[] = []
    const applicantLines: string[] = []
    const lifecycleLines: string[] = []
    const policyLines: string[] = []
    const permanentDenyLines: string[] = []

    for (const line of descriptor.lines.slice(1)) {
        if (line.startsWith("Ticket ref:") || line.startsWith("Case id:")) {
            caseLines.push(line)
        } else if (line.startsWith("Applicant Discord id:") || line.startsWith("Warning: applicant ")) {
            applicantLines.push(line)
        } else if (
            line.startsWith("Status:")
            || line.startsWith("Transcript:")
            || line.startsWith("Transcript URL:")
            || line.startsWith("Transcript note:")
            || line.startsWith("Applicant update:")
            || line.startsWith("Ticket closeout:")
        ) {
            lifecycleLines.push(line)
        } else if (
            line.startsWith("Retry ladder:")
            || line.startsWith("Limit lockouts:")
            || line.startsWith("Current block:")
        ) {
            policyLines.push(line)
        } else if (line.startsWith("Reviewed permanent denial targets:")) {
            permanentDenyLines.push(line.replace("Reviewed permanent denial targets: ", ""))
        } else {
            descriptionLines.push(line)
        }
    }

    const fields: BridgeControlEmbedPresentation["fields"] = []
    if (caseLines.length > 0) {
        fields.push({ name: "Case", value: caseLines.join("\n"), inline: false })
    }
    if (applicantLines.length > 0) {
        fields.push({ name: "Applicant", value: applicantLines.join("\n"), inline: false })
    }
    if (lifecycleLines.length > 0) {
        fields.push({ name: "Lifecycle", value: lifecycleLines.join("\n"), inline: false })
    }
    if (policyLines.length > 0) {
        fields.push({ name: "Policy", value: policyLines.join("\n"), inline: false })
    }
    if (permanentDenyLines.length > 0) {
        fields.push({ name: "Permanent Denial Review", value: permanentDenyLines.join("\n"), inline: false })
    }

    return {
        title: descriptor.lines[0] ?? "Whitelist Staff Review",
        description: descriptionLines.join("\n") || "Use Refresh Status to load the latest whitelist bridge state.",
        color: resolveBridgeControlColor(descriptor.renderState),
        fields
    }
}

export function describeEligibilityBlock(response: BridgeEligibilityResponse): string {
    const until = response.block_expires_at ? ` until ${response.block_expires_at}` : ""
    switch (response.current_block_state) {
        case BRIDGE_BLOCK_STATE_RETRY_COOLDOWN:
            return `You cannot open another whitelist ticket during the retry cooldown${until}.`
        case BRIDGE_BLOCK_STATE_LIMIT_LOCKOUT:
            return `You cannot open another whitelist ticket during the limit lockout${until}.`
        case BRIDGE_BLOCK_STATE_HARD_DENY_PENDING:
        case BRIDGE_BLOCK_STATE_HARD_DENY_REPAIR_REQUIRED:
        case BRIDGE_BLOCK_STATE_HARD_DENY_MANUAL:
            return `You cannot open another whitelist ticket while a permanent whitelist block is active${until}.`
        default:
            return "You cannot open another whitelist ticket right now."
    }
}

export function evaluateCreateTicketDecision(
    optionId: string,
    eligibleOptionIds: readonly string[],
    applicantDiscordUserId: string,
    openTickets: readonly BridgeOpenTicketSnapshot[],
    eligibility: BridgeEligibilityResponse | null,
    degradedReason: string | null
): BridgeCreateTicketDecision {
    if (!eligibleOptionIds.includes(optionId)) {
        return { allow: true, reason: null, failOpen: false }
    }
    const normalizedApplicantDiscordUserId = asString(applicantDiscordUserId)
    const liveWhitelistTicket = openTickets.find((ticket) => {
        if (ticket.closed) return false
        if (!eligibleOptionIds.includes(ticket.optionId)) return false
        return asString(ticket.creatorDiscordUserId) == normalizedApplicantDiscordUserId
    })
    if (liveWhitelistTicket) {
        return {
            allow: false,
            reason: "You already have an open whitelist ticket. Use the existing ticket instead of creating another one.",
            failOpen: false
        }
    }
    if (degradedReason) {
        return { allow: true, reason: null, failOpen: true }
    }
    if (!eligibility || eligibility.eligible) {
        return { allow: true, reason: null, failOpen: false }
    }
    if (eligibility.current_block_state == BRIDGE_BLOCK_STATE_NONE) {
        return { allow: true, reason: null, failOpen: false }
    }
    return {
        allow: false,
        reason: describeEligibilityBlock(eligibility),
        failOpen: false
    }
}

export function findMisconfiguredEligibleOptionIds(
    optionSnapshots: readonly BridgeOptionLimitSnapshot[]
): string[] {
    return optionSnapshots
        .filter((snapshot) => !snapshot.limitsEnabled || snapshot.userMaximum != 1)
        .map((snapshot) => snapshot.optionId)
}
