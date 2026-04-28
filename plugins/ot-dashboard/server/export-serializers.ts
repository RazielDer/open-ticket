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
import type { TicketWorkbenchListModel } from "./ticket-workbench"

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

function metricStatus(cell: DashboardAnalyticsMetricCell) {
  if (!cell.available) return "unavailable"
  return cell.lowSample ? "low-sample" : "available"
}

function metricWarning(cell: DashboardAnalyticsMetricCell) {
  return cell.available && !cell.lowSample ? null : cell.detail
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

function backlogSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsBacklogRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsBacklogRow>[] = [
    { header: "key", value: (row) => row.key },
    { header: "label", value: (row) => row.label },
    { header: "openCount", value: (row) => row.count },
    { header: "detail", value: (row) => row.detail }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    key: row.key,
    label: row.label,
    openCount: row.count,
    detail: row.detail
  }), unavailableSections)
}

function cohortSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsTableRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsTableRow>[] = [
    { header: "key", value: (row) => row.key },
    { header: "label", value: (row) => row.label },
    { header: "openedTickets", value: (row) => row.count },
    { header: "medianFirstResponse", value: (row) => row.firstResponse.value },
    { header: "firstResponseStatus", value: (row) => metricStatus(row.firstResponse) },
    { header: "firstResponseWarning", value: (row) => metricWarning(row.firstResponse) },
    { header: "missingFirstResponse", value: (row) => row.missingFirstResponse },
    { header: "medianResolution", value: (row) => row.resolution.value },
    { header: "resolutionStatus", value: (row) => metricStatus(row.resolution) },
    { header: "resolutionWarning", value: (row) => metricWarning(row.resolution) },
    { header: "missingResolution", value: (row) => row.missingResolution }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    key: row.key,
    label: row.label,
    openedTickets: row.count,
    medianFirstResponse: row.firstResponse.value,
    firstResponseStatus: metricStatus(row.firstResponse),
    firstResponseWarning: metricWarning(row.firstResponse),
    missingFirstResponse: row.missingFirstResponse,
    medianResolution: row.resolution.value,
    resolutionStatus: metricStatus(row.resolution),
    resolutionWarning: metricWarning(row.resolution),
    missingResolution: row.missingResolution
  }), unavailableSections)
}

function feedbackSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsFeedbackOutcomeRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsFeedbackOutcomeRow>[] = [
    { header: "key", value: (row) => row.key },
    { header: "label", value: (row) => row.label },
    { header: "triggered", value: (row) => row.total },
    { header: "completed", value: (row) => row.completed },
    { header: "ignored", value: (row) => row.ignored },
    { header: "deliveryFailed", value: (row) => row.deliveryFailed },
    { header: "completionRate", value: (row) => row.completionRate.value },
    { header: "completionRateStatus", value: (row) => metricStatus(row.completionRate) },
    { header: "completionRateWarning", value: (row) => metricWarning(row.completionRate) },
    { header: "ignoredRate", value: (row) => row.ignoredRate.value },
    { header: "ignoredRateStatus", value: (row) => metricStatus(row.ignoredRate) },
    { header: "ignoredRateWarning", value: (row) => metricWarning(row.ignoredRate) }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    key: row.key,
    label: row.label,
    triggered: row.total,
    completed: row.completed,
    ignored: row.ignored,
    deliveryFailed: row.deliveryFailed,
    completionRate: row.completionRate.value,
    completionRateStatus: metricStatus(row.completionRate),
    completionRateWarning: metricWarning(row.completionRate),
    ignoredRate: row.ignoredRate.value,
    ignoredRateStatus: metricStatus(row.ignoredRate),
    ignoredRateWarning: metricWarning(row.ignoredRate)
  }), unavailableSections)
}

function ratingSection(rows: DashboardAnalyticsRatingRow[], unavailableSections: Map<string, { warning: string }>) {
  const columns: CsvColumn<DashboardAnalyticsRatingRow>[] = [
    { header: "questionKey", value: (row) => row.questionKey },
    { header: "questionLabel", value: (row) => row.questionLabel },
    { header: "responses", value: (row) => row.responses },
    { header: "averageRating", value: (row) => row.averageRating },
    { header: "medianRating", value: (row) => row.medianRating },
    { header: "status", value: (row) => row.responses < 1 ? "unavailable" : row.lowSample ? "low-sample" : "available" },
    { header: "warning", value: (row) => row.responses < 1 ? "No rating responses" : row.lowSample ? "Low sample" : null }
  ]
  return section("ratingMetrics", "Rating question summaries", "rating-metrics.csv", rows, columns, (row) => ({
    questionKey: row.questionKey,
    questionLabel: row.questionLabel,
    responses: row.responses,
    averageRating: row.averageRating,
    medianRating: row.medianRating,
    status: row.responses < 1 ? "unavailable" : row.lowSample ? "low-sample" : "available",
    warning: row.responses < 1 ? "No rating responses" : row.lowSample ? "Low sample" : null
  }), unavailableSections)
}

function reopenSection(
  key: string,
  label: string,
  fileName: string,
  rows: DashboardAnalyticsReopenRateRow[],
  unavailableSections: Map<string, { warning: string }>
) {
  const columns: CsvColumn<DashboardAnalyticsReopenRateRow>[] = [
    { header: "key", value: (row) => row.key },
    { header: "label", value: (row) => row.label },
    { header: "reopenedTickets", value: (row) => row.reopenedTickets },
    { header: "closedTickets", value: (row) => row.closedTickets },
    { header: "reopenRate", value: (row) => row.reopenRate.value },
    { header: "reopenRateStatus", value: (row) => metricStatus(row.reopenRate) },
    { header: "reopenRateWarning", value: (row) => metricWarning(row.reopenRate) }
  ]
  return section(key, label, fileName, rows, columns, (row) => ({
    key: row.key,
    label: row.label,
    reopenedTickets: row.reopenedTickets,
    closedTickets: row.closedTickets,
    reopenRate: row.reopenRate.value,
    reopenRateStatus: metricStatus(row.reopenRate),
    reopenRateWarning: metricWarning(row.reopenRate)
  }), unavailableSections)
}

function analyticsSections(model: DashboardAnalyticsModel) {
  const unavailableSections = unavailableSectionMap(model)
  return [
    backlogSection("backlogByTeam", "Current backlog by team", "backlog-by-team.csv", model.backlogByTeam, unavailableSections),
    backlogSection("backlogByAssignee", "Current backlog by assignee", "backlog-by-assignee.csv", model.backlogByAssignee, unavailableSections),
    backlogSection("backlogByTransport", "Current backlog by transport", "backlog-by-transport.csv", model.backlogByTransport, unavailableSections),
    cohortSection("cohortPerformanceByTeam", "Opened-ticket cohort by team", "cohort-performance-by-team.csv", model.cohortByTeam, unavailableSections),
    cohortSection("cohortPerformanceByTransport", "Opened-ticket cohort by transport", "cohort-performance-by-transport.csv", model.cohortByTransport, unavailableSections),
    feedbackSection("feedbackOutcomesByTeam", "Feedback outcomes by team", "feedback-outcomes-by-team.csv", model.feedbackByTeam, unavailableSections),
    feedbackSection("feedbackOutcomesByTransport", "Feedback outcomes by transport", "feedback-outcomes-by-transport.csv", model.feedbackByTransport, unavailableSections),
    ratingSection(model.ratingQuestions, unavailableSections),
    reopenSection("reopenRateByTeam", "Reopen rate by team", "reopen-rate-by-team.csv", model.reopenRateByTeam, unavailableSections),
    reopenSection("reopenRateByTransport", "Reopen rate by transport", "reopen-rate-by-transport.csv", model.reopenRateByTransport, unavailableSections),
    backlogSection("reopenedBacklogByTeam", "Reopened backlog by team", "reopened-backlog-by-team.csv", model.reopenedBacklogByTeam, unavailableSections),
    backlogSection("reopenedBacklogByTransport", "Reopened backlog by transport", "reopened-backlog-by-transport.csv", model.reopenedBacklogByTransport, unavailableSections)
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
    report: "ticket-analytics",
    formatVersion: 1,
    generatedAt,
    filters: analyticsFilters(model),
    warnings: analyticsWarnings(model),
    unavailableSections: analyticsUnavailableSections(model),
    summaryCards: model.exportSummaryCards,
    tables: Object.fromEntries(sections.map((item) => [
      item.key,
      {
        label: item.label,
        status: item.available ? "available" : "unavailable",
        warning: item.warning,
        rows: item.rows
      }
    ]))
  }
}

function buildSummaryCardsCsv(model: DashboardAnalyticsModel) {
  return buildDashboardCsv(
    ["key", "label", "value", "status", "warning"],
    model.exportSummaryCards,
    [
      { header: "key", value: (row) => row.key },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
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
    report: "ticket-analytics",
    formatVersion: 1,
    generatedAt,
    filters: analyticsFilters(model),
    warnings: analyticsWarnings(model),
    unavailableSections: analyticsUnavailableSections(model),
    files: [
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

function buildTicketJson(model: TicketWorkbenchListModel, generatedAt: string) {
  return {
    report: "ticket-workbench-page",
    formatVersion: 1,
    generatedAt,
    currentPageOnly: true,
    filters: ticketFilters(model),
    sort: model.request.sort,
    page: model.request.page,
    limit: model.request.limit,
    total: model.total,
    unfilteredTotal: model.unfilteredTotal,
    warnings: ticketWarnings(model),
    items: model.exportRows
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
