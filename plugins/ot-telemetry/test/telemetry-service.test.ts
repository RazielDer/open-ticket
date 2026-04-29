import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import path from "path"

import {
  OTTelemetryService,
  TICKET_TELEMETRY_FEEDBACK_CATEGORY,
  TICKET_TELEMETRY_LIFECYCLE_CATEGORY,
  TICKET_TELEMETRY_LIFECYCLE_EVENT_TYPES,
  projectFeedbackQuestionSummaries
} from "../service/telemetry-service.js"

class MemoryDatabase {
  rows: { category: string; key: string; value: any }[] = []

  set(category: string, key: string, value: any) {
    const existing = this.rows.find((row) => row.category === category && row.key === key)
    if (existing) {
      existing.value = value
      return true
    }
    this.rows.push({ category, key, value })
    return false
  }

  getCategory(category: string) {
    return this.rows
      .filter((row) => row.category === category)
      .map((row) => ({ key: row.key, value: row.value }))
  }
}

function ticket(overrides: Record<string, unknown> = {}) {
  const data = {
    "opendiscord:opened-by": "creator-1",
    "opendiscord:transport-mode": "private_thread",
    "opendiscord:assigned-team": "triage",
    "opendiscord:assigned-staff": "staff-1",
    "opendiscord:assignment-strategy": "round_robin",
    "opendiscord:integration-profile": "whitelist",
    "opendiscord:ai-assist-profile": "assist",
    "opendiscord:close-request-state": "requested",
    "opendiscord:awaiting-user-state": "waiting",
    "opendiscord:first-staff-response-on": 1710000001000,
    "opendiscord:resolved-on": 1710000002000,
    "opendiscord:closed": false,
    ...overrides
  }

  return {
    id: { value: "ticket-1" },
    option: { id: { value: "intake" } },
    get(id: string) {
      return { value: data[id] }
    }
  }
}

function service(database = new MemoryDatabase()) {
  let nextId = 1
  return {
    database,
    service: new OTTelemetryService({
      database,
      now: () => 1710000000000,
      randomId: () => `record-${nextId++}`
    })
  }
}

function sourceSlice(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return source.slice(start, end)
}

test("telemetry snapshots use the locked analytics-safe ticket shape", () => {
  const { service: telemetry } = service()
  const snapshot = telemetry.createTicketSnapshot(ticket())

  assert.deepEqual(Object.keys(snapshot), [
    "creatorUserId",
    "optionId",
    "transportMode",
    "assignedTeamId",
    "assignedStaffUserId",
    "assignmentStrategy",
    "integrationProfileId",
    "aiAssistProfileId",
    "closeRequestState",
    "awaitingUserState",
    "firstStaffResponseAt",
    "resolvedAt",
    "closed"
  ])
  assert.deepEqual(snapshot, {
    creatorUserId: "creator-1",
    optionId: "intake",
    transportMode: "private_thread",
    assignedTeamId: "triage",
    assignedStaffUserId: "staff-1",
    assignmentStrategy: "round_robin",
    integrationProfileId: "whitelist",
    aiAssistProfileId: "assist",
    closeRequestState: "requested",
    awaitingUserState: "waiting",
    firstStaffResponseAt: 1710000001000,
    resolvedAt: 1710000002000,
    closed: false
  })
})

test("lifecycle records persist by recordId and support ticket/time/limit filters", async () => {
  const { database, service: telemetry } = service()
  const previousSnapshot = telemetry.createTicketSnapshot(ticket({ "opendiscord:closed": false }))
  const closedTicket = ticket({ "opendiscord:closed": true })

  const closed = await telemetry.appendLifecycleEvent({
    eventType: "closed",
    ticket: closedTicket,
    actorUserId: "staff-1",
    occurredAt: 1710000100000,
    previousSnapshot
  })
  const reopened = await telemetry.appendLifecycleEvent({
    eventType: "reopened",
    ticket: ticket({ "opendiscord:closed": false }),
    actorUserId: "staff-2",
    occurredAt: 1710000200000
  })

  assert.equal(database.rows[0]?.category, TICKET_TELEMETRY_LIFECYCLE_CATEGORY)
  assert.equal(database.rows[0]?.key, closed.recordId)
  assert.deepEqual(Object.keys(closed), ["recordId", "ticketId", "eventType", "occurredAt", "actorUserId", "snapshot", "previousSnapshot"])
  assert.equal(closed.previousSnapshot?.closed, false)
  assert.equal(closed.snapshot.closed, true)
  assert.equal(reopened.recordId, "record-2")

  assert.deepEqual(await telemetry.listLifecycleHistory({ ticketId: "missing" }), [])
  assert.deepEqual((await telemetry.listLifecycleHistory({ since: 1710000150000 })).map((record) => record.eventType), ["reopened"])
  assert.deepEqual((await telemetry.listLifecycleHistory({ limit: 1 })).map((record) => record.eventType), ["closed"])
})

test("feedback telemetry projects answers without retaining raw text or attachment data", async () => {
  const { database, service: telemetry } = service()
  const record = await telemetry.storeFeedbackSession({
    session: {
      sessionId: "session-1",
      ticketId: "ticket-1",
      triggerMode: "close",
      triggeredAt: 1710000000000,
      completedAt: 1710000300000,
      status: "completed",
      respondentUserId: "creator-1",
      closeCountAtTrigger: 3
    },
    responses: [
      { label: "Freeform", type: "text", answer: "raw freeform text must not persist" },
      { label: "Rating", type: "rating", answer: "7" },
      { label: "Choice", type: "choice", choices: ["Good", "Bad"], answer: "Good" },
      { label: "Image", type: "image", answer: { url: "https://cdn.discordapp.invalid/image.png", name: "secret-image.png" } },
      { label: "File", type: "attachment", answer: { url: "https://cdn.discordapp.invalid/file.zip", name: "secret-file.zip" } }
    ]
  }, { ticket: ticket() })

  assert.equal(database.rows[0]?.category, TICKET_TELEMETRY_FEEDBACK_CATEGORY)
  assert.equal(database.rows[0]?.key, "session-1")
  assert.deepEqual(record.questionSummaries, [
    { position: 1, type: "text", label: "Freeform", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: null },
    { position: 2, type: "rating", label: "Rating", answered: true, ratingValue: 7, choiceIndex: null, choiceLabel: null },
    { position: 3, type: "choice", label: "Choice", answered: true, ratingValue: null, choiceIndex: 0, choiceLabel: "Good" },
    { position: 4, type: "image", label: "Image", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: null },
    { position: 5, type: "attachment", label: "File", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: null }
  ])
  assert.doesNotMatch(JSON.stringify(record), /raw freeform|cdn\.discordapp|secret-image|secret-file/)
})

test("feedback history is restart-readable and overwrites duplicate session ids", async () => {
  const database = new MemoryDatabase()
  const first = service(database).service
  await first.storeFeedbackSession({
    session: {
      sessionId: "session-1",
      ticketId: "ticket-1",
      triggerMode: "delete",
      triggeredAt: 100,
      completedAt: null,
      status: "delivery_failed",
      respondentUserId: null,
      closeCountAtTrigger: 0
    },
    responses: []
  }, { snapshot: first.createTicketSnapshot(null) })
  await first.storeFeedbackSession({
    session: {
      sessionId: "session-1",
      ticketId: "ticket-1",
      triggerMode: "delete",
      triggeredAt: 100,
      completedAt: 200,
      status: "ignored",
      respondentUserId: "creator-1",
      closeCountAtTrigger: 0
    },
    responses: []
  }, { snapshot: first.createTicketSnapshot(null) })

  const restored = service(database).service
  assert.deepEqual(await restored.restore(), { lifecycleRecords: 0, feedbackRecords: 1 })
  assert.deepEqual((await restored.listFeedbackHistory({ ticketId: "ticket-1" })).map((record) => record.status), ["ignored"])
})

test("question summary projection keeps only the analytics-safe subset", () => {
  const summaries = projectFeedbackQuestionSummaries([
    { label: "No answer", type: "text", answer: null },
    { label: "Bad rating", type: "rating", answer: "not-a-number" },
    { label: "Unknown choice", type: "choice", choices: ["A"], answer: "B" }
  ])

  assert.deepEqual(summaries, [
    { position: 1, type: "text", label: "No answer", answered: false, ratingValue: null, choiceIndex: null, choiceLabel: null },
    { position: 2, type: "rating", label: "Bad rating", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: null },
    { position: 3, type: "choice", label: "Unknown choice", answered: true, ratingValue: null, choiceIndex: null, choiceLabel: "B" }
  ])
})

test("telemetry plugin and workflow sources use the locked capture paths", () => {
  const telemetryIndex = fs.readFileSync(path.resolve(process.cwd(), "plugins", "ot-telemetry", "index.ts"), "utf8")
  const workflowSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "ticketWorkflow.ts"), "utf8")
  const serviceSource = fs.readFileSync(path.resolve(process.cwd(), "plugins", "ot-telemetry", "service", "telemetry-service.ts"), "utf8")

  for (const eventType of TICKET_TELEMETRY_LIFECYCLE_EVENT_TYPES) {
    assert.match(serviceSource, new RegExp(`"${eventType}"`))
  }
  assert.match(telemetryIndex, /afterTicketCreated/)
  assert.match(telemetryIndex, /afterTicketClosed/)
  assert.match(telemetryIndex, /afterTicketAssigned/)
  assert.match(telemetryIndex, /ot-feedback:afterFeedback/)
  assert.match(telemetryIndex, /feedbackSnapshots\.get\(ticketId\) \?\? null/)
  assert.match(workflowSource, /close_request_requested/)
  assert.match(workflowSource, /awaiting_user_timeout_closed/)
  assert.doesNotMatch(serviceSource, /opendiscord\.stats/)
})

test("close-derived workflow telemetry waits for successful close mutation", () => {
  const workflowSource = fs.readFileSync(path.resolve(process.cwd(), "src", "actions", "ticketWorkflow.ts"), "utf8")
  const closeTelemetryHelper = sourceSlice(
    workflowSource,
    "async function closeTicketAndAppendWorkflowTelemetry",
    "export async function requestTicketClose"
  )
  const approvalFunction = sourceSlice(
    workflowSource,
    "export async function approveTicketCloseRequest",
    "export async function dismissTicketCloseRequest"
  )
  const workflowScanFunction = sourceSlice(
    workflowSource,
    "export async function runAwaitingUserWorkflowScan",
    "export const registerActions"
  )

  const previousSnapshotIndex = closeTelemetryHelper.indexOf("const previousSnapshot = snapshotTicketForTelemetry(input.ticket)")
  const closeActionIndex = closeTelemetryHelper.indexOf('opendiscord.actions.get("opendiscord:close-ticket").run')
  const closedGuardIndex = closeTelemetryHelper.indexOf('if (!input.ticket.get("opendiscord:closed").value) return false')
  const appendIndex = closeTelemetryHelper.indexOf("appendTicketTelemetryLifecycleEvent")

  assert.ok(previousSnapshotIndex >= 0)
  assert.ok(previousSnapshotIndex < closeActionIndex)
  assert.ok(closeActionIndex < closedGuardIndex)
  assert.ok(closedGuardIndex < appendIndex)
  assert.doesNotMatch(closeTelemetryHelper.slice(0, closeActionIndex), /appendTicketTelemetryLifecycleEvent/)

  assert.match(approvalFunction, /closeTicketAndAppendWorkflowTelemetry\({[\s\S]*eventType:"close_request_approved"/)
  assert.doesNotMatch(approvalFunction, /appendTicketTelemetryLifecycleEvent/)

  assert.match(workflowScanFunction, /const closedTicket = await closeTicketAndAppendWorkflowTelemetry\({[\s\S]*eventType:"awaiting_user_timeout_closed"/)
  assert.ok(workflowScanFunction.indexOf("if (!closedTicket) continue") < workflowScanFunction.indexOf("closed++"))
})
