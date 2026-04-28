import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  OTQualityReviewService,
  QUALITY_REVIEW_CASES_CATEGORY,
  QUALITY_REVIEW_NOTES_CATEGORY,
  QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY
} from "../service/quality-review-service.js"

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

  get(category: string, key: string) {
    return this.rows.find((row) => row.category === category && row.key === key)?.value
  }

  getCategory(category: string) {
    return this.rows
      .filter((row) => row.category === category)
      .map((row) => ({ key: row.key, value: row.value }))
  }
}

function createService(options: {
  now?: () => number
  fetchAsset?: (url: string) => Promise<Response>
  config?: Partial<{ rawFeedbackRetentionDays: number; maxMirroredFileBytes: number; maxMirroredSessionBytes: number }>
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ot-quality-review-"))
  let nextId = 1
  const database = new MemoryDatabase()
  const service = new OTQualityReviewService({
    database,
    assetRoot: path.join(root, "runtime", "ot-quality-review", "assets"),
    now: options.now || (() => 1710000000000),
    randomId: () => `uuid-${nextId++}`,
    fetchAsset: options.fetchAsset || (async () => new Response(Buffer.from("mirrored"), {
      headers: {
        "content-length": "8",
        "content-type": "image/png"
      }
    })),
    config: options.config
  })
  return { root, database, service }
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      sessionId: "session-1",
      ticketId: "ticket-1",
      triggerMode: "close",
      status: "completed",
      completedAt: 1710000000000,
      respondentUserId: "creator-1",
      closeCountAtTrigger: 2,
      ...overrides
    },
    responses: [
      { label: "Freeform", type: "text", answer: "raw private comment" },
      { label: "Rating", type: "rating", answer: "4" },
      { label: "Choice", type: "choice", choices: ["Good", "Bad"], answer: "Good" },
      { label: "Screenshot", type: "image", answer: { url: "https://cdn.discordapp.invalid/secret.png", name: "../../secret.png", contentType: "image/png", size: 8 } }
    ]
  }
}

test("raw feedback capture stores answered values and mirrors accepted assets without persisting source URLs", async (t) => {
  const { root, database, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const record = await service.captureFeedbackPayload(payload())

  assert.ok(record)
  assert.equal(record?.sessionId, "session-1")
  assert.equal(record?.storageStatus, "available")
  assert.equal(record?.answers[0].textValue, "raw private comment")
  assert.equal(record?.answers[1].ratingValue, 4)
  assert.equal(record?.answers[2].choiceIndex, 0)
  assert.equal(record?.answers[3].assets[0].captureStatus, "mirrored")
  assert.equal(record?.answers[3].assets[0].fileName, "uuid-1.png")
  assert.doesNotMatch(JSON.stringify(record), /cdn\.discordapp|secret\.png|\.\./)
  assert.equal(database.rows[0].category, QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY)

  const asset = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(asset.status, "available")
  assert.ok(asset.filePath)
  assert.equal(fs.existsSync(String(asset.filePath)), true)
})

test("ignored sessions stay telemetry-only and partial mirror failures preserve raw text", async (t) => {
  const { root, database, service } = createService({
    fetchAsset: async () => {
      throw new Error("network included https://cdn.discordapp.invalid/secret.png")
    }
  })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  assert.equal(await service.captureFeedbackPayload(payload({ status: "ignored" })), null)
  assert.equal(database.rows.length, 0)

  const record = await service.captureFeedbackPayload(payload())
  assert.equal(record?.storageStatus, "partial")
  assert.equal(record?.answers[0].textValue, "raw private comment")
  assert.equal(record?.answers[3].assets[0].captureStatus, "failed")
  assert.doesNotMatch(JSON.stringify(record), /cdn\.discordapp|network included/)
})

test("retention expiry removes mirrored files and blanks raw text without deleting cases or notes", async (t) => {
  let now = 1000
  const { root, database, service } = createService({
    now: () => now,
    config: { rawFeedbackRetentionDays: 1 }
  })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await service.captureFeedbackPayload(payload({ completedAt: now }))
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "set-state",
    actorUserId: "admin-1",
    state: "in_review",
    lastSignalAt: now
  })
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "add-note",
    actorUserId: "admin-1",
    actorLabel: "Admin One",
    note: "Investigating",
    lastSignalAt: now
  })
  const before = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(before.status, "available")

  now += 2 * 24 * 60 * 60 * 1000
  assert.equal(await service.sweepExpiredRawFeedback(), 1)
  const expired = database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, "session-1")
  assert.equal(expired.storageStatus, "expired")
  assert.equal(expired.answers[0].textValue, null)
  assert.equal(expired.answers[3].assets[0].captureStatus, "expired")
  assert.equal(fs.existsSync(String(before.filePath)), false)
  assert.equal(database.getCategory(QUALITY_REVIEW_CASES_CATEGORY).length, 1)
  assert.equal(database.getCategory(QUALITY_REVIEW_NOTES_CATEGORY).length, 1)
  assert.equal((await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")).status, "expired")
})

test("case actions create durable state and resolved cases reset when newer signals arrive", async (t) => {
  const { root, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "assign-owner",
    actorUserId: "admin-1",
    ownerUserId: "admin-2",
    firstKnownAt: 100,
    lastSignalAt: 200
  })
  await service.runDashboardQualityReviewAction({
    ticketId: "ticket-1",
    action: "set-state",
    actorUserId: "admin-1",
    state: "resolved",
    firstKnownAt: 100,
    lastSignalAt: 200
  })

  const current = await service.listDashboardQualityReviewCases({
    tickets: [{ ticketId: "ticket-1", firstKnownAt: 100, lastSignalAt: 200, latestCompletedAnsweredSessionId: null }]
  })
  assert.equal(current.cases[0].state, "resolved")
  assert.equal(current.cases[0].ownerUserId, "admin-2")

  const reset = await service.listDashboardQualityReviewCases({
    tickets: [{ ticketId: "ticket-1", firstKnownAt: 100, lastSignalAt: 1710000001000, latestCompletedAnsweredSessionId: null }]
  })
  assert.equal(reset.cases[0].state, "unreviewed")
  assert.equal(reset.cases[0].ownerUserId, null)
})

test("asset resolution rejects traversal paths even when storage is tampered", async (t) => {
  const { root, database, service } = createService()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await service.captureFeedbackPayload(payload())
  const stored = database.get(QUALITY_REVIEW_RAW_FEEDBACK_CATEGORY, "session-1")
  stored.answers[3].assets[0].relativePath = "../outside.txt"

  const result = await service.resolveQualityReviewAsset("ticket-1", "session-1", "uuid-1")
  assert.equal(result.status, "missing")
})
