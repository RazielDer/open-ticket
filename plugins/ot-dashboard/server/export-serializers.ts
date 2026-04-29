import path from "node:path"

import type {
  DashboardAnalyticsBacklogRow,
  DashboardAnalyticsFeedbackOutcomeRow,
  DashboardAnalyticsMetricCell,
  DashboardAnalyticsModel,
  DashboardAnalyticsRatingRow,
  DashboardAnalyticsReopenRateRow,
  DashboardAnalyticsTableRow
} from "./analytics"
import type { TicketWorkbenchDetailModel, TicketWorkbenchListModel } from "./ticket-workbench"
import type { DashboardTicketDetailExportPayload } from "./ticket-workbench-types"

export type DashboardExportFormat = "json" | "csv"

export interface DashboardExportPayload {
  fileName: string
  contentType: string
  body: Buffer | string
}

interface CsvColumn<T> {
  header: string
  value: (row: T) => unknown
}

interface AnalyticsExportSection {
  key: string
  label: string
  fileName: string
  available: boolean
  warning: string | null
  headers: string[]
  rows: Array<Record<string, unknown>>
  csv: string
}

const ANALYTICS_JSON_FILE = "ticket-analytics-report.json"
const ANALYTICS_ZIP_FILE = "ticket-analytics-report.zip"
const TICKETS_JSON_FILE = "ticket-workbench-page.json"
const TICKETS_CSV_FILE = "ticket-workbench-page.csv"
const TICKETS_FULL_JSON_FILE = "ticket-workbench-full.json"
const TICKETS_FULL_CSV_FILE = "ticket-workbench-full.csv"
const TICKET_DETAIL_JSON_FILE = "ticket-detail.json"

export function parseDashboardExportFormat(value: unknown): DashboardExportFormat | null {
  return value === "json" || value === "csv" ? value : null
}

function generatedIso(value?: Date | number | string) {
  const date = value == null ? new Date() : value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString()
}

function neutralizeCsvFormula(text: string) {
  return /^[=+\-@]/.test(text) ? `'${text}` : text
}

function csvCell(value: unknown) {
  if (value == null) return ""
  const text = neutralizeCsvFormula(String(value))
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildDashboardCsv<T>(headers: string[], rows: T[], columns: CsvColumn<T>[]) {
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(column.value(row))).join(","))
  ]
  return `${lines.join("\r\n")}\r\n`
}

function metricWarning(cell: DashboardAnalyticsMetricCell) {
  return cell.available && !cell.lowSample ? null : cell.detail
}

function combinedWarning(...warnings: Array<string | null | undefined>) {
  const values = warnings
    .map((warning) => String(warning || "").trim())
    .filter(Boolean)
    .filter((warning, index, all) => all.indexOf(warning) === index)
  return values.length > 0 ? values.join("; ") : null
}

function unavailableWarning(warnings: string[], fallback: string) {
  return warnings.find((warning) => warning.trim().length > 0) || fallback
}

function analyticsWarnings(model: DashboardAnalyticsModel) {
  return [...model.historyWarnings, ...model.telemetryWarnings]
}

function analyticsUnavailableSections(model: DashboardAnalyticsModel) {
  const sections: Array<{ key: string; label: string; warning: string }> = []
  const historyWarning = unavailableWarning(model.historyWarnings, "Transcript analytics history is unavailable.")
  const telemetryWarning = unavailableWarning(model.telemetryWarnings, "Ticket telemetry is unavailable.")
  if (model.historyState !== "available") {
    sections.push(
      { key: "cohortPerformanceByTeam", label: "Opened-ticket cohort by team", warning: historyWarning },
      { key: "cohortPerformanceByTransport", label: "Opened-ticket cohort by transport", warning: historyWarning }
    )
  }
  if (model.telemetryState !== "available") {
    sections.push(
      { key: "feedbackOutcomesByTeam", label: "Feedback outcomes by team", warning: telemetryWarning },
      { key: "feedbackOutcomesByTransport", label: "Feedback outcomes by transport", warning: telemetryWarning },
      { key: "ratingMetrics", label: "Rating question summaries", warning: telemetryWarning },
      { key: "reopenRateByTeam", label: "Reopen rate by team", warning: telemetryWarning },
      { key: "reopenRateByTransport", label: "Reopen rate by transport", warning: telemetryWarning },
      { key: "reopenedBacklogByTeam", label: "Reopened backlog by team", warning: telemetryWarning },
      { key: "reopenedBacklogByTransport", label: "Reopened backlog by transport", warning: telemetryWarning }
    )
  }
  return sections
}

function unavailableSectionMap(model: DashboardAnalyticsModel) {
  return new Map(analyticsUnavailableSections(model).map((section) => [section.key, section]))
}

function analyticsFilters(model: DashboardAnalyticsModel) {
  return {
    window: model.request.window,
    from: model.request.from,
    to: model.request.to,
    transport: model.request.transport,
    teamId: model.request.teamId || null,
    assigneeId: model.request.assigneeId || null
  }
}

function section<T>(
  key: string,
  label: string,
  fileName: string,
  rows: T[],
  columns: CsvColumn<T>[],
  mapRow: (row: T) => Record<string, unknown>,
  unavailableSections: Map<string, { warning: string }>
): AnalyticsExportSection {
  const unavailable = unavailableSections.get(key)
  const headers = columns.map((column) => column.header)
  return {
    key,
    label,
    fileName,
    available: !unavailable,
    warning: unavailable?.warning || null,
    headers,
    rows: unavailable ? [] : rows.map(mapRow),
    csv: unavailable ? buildDashboardCsv(headers, [], columns) : buildDashboardCsv(headers, rows, columns)
  }
}

function teamId(value: string) {
  return value === "unknown" ? "" : value
}

function assigneeUserId(value: string) {
  return value === "unknown" ? "" : value
}

function teamBacklogSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsBacklogRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsBacklogRow>[] = [
    { header: "teamId", value: (row) => teamId(row.key) },
    { header: "teamLabel", value: (row) => row.label },
    { header: "openCount", value: (row) => row.count }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    teamId: teamId(row.key),
    teamLabel: row.label,
    openCount: row.count
  }), unavailableSections)
}

function assigneeBacklogSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsBacklogRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsBacklogRow>[] = [
    { header: "assigneeUserId", value: (row) => assigneeUserId(row.key) },
    { header: "assigneeLabel", value: (row) => row.label },
    { header: "openCount", value: (row) => row.count }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    assigneeUserId: assigneeUserId(row.key),
    assigneeLabel: row.label,
    openCount: row.count
  }), unavailableSections)
}

function transportBacklogSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsBacklogRow[],
  countHeader: "openCount" | "openReopenedCount",
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsBacklogRow>[] = [
    { header: "transportMode", value: (row) => row.key || "unknown" },
    { header: countHeader, value: (row) => row.count }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    transportMode: row.key || "unknown",
    [countHeader]: row.count
  }), unavailableSections)
}

function reopenedTeamBacklogSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsBacklogRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsBacklogRow>[] = [
    { header: "teamId", value: (row) => teamId(row.key) },
    { header: "teamLabel", value: (row) => row.label },
    { header: "openReopenedCount", value: (row) => row.count }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    teamId: teamId(row.key),
    teamLabel: row.label,
    openReopenedCount: row.count
  }), unavailableSections)
}

function cohortWarning(row: DashboardAnalyticsTableRow) {
  return combinedWarning(
    metricWarning(row.firstResponse),
    metricWarning(row.firstResponseP95),
    metricWarning(row.resolution),
    metricWarning(row.resolutionP95)
  )
}

function teamCohortSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsTableRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsTableRow>[] = [
    { header: "teamId", value: (row) => teamId(row.key) },
    { header: "teamLabel", value: (row) => row.label },
    { header: "openedCount", value: (row) => row.count },
    { header: "medianFirstResponseMs", value: (row) => row.medianFirstResponseMs },
    { header: "p95FirstResponseMs", value: (row) => row.p95FirstResponseMs },
    { header: "medianResolutionMs", value: (row) => row.medianResolutionMs },
    { header: "p95ResolutionMs", value: (row) => row.p95ResolutionMs },
    { header: "warning", value: cohortWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    teamId: teamId(row.key),
    teamLabel: row.label,
    openedCount: row.count,
    medianFirstResponseMs: row.medianFirstResponseMs,
    p95FirstResponseMs: row.p95FirstResponseMs,
    medianResolutionMs: row.medianResolutionMs,
    p95ResolutionMs: row.p95ResolutionMs,
    warning: cohortWarning(row)
  }), unavailableSections)
}

function transportCohortSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsTableRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsTableRow>[] = [
    { header: "transportMode", value: (row) => row.key || "unknown" },
    { header: "openedCount", value: (row) => row.count },
    { header: "medianFirstResponseMs", value: (row) => row.medianFirstResponseMs },
    { header: "p95FirstResponseMs", value: (row) => row.p95FirstResponseMs },
    { header: "medianResolutionMs", value: (row) => row.medianResolutionMs },
    { header: "p95ResolutionMs", value: (row) => row.p95ResolutionMs },
    { header: "warning", value: cohortWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    transportMode: row.key || "unknown",
    openedCount: row.count,
    medianFirstResponseMs: row.medianFirstResponseMs,
    p95FirstResponseMs: row.p95FirstResponseMs,
    medianResolutionMs: row.medianResolutionMs,
    p95ResolutionMs: row.p95ResolutionMs,
    warning: cohortWarning(row)
  }), unavailableSections)
}

function feedbackWarning(row: DashboardAnalyticsFeedbackOutcomeRow) {
  return combinedWarning(metricWarning(row.completionRate), metricWarning(row.ignoredRate))
}

function teamFeedbackSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsFeedbackOutcomeRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsFeedbackOutcomeRow>[] = [
    { header: "teamId", value: (row) => teamId(row.key) },
    { header: "teamLabel", value: (row) => row.label },
    { header: "triggeredCount", value: (row) => row.total },
    { header: "completedCount", value: (row) => row.completed },
    { header: "ignoredCount", value: (row) => row.ignored },
    { header: "deliveryFailedCount", value: (row) => row.deliveryFailed },
    { header: "completionRate", value: (row) => row.completionRate.value },
    { header: "ignoredRate", value: (row) => row.ignoredRate.value },
    { header: "warning", value: feedbackWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    teamId: teamId(row.key),
    teamLabel: row.label,
    triggeredCount: row.total,
    completedCount: row.completed,
    ignoredCount: row.ignored,
    deliveryFailedCount: row.deliveryFailed,
    completionRate: row.completionRate.value,
    ignoredRate: row.ignoredRate.value,
    warning: feedbackWarning(row)
  }), unavailableSections)
}

function transportFeedbackSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsFeedbackOutcomeRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsFeedbackOutcomeRow>[] = [
    { header: "transportMode", value: (row) => row.key || "unknown" },
    { header: "triggeredCount", value: (row) => row.total },
    { header: "completedCount", value: (row) => row.completed },
    { header: "ignoredCount", value: (row) => row.ignored },
    { header: "deliveryFailedCount", value: (row) => row.deliveryFailed },
    { header: "completionRate", value: (row) => row.completionRate.value },
    { header: "ignoredRate", value: (row) => row.ignoredRate.value },
    { header: "warning", value: feedbackWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    transportMode: row.key || "unknown",
    triggeredCount: row.total,
    completedCount: row.completed,
    ignoredCount: row.ignored,
    deliveryFailedCount: row.deliveryFailed,
    completionRate: row.completionRate.value,
    ignoredRate: row.ignoredRate.value,
    warning: feedbackWarning(row)
  }), unavailableSections)
}

function ratingWarning(row: DashboardAnalyticsRatingRow) {
  return row.responses < 1 ? "No rating responses" : row.lowSample ? "Low sample" : null
}

function ratingSection(rows: DashboardAnalyticsRatingRow[], unavailableSections: Map<string, { warning: string }>) {
  const columns: CsvColumn<DashboardAnalyticsRatingRow>[] = [
    { header: "questionKey", value: (row) => row.questionKey },
    { header: "questionLabel", value: (row) => row.questionLabel },
    { header: "responses", value: (row) => row.responses },
    { header: "averageRating", value: (row) => row.averageRating },
    { header: "medianRating", value: (row) => row.medianRating },
    { header: "warning", value: ratingWarning }
  ]
  return section("ratingMetrics", "Rating question summaries", "rating-metrics.csv", rows, columns, (row) => ({
    questionKey: row.questionKey,
    questionLabel: row.questionLabel,
    responses: row.responses,
    averageRating: row.averageRating,
    medianRating: row.medianRating,
    warning: ratingWarning(row)
  }), unavailableSections)
}

function reopenWarning(row: DashboardAnalyticsReopenRateRow) {
  return metricWarning(row.reopenRate)
}

function teamReopenSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsReopenRateRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsReopenRateRow>[] = [
    { header: "teamId", value: (row) => teamId(row.key) },
    { header: "teamLabel", value: (row) => row.label },
    { header: "reopenedTicketCount", value: (row) => row.reopenedTickets },
    { header: "closedTicketCount", value: (row) => row.closedTickets },
    { header: "reopenRate", value: (row) => row.reopenRate.value },
    { header: "warning", value: reopenWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    teamId: teamId(row.key),
    teamLabel: row.label,
    reopenedTicketCount: row.reopenedTickets,
    closedTicketCount: row.closedTickets,
    reopenRate: row.reopenRate.value,
    warning: reopenWarning(row)
  }), unavailableSections)
}

function transportReopenSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsReopenRateRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsReopenRateRow>[] = [
    { header: "transportMode", value: (row) => row.key || "unknown" },
    { header: "reopenedTicketCount", value: (row) => row.reopenedTickets },
    { header: "closedTicketCount", value: (row) => row.closedTickets },
    { header: "reopenRate", value: (row) => row.reopenRate.value },
    { header: "warning", value: reopenWarning }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    transportMode: row.key || "unknown",
    reopenedTicketCount: row.reopenedTickets,
    closedTicketCount: row.closedTickets,
    reopenRate: row.reopenRate.value,
    warning: reopenWarning(row)
  }), unavailableSections)
}

function analyticsSections(model: DashboardAnalyticsModel) {
  const unavailableSections = unavailableSectionMap(model)
  return [
    teamBacklogSection("backlogByTeam", "Current backlog by team", "backlog-by-team.csv", model.backlogByTeam, unavailableSections),
    assigneeBacklogSection("backlogByAssignee", "Current backlog by assignee", "backlog-by-assignee.csv", model.backlogByAssignee, unavailableSections),
    transportBacklogSection("backlogByTransport", "Current backlog by transport", "backlog-by-transport.csv", model.backlogByTransport, "openCount", unavailableSections),
    teamCohortSection("cohortPerformanceByTeam", "Opened-ticket cohort by team", "cohort-performance-by-team.csv", model.cohortByTeam, unavailableSections),
    transportCohortSection("cohortPerformanceByTransport", "Opened-ticket cohort by transport", "cohort-performance-by-transport.csv", model.cohortByTransport, unavailableSections),
    teamFeedbackSection("feedbackOutcomesByTeam", "Feedback outcomes by team", "feedback-outcomes-by-team.csv", model.feedbackByTeam, unavailableSections),
    transportFeedbackSection("feedbackOutcomesByTransport", "Feedback outcomes by transport", "feedback-outcomes-by-transport.csv", model.feedbackByTransport, unavailableSections),
    ratingSection(model.ratingQuestions, unavailableSections),
    teamReopenSection("reopenRateByTeam", "Reopen rate by team", "reopen-rate-by-team.csv", model.reopenRateByTeam, unavailableSections),
    transportReopenSection("reopenRateByTransport", "Reopen rate by transport", "reopen-rate-by-transport.csv", model.reopenRateByTransport, unavailableSections),
    reopenedTeamBacklogSection("reopenedBacklogByTeam", "Reopened backlog by team", "reopened-backlog-by-team.csv", model.reopenedBacklogByTeam, unavailableSections),
    transportBacklogSection("reopenedBacklogByTransport", "Reopened backlog by transport", "reopened-backlog-by-transport.csv", model.reopenedBacklogByTransport, "openReopenedCount", unavailableSections)
  ]
}

export function getAnalyticsExportAuditDetails(model: DashboardAnalyticsModel, format: DashboardExportFormat) {
  return {
    format,
    warningCount: analyticsWarnings(model).length,
    unavailableSectionCount: analyticsUnavailableSections(model).length
  }
}

export function getTicketWorkbenchExportAuditDetails(model: TicketWorkbenchListModel, format: DashboardExportFormat) {
  return {
    format,
    page: model.request.page,
    limit: model.request.limit,
    rowCount: model.exportRows.length,
    warningCount: [model.warningMessage, model.telemetryWarningMessage].filter((warning) => warning.trim().length > 0).length
  }
}

function buildAnalyticsJson(model: DashboardAnalyticsModel, generatedAt: string) {
  const sections = analyticsSections(model)
  return {
    generatedAt,
    filters: analyticsFilters(model),
    warnings: analyticsWarnings(model),
    unavailableSections: analyticsUnavailableSections(model),
    summaryCards: model.exportSummaryCards,
    tables: Object.fromEntries(sections.map((item) => [
      item.key,
      {
        status: item.available ? "available" : "unavailable",
        warning: item.warning,
        rows: item.rows
      }
    ]))
  }
}

function buildSummaryCardsCsv(model: DashboardAnalyticsModel) {
  return buildDashboardCsv(
    ["key", "label", "status", "value", "warning"],
    model.exportSummaryCards,
    [
      { header: "key", value: (row) => row.key },
      { header: "label", value: (row) => row.label },
      { header: "status", value: (row) => row.status },
      { header: "value", value: (row) => row.value },
      { header: "warning", value: (row) => row.warning }
    ]
  )
}

async function zipToBuffer(entries: Array<{ name: string; content: Buffer | string }>) {
  const { ZipFile } = require(path.resolve(process.cwd(), "plugins", "ot-html-transcripts", "vendor", "yazl.js")) as {
    ZipFile: new () => {
      outputStream: NodeJS.ReadableStream
      addBuffer(buffer: Buffer, metadataPath: string): void
      end(): void
    }
  }

  const zip = new ZipFile()
  for (const entry of entries) {
    zip.addBuffer(Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8"), entry.name)
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    zip.outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    zip.outputStream.on("error", reject)
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)))
    zip.end()
  })
}

export async function buildAnalyticsExportPayload(
  model: DashboardAnalyticsModel,
  format: DashboardExportFormat,
  generatedAtInput?: Date | number | string
): Promise<DashboardExportPayload> {
  const generatedAt = generatedIso(generatedAtInput)
  if (format === "json") {
    return {
      fileName: ANALYTICS_JSON_FILE,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify(buildAnalyticsJson(model, generatedAt), null, 2)}\n`
    }
  }

  const sections = analyticsSections(model)
  const availableSections = sections.filter((item) => item.available)
  const manifest = {
    formatVersion: 1,
    generatedAt,
    filters: analyticsFilters(model),
    warnings: analyticsWarnings(model),
    unavailableSections: analyticsUnavailableSections(model),
    includedFiles: [
      { name: "summary-cards.csv", section: "summaryCards", rowCount: model.exportSummaryCards.length },
      ...availableSections.map((item) => ({ name: item.fileName, section: item.key, rowCount: item.rows.length }))
    ]
  }
  const body = await zipToBuffer([
    { name: "manifest.json", content: `${JSON.stringify(manifest, null, 2)}\n` },
    { name: "summary-cards.csv", content: buildSummaryCardsCsv(model) },
    ...availableSections.map((item) => ({ name: item.fileName, content: item.csv }))
  ])
  return {
    fileName: ANALYTICS_ZIP_FILE,
    contentType: "application/zip",
    body
  }
}

function ticketFilters(model: TicketWorkbenchListModel) {
  return {
    q: model.request.q,
    status: model.request.status,
    transport: model.request.transport,
    feedback: model.request.feedback,
    reopened: model.request.reopened,
    teamId: model.request.teamId || null,
    assigneeId: model.request.assigneeId || null,
    optionId: model.request.optionId || null,
    panelId: model.request.panelId || null,
    creatorId: model.request.creatorId || null
  }
}

function ticketWarnings(model: TicketWorkbenchListModel) {
  return [model.warningMessage, model.telemetryWarningMessage].filter((warning) => warning.trim().length > 0)
}

function ticketRowsCsv(model: TicketWorkbenchListModel) {
  const columns: CsvColumn<TicketWorkbenchListModel["exportRows"][number]>[] = [
    { header: "ticketId", value: (row) => row.ticketId },
    { header: "resourceName", value: (row) => row.resourceName },
    { header: "closed", value: (row) => row.closed },
    { header: "claimed", value: (row) => row.claimed },
    { header: "transportMode", value: (row) => row.transportMode },
    { header: "panelId", value: (row) => row.panelId },
    { header: "panelLabel", value: (row) => row.panelLabel },
    { header: "optionId", value: (row) => row.optionId },
    { header: "optionLabel", value: (row) => row.optionLabel },
    { header: "creatorUserId", value: (row) => row.creatorUserId },
    { header: "creatorLabel", value: (row) => row.creatorLabel },
    { header: "assignedTeamId", value: (row) => row.assignedTeamId },
    { header: "teamLabel", value: (row) => row.teamLabel },
    { header: "assignedStaffUserId", value: (row) => row.assignedStaffUserId },
    { header: "assigneeLabel", value: (row) => row.assigneeLabel },
    { header: "telemetryAvailable", value: (row) => row.telemetryAvailable },
    { header: "latestFeedbackStatus", value: (row) => row.latestFeedbackStatus },
    { header: "reopenCount", value: (row) => row.reopenCount },
    { header: "lastReopenedAt", value: (row) => row.lastReopenedAt }
  ]
  return buildDashboardCsv(columns.map((column) => column.header), model.exportRows, columns)
}

function ticketRowsCsvFromRows(rows: TicketWorkbenchListModel["exportRows"]) {
  const model = { exportRows: rows } as TicketWorkbenchListModel
  return ticketRowsCsv(model)
}

function buildTicketJson(model: TicketWorkbenchListModel, generatedAt: string) {
  return {
    generatedAt,
    filters: ticketFilters(model),
    page: model.request.page,
    limit: model.request.limit,
    sort: model.request.sort,
    warnings: ticketWarnings(model),
    items: model.exportRows
  }
}

function buildFullTicketJson(model: TicketWorkbenchListModel, generatedAt: string) {
  return {
    generatedAt,
    filters: ticketFilters(model),
    sort: model.request.sort,
    warnings: ticketWarnings(model),
    total: model.allExportRows.length,
    items: model.allExportRows
  }
}

export async function buildTicketWorkbenchExportPayload(
  model: TicketWorkbenchListModel,
  format: DashboardExportFormat,
  generatedAtInput?: Date | number | string
): Promise<DashboardExportPayload> {
  const generatedAt = generatedIso(generatedAtInput)
  if (format === "json") {
    return {
      fileName: TICKETS_JSON_FILE,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify(buildTicketJson(model, generatedAt), null, 2)}\n`
    }
  }
  return {
    fileName: TICKETS_CSV_FILE,
    contentType: "text/csv; charset=utf-8",
    body: ticketRowsCsv(model)
  }
}

export async function buildFullTicketWorkbenchExportPayload(
  model: TicketWorkbenchListModel,
  format: DashboardExportFormat,
  generatedAtInput?: Date | number | string
): Promise<DashboardExportPayload> {
  const generatedAt = generatedIso(generatedAtInput)
  if (format === "json") {
    return {
      fileName: TICKETS_FULL_JSON_FILE,
      contentType: "application/json; charset=utf-8",
      body: `${JSON.stringify(buildFullTicketJson(model, generatedAt), null, 2)}\n`
    }
  }
  return {
    fileName: TICKETS_FULL_CSV_FILE,
    contentType: "text/csv; charset=utf-8",
    body: ticketRowsCsvFromRows(model.allExportRows)
  }
}

export function getFullTicketWorkbenchExportAuditDetails(model: TicketWorkbenchListModel, format: DashboardExportFormat) {
  return {
    format,
    rowCount: model.allExportRows.length,
    warningCount: [model.warningMessage, model.telemetryWarningMessage, model.queueWarningMessage].filter((warning) => warning.trim().length > 0).length,
    queryKeys: Object.keys(ticketFilters(model)).sort()
  }
}

function buildTicketDetailJson(model: TicketWorkbenchDetailModel, generatedAt: string): DashboardTicketDetailExportPayload {
  const detail = model.detail
  if (!detail) {
    throw new Error("Ticket detail export requires an available ticket detail model.")
  }
  return {
    generatedAt,
    ticket: {
      id: detail.ticket.id,
      open: detail.ticket.open,
      closed: detail.ticket.closed,
      claimed: detail.ticket.claimed,
      pinned: detail.ticket.pinned,
      openedOn: detail.ticket.openedOn,
      closedOn: detail.ticket.closedOn,
      resolvedAt: detail.ticket.resolvedAt,
      claimedOn: detail.ticket.claimedOn,
      reopenedOn: detail.ticket.reopenedOn
    },
    route: {
      panelId: detail.panelId,
      panelLabel: detail.panelLabel,
      optionId: detail.ticket.optionId,
      optionLabel: detail.optionLabel,
      teamId: detail.ticket.assignedTeamId,
      teamLabel: detail.teamLabel,
      assigneeUserId: detail.ticket.assignedStaffUserId,
      assigneeLabel: detail.assigneeLabel
    },
    requester: {
      creatorUserId: detail.ticket.creatorId,
      creatorLabel: detail.creatorLabel,
      originalApplicantUserId: detail.originalApplicantUserId,
      originalApplicantLabel: detail.originalApplicantLabel
    },
    workflow: {
      closeRequestState: detail.ticket.closeRequestState,
      awaitingUserState: detail.ticket.awaitingUserState
    },
    transport: {
      mode: detail.ticket.transportMode,
      parentChannelId: detail.ticket.transportParentChannelId,
      parentMessageId: detail.ticket.transportParentMessageId
    },
    operations: {
      priorityId: detail.priorityId,
      priorityLabel: detail.priorityLabel,
      topic: detail.topic,
      participantCount: detail.ticket.participantCount
    },
    telemetry: detail.telemetry,
    transcriptReference: {
      resourceName: detail.ticket.channelName,
      channelSuffix: detail.ticket.channelSuffix
    }
  }
}

export async function buildTicketDetailExportPayload(
  model: TicketWorkbenchDetailModel,
  generatedAtInput?: Date | number | string
): Promise<DashboardExportPayload> {
  const generatedAt = generatedIso(generatedAtInput)
  return {
    fileName: TICKET_DETAIL_JSON_FILE,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(buildTicketDetailJson(model, generatedAt), null, 2)}\n`
  }
}
