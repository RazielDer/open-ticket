import { buildConfigItems } from "./control-center"
import type { DashboardAppContext } from "./create-app"
import { joinBasePath } from "./dashboard-config"
import { buildQualityReviewQueueHref } from "./quality-review"
import { evaluateSetupState, type SetupNextStep, type SetupState, type SetupStatusItem } from "./setup-state"
import type { DashboardQualityReviewNotificationStatus, DashboardQualityReviewQueueSummary, DashboardTicketQueueSummary } from "./ticket-workbench-types"
import type { DashboardTranscriptIntegration } from "./transcript-service-bridge"

const WORKSPACE_FIRST_SETUP_IDS = new Set(["general", "options", "panels", "questions"])

function toneForState(state: SetupState) {
  switch (state) {
    case "needs_setup":
      return "danger"
    case "needs_attention":
      return "warning"
    case "optional":
      return "muted"
    default:
      return "success"
  }
}

function stateLabelKey(state: SetupState) {
  switch (state) {
    case "needs_setup":
      return "setup.states.needsSetup"
    case "needs_attention":
      return "setup.states.needsAttention"
    case "optional":
      return "setup.states.optional"
    default:
      return "setup.states.ready"
  }
}

function areaReasonKey(id: string, reason: string) {
  return `setup.areas.${id}.reasons.${reason}`
}

function countSetupStates(items: SetupStatusItem[]) {
  return items.reduce(
    (accumulator, item) => {
      if (item.state === "needs_setup") accumulator.needsSetup += 1
      else if (item.state === "needs_attention") accumulator.needsAttention += 1
      else if (item.state === "optional") accumulator.optional += 1
      else accumulator.ready += 1
      return accumulator
    },
    { ready: 0, needsSetup: 0, needsAttention: 0, optional: 0 }
  )
}

function buildSetupCard(context: DashboardAppContext, item: SetupStatusItem, configItem: ReturnType<typeof buildConfigItems>[number]) {
  const workspaceFirst = WORKSPACE_FIRST_SETUP_IDS.has(item.id)

  return {
    id: item.id,
    fileName: configItem.fileName,
    controlHref: configItem.controlHref,
    visualHref: configItem.visualHref,
    rawHref: configItem.rawHref,
    primaryHref: workspaceFirst ? configItem.visualHref : configItem.controlHref,
    secondaryHref: workspaceFirst ? configItem.rawHref : configItem.visualHref,
    secondaryActionLabel: workspaceFirst ? context.i18n.t("common.rawEditor") : context.i18n.t("common.visualEditor"),
    searchText: configItem.searchText,
    state: item.state,
    stateTone: toneForState(item.state),
    stateLabel: context.i18n.t(stateLabelKey(item.state)),
    metaLabel: configItem.fileName,
    title: context.i18n.t(`setup.areas.${item.id}.label`),
    whatControls: context.i18n.t(`setup.areas.${item.id}.what`),
    guidance: item.state === "ready"
      ? context.i18n.t(areaReasonKey(item.id, item.reason))
      : context.i18n.t(`setup.areas.${item.id}.tasks`),
    whyNow: context.i18n.t(areaReasonKey(item.id, item.reason)),
    nextTask: context.i18n.t(`setup.areas.${item.id}.tasks`),
    primaryActionLabel: context.i18n.t(`setup.areas.${item.id}.primaryAction`)
  }
}

function buildRecommendedAction(context: DashboardAppContext, nextStep: SetupNextStep) {
  const baseKey = `home.nextStep.${nextStep.id}`
  const tone = nextStep.id === "operations"
    ? "success"
    : nextStep.id === "questions"
      ? "muted"
      : nextStep.id === "transcripts"
        ? "warning"
        : "danger"

  return {
    id: nextStep.id,
    tone,
    metaLabel: nextStep.id === "operations"
      ? context.i18n.t("home.title")
      : context.i18n.t(`setup.areas.${nextStep.id}.label`),
    title: context.i18n.t(`${baseKey}.title`),
    whyNow: context.i18n.t(`${baseKey}.reasons.${nextStep.reason}`),
    actionLabel: context.i18n.t(`${baseKey}.actionLabel`),
    href: nextStep.id === "operations"
      ? joinBasePath(context.basePath, "admin/transcripts")
      : WORKSPACE_FIRST_SETUP_IDS.has(nextStep.id)
        ? joinBasePath(context.basePath, `visual/${nextStep.id}`)
        : nextStep.id === "transcripts"
          ? joinBasePath(context.basePath, "admin/transcripts")
          : joinBasePath(context.basePath, `admin/configs/${nextStep.id}`)
  }
}

export function buildTranscriptIntegrationWarning(
  context: DashboardAppContext,
  integration: DashboardTranscriptIntegration
) {
  if (!integration.htmlMode || integration.state === "ready") {
    return null
  }

  return {
    tone: "warning",
    message: context.i18n.t("transcripts.htmlModeWarning", {
      reason: integration.message
    })
  }
}

function buildQualityReviewHomeLinks(basePath: string) {
  return {
    active: buildQualityReviewQueueHref(basePath),
    mine: buildQualityReviewQueueHref(basePath, { ownerId: "me" }),
    unassigned: buildQualityReviewQueueHref(basePath, { ownerId: "unassigned" }),
    overdue: buildQualityReviewQueueHref(basePath, { attention: "overdue" })
  }
}

function buildTicketQueueHomeLinks(basePath: string) {
  const ticketsHref = joinBasePath(basePath, "admin/tickets")
  return {
    active: ticketsHref,
    firstResponse: `${ticketsHref}?attention=first-response`,
    unassigned: `${ticketsHref}?attention=unassigned`,
    staleOwner: `${ticketsHref}?attention=stale-owner`,
    closeRequest: `${ticketsHref}?attention=close-request`,
    awaitingUser: `${ticketsHref}?attention=awaiting-user`
  }
}

function formatNotificationDate(value: number | null | undefined, fallback: string) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`
    : fallback
}

export function buildHomeTicketQueueBlock(
  context: DashboardAppContext,
  summary: DashboardTicketQueueSummary | null
) {
  if (!summary) return null
  return {
    title: context.i18n.t("home.ticketQueue.title"),
    summary,
    summaryCard: {
      label: context.i18n.t("home.summary.ticketQueue"),
      value: String(summary.activeCount),
      detail: context.i18n.t("home.summary.ticketQueueDetail", {
        firstResponse: summary.firstResponseOverdueCount,
        unassigned: summary.unassignedCount,
        staleOwner: summary.staleOwnerCount,
        closeRequest: summary.closeRequestCount,
        awaitingUser: summary.awaitingUserCount
      }),
      tone: summary.firstResponseOverdueCount > 0 || summary.unassignedCount > 0 || summary.staleOwnerCount > 0 || summary.closeRequestCount > 0 ? "warning" as const : "muted" as const
    },
    links: buildTicketQueueHomeLinks(context.basePath),
    unavailable: Boolean(summary.unavailableReason),
    zeroState: summary.activeCount === 0
      && summary.firstResponseOverdueCount === 0
      && summary.unassignedCount === 0
      && summary.staleOwnerCount === 0
      && summary.closeRequestCount === 0
      && summary.awaitingUserCount === 0
  }
}

export function buildHomeQualityReviewBlock(
  context: DashboardAppContext,
  summary: DashboardQualityReviewQueueSummary | null,
  notificationStatus: DashboardQualityReviewNotificationStatus | null = null
) {
  if (!summary) return null
  const notificationUnavailable = notificationStatus?.unavailableReason || null
  const notificationFacts = notificationStatus
    ? [
        {
          label: context.i18n.t("home.qualityReview.lastDigest"),
          value: formatNotificationDate(notificationStatus.lastDigestAt, context.i18n.t("home.qualityReview.notDelivered"))
        },
        {
          label: context.i18n.t("home.qualityReview.remindersSentToday"),
          value: String(notificationStatus.remindersSentToday)
        }
      ]
    : []
  return {
    title: context.i18n.t("home.qualityReview.title"),
    summary,
    summaryCard: {
      label: context.i18n.t("home.summary.qualityReview"),
      value: String(summary.overdueCount),
      detail: context.i18n.t("home.summary.qualityReviewDetail", {
        active: summary.activeCount,
        unassigned: summary.unassignedCount
      }),
      tone: summary.overdueCount > 0 || summary.unassignedCount > 0 ? "warning" as const : "muted" as const
    },
    notificationStatus,
    notificationFacts,
    notificationStatusCopy: notificationUnavailable,
    links: buildQualityReviewHomeLinks(context.basePath),
    unavailable: Boolean(summary.unavailableReason),
    zeroState: summary.activeCount === 0 && summary.unassignedCount === 0 && summary.overdueCount === 0
  }
}

export function buildHomeWorkspaceModel(
  context: DashboardAppContext,
  transcriptIntegration: DashboardTranscriptIntegration,
  modelOptions: {
    ticketQueue?: ReturnType<typeof buildHomeTicketQueueBlock>
    qualityReview?: ReturnType<typeof buildHomeQualityReviewBlock>
  } = {}
) {
  const general = context.configService.readManagedJson<Record<string, unknown>>("general")
  const options = context.configService.readManagedJson<Record<string, unknown>[]>("options")
  const panels = context.configService.readManagedJson<Record<string, unknown>[]>("panels")
  const questions = context.configService.readManagedJson<Record<string, unknown>[]>("questions")
  const transcripts = context.configService.readManagedJson<Record<string, unknown>>("transcripts")
  const setup = evaluateSetupState({ general, options, panels, questions, transcripts }, transcriptIntegration)
  const configItems = buildConfigItems(context)
  const setupCards = setup.items.map((item) => {
    const configItem = configItems.find((entry) => entry.id === item.id)
    if (!configItem) {
      throw new Error(`Missing config item for ${item.id}`)
    }
    return buildSetupCard(context, item, configItem)
  })
  const setupCounts = countSetupStates(setup.items)

  return {
    setup,
    setupCounts,
    setupCards,
    recommendedAction: buildRecommendedAction(context, setup.nextStep),
    ticketQueue: modelOptions.ticketQueue || null,
    qualityReview: modelOptions.qualityReview || null
  }
}

export function buildAdvancedWorkspaceModel(context: DashboardAppContext) {
  const configItems = buildConfigItems(context)
  return {
    sections: {
      security: {
        title: context.i18n.t("advanced.sections.security.title"),
        description: context.i18n.t("advanced.sections.security.description"),
        links: [
          {
            label: context.i18n.t("advanced.sections.security.links.workspace"),
            href: joinBasePath(context.basePath, "admin/security")
          },
          {
            label: context.i18n.t("advanced.sections.security.links.evidence"),
            href: joinBasePath(context.basePath, "admin/evidence")
          }
        ]
      },
      systemStatus: {
        title: context.i18n.t("advanced.sections.systemStatus.title"),
        description: context.i18n.t("advanced.sections.systemStatus.description"),
        links: [
          {
            label: context.i18n.t("advanced.sections.systemStatus.links.runtime"),
            href: joinBasePath(context.basePath, "admin/runtime")
          },
          {
            label: context.i18n.t("advanced.sections.systemStatus.links.transcripts"),
            href: joinBasePath(context.basePath, "admin/transcripts")
          }
        ]
      },
      backups: {
        title: context.i18n.t("advanced.sections.backups.title"),
        description: context.i18n.t("advanced.sections.backups.description"),
        links: [
          {
            label: context.i18n.t("advanced.sections.backups.links.inventory"),
            href: joinBasePath(context.basePath, "admin/evidence")
          },
          {
            label: context.i18n.t("advanced.sections.backups.links.setup"),
            href: joinBasePath(context.basePath, "admin")
          }
        ]
      },
      editors: {
        title: context.i18n.t("advanced.sections.editors.title"),
        description: context.i18n.t("advanced.sections.editors.description"),
        items: configItems.map((item) => ({
          id: item.id,
          title: context.i18n.t(item.titleKey),
          description: context.i18n.t(`advanced.sections.editors.items.${item.id}`),
          href: item.rawHref
        }))
      },
      plugins: {
        title: context.i18n.t("advanced.sections.plugins.title"),
        description: context.i18n.t("advanced.sections.plugins.description"),
        links: [
          {
            label: context.i18n.t("advanced.sections.plugins.links.inventory"),
            href: joinBasePath(context.basePath, "admin/plugins")
          },
          {
            label: context.i18n.t("advanced.sections.plugins.links.transcriptWorkbench"),
            href: joinBasePath(context.basePath, "admin/plugins/ot-html-transcripts")
          }
        ]
      },
      diagnostics: {
        title: context.i18n.t("advanced.sections.diagnostics.title"),
        description: context.i18n.t("advanced.sections.diagnostics.description"),
        links: [
          {
            label: context.i18n.t("advanced.sections.diagnostics.links.health"),
            href: joinBasePath(context.basePath, "health"),
            target: "_blank",
            rel: "noopener"
          },
          {
            label: context.i18n.t("advanced.sections.diagnostics.links.systemStatus"),
            href: joinBasePath(context.basePath, "admin/runtime")
          },
          {
            label: context.i18n.t("advanced.sections.diagnostics.links.backups"),
            href: joinBasePath(context.basePath, "admin/evidence")
          }
        ]
      }
    }
  }
}
