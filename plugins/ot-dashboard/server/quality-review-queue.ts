import type {
  DashboardQualityReviewCaseSummary,
  DashboardQualityReviewOwnerBucket,
  DashboardQualityReviewOverdueKind,
  DashboardQualityReviewQueueSummary
} from "./ticket-workbench-types"

export type DashboardQualityReviewQueueFields = Pick<
  DashboardQualityReviewCaseSummary,
  "ownerBucket" | "queueAnchorAt" | "overdue" | "overdueKind" | "overdueSince"
>
export type DashboardQualityReviewQueueProjectableCase =
  Omit<DashboardQualityReviewCaseSummary, keyof DashboardQualityReviewQueueFields>
  & Partial<DashboardQualityReviewQueueFields>

const HOUR_MS = 60 * 60 * 1000
export const QUALITY_REVIEW_UNREVIEWED_OVERDUE_MS = 72 * HOUR_MS
export const QUALITY_REVIEW_IN_REVIEW_OVERDUE_MS = 168 * HOUR_MS

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function activeQueueState(state: DashboardQualityReviewCaseSummary["state"]) {
  return state === "unreviewed" || state === "in_review"
}

function ownerBucketForCase(
  reviewCase: Pick<DashboardQualityReviewCaseSummary, "state" | "ownerUserId">,
  actorUserId: string
): DashboardQualityReviewOwnerBucket {
  if (!activeQueueState(reviewCase.state)) return "resolved"
  if (!reviewCase.ownerUserId) return "unassigned"
  return reviewCase.ownerUserId === actorUserId ? "mine" : "other"
}

function queueAnchorForCase(
  reviewCase: Pick<DashboardQualityReviewCaseSummary, "state" | "lastSignalAt" | "updatedAt">
) {
  if (reviewCase.state === "unreviewed") return reviewCase.lastSignalAt
  if (reviewCase.state === "in_review") return reviewCase.updatedAt
  return null
}

function overdueThresholdForState(
  state: DashboardQualityReviewCaseSummary["state"]
): { kind: Exclude<DashboardQualityReviewOverdueKind, null>; thresholdMs: number } | null {
  if (state === "unreviewed") {
    return { kind: "unreviewed", thresholdMs: QUALITY_REVIEW_UNREVIEWED_OVERDUE_MS }
  }
  if (state === "in_review") {
    return { kind: "in_review", thresholdMs: QUALITY_REVIEW_IN_REVIEW_OVERDUE_MS }
  }
  return null
}

export function projectQualityReviewQueueFields<T extends DashboardQualityReviewQueueProjectableCase>(
  reviewCase: T,
  input: { actorUserId?: string | null; now?: number } = {}
): T & DashboardQualityReviewQueueFields {
  const actorUserId = normalizeString(input.actorUserId)
  const now = typeof input.now === "number" && Number.isFinite(input.now) ? input.now : Date.now()
  const ownerBucket = ownerBucketForCase(reviewCase, actorUserId)
  const queueAnchorAt = queueAnchorForCase(reviewCase)
  const threshold = overdueThresholdForState(reviewCase.state)
  const overdueSince = threshold && typeof queueAnchorAt === "number" && Number.isFinite(queueAnchorAt)
    ? queueAnchorAt + threshold.thresholdMs
    : null
  const overdue = overdueSince !== null && now >= overdueSince

  return {
    ...reviewCase,
    ownerBucket,
    queueAnchorAt,
    overdue,
    overdueKind: overdue && threshold ? threshold.kind : null,
    overdueSince: overdue ? overdueSince : null
  }
}

export function buildQualityReviewQueueSummary(
  cases: DashboardQualityReviewQueueProjectableCase[],
  input: { actorUserId?: string | null; now?: number; unavailableReason?: string | null } = {}
): DashboardQualityReviewQueueSummary {
  const projected = cases.map((reviewCase) => projectQualityReviewQueueFields(reviewCase, input))
  const active = projected.filter((reviewCase) => activeQueueState(reviewCase.state))
  return {
    activeCount: active.length,
    myQueueCount: active.filter((reviewCase) => reviewCase.ownerBucket === "mine").length,
    unassignedCount: active.filter((reviewCase) => reviewCase.ownerBucket === "unassigned").length,
    overdueCount: active.filter((reviewCase) => reviewCase.overdue).length,
    overdueUnreviewedCount: active.filter((reviewCase) => reviewCase.overdueKind === "unreviewed").length,
    overdueInReviewCount: active.filter((reviewCase) => reviewCase.overdueKind === "in_review").length,
    unavailableReason: normalizeString(input.unavailableReason) || null
  }
}
